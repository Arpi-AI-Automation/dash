// app/api/webhook/route.js
// Receives TradingView alerts, validates secret, stores in Upstash Redis
//
// Storage strategy (BTC):
//   signal:btc          → current signal (SET, single key, always latest)
//   btc:daily           → Redis HASH keyed by "YYYY-MM-DD" — permanent daily prices
//   btc:transitions     → Redis HASH keyed by "YYYY-MM-DD" — state change events only
//                         written ONLY when state changes vs previous signal
//                         field = date, value = {state, price, ts}
//                         this is the source of truth for equity curve transitions
//   history:btc         → legacy LPUSH list, kept for backward compat

const REDIS_URL      = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN    = process.env.UPSTASH_REDIS_REST_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'Arpi-vypi-2026-btc'

const headers = {
  Authorization: `Bearer ${REDIS_TOKEN}`,
  'Content-Type': 'application/json',
}

async function redisGet(key) {
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    method: 'GET', headers,
  })
  const d = await res.json()
  if (!d.result) return null
  try { return JSON.parse(d.result) } catch { return d.result }
}

async function redisSet(key, value) {
  const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}`, {
    method: 'GET', headers,
  })
  return res.json()
}

async function redisHSet(hashKey, field, value) {
  const key = encodeURIComponent(hashKey)
  const f   = encodeURIComponent(field)
  const v   = encodeURIComponent(JSON.stringify(value))
  const res = await fetch(`${REDIS_URL}/hset/${key}/${f}/${v}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  })
  return res.json()
}

async function redisPush(key, value) {
  await fetch(`${REDIS_URL}/lpush/${key}`, {
    method: 'POST', headers,
    body: JSON.stringify(JSON.stringify(value)),
  })
  await fetch(`${REDIS_URL}/ltrim/${key}/0/499`, {
    method: 'POST', headers,
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

      const dateKey = new Date(timestamp).toISOString().slice(0, 10)

      const dailyEntry = {
        state: signal.state, tpi: signal.tpi, roc: signal.roc,
        price: signal.price, ts: timestamp, date: dateKey,
      }

      // Check if state has changed vs previous signal — if so, record a transition
      const prevSignal = await redisGet('signal:btc')
      const isTransition = !prevSignal || prevSignal.state !== state

      const writes = [
        redisSet('signal:btc', signal),
        redisHSet('btc:daily', dateKey, dailyEntry),
        redisPush('history:btc', {
          state: signal.state, tpi: signal.tpi, roc: signal.roc,
          price: signal.price, ts: signal.ts,
        }),
      ]

      if (isTransition) {
        // Record this state change permanently in btc:transitions hash
        // field = YYYY-MM-DD, value = {state, price, ts}
        writes.push(redisHSet('btc:transitions', dateKey, {
          state: signal.state,
          price: signal.price,
          ts:    timestamp,
          date:  dateKey,
        }))
      }

      await Promise.all(writes)

      return Response.json({
        ok: true, script: 'btc', state, date: dateKey,
        transition: isTransition,
      })
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
        asset: signal.asset, prev_asset: signal.prev_asset, ts: signal.ts,
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
