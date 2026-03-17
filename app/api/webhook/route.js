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
  // Upstash REST: POST to /set/key with value as raw JSON string body
  const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(value),
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
    // Compact TradingView message (fits 300 char limit):
    //   {"script":"s2","sc":"{{plot_0}},{{plot_1}},{{plot_2}},{{plot_3}},{{plot_4}},{{plot_5}},{{plot_6}}","al":"{{plot_7}},{{plot_8}},{{plot_9}},{{plot_10}},{{plot_11}},{{plot_12}},{{plot_13}}"}
    // Asset order: BTC, ETH, SOL, SUI, XRP, BNB, PAXG
    if (script === 's2') {
      const dateKey = new Date(timestamp).toISOString().slice(0, 10)
      const KEYS = ['btc','eth','sol','sui','xrp','bnb','paxg']

      // ── Parse compact format: sc="0,6,2,2,-4,-4,-6" al="0,60,0,0,0,0,40"
      let scores = null, alloc = null

      if (body.sc != null) {
        const vals = String(body.sc).split(',').map(Number)
        scores = Object.fromEntries(KEYS.map((k, i) => [k, vals[i] ?? 0]))
      }
      if (body.al != null) {
        const vals = String(body.al).split(',').map(Number)
        alloc = Object.fromEntries(KEYS.map((k, i) => [k, vals[i] ?? 0]))
      }

      // ── Fallback: verbose format (btc_score, eth_alloc etc.)
      if (!scores && body.btc_score != null) {
        scores = Object.fromEntries(KEYS.map(k => [k, parseFloat(body[k + '_score']) || 0]))
      }
      if (!alloc && body.btc_alloc != null) {
        alloc = Object.fromEntries(KEYS.map(k => [k, parseFloat(body[k + '_alloc']) || 0]))
      }

      // ── Derive dominant asset from alloc (highest %), else scores, else body.asset
      let dominantAsset = asset?.trim() || 'USD'
      if (alloc) {
        const top = KEYS.reduce((a, b) => (alloc[a] ?? 0) >= (alloc[b] ?? 0) ? a : b)
        if ((alloc[top] ?? 0) > 0) dominantAsset = top.toUpperCase()
      } else if (scores) {
        const top = KEYS.reduce((a, b) => (scores[a] ?? 0) >= (scores[b] ?? 0) ? a : b)
        dominantAsset = top.toUpperCase()
      }

      const signal = {
        asset:      dominantAsset,
        prev_asset: null,
        scores,
        alloc,
        ts:         timestamp,
        updated_at: new Date().toISOString(),
      }

      const prevS2     = await redisGet('signal:s2')
      signal.prev_asset = prevS2?.asset || null
      const isRotation  = !prevS2 || prevS2.asset !== signal.asset

      const dailyEntry = {
        asset:  signal.asset,
        scores: signal.scores,
        alloc:  signal.alloc,
        ts:     timestamp,
        date:   dateKey,
      }

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
        hasScores: !!scores, hasAlloc: !!alloc,
      })
    }

    // ── Valuation Index ─────────────────────────────────────────────────────
    // TradingView message: {"script":"vi","value":{{plot_0}}}
    if (script === 'vi') {
      const value = parseFloat(body.value)
      if (isNaN(value)) return Response.json({ error: 'Invalid value' }, { status: 400 })
      const dateKey = new Date(timestamp).toISOString().slice(0, 10)
      const signal = { value, ts: timestamp, updated_at: new Date().toISOString(), date: dateKey }
      await Promise.all([
        redisSet('signal:vi', signal),
        redisHSet('vi:daily', dateKey, signal),
      ])
      return Response.json({ ok: true, script: 'vi', value, date: dateKey })
    }


    // ── Valuation Index 2 (Full-cycle) ───────────────────────────────────────
    // TradingView message: {"script":"vi2","value":{{plot_0}}}
    if (script === 'vi2') {
      const value = parseFloat(body.value)
      if (isNaN(value)) return Response.json({ error: 'Invalid value' }, { status: 400 })
      const dateKey = new Date(timestamp).toISOString().slice(0, 10)
      const signal = { value, ts: timestamp, updated_at: new Date().toISOString(), date: dateKey }
      await Promise.all([
        redisSet('signal:vi2', signal),
        redisHSet('vi2:daily', dateKey, signal),
      ])
      return Response.json({ ok: true, script: 'vi2', value, date: dateKey })
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
