// app/api/cron/daily-score/route.js
// Runs at UTC 00:05 via Vercel cron.
// Writes: btc:checklist-daily, vi:daily, vi2:daily, s2:daily (with equity)

export const revalidate = 0

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const CRON_SECRET = process.env.CRON_SECRET || 'arpi-cron-2026'

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

async function redisHSet(hashKey, field, value) {
  const res = await fetch(
    `${REDIS_URL}/hset/${encodeURIComponent(hashKey)}/${encodeURIComponent(field)}/${encodeURIComponent(JSON.stringify(value))}`,
    { method: 'GET', headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }
  )
  return res.json()
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

// ── CoinGecko: fetch multi-asset prices in one call ──────────────────────────
// Returns { eth: 2050.5, paxg: 3200.1, btc: 87000, ... } or null on failure
async function getCoinGeckoPrices(ids = ['ethereum','pax-gold','bitcoin','solana','ripple','binancecoin','sui']) {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
    const res  = await fetch(url)
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

// ── Compute S2 portfolio equity ───────────────────────────────────────────────
// Strategy: hold fixed-quantity basket based on alloc weights applied to
// starting portfolio value. Track portfolio value / starting value each day.
//
// We use the FIRST s2:daily entry as the starting point (equity = 1.0).
// Each subsequent day we recompute the current alloc's portfolio value
// relative to that starting day's prices.
//
// alloc example: { btc: 0, eth: 60, paxg: 40, ... }  (percentages, sum = 100)
// We weight today's prices by alloc and normalise against starting-day prices.
async function computeS2Equity(alloc, prices, allDailyEntries) {
  if (!alloc || !prices) return null

  // Normalise alloc to fractions (handle 0-100 or 0-1 scale)
  const allocSum = Object.values(alloc).reduce((s, v) => s + v, 0)
  if (allocSum === 0) return null
  const scale = allocSum > 1 ? 100 : 1  // if stored as 60/40 → divide by 100
  const weights = Object.fromEntries(Object.entries(alloc).map(([k, v]) => [k, v / scale]))

  // Find the first entry with stored prices to use as base
  const baseEntry = allDailyEntries.find(e => e.base_prices != null)

  if (!baseEntry) {
    // No base yet — this is day 1, return equity 1.0 and store base prices
    return { equity: 1.0, isBase: true }
  }

  // Compute today's weighted portfolio value relative to base
  const basePrices = baseEntry.base_prices
  let portfolioReturn = 0
  let totalWeight = 0

  for (const [asset, weight] of Object.entries(weights)) {
    if (weight === 0) continue
    const basePrice   = basePrices[asset]
    const todayPrice  = prices[asset]
    if (!basePrice || !todayPrice) continue
    portfolioReturn += weight * (todayPrice / basePrice)
    totalWeight     += weight
  }

  if (totalWeight === 0) return null

  // Normalise for any missing assets
  const equity = portfolioReturn / totalWeight
  return { equity: parseFloat(equity.toFixed(6)), isBase: false }
}

async function getBybitFundingOI() {
  try {
    const [tickerRes, oiRes, takerRes] = await Promise.all([
      fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT'),
      fetch('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=2'),
      fetch('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1d&limit=1'),
    ])
    const [ticker, oi, taker] = await Promise.all([tickerRes.json(), oiRes.json(), takerRes.json()])
    const t = ticker?.result?.list?.[0]
    return {
      fundingRate:   t ? parseFloat(t.fundingRate)       : 0,
      oiUsd:         t ? parseFloat(t.openInterestValue) : 0,
      price24hPcnt:  t ? parseFloat(t.price24hPcnt)      : 0,
      oiCurr:        oi?.result?.list?.[0] ? parseFloat(oi.result.list[0].openInterest) : null,
      oiPrev:        oi?.result?.list?.[1] ? parseFloat(oi.result.list[1].openInterest) : null,
      takerBuyRatio: taker?.result?.list?.[0] ? parseFloat(taker.result.list[0].buyRatio) * 100 : null,
    }
  } catch {
    return { fundingRate: 0, oiUsd: 0, price24hPcnt: 0, oiCurr: null, oiPrev: null, takerBuyRatio: null }
  }
}

async function getFearGreed() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1&format=json')
    const d   = await res.json()
    return parseInt(d.data[0].value)
  } catch { return null }
}

async function getTpiSignal() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://dash-3n2o.vercel.app'}/api/signals?history=false`
    )
    const d = await res.json()
    return d?.btc?.state ?? null
  } catch { return null }
}

async function getBtcDominance() {
  try {
    const [globalRes, histRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/global'),
      fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=4&interval=daily'),
    ])
    const [globalData, histData] = await Promise.all([globalRes.json(), histRes.json()])
    const dominanceNow  = globalData.data?.market_cap_percentage?.btc ?? null
    const totalMcapNow  = globalData.data?.total_market_cap?.usd ?? null
    const mcapChange24h = globalData.data?.market_cap_change_percentage_24h_usd ?? 0
    const btcCaps       = histData.market_caps ?? []
    if (!dominanceNow || btcCaps.length < 4 || !totalMcapNow) return { dominanceNow, trend: null }
    const btcMcap3dAgo     = btcCaps[0][1]
    const btcMcapNow       = btcCaps[btcCaps.length - 1][1]
    const btcMcapChangePct = ((btcMcapNow - btcMcap3dAgo) / btcMcap3dAgo) * 100
    const impliedTotal3d   = mcapChange24h * 3
    const trend = Math.abs(btcMcapChangePct - impliedTotal3d) < 0.5 ? 'flat'
                : btcMcapChangePct > impliedTotal3d ? 'rising' : 'falling'
    return {
      dominanceNow: parseFloat(dominanceNow.toFixed(2)),
      btcMcapChangePct: parseFloat(btcMcapChangePct.toFixed(2)),
      trend,
    }
  } catch { return null }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret')
  if (secret !== CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const dateKey = new Date().toISOString().slice(0, 10)

    // Fetch everything in parallel
    const [bybit, fearGreed, tpiSignal, dominance, viSignal, vi2Signal, s2Signal, allPrices, existingS2Daily] =
      await Promise.all([
        getBybitFundingOI(),
        getFearGreed(),
        getTpiSignal(),
        getBtcDominance(),
        redisGet('signal:vi'),
        redisGet('signal:vi2'),
        redisGet('signal:s2'),
        getCoinGeckoPrices(),          // multi-asset prices for S2 equity
        redisHGetAll('s2:daily'),      // existing S2 history to find base prices
      ])

    // BTC price from prices call (already fetched above)
    const btcPrice = allPrices?.btc ?? null
    const btcChange24h = null  // not available from simple/price, fine to omit

    // ── Checklist conditions ──────────────────────────────────────────────────
    const frPct       = bybit.fundingRate * 100
    const price24hPct = bybit.price24hPcnt * 100
    const oiRising    = bybit.oiCurr !== null && bybit.oiPrev !== null ? bybit.oiCurr > bybit.oiPrev : null
    const priceUp     = price24hPct > 0
    const priceDown   = price24hPct < 0
    const hasDom      = dominance !== null && dominance?.trend !== null
    const domRising   = hasDom ? dominance.trend === 'rising'  : null
    const domFalling  = hasDom ? dominance.trend === 'falling' : null

    const c1Long  = frPct <= 0.005;  const c1Short = frPct > 0.05
    const c2Long  = fearGreed !== null ? fearGreed < 30 : null
    const c2Short = fearGreed !== null ? fearGreed > 70 : null
    const c3Long  = tpiSignal === 'LONG';  const c3Short = tpiSignal === 'SHORT'
    const c4Long  = oiRising !== null ? (oiRising && priceUp)   : null
    const c4Short = oiRising !== null ? (oiRising && priceDown) : null
    const c5Long  = hasDom ? domRising   : null
    const c5Short = hasDom ? domFalling  : null
    const c6Long  = bybit.takerBuyRatio !== null ? bybit.takerBuyRatio > 52 : null
    const c6Short = bybit.takerBuyRatio !== null ? bybit.takerBuyRatio < 48 : null

    const longScore  = [c1Long,  c2Long,  c3Long,  c4Long,  c5Long,  c6Long ].filter(c => c === true).length
    const shortScore = [c1Short, c2Short, c3Short, c4Short, c5Short, c6Short].filter(c => c === true).length

    const checklistEntry = {
      date: dateKey, longScore, shortScore,
      tpiState:    tpiSignal,
      price:       btcPrice,
      change24h:   btcChange24h,
      fg:          fearGreed,
      frPct:       parseFloat(frPct.toFixed(4)),
      fundingAvail: true,
      tpiAvail:    tpiSignal !== null,
      ts:          Date.now(),
    }

    const writes = [redisHSet('btc:checklist-daily', dateKey, checklistEntry)]

    // ── VI / VI2 snapshots ────────────────────────────────────────────────────
    if (viSignal?.value != null) {
      writes.push(redisHSet('vi:daily', dateKey, {
        value: viSignal.value, ts: viSignal.ts, updated_at: viSignal.updated_at, date: dateKey,
      }))
    }
    if (vi2Signal?.value != null) {
      writes.push(redisHSet('vi2:daily', dateKey, {
        value: vi2Signal.value, ts: vi2Signal.ts, updated_at: vi2Signal.updated_at, date: dateKey,
      }))
    }

    // ── S2 daily snapshot WITH equity ─────────────────────────────────────────
    let s2EquityResult = null
    if (s2Signal && allPrices) {
      const alloc = s2Signal.alloc  // e.g. { eth: 60, paxg: 40, btc: 0, ... }

      // Find base entry — the earliest s2:daily that has base_prices stored
      // If none exists yet, today becomes the base (equity = 1.0, store base_prices)
      const existingWithBase = existingS2Daily.filter(e => e.base_prices != null)

      let equity    = null
      let isBase    = false
      let basePrices = null

      if (existingWithBase.length === 0) {
        // First ever entry — this is the base day
        equity    = 1.0
        isBase    = true
        basePrices = allPrices  // store today's prices as the base
      } else {
        // Compute today's equity vs base
        const base = existingWithBase[0]  // oldest base entry
        const bp   = base.base_prices

        // Weight today's prices by allocation
        const allocSum = Object.values(alloc || {}).reduce((s, v) => s + v, 0)
        if (allocSum > 0 && bp) {
          const scl = allocSum > 1 ? 100 : 1
          let portfolioReturn = 0, totalWeight = 0
          for (const [asset, rawW] of Object.entries(alloc)) {
            const w = rawW / scl
            if (w === 0) continue
            const baseP  = bp[asset]
            const todayP = allPrices[asset]
            if (!baseP || !todayP) continue
            portfolioReturn += w * (todayP / baseP)
            totalWeight     += w
          }
          if (totalWeight > 0) {
            equity = parseFloat((portfolioReturn / totalWeight).toFixed(6))
          }
        }
      }

      const s2Entry = {
        date:        dateKey,
        asset:       s2Signal.asset   ?? null,
        alloc:       s2Signal.alloc   ?? null,
        scores:      s2Signal.scores  ?? null,
        ts:          Date.now(),
        updated_at:  new Date().toISOString(),
        equity,                         // computed portfolio return vs base day
        ...(isBase ? { base_prices: allPrices } : {}),  // only on first entry
      }

      writes.push(redisHSet('s2:daily', dateKey, s2Entry))
      s2EquityResult = { equity, isBase }
    }

    await Promise.all(writes)

    return Response.json({
      ok: true,
      date: dateKey,
      longScore,
      shortScore,
      tpiSignal,
      vi:       viSignal?.value  ?? null,
      vi2:      vi2Signal?.value ?? null,
      s2_asset: s2Signal?.asset  ?? null,
      s2_alloc: s2Signal?.alloc  ?? null,
      s2_equity: s2EquityResult,
      btc_price: btcPrice,
    })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
