// app/api/webhook/route.js
// Receives TradingView alerts, validates secret, stores in Upstash Redis

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'Arpi-vypi-2026-btc'

async function redisSet(key, value) {
  const encoded = encodeURIComponent(JSON.stringify(value))
  const res = await fetch(`${REDIS_URL}/set/${key}/${encoded}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  })
  return res.json()
}

async function redisPush(key, value) {
  const res = await fetch(`${REDIS_URL}/lpush/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(JSON.stringify(value)),
  })
  await res.json()
  await fetch(`${REDIS_URL}/ltrim/${key}/0/364`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([0, 499]),
  })
}

export async function POST(request) {
  try {
    // TradingView doesn't support custom headers — accept secret in URL or header
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
        tpi: parseFloat(tpi) || 0,
        tpi_bar: parseFloat(tpi) || 0,
        roc: parseFloat(roc) || 0,
        price: parseFloat(price) || 0,
        ts: timestamp,
        updated_at: new Date().toISOString(),
      }

      await redisSet('signal:btc', signal)
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

      await redisSet('signal:rotation', signal)
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

export async function GET() {
  return Response.json({ ok: true, endpoint: 'webhook', ts: Date.now() })
}
