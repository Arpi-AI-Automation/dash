// app/api/cron/daily-score/route.js
// Runs at UTC 00:05 via Vercel cron — final safety net after s2-sync at 00:01–00:04.
// Writes: btc:checklist-daily, vi:daily, vi2:daily, s2:daily (with equity + zero-guard)

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

async function redisHSet(hashKey, field, value) {
  const res = await fetch(
    `${REDIS_URL}/hset/${encodeURIComponent(hashKey)}/${encodeURIComponent(field)}/${encodeURIComponent(JSON.stringify(value))}`,
    { method: 'GET', headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }
  )
  return res.json()
}

async function redisSet(key, value) {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  })
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
  if (allocSum === 0) return 1.0
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
    return { dominanceNow: parseFloat(dominanceNow.toFixed(2)), trend }
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

    const [bybit, fearGreed, tpiSignal, dominance, viSignal, vi2Signal, s2Signal, allPrices, allS2Daily] =
      await Promise.all([
        getBybitFundingOI(),
        getFearGreed(),
        getTpiSignal(),
        getBtcDominance(),
        redisGet('signal:vi'),
        redisGet('signal:vi2'),
        redisGet('signal:s2'),
        getCoinGeckoPrices(),
        redisHGetAll('s2:daily'),
      ])

    const btcPrice = allPrices?.btc ?? null

    // ── Checklist ─────────────────────────────────────────────────────────────
    const frPct       = bybit.fundingRate * 100
    const price24hPct = bybit.price24hPcnt * 100
    const oiRising    = bybit.oiCurr !== null && bybit.oiPrev !== null ? bybit.oiCurr > bybit.oiPrev : null
    const hasDom      = dominance !== null && dominance?.trend !== null

    const conditions = {
      c1Long:  frPct <= 0.005,    c1Short: frPct > 0.05,
      c2Long:  fearGreed !== null ? fearGreed < 30  : null,
      c2Short: fearGreed !== null ? fearGreed > 70  : null,
      c3Long:  tpiSignal === 'LONG',  c3Short: tpiSignal === 'SHORT',
      c4Long:  oiRising !== null ? (oiRising && price24hPct > 0) : null,
      c4Short: oiRising !== null ? (oiRising && price24hPct < 0) : null,
      c5Long:  hasDom ? dominance.trend === 'rising'  : null,
      c5Short: hasDom ? dominance.trend === 'falling' : null,
      c6Long:  bybit.takerBuyRatio !== null ? bybit.takerBuyRatio > 52 : null,
      c6Short: bybit.takerBuyRatio !== null ? bybit.takerBuyRatio < 48 : null,
    }

    const longScore  = ['c1Long','c2Long','c3Long','c4Long','c5Long','c6Long'].filter(k => conditions[k] === true).length
    const shortScore = ['c1Short','c2Short','c3Short','c4Short','c5Short','c6Short'].filter(k => conditions[k] === true).length

    const writes = []

    // ── Checklist daily ───────────────────────────────────────────────────────
    writes.push(redisHSet('btc:checklist-daily', dateKey, {
      date: dateKey, longScore, shortScore,
      tpiState: tpiSignal, price: btcPrice,
      fg: fearGreed, frPct: parseFloat(frPct.toFixed(4)),
      tpiAvail: tpiSignal !== null, ts: Date.now(),
    }))

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

    // ── S2 daily — with zero-alloc guard ─────────────────────────────────────
    // GUARD: If signal:s2 has all-zero alloc (corrupted/stale state from a bad
    // cron write), do NOT write it — find the last known good entry instead.
    let s2WriteResult = 'skipped'

    if (s2Signal) {
      const allocSum = Object.values(s2Signal.alloc ?? {}).reduce((s, v) => s + v, 0)
      const isZeroAlloc = allocSum === 0

      let effectiveAlloc  = s2Signal.alloc
      let effectiveScores = s2Signal.scores
      let effectiveAsset  = s2Signal.asset

      if (isZeroAlloc) {
        // Find last good s2:daily entry (non-zero alloc)
        const lastGood = [...allS2Daily]
          .reverse()
          .find(e => e.alloc && Object.values(e.alloc).reduce((s, v) => s + v, 0) > 0)

        if (lastGood) {
          effectiveAlloc  = lastGood.alloc
          effectiveScores = lastGood.scores ?? effectiveScores
          effectiveAsset  = lastGood.asset  ?? effectiveAsset
          s2WriteResult   = `carried-forward-from-${lastGood.date}`

          // Also repair signal:s2 itself so future cron runs don't perpetuate zeros
          writes.push(redisSet('signal:s2', {
            ...s2Signal,
            alloc:        effectiveAlloc,
            scores:       effectiveScores,
            asset:        effectiveAsset,
            cron_repaired_at: new Date().toISOString(),
            cron_repaired_from: lastGood.date,
          }))
        } else {
          s2WriteResult = 'no-good-entry-found'
        }
      } else {
        s2WriteResult = 'fresh-signal'
      }

      if (effectiveAlloc && Object.values(effectiveAlloc).reduce((s, v) => s + v, 0) > 0) {
        // Compute equity
        const baseEntry  = allS2Daily.find(e => e.base_prices != null)
        const basePrices = baseEntry?.base_prices ?? null
        const equity     = computeEquity(effectiveAlloc, allPrices, basePrices)

        writes.push(redisHSet('s2:daily', dateKey, {
          date:       dateKey,
          asset:      effectiveAsset,
          alloc:      effectiveAlloc,
          scores:     effectiveScores,
          ts:         Date.now(),
          updated_at: new Date().toISOString(),
          equity,
          source:     'daily-score-cron',
          s2_status:  s2WriteResult,
        }))
      }
    }

    await Promise.all(writes)

    return Response.json({
      ok: true, date: dateKey,
      longScore, shortScore, tpiSignal,
      vi:  viSignal?.value  ?? null,
      vi2: vi2Signal?.value ?? null,
      s2_asset: s2Signal?.asset ?? null,
      s2_write: s2WriteResult,
      btc_price: btcPrice,
    })
  } catch (err) {
    console.error('[daily-score] Error:', err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
