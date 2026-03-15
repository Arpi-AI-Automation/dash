// app/api/webhook/route.js
// Receives TradingView alerts, validates secret, stores in Upstash Redis

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'Arpi-vypi-2026-btc'

async function redisSet(key, value) {
  const res = await fetch(`${REDIS_URL}/set/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  })
  return res.json()
}

async function redisPush(key, value) {
  // Push to a list (for history), keep last 365 entries
  const res = await fetch(`${REDIS_URL}/lpush/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(JSON.stringify(value)),
  })
  await res.json()

  // Trim to last 365 entries
  await fetch(`${REDIS_URL}/ltrim/${key}/0/364`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([0, 364]),
  })
}

export async function POST(request) {
  try {
    // Validate secret
    const secret = request.headers.get('x-webhook-secret')
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
      // Validate required fields
      if (!state || tpi === undefined) {
        return Response.json({ error: 'Missing required BTC fields' }, { status: 400 })
      }

      const signal = {
        state,
        tpi: parseFloat(tpi) || 0,
        tpi_bar: parseFloat(tpi) || 0,
        roc: parseFloat(roc) || 0,
        price: parseFloat(price) || 0,
        ts: timestamp,
        updated_at: new Date().toISOString(),
      }

      // Store current signal
      await redisSet('signal:btc', JSON.stringify(signal))

      // Store in history list for equity curve
      await redisPush('history:btc', {
        state: signal.state,
        tpi: signal.tpi,
        roc: signal.roc,
        price: signal.price,
        ts: signal.ts,
      })

      return Response.json({ ok: true, script: 'btc', state })
    }

    if (script === 'rotation') {
      const signal = {
        asset: asset || 'USD',
        prev_asset: prev_asset || null,
        ts: timestamp,
        updated_at: new Date().toISOString(),
      }

      await redisSet('signal:rotation', JSON.stringify(signal))

      // Store rotation history
      await redisPush('history:rotation', {
        asset: signal.asset,
        prev_asset: signal.prev_asset,
        ts: signal.ts,
      })

      return Response.json({ ok: true, script: 'rotation', asset })
    }

    return Response.json({ error: 'Unknown script type' }, { status: 400 })
  } catch (err) {
    console.error('Webhook error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Health check
export async function GET() {
  return Response.json({ ok: true, endpoint: 'webhook', ts: Date.now() })
}
