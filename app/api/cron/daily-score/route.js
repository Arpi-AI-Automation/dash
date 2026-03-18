// app/api/cron/daily-score/route.js
// Runs at UTC midnight via Vercel cron.
// Fetches server-side checklist conditions and writes today's score to Redis.
// Bybit client-side params (FR, OI, taker) are fetched from Bybit REST here
// since this is a server-side cron — Bybit is accessible from Vercel.

export const revalidate = 0

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const CRON_SECRET = process.env.CRON_SECRET || 'arpi-cron-2026'

const redisHeaders = {
  Authorization: `Bearer ${REDIS_TOKEN}`,
  'Content-Type': 'application/json',
}

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
  const res = await fetch(`${REDIS_URL}/hset/${encodeURIComponent(hashKey)}/${encodeURIComponent(field)}/${encodeURIComponent(JSON.stringify(value))}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  })
  return res.json()
}

// ── Fetch Bybit funding rate + OI (server-side accessible) ──────────────────
async function getBybitFundingOI() {
  try {
    const [tickerRes, oiRes, takerRes] = await Promise.all([
      fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT'),
      fetch('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=2'),
      fetch('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1d&limit=1'),
    ])
    const [ticker, oi, taker] = await Promise.all([tickerRes.json(), oiRes.json(), takerRes.json()])

    const t = ticker?.result?.list?.[0]
    const fundingRate  = t ? parseFloat(t.fundingRate)       : 0
    const oiUsd        = t ? parseFloat(t.openInterestValue) : 0
    const price24hPcnt = t ? parseFloat(t.price24hPcnt)      : 0

    const oiList = oi?.result?.list ?? []
    const oiCurr = oiList[0] ? parseFloat(oiList[0].openInterest) : null
    const oiPrev = oiList[1] ? parseFloat(oiList[1].openInterest) : null

    const takerList      = taker?.result?.list ?? []
    const takerBuyRatio  = takerList[0] ? parseFloat(takerList[0].buyRatio) * 100 : null

    return { fundingRate, oiUsd, price24hPcnt, oiCurr, oiPrev, takerBuyRatio }
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
    const btcMcap3dAgo      = btcCaps[0][1]
    const btcMcapNow        = btcCaps[btcCaps.length - 1][1]
    const btcMcapChangePct  = ((btcMcapNow - btcMcap3dAgo) / btcMcap3dAgo) * 100
    const impliedTotal3d    = mcapChange24h * 3
    const trend = Math.abs(btcMcapChangePct - impliedTotal3d) < 0.5 ? 'flat'
      : btcMcapChangePct > impliedTotal3d ? 'rising' : 'falling'
    return { dominanceNow: parseFloat(dominanceNow.toFixed(2)), btcMcapChangePct: parseFloat(btcMcapChangePct.toFixed(2)), trend }
  } catch { return null }
}

async function getBtcPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true')
    const d   = await res.json()
    return { price: d.bitcoin?.usd ?? null, change24h: d.bitcoin?.usd_24h_change ?? null }
  } catch { return { price: null, change24h: null } }
}

export async function GET(request) {
  // Verify cron secret
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret')
  if (secret !== CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const dateKey = new Date().toISOString().slice(0, 10)

    const [bybit, fearGreed, tpiSignal, dominance, btcPrice, viSignal, vi2Signal] = await Promise.all([
      getBybitFundingOI(),
      getFearGreed(),
      getTpiSignal(),
      getBtcDominance(),
      getBtcPrice(),
      redisGet('signal:vi'),
      redisGet('signal:vi2'),
    ])

    const frOi = {
      fundingRate:        bybit.fundingRate,
      openInterestValue:  bybit.oiUsd,
      price24hPcnt:       bybit.price24hPcnt,
      markPrice:          0,
    }

    // Import buildChecklist logic inline (can't import from route.js server-side cleanly)
    const frPct        = frOi.fundingRate * 100
    const price24hPct  = frOi.price24hPcnt * 100
    const oiRising     = bybit.oiCurr !== null && bybit.oiPrev !== null ? bybit.oiCurr > bybit.oiPrev : null
    const priceUp      = price24hPct > 0
    const priceDown    = price24hPct < 0
    const hasDom       = dominance !== null && dominance?.trend !== null
    const domRising    = hasDom ? dominance.trend === 'rising'  : null
    const domFalling   = hasDom ? dominance.trend === 'falling' : null

    const c1Long  = frPct <= 0.005
    const c1Short = frPct > 0.05
    const c2Long  = fearGreed !== null ? fearGreed < 30  : null
    const c2Short = fearGreed !== null ? fearGreed > 70  : null
    const c3Long  = tpiSignal === 'LONG'
    const c3Short = tpiSignal === 'SHORT'
    const c4Long  = oiRising !== null ? (oiRising && priceUp)   : null
    const c4Short = oiRising !== null ? (oiRising && priceDown) : null
    const c5Long  = hasDom ? domRising  : null
    const c5Short = hasDom ? domFalling : null
    const c6Long  = bybit.takerBuyRatio !== null ? bybit.takerBuyRatio > 52 : null
    const c6Short = bybit.takerBuyRatio !== null ? bybit.takerBuyRatio < 48 : null

    const longScore  = [c1Long,  c2Long,  c3Long,  c4Long,  c5Long,  c6Long ].filter(c => c === true).length
    const shortScore = [c1Short, c2Short, c3Short, c4Short, c5Short, c6Short].filter(c => c === true).length

    const entry = {
      date:       dateKey,
      longScore,
      shortScore,
      tpiState:   tpiSignal,
      price:      btcPrice.price,
      change24h:  btcPrice.change24h ? parseFloat(btcPrice.change24h.toFixed(2)) : null,
      fg:         fearGreed,
      frPct:      parseFloat(frPct.toFixed(4)),
      fundingAvail: true,
      tpiAvail:   tpiSignal !== null,
      ts:         Date.now(),
    }

    const writes = [redisHSet('btc:checklist-daily', dateKey, entry)]

    // Persist today's VI/VI2 values to their daily hashes so history accumulates
    if (viSignal?.value != null) {
      writes.push(redisHSet('vi:daily', dateKey, {
        value:      viSignal.value,
        ts:         viSignal.ts,
        updated_at: viSignal.updated_at,
        date:       dateKey,
      }))
    }
    if (vi2Signal?.value != null) {
      writes.push(redisHSet('vi2:daily', dateKey, {
        value:      vi2Signal.value,
        ts:         vi2Signal.ts,
        updated_at: vi2Signal.updated_at,
        date:       dateKey,
      }))
    }

    await Promise.all(writes)

    return Response.json({ ok: true, date: dateKey, longScore, shortScore, tpiSignal,
      vi: viSignal?.value ?? null, vi2: vi2Signal?.value ?? null, entry })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
