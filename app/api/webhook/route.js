// app/api/webhook/route.js
// Receives TradingView alerts, validates secret, stores in Upstash Redis
//
// Storage strategy (BTC):
//   signal:btc          → current signal (SET, single key, always latest)
//   btc:daily           → Redis HASH keyed by "YYYY-MM-DD"
//                         one entry per calendar day, permanent, never trimmed
//                         idempotent: same-day webhooks overwrite, no duplicates
//                         this IS the TV 1D close price (webhook fires at bar close)
//   history:btc         → legacy LPUSH list, kept for backward compat (500 entries)

const REDIS_URL     = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN   = process.env.UPSTASH_REDIS_REST_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'Arpi-vypi-2026-btc'

const headers = {
  Authorization: `Bearer ${REDIS_TOKEN}`,
  'Content-Type': 'application/json',
}

async function redisCmd(cmd, ...args) {
  const res = await fetch(`${REDIS_URL}/${cmd}/${args.map(encodeURIComponent).join('/')}`, {
    method: 'GET',
    headers,
  })
  return res.json()
}

async function redisPost(cmd, body) {
  const res = await fetch(`${REDIS_URL}/${cmd}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  return res.json()
}

// SET a single key
async function redisSet(key, value) {
  return redisCmd('set', key, JSON.stringify(value))
}

// HSET into a hash: hset <hashKey> <field> <value>
// Used for btc:daily — field = "YYYY-MM-DD", value = JSON entry
// Overwrites same-day entries automatically (idempotent)
async function redisHSet(hashKey, field, value) {
  const res = await fetch(`${REDIS_URL}/hset/${encodeURIComponent(hashKey)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify([field, JSON.stringify(value)]),
  })
  return res.json()
}

// LPUSH + LTRIM for legacy list (backward compat)
async function redisPush(key, value) {
  await fetch(`${REDIS_URL}/lpush/${key}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(JSON.stringify(value)),
  })
  // Keep 500 most recent raw entries
  await fetch(`${REDIS_URL}/ltrim/${key}/0/499`, {
    method: 'POST',
    headers,
    body: JSON.stringify([0, 499]),
  })
}

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret') || request.headers.get('x-webhook-secret')
    if (secret !== WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { script, state, tpi, roc, price, ts, asset, prev_asset } = body

    if (!script) {
      return Response.json({ error: 'Missing script field' }, { status: 400 })
    }

    const timestamp = ts || Date.now()

    if (script === 'btc') {
      if (!state || tpi === undefined) {
        return Response.json({ error: 'Missing required BTC fields' }, { status: 400 })
      }

      const signal = {
        state,
        tpi:        parseFloat(tpi)   || 0,
        tpi_bar:    parseFloat(tpi)   || 0,
        roc:        parseFloat(roc)   || 0,
        price:      parseFloat(price) || 0,
        ts:         timestamp,
        updated_at: new Date().toISOString(),
      }

      // UTC date for the daily hash key
      const dateKey = new Date(timestamp).toISOString().slice(0, 10) // "YYYY-MM-DD"

      const dailyEntry = {
        state:  signal.state,
        tpi:    signal.tpi,
        roc:    signal.roc,
        price:  signal.price,
        ts:     timestamp,
        date:   dateKey,
      }

      await Promise.all([
        // 1. Current signal (always latest)
        redisSet('signal:btc', signal),
        // 2. Daily hash — permanent, deduplicated by date, never trimmed
        //    Same-day calls overwrite → always stores the LAST price of the day
        //    (most recent = closest to TV's actual daily close)
        redisHSet('btc:daily', dateKey, dailyEntry),
        // 3. Legacy list — kept for backward compat
        redisPush('history:btc', {
          state: signal.state,
          tpi:   signal.tpi,
          roc:   signal.roc,
          price: signal.price,
          ts:    signal.ts,
        }),
      ])

      return Response.json({ ok: true, script: 'btc', state, date: dateKey })
    }

    if (script === 'rotation') {
      const signal = {
        asset:      asset      || 'USD',
        prev_asset: prev_asset || null,
        ts:         timestamp,
        updated_at: new Date().toISOString(),
      }

      await redisSet('signal:rotation', signal)
      await redisPush('history:rotation', {
        asset:      signal.asset,
        prev_asset: signal.prev_asset,
        ts:         signal.ts,
      })

      return Response.json({ ok: true, script: 'rotation', asset })
    }

    return Response.json({ error: 'Unknown script type' }, { status: 400 })
  } catch (err) {
    console.error('Webhook error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({ ok: true, endpoint: 'webhook', ts: Date.now() })
}
