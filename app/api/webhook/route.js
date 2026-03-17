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
      // Scores for each asset (0-6 each, from the relative strength matrix)
      const scores = {
        bnb:  parseInt(body.bnb_score)  || 0,
        eth:  parseInt(body.eth_score)  || 0,
        sol:  parseInt(body.sol_score)  || 0,
        xrp:  parseInt(body.xrp_score)  || 0,
        paxg: parseInt(body.paxg_score) || 0,
        sui:  parseInt(body.sui_score)  || 0,
        usd:  parseInt(body.usd_score)  || 0,
      }

      const signal = {
        asset:      asset || 'USD',
        prev_asset: prev_asset || null,
        scores,
        ts:         timestamp,
        updated_at: new Date().toISOString(),
      }

      const dateKey = new Date(timestamp).toISOString().slice(0, 10)

      const dailyEntry = {
        asset:  signal.asset,
        scores: signal.scores,
        ts:     timestamp,
        date:   dateKey,
      }

      // Detect rotation (asset change) → write to transitions hash
      const prevRotation = await redisGet('signal:rotation')
      const isRotation = !prevRotation || prevRotation.asset !== signal.asset

      const writes = [
        redisSet('signal:rotation', signal),
        redisHSet('rotation:daily', dateKey, dailyEntry),
        redisPush('history:rotation', {
          asset: signal.asset, prev_asset: signal.prev_asset,
          scores, ts: signal.ts,
        }),
      ]

      if (isRotation) {
        writes.push(redisHSet('rotation:transitions', dateKey, {
          asset: signal.asset,
          date:  dateKey,
          ts:    timestamp,
        }))
      }

      await Promise.all(writes)

      return Response.json({
        ok: true, script: 'rotation', asset: signal.asset,
        date: dateKey, rotation: isRotation,
      })
    }

    // ── System 2: RS Dynamic Hedging / viResearch style ─────────────────────
    // Supports both scored (with allocation %) and plain (asset name only) payloads.
    // TradingView alert message (full):
    //   {"script":"s2","asset":"ETHUSD","btc_score":"0","eth_score":"6","sol_score":"2",
    //    "sui_score":"2","xrp_score":"-4","bnb_score":"0","paxg_score":"-6",
    //    "btc_alloc":"0","eth_alloc":"60","sol_alloc":"0","sui_alloc":"0",
    //    "xrp_alloc":"0","bnb_alloc":"0","paxg_alloc":"40"}
    // Minimal fallback (if plot vars don't resolve):
    //   {"script":"s2","asset":"ETHUSD"}
    if (script === 's2') {
      if (!asset) {
        return Response.json({ error: 'Missing asset field' }, { status: 400 })
      }

      const dateKey = new Date(timestamp).toISOString().slice(0, 10)

      // Parse scores if provided (null if not sent)
      const hasScores = body.eth_score != null || body.btc_score != null
      const scores = hasScores ? {
        btc:  parseFloat(body.btc_score)  || 0,
        eth:  parseFloat(body.eth_score)  || 0,
        sol:  parseFloat(body.sol_score)  || 0,
        sui:  parseFloat(body.sui_score)  || 0,
        xrp:  parseFloat(body.xrp_score)  || 0,
        bnb:  parseFloat(body.bnb_score)  || 0,
        paxg: parseFloat(body.paxg_score) || 0,
      } : null

      const hasAlloc = body.eth_alloc != null || body.btc_alloc != null
      const alloc = hasAlloc ? {
        btc:  parseFloat(body.btc_alloc)  || 0,
        eth:  parseFloat(body.eth_alloc)  || 0,
        sol:  parseFloat(body.sol_alloc)  || 0,
        sui:  parseFloat(body.sui_alloc)  || 0,
        xrp:  parseFloat(body.xrp_alloc)  || 0,
        bnb:  parseFloat(body.bnb_alloc)  || 0,
        paxg: parseFloat(body.paxg_alloc) || 0,
      } : null

      const signal = {
        asset:      asset.trim(),
        prev_asset: prev_asset || null,
        scores,
        alloc,
        ts:         timestamp,
        updated_at: new Date().toISOString(),
      }

      const dailyEntry = {
        asset:  signal.asset,
        scores: signal.scores,
        alloc:  signal.alloc,
        ts:     timestamp,
        date:   dateKey,
      }

      const prevS2     = await redisGet('signal:s2')
      const isRotation = !prevS2 || prevS2.asset !== signal.asset

      const writes = [
        redisSet('signal:s2', signal),
        redisHSet('s2:daily', dateKey, dailyEntry),
        redisPush('history:s2', { asset: signal.asset, scores, alloc, ts: timestamp }),
      ]

      if (isRotation) {
        writes.push(redisHSet('s2:transitions', dateKey, {
          asset:      signal.asset,
          prev_asset: prevS2?.asset || null,
          date:       dateKey,
          ts:         timestamp,
        }))
      }

      await Promise.all(writes)

      return Response.json({
        ok: true, script: 's2', asset: signal.asset,
        date: dateKey, rotation: isRotation,
        hasScores, hasAlloc,
      })
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
