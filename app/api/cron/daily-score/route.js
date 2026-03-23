// app/api/cron/daily-score/route.js
// Runs at UTC 00:05 via Vercel cron — final safety net.
// Writes: btc:checklist-daily (full), vi:daily, vi2:daily, s2:daily (with equity)
//
// ZERO-GUARD LOGIC (fixed):
// All-zero alloc is VALID when asset='USD' (cash signal from TradingView).
// Only treat as corrupt if asset is null/empty AND alloc is all zeros.
export const revalidate = 0

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const CRON_SECRET = process.env.CRON_SECRET || 'arpi-cron-2026'

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } })
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
    const res  = await fetch(`${REDIS_URL}/hgetall/${encodeURIComponent(hashKey)}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } })
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
      eth: data.ethereum?.usd ?? null, paxg: data['pax-gold']?.usd ?? null,
      btc: data.bitcoin?.usd   ?? null, sol:  data.solana?.usd      ?? null,
      xrp: data.ripple?.usd    ?? null, bnb:  data.binancecoin?.usd ?? null,
      sui: data.sui?.usd       ?? null, usd:  1.0,
    }
  } catch { return null }
}

function isCashSignal(s2Signal) {
  const asset = (s2Signal?.asset ?? '').toUpperCase()
  return asset === 'USD' || asset === ''
}

function isCorruptSignal(s2Signal) {
  const asset    = (s2Signal?.asset ?? '').toUpperCase()
  const allocSum = Object.values(s2Signal?.alloc ?? {}).reduce((s, v) => s + v, 0)
  const hasAsset = asset.length > 0 && asset !== 'NULL' && asset !== 'UNDEFINED'
  if (hasAsset) return false
  return allocSum === 0
}

function computeEquity(alloc, prices, basePrices) {
  if (!alloc || !prices || !basePrices) return null
  const allocSum = Object.values(alloc).reduce((s, v) => s + v, 0)
  if (allocSum === 0) return null
  const scl = allocSum > 1 ? 100 : 1
  let portfolioReturn = 0, totalWeight = 0
  for (const [asset, rawW] of Object.entries(alloc)) {
    const w     = rawW / scl
    if (w === 0) continue
    const baseP = basePrices[asset]
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
      fundingRate:   t ? parseFloat(t.fundingRate)  : 0,
      oiUsd:         t ? parseFloat(t.openInterestValue) : 0,
      price24hPcnt:  t ? parseFloat(t.price24hPcnt) : 0,
      oiCurr: oi?.result?.list?.[0] ? parseFloat(oi.result.list[0].openInterest) : null,
      oiPrev: oi?.result?.list?.[1] ? parseFloat(oi.result.list[1].openInterest) : null,
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
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://dash-3n2o.vercel.app'}/api/signals?history=false`)
    const d   = await res.json()
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
    const dominanceNow = globalData.data?.market_cap_percentage?.btc ?? null
    const totalMcapNow = globalData.data?.total_market_cap?.usd      ?? null
    const btcCaps      = histData.market_caps ?? []
    if (!dominanceNow || btcCaps.length < 4 || !totalMcapNow) return { dominanceNow, trend: null }
    const btcMcap3dAgo     = btcCaps[0][1]
    const btcMcapNow       = btcCaps[btcCaps.length - 1][1]
    const dominance3dAgo   = (btcMcap3dAgo / totalMcapNow) * 100
    const delta            = dominanceNow - dominance3dAgo
    const trend            = Math.abs(delta) < 0.3 ? 'flat' : delta > 0 ? 'rising' : 'falling'
    return { dominanceNow: parseFloat(dominanceNow.toFixed(2)), dominance3dAgo: parseFloat(dominance3dAgo.toFixed(2)), delta: parseFloat(delta.toFixed(2)), trend }
  } catch { return null }
}

// ── Full checklist builder (same logic as checklist/route.js) ─────────────────
// Duplicated here so the cron doesn't need an internal HTTP call to itself
function buildFullChecklist({ fundingRate, oiUsd, price24hPcnt, oiCurr, oiPrev, takerBuyRatio, fearGreed, tpiSignal, dominance }) {
  const frPct       = fundingRate * 100
  const price24hPct = price24hPcnt * 100
  const hasOiDelta  = oiPrev !== null && oiCurr !== null
  const hasTaker    = takerBuyRatio !== null
  const hasDom      = dominance !== null && dominance?.dominanceNow !== null
  const hasTpi      = tpiSignal !== null
  const oiRising    = hasOiDelta ? oiCurr > oiPrev : null
  const oiDeltaPct  = hasOiDelta ? ((oiCurr - oiPrev) / oiPrev) * 100 : null
  const priceUp     = price24hPct > 0
  const priceDown   = price24hPct < 0

  const c1Long  = frPct <= 0.005
  const c1Short = frPct > 0.05
  const c2Long  = fearGreed !== null ? fearGreed < 30   : null
  const c2Short = fearGreed !== null ? fearGreed > 70   : null
  const c3Long  = hasTpi    ? tpiSignal === 'LONG'       : null
  const c3Short = hasTpi    ? tpiSignal === 'SHORT'      : null
  const c4Long  = hasOiDelta ? (oiRising && priceUp)    : null
  const c4Short = hasOiDelta ? (oiRising && priceDown)  : null
  const domRising  = hasDom ? dominance.trend === 'rising'  : null
  const domFalling = hasDom ? dominance.trend === 'falling' : null
  const c5Long  = hasDom ? domRising   : null
  const c5Short = hasDom ? domFalling  : null
  const c6Long  = hasTaker ? takerBuyRatio > 52 : null
  const c6Short = hasTaker ? takerBuyRatio < 48 : null

  const c2Val = fearGreed !== null ? `${fearGreed}/100` : '—'
  const c4Val = oiUsd > 0 ? `OI $${(oiUsd / 1e9).toFixed(2)}B` : '—'
  const c5Val = hasDom ? (dominance.delta !== null ? `Dom ${dominance.dominanceNow?.toFixed(1)}% (${dominance.delta >= 0 ? '+' : ''}${dominance.delta?.toFixed(2)}% 3d)` : `Dom ${dominance.dominanceNow?.toFixed(1)}%`) : '—'
  const c6Val = hasTaker ? `Buy ${takerBuyRatio?.toFixed(1)}%` : '—'

  const longConditions = [
    { id: 'funding', label: 'Funding neutral/negative (≤ +0.005%)', pass: c1Long,  value: `${frPct >= 0 ? '+' : ''}${frPct.toFixed(4)}%`, detail: c1Long ? `Funding ${frPct >= 0 ? '+' : ''}${frPct.toFixed(4)}% — longs not overpaying` : `Funding +${frPct.toFixed(4)}% — longs paying premium` },
    { id: 'fg',      label: 'Extreme fear (F&G < 30)',              pass: c2Long,  value: c2Val, detail: fearGreed === null ? 'F&G unavailable' : fearGreed < 30 ? `Extreme fear (${fearGreed}) — capitulation zone` : `Fear/Greed ${fearGreed} — not extreme enough` },
    { id: 'tpi',     label: 'TPI confirmed LONG',                   pass: c3Long,  value: hasTpi ? tpiSignal : '—', detail: !hasTpi ? 'TPI unavailable' : tpiSignal === 'LONG' ? 'TPI LONG — trend aligned bullish' : `TPI ${tpiSignal} — not bullish` },
    { id: 'oi',      label: 'OI rising with price rising',          pass: c4Long,  value: c4Val, detail: !hasOiDelta ? 'OI unavailable' : oiRising && priceUp ? `OI +${oiDeltaPct?.toFixed(2)}% with price up — conviction buying` : 'No long OI confirmation' },
    { id: 'dom',     label: 'BTC dominance rising (3-day trend)',   pass: c5Long,  value: c5Val, detail: !hasDom ? 'Dominance unavailable' : domRising ? `Dominance rising — capital rotating into BTC` : `Dominance ${dominance?.trend} — not bullish rotation` },
    { id: 'cvd',     label: 'Taker buy pressure dominant (> 52%)', pass: c6Long,  value: c6Val, detail: !hasTaker ? 'Taker data unavailable' : takerBuyRatio > 52 ? `${takerBuyRatio?.toFixed(1)}% taker buys — aggressive buying` : 'No buy pressure dominance' },
  ]
  const shortConditions = [
    { id: 'funding', label: 'Funding overheated (> +0.05%)',        pass: c1Short, value: `${frPct >= 0 ? '+' : ''}${frPct.toFixed(4)}%`, detail: c1Short ? `Funding +${frPct.toFixed(4)}% — longs overextended` : `Funding ${frPct.toFixed(4)}% — not overheated` },
    { id: 'fg',      label: 'Euphoria (F&G > 70)',                  pass: c2Short, value: c2Val, detail: fearGreed === null ? 'F&G unavailable' : fearGreed > 70 ? `Greed (${fearGreed}) — late cycle euphoria` : `F&G ${fearGreed} — not euphoric` },
    { id: 'tpi',     label: 'TPI confirmed SHORT',                  pass: c3Short, value: hasTpi ? tpiSignal : '—', detail: !hasTpi ? 'TPI unavailable' : tpiSignal === 'SHORT' ? 'TPI SHORT — trend aligned bearish' : `TPI ${tpiSignal} — not bearish` },
    { id: 'oi',      label: 'OI rising with price falling',         pass: c4Short, value: c4Val, detail: !hasOiDelta ? 'OI unavailable' : oiRising && priceDown ? `OI +${oiDeltaPct?.toFixed(2)}% with price down — conviction selling` : 'No short OI confirmation' },
    { id: 'dom',     label: 'BTC dominance falling (3-day trend)',  pass: c5Short, value: c5Val, detail: !hasDom ? 'Dominance unavailable' : domFalling ? `Dominance falling — capital leaving BTC` : `Dominance ${dominance?.trend} — not bearish rotation` },
    { id: 'cvd',     label: 'Taker sell pressure dominant (< 48%)', pass: c6Short, value: c6Val, detail: !hasTaker ? 'Taker data unavailable' : takerBuyRatio < 48 ? `${takerBuyRatio?.toFixed(1)}% taker buys — aggressive selling` : 'No sell pressure dominance' },
  ]

  const longScore  = longConditions.filter(c => c.pass === true).length
  const shortScore = shortConditions.filter(c => c.pass === true).length
  const total      = 6
  const bias       = longScore > shortScore ? 'LONG' : shortScore > longScore ? 'SHORT' : 'NEUTRAL'

  // Leverage verdict
  let leverageVerdict = null
  if (tpiSignal) {
    const conflict = (tpiSignal === 'LONG' && shortScore > longScore) || (tpiSignal === 'SHORT' && longScore > shortScore)
    if (conflict) {
      leverageVerdict = { action: 'CONFLICT', label: 'Signal conflict — stay flat', color: '#f97316', detail: `TPI is ${tpiSignal} but checklist favours ${longScore > shortScore ? 'LONG' : 'SHORT'} — no new entries until resolved` }
    } else if (tpiSignal === 'LONG') {
      const r = longScore / total
      if      (r >= 0.83) leverageVerdict = { action: 'LEVERAGE_OK',  label: '2x Long permissible',    color: '#22c55e', detail: `TPI LONG + ${longScore}/${total} conditions — strong confluence` }
      else if (r >= 0.5)  leverageVerdict = { action: 'SPOT_ONLY',    label: 'Spot only — no leverage', color: '#eab308', detail: `TPI LONG but ${longScore}/${total} — insufficient confluence for leverage` }
      else                leverageVerdict = { action: 'REDUCE',        label: 'Reduce / stay flat',      color: '#ef4444', detail: `TPI LONG but ${longScore}/${total} — conditions not supporting` }
    } else if (tpiSignal === 'SHORT') {
      const r = shortScore / total
      if      (r >= 0.83) leverageVerdict = { action: 'SHORT_OK',    label: 'Short with leverage',       color: '#ef4444', detail: `TPI SHORT + ${shortScore}/${total} — strong confluence` }
      else if (r >= 0.5)  leverageVerdict = { action: 'LIGHT_SHORT', label: 'Light short only',          color: '#eab308', detail: `TPI SHORT but ${shortScore}/${total} — reduce size` }
      else                leverageVerdict = { action: 'HOLD_SHORT',   label: 'Hold — no new short entries', color: '#6b7280', detail: `TPI SHORT but ${shortScore}/${total} — wait for confluence` }
    }
  }

  return { ok: true, bias, longScore, shortScore, total, longConditions, shortConditions, leverageVerdict, tpiSignal,
    meta: { frPct: parseFloat(frPct.toFixed(4)), fearGreed, oiUsd, price24hPct, takerBuyRatio,
      dominance: dominance?.dominanceNow ?? null, dominanceTrend: dominance?.trend ?? null,
      oiDeltaPct: oiDeltaPct ? parseFloat(oiDeltaPct.toFixed(3)) : null } }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret')
  if (secret !== CRON_SECRET) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const dateKey = new Date().toISOString().slice(0, 10)

    const [bybit, fearGreed, tpiSignal, dominance, viSignal, vi2Signal, s2Signal, allPrices, allS2Daily] = await Promise.all([
      getBybitFundingOI(), getFearGreed(), getTpiSignal(), getBtcDominance(),
      redisGet('signal:vi'), redisGet('signal:vi2'), redisGet('signal:s2'),
      getCoinGeckoPrices(), redisHGetAll('s2:daily'),
    ])

    const btcPrice = allPrices?.btc ?? null
    const writes   = []

    // ── Full checklist at daily close ──────────────────────────────────────────
    const checklist = buildFullChecklist({
      fundingRate:   bybit.fundingRate,
      oiUsd:         bybit.oiUsd,
      price24hPcnt:  bybit.price24hPcnt,
      oiCurr:        bybit.oiCurr,
      oiPrev:        bybit.oiPrev,
      takerBuyRatio: bybit.takerBuyRatio,
      fearGreed, tpiSignal, dominance,
    })

    // Write full checklist to Redis — two keys:
    // 1. btc:checklist-daily hash (historical, keyed by date) — scores only for backtest
    // 2. btc:checklist-latest (single key) — full result for component to read
    const { longScore, shortScore } = checklist
    writes.push(redisHSet('btc:checklist-daily', dateKey, {
      date: dateKey, longScore, shortScore,
      tpiState: tpiSignal, price: btcPrice, fg: fearGreed,
      frPct: parseFloat((bybit.fundingRate * 100).toFixed(4)),
      tpiAvail: tpiSignal !== null, ts: Date.now(),
      source: 'daily-cron',
    }))
    // Full result (for DecisionChecklist component) — stored as a single key
    writes.push(redisSet('btc:checklist-latest', {
      ...checklist,
      date: dateKey, ts: Date.now(), source: 'daily-cron',
    }))

    // ── VI / VI2 snapshots ─────────────────────────────────────────────────────
    if (viSignal?.value  != null) writes.push(redisHSet('vi:daily',  dateKey, { value: viSignal.value,  ts: viSignal.ts,  updated_at: viSignal.updated_at,  date: dateKey }))
    if (vi2Signal?.value != null) writes.push(redisHSet('vi2:daily', dateKey, { value: vi2Signal.value, ts: vi2Signal.ts, updated_at: vi2Signal.updated_at, date: dateKey }))

    // ── S2 daily ───────────────────────────────────────────────────────────────
    let s2WriteResult = 'skipped'
    if (s2Signal) {
      const corrupt = isCorruptSignal(s2Signal)
      const cash    = isCashSignal(s2Signal)
      let effectiveSignal = s2Signal
      if (corrupt) {
        const lastGood = [...allS2Daily].reverse().find(e => {
          const asset = (e.asset ?? '').toUpperCase()
          return asset.length > 0 && asset !== 'NULL' && asset !== 'UNDEFINED'
        })
        if (lastGood) {
          effectiveSignal = { ...s2Signal, asset: lastGood.asset, alloc: lastGood.alloc, scores: lastGood.scores }
          s2WriteResult   = `repaired-from-${lastGood.date}`
          writes.push(redisSet('signal:s2', effectiveSignal))
        } else { s2WriteResult = 'no-good-entry-found' }
      } else { s2WriteResult = cash ? 'cash-signal' : 'fresh-signal' }

      const baseEntry  = allS2Daily.find(e => e.base_prices != null)
      const basePrices = baseEntry?.base_prices ?? null
      let equity
      if (cash) {
        const lastNonCash = [...allS2Daily].reverse().find(e => { const a = (e.asset ?? '').toUpperCase(); return a !== 'USD' && a.length > 0 && e.equity != null })
        equity = lastNonCash?.equity ?? 1.0
        s2WriteResult += '+equity-locked'
      } else {
        equity = computeEquity(effectiveSignal.alloc, allPrices, basePrices)
      }
      writes.push(redisHSet('s2:daily', dateKey, { date: dateKey, asset: effectiveSignal.asset, alloc: effectiveSignal.alloc, scores: effectiveSignal.scores, ts: Date.now(), updated_at: new Date().toISOString(), equity, source: 'daily-score-cron', s2_status: s2WriteResult }))
    }

    await Promise.all(writes)

    return Response.json({ ok: true, date: dateKey, longScore, shortScore, tpiSignal, vi: viSignal?.value ?? null, vi2: vi2Signal?.value ?? null, s2_asset: s2Signal?.asset ?? null, s2_write: s2WriteResult, btc_price: btcPrice })
  } catch (err) {
    console.error('[daily-score] Error:', err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
