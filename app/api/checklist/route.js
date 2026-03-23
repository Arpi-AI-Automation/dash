// app/api/checklist/route.js
// Two modes:
// ?stored=true  → read from Redis btc:checklist-latest (daily-close data only, no live Bybit)
// default       → live mode, accepts Bybit params from client (legacy, still works)
export const revalidate = 0

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } })
    const data = await res.json()
    if (!data.result) return null
    return JSON.parse(data.result)
  } catch { return null }
}

async function getFearGreed() {
  const res = await fetch('https://api.alternative.me/fng/?limit=1&format=json', { next: { revalidate: 0 } })
  const d   = await res.json()
  return parseInt(d.data[0].value)
}

async function getTpiSignal() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://dash-3n2o.vercel.app'}/api/signals?history=false`, { next: { revalidate: 0 } })
    const d   = await res.json()
    return d?.btc?.state ?? null
  } catch { return null }
}

async function getBtcDominance() {
  try {
    const [globalRes, btcRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/global', { next: { revalidate: 0 } }),
      fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=4&interval=daily', { next: { revalidate: 0 } }),
    ])
    if (globalRes.ok && btcRes.ok) {
      const globalData   = await globalRes.json()
      const btcData      = await btcRes.json()
      const dominanceNow = globalData.data?.market_cap_percentage?.btc ?? null
      const totalMcapNow = globalData.data?.total_market_cap?.usd      ?? null
      const btcCaps      = btcData.market_caps ?? []
      if (dominanceNow !== null && totalMcapNow !== null && btcCaps.length >= 2) {
        const btcMcap3dAgo   = btcCaps[0][1]
        const btcMcapNow     = btcCaps[btcCaps.length - 1][1]
        const dominance3dAgo = (btcMcap3dAgo / totalMcapNow) * 100
        const delta          = dominanceNow - dominance3dAgo
        const trend          = Math.abs(delta) < 0.3 ? 'flat' : delta > 0 ? 'rising' : 'falling'
        return { dominanceNow: parseFloat(dominanceNow.toFixed(2)), dominance3dAgo: parseFloat(dominance3dAgo.toFixed(2)), delta: parseFloat(delta.toFixed(2)), trend }
      }
    }
  } catch (e) { console.error('[dominance]', e?.message) }
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', { next: { revalidate: 0 } })
    if (res.ok) { const d = await res.json(); const dominanceNow = d.data?.market_cap_percentage?.btc ?? null; if (dominanceNow !== null) return { dominanceNow: parseFloat(dominanceNow.toFixed(2)), dominance3dAgo: null, delta: null, trend: null } }
  } catch {}
  return null
}

export function buildChecklist({ frOi, fearGreed, tpiSignal, oiPrev, oiCurr, takerBuyRatio, dominance }) {
  const frPct       = frOi.fundingRate * 100
  const oiUsd       = frOi.openInterestValue
  const price24hPct = frOi.price24hPcnt * 100
  const hasOiDelta  = oiPrev !== null && oiCurr !== null
  const hasTaker    = takerBuyRatio !== null
  const hasDom      = dominance !== null && dominance?.dominanceNow !== null
  const hasTpi      = tpiSignal !== null
  const oiRising    = hasOiDelta ? oiCurr > oiPrev   : null
  const oiDeltaPct  = hasOiDelta ? ((oiCurr - oiPrev) / oiPrev) * 100 : null
  const priceUp     = price24hPct > 0
  const priceDown   = price24hPct < 0

  const c1Long  = frPct <= 0.005;  const c1Short = frPct > 0.05
  const c2Long  = fearGreed !== null ? fearGreed < 30  : null; const c2Short = fearGreed !== null ? fearGreed > 70 : null
  const c3Long  = hasTpi ? tpiSignal === 'LONG' : null;        const c3Short = hasTpi ? tpiSignal === 'SHORT' : null
  const c4Long  = hasOiDelta ? (oiRising && priceUp)  : null;  const c4Short = hasOiDelta ? (oiRising && priceDown) : null
  const domRising  = hasDom ? dominance.trend === 'rising'  : null
  const domFalling = hasDom ? dominance.trend === 'falling' : null
  const c5Long  = hasDom ? domRising  : null;  const c5Short = hasDom ? domFalling : null
  const c6Long  = hasTaker ? takerBuyRatio > 52 : null; const c6Short = hasTaker ? takerBuyRatio < 48 : null

  const c2Val = fearGreed !== null ? `${fearGreed}/100` : '—'
  const c4Val = oiUsd > 0 ? `OI $${(oiUsd / 1e9).toFixed(2)}B` : '—'
  const c5Val = hasDom ? (dominance.delta !== null ? `Dom ${dominance.dominanceNow?.toFixed(1)}% (${dominance.delta >= 0 ? '+' : ''}${dominance.delta?.toFixed(2)}% 3d)` : `Dom ${dominance.dominanceNow?.toFixed(1)}%`) : '—'
  const c6Val = hasTaker ? `Buy ${takerBuyRatio?.toFixed(1)}%` : '—'

  const longConditions = [
    { id: 'funding', label: 'Funding neutral/negative (≤ +0.005%)', pass: c1Long,  value: `${frPct >= 0 ? '+' : ''}${frPct.toFixed(4)}%`, detail: c1Long ? `Funding ${frPct >= 0 ? '+' : ''}${frPct.toFixed(4)}% — longs not overpaying, no flush risk` : `Funding +${frPct.toFixed(4)}% — longs paying premium, elevated flush risk` },
    { id: 'fg',      label: 'Extreme fear (F&G < 30)',              pass: c2Long,  value: c2Val, detail: fearGreed === null ? 'F&G unavailable' : fearGreed < 30 ? `Extreme fear (${fearGreed}) — capitulation zone, strong long risk/reward` : fearGreed < 50 ? `Fear (${fearGreed}) — below neutral, not extreme enough` : `Fear/Greed ${fearGreed} — no contrarian long signal` },
    { id: 'tpi',     label: 'TPI confirmed LONG',                   pass: c3Long,  value: hasTpi ? tpiSignal : '—', detail: !hasTpi ? 'TPI signal unavailable — connect webhook' : tpiSignal === 'LONG' ? 'TPI confirmed LONG — multi-factor trend aligned bullish' : `TPI confirmed ${tpiSignal} — not aligned for long` },
    { id: 'oi',      label: 'OI rising with price rising',          pass: c4Long,  value: c4Val, detail: !hasOiDelta ? 'OI data unavailable' : oiRising && priceUp ? `OI +${oiDeltaPct?.toFixed(2)}% with price up — real conviction buying` : oiRising && priceDown ? `OI rising but price falling — shorts adding` : `OI declining — money leaving market` },
    { id: 'dom',     label: 'BTC dominance rising (3-day trend)',   pass: c5Long,  value: c5Val, detail: !hasDom ? 'Dominance data unavailable' : domRising ? `BTC dominance ${dominance.dominanceNow?.toFixed(1)}% rising — capital rotating into BTC` : `BTC dominance ${dominance.dominanceNow?.toFixed(1)}% ${dominance.trend} — not bullish rotation` },
    { id: 'cvd',     label: 'Taker buy pressure dominant (> 52%)', pass: c6Long,  value: c6Val, detail: !hasTaker ? 'Taker data unavailable' : takerBuyRatio > 52 ? `${takerBuyRatio?.toFixed(1)}% taker buys — aggressive buying dominant` : `${takerBuyRatio?.toFixed(1)}% taker buys — no buy pressure dominance` },
  ]
  const shortConditions = [
    { id: 'funding', label: 'Funding overheated (> +0.05%)',        pass: c1Short, value: `${frPct >= 0 ? '+' : ''}${frPct.toFixed(4)}%`, detail: c1Short ? `Funding +${frPct.toFixed(4)}% — longs overextended, squeeze candidate` : `Funding ${frPct.toFixed(4)}% — not overheated` },
    { id: 'fg',      label: 'Euphoria (F&G > 70)',                  pass: c2Short, value: c2Val, detail: fearGreed === null ? 'F&G unavailable' : fearGreed > 70 ? `Greed (${fearGreed}) — late cycle euphoria, contrarian short setup` : `F&G ${fearGreed} — not in greed zone` },
    { id: 'tpi',     label: 'TPI confirmed SHORT',                  pass: c3Short, value: hasTpi ? tpiSignal : '—', detail: !hasTpi ? 'TPI signal unavailable' : tpiSignal === 'SHORT' ? 'TPI confirmed SHORT — multi-factor trend aligned bearish' : `TPI confirmed ${tpiSignal} — not aligned for short` },
    { id: 'oi',      label: 'OI rising with price falling',         pass: c4Short, value: c4Val, detail: !hasOiDelta ? 'OI data unavailable' : oiRising && priceDown ? `OI +${oiDeltaPct?.toFixed(2)}% with price down — real selling conviction` : oiRising && priceUp ? `OI rising with price — buyers in control` : `No OI confirmation for short` },
    { id: 'dom',     label: 'BTC dominance falling (3-day trend)',  pass: c5Short, value: c5Val, detail: !hasDom ? 'Dominance data unavailable' : domFalling ? `BTC dominance ${dominance.dominanceNow?.toFixed(1)}% falling — capital leaving BTC` : `BTC dominance ${dominance.dominanceNow?.toFixed(1)}% ${dominance.trend} — not bearish rotation` },
    { id: 'cvd',     label: 'Taker sell pressure dominant (< 48%)', pass: c6Short, value: c6Val, detail: !hasTaker ? 'Taker data unavailable' : takerBuyRatio < 48 ? `${takerBuyRatio?.toFixed(1)}% taker buys — aggressive selling dominant` : `${takerBuyRatio?.toFixed(1)}% taker buys — no sell pressure dominance` },
  ]

  const longScore  = longConditions.filter(c => c.pass === true).length
  const shortScore = shortConditions.filter(c => c.pass === true).length
  const total      = 6
  const bias       = longScore > shortScore ? 'LONG' : shortScore > longScore ? 'SHORT' : 'NEUTRAL'

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
      if      (r >= 0.83) leverageVerdict = { action: 'SHORT_OK',    label: 'Short with leverage',        color: '#ef4444', detail: `TPI SHORT + ${shortScore}/${total} — strong confluence` }
      else if (r >= 0.5)  leverageVerdict = { action: 'LIGHT_SHORT', label: 'Light short only',           color: '#eab308', detail: `TPI SHORT but ${shortScore}/${total} — reduce size` }
      else                leverageVerdict = { action: 'HOLD_SHORT',   label: 'Hold — no new short entries', color: '#6b7280', detail: `TPI SHORT but ${shortScore}/${total} — wait for confluence` }
    }
  }

  return { ok: true, bias, longScore, shortScore, total, longConditions, shortConditions, leverageVerdict, tpiSignal,
    meta: { frPct: parseFloat(frPct.toFixed(4)), fearGreed, oiUsd, price24hPct, takerBuyRatio,
      dominance: dominance?.dominanceNow ?? null, dominanceTrend: dominance?.trend ?? null,
      oiDeltaPct: oiDeltaPct ? parseFloat(oiDeltaPct.toFixed(3)) : null } }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)

    // ── STORED MODE: read from Redis daily-close snapshot ─────────────────────
    // Used by the DecisionChecklist component — daily candle data only
    if (searchParams.get('stored') === 'true') {
      const stored = await redisGet('btc:checklist-latest')
      if (stored) {
        return Response.json({ ...stored, ok: true, source: 'daily-close' })
      }
      // No stored data yet — fall through to live mode as bootstrap
      return Response.json({ ok: false, error: 'No daily close data yet — cron has not fired. Will populate at UTC 00:05.' }, { status: 404 })
    }

    // ── LIVE MODE: accepts Bybit params from client (used by DailyBrief for raw scores) ──
    const fundingRate  = searchParams.get('fundingRate')  ? parseFloat(searchParams.get('fundingRate'))  : 0
    const oiUsdParam   = searchParams.get('oiUsd')        ? parseFloat(searchParams.get('oiUsd'))        : 0
    const price24hPcnt = searchParams.get('price24hPcnt') ? parseFloat(searchParams.get('price24hPcnt')) : 0
    const frOi         = { fundingRate, openInterestValue: oiUsdParam, markPrice: 0, price24hPcnt }
    const oiPrev       = searchParams.get('oiPrev')        ? parseFloat(searchParams.get('oiPrev'))        : null
    const oiCurr       = searchParams.get('oiCurr')        ? parseFloat(searchParams.get('oiCurr'))        : null
    const takerBuyRatio = searchParams.get('takerBuyRatio') ? parseFloat(searchParams.get('takerBuyRatio')) : null

    const [fgR, tpiR, domR] = await Promise.allSettled([getFearGreed(), getTpiSignal(), getBtcDominance()])
    const fearGreed  = fgR.status  === 'fulfilled' ? fgR.value  : null
    const tpiSignal  = tpiR.status === 'fulfilled' ? tpiR.value : null
    const dominance  = domR.status === 'fulfilled' ? domR.value : null

    return Response.json(buildChecklist({ frOi, fearGreed, tpiSignal, oiPrev, oiCurr, takerBuyRatio, dominance }))
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
