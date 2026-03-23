// app/api/cron/s2-sync/route.js
//
// Runs at 00:01, 00:02, 00:03, 00:04 UTC via Vercel cron.
// Purpose: guarantee s2:daily is written with today's signal by UTC close.
//
// Strategy (layered, each layer is a fallback for the one above):
//   1. If TradingView already wrote signal:s2 today → use it as-is, just ensure
//      s2:daily for today is written (idempotent re-write is fine)
//   2. If signal:s2 is stale (from a previous day) → carry forward the last known
//      signal into today's s2:daily entry (portfolio didn't change, write it)
//   3. Compute today's equity from CoinGecko prices using the current alloc
//   4. Write a staleness flag to Redis so the dashboard can warn the user
//
// This runs 4 times (00:01–00:04). TradingView also fires at 00:01–00:05 (5 alerts).
// First successful write wins. Subsequent writes are idempotent.

export const revalidate = 0

const REDIS_URL    = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN  = process.env.UPSTASH_REDIS_REST_TOKEN
const CRON_SECRET  = process.env.CRON_SECRET || 'arpi-cron-2026'

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    })
    const data = await res.json()
    if (!data.result) return null
    return JSON.parse(data.result)
  } catch { return null }
}

async function redisSet(key, value) {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  })
}

async function redisHSet(hashKey, field, value) {
  await fetch(
    `${REDIS_URL}/hset/${encodeURIComponent(hashKey)}/${encodeURIComponent(field)}/${encodeURIComponent(JSON.stringify(value))}`,
    { method: 'GET', headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }
  )
}

async function redisHGet(hashKey, field) {
  try {
    const res  = await fetch(`${REDIS_URL}/hget/${encodeURIComponent(hashKey)}/${encodeURIComponent(field)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    })
    const data = await res.json()
    if (!data.result) return null
    return JSON.parse(data.result)
  } catch { return null }
}

async function redisHGetAll(hashKey) {
  try {
    const res  = await fetch(`${REDIS_URL}/hgetall/${encodeURIComponent(hashKey)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    })
    const data = await res.json()
    if (!data.result || !Array.isArray(data.result)) return []
    const entries = []
    for (let i = 0; i < data.result.length; i += 2) {
      try {
        let parsed = JSON.parse(data.result[i + 1])
        if (typeof parsed === 'string') parsed = JSON.parse(parsed)
        entries.push({ date: data.result[i], ...parsed })
      } catch {}
    }
    return entries.sort((a, b) => a.date.localeCompare(b.date))
  } catch { return [] }
}

async function getCoinGeckoPrices() {
  try {
    const ids = 'ethereum,pax-gold,bitcoin,solana,ripple,binancecoin,sui'
    const res  = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)
    const data = await res.json()
    return {
      eth:  data.ethereum?.usd        ?? null,
      paxg: data['pax-gold']?.usd     ?? null,
      btc:  data.bitcoin?.usd         ?? null,
      sol:  data.solana?.usd          ?? null,
      xrp:  data.ripple?.usd          ?? null,
      bnb:  data.binancecoin?.usd     ?? null,
      sui:  data.sui?.usd             ?? null,
      usd:  1.0,
    }
  } catch { return null }
}

function computeEquity(alloc, prices, basePrices) {
  if (!alloc || !prices || !basePrices) return null
  const allocSum = Object.values(alloc).reduce((s, v) => s + v, 0)
  if (allocSum === 0) return 1.0  // all cash = flat
  const scl = allocSum > 1 ? 100 : 1
  let portfolioReturn = 0, totalWeight = 0
  for (const [asset, rawW] of Object.entries(alloc)) {
    const w = rawW / scl
    if (w === 0) continue
    const baseP  = basePrices[asset]
    const todayP = prices[asset]
    if (!baseP || !todayP) continue
    portfolioReturn += w * (todayP / baseP)
    totalWeight     += w
  }
  if (totalWeight === 0) return null
  return parseFloat((portfolioReturn / totalWeight).toFixed(6))
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret')
  if (secret !== CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now     = new Date()
  const dateKey = now.toISOString().slice(0, 10)
  const runAt   = now.toISOString()

  try {
    // ── 1. Read current signal:s2 ────────────────────────────────────────────
    const s2Signal = await redisGet('signal:s2')

    if (!s2Signal) {
      return Response.json({ ok: false, reason: 'No signal:s2 in Redis yet', date: dateKey })
    }

    const signalDate = s2Signal.updated_at
      ? new Date(s2Signal.updated_at).toISOString().slice(0, 10)
      : null

    const isStale = signalDate !== dateKey

    // ── 2. Check if s2:daily already has a good entry for today ─────────────
    const todayEntry = await redisHGet('s2:daily', dateKey)
    const todayHasGoodData = todayEntry &&
      todayEntry.alloc &&
      Object.values(todayEntry.alloc).reduce((s, v) => s + v, 0) > 0

    // ── 3. Fetch prices for equity computation ───────────────────────────────
    const prices = await getCoinGeckoPrices()

    // ── 4. Find base prices (first s2:daily entry with base_prices) ──────────
    const allDaily = await redisHGetAll('s2:daily')
    const baseEntry = allDaily.find(e => e.base_prices != null)
    const basePrices = baseEntry?.base_prices ?? null

    const alloc = s2Signal.alloc

    // ── 5. Compute equity ────────────────────────────────────────────────────
    const equity = computeEquity(alloc, prices, basePrices)

    // ── 6. Decide what to write ──────────────────────────────────────────────
    // Always write s2:daily for today if:
    //   a) It doesn't exist yet, or
    //   b) It has zero/bad data (cron wrote garbage earlier), or
    //   c) Signal is fresh (TV fired today — refresh with latest scores/alloc)
    const shouldWrite = !todayHasGoodData || !isStale

    const writes = []

    if (shouldWrite) {
      const entry = {
        date:       dateKey,
        asset:      s2Signal.asset   ?? null,
        alloc:      s2Signal.alloc   ?? null,
        scores:     s2Signal.scores  ?? null,
        ts:         Date.now(),
        updated_at: runAt,
        equity,
        source:     isStale ? 'cron-carry-forward' : 'cron-fresh',
      }
      writes.push(redisHSet('s2:daily', dateKey, entry))
    }

    // ── 7. If signal:s2 is stale, update its updated_at so dashboard shows
    //       the correct date (carry-forward, not wrong date) ─────────────────
    if (isStale) {
      // Carry forward: keep all signal data, just note it was refreshed by cron
      const refreshed = {
        ...s2Signal,
        cron_refreshed_at: runAt,
        cron_carried_forward: true,
        // DO NOT update updated_at — we want dashboard to show actual TV signal date
        // so you can see when TV last fired
      }
      writes.push(redisSet('signal:s2', refreshed))
    }

    // ── 8. Write a staleness status key for dashboard to read ────────────────
    writes.push(redisSet('s2:status', {
      date:           dateKey,
      signal_date:    signalDate,
      is_stale:       isStale,
      has_good_data:  todayHasGoodData || shouldWrite,
      equity_today:   equity,
      run_at:         runAt,
      wrote_daily:    shouldWrite,
    }))

    await Promise.all(writes)

    return Response.json({
      ok:             true,
      date:           dateKey,
      signal_date:    signalDate,
      is_stale:       isStale,
      wrote_daily:    shouldWrite,
      had_good_data:  todayHasGoodData,
      equity:         equity,
      alloc:          alloc,
      asset:          s2Signal.asset,
      run_at:         runAt,
    })

  } catch (err) {
    console.error('[s2-sync] Error:', err)
    return Response.json({ ok: false, error: err.message, date: dateKey }, { status: 500 })
  }
}
