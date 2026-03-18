export const revalidate = 0

// ─── DATA SOURCES ────────────────────────────────────────────────────────────
// Server-side (Vercel OK):
//   ✅ Alternative.me        — fear & greed
//   ✅ Redis signals API     — TPI state (LONG/SHORT)
//   ✅ CoinGecko /global     — BTC dominance (condition 5)
//   ✅ CoinGecko market_chart — BTC dominance 3-day trend
//
// Client-side only (Vercel IP blocked) — passed in via query params:
//   ❌ Bybit ticker          — funding rate, OI USD, 24h price pct
//   ❌ Bybit OI history      — daily OI delta (condition 4)
//   ❌ Bybit taker ratio     — CVD proxy (condition 6)

async function getFearGreed() {
  const res = await fetch(
    'https://api.alternative.me/fng/?limit=1&format=json',
    { next: { revalidate: 0 } }
  )
  const d = await res.json()
  return parseInt(d.data[0].value)
}

async function getTpiSignal() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://dash-3n2o.vercel.app'}/api/signals?history=false`,
      { next: { revalidate: 0 } }
    )
    const d = await res.json()
    return d?.btc?.state ?? null
  } catch { return null }
}

async function getBtcDominance() {
  // Returns { dominanceNow, dominance3dAgo, trend }
  // trend: 'rising' | 'falling' | 'flat'
  // Strategy: fetch BTC mcap history + total mcap history, compute real dominance at both ends
  try {
    const [btcRes, totalRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=4&interval=daily', { next: { revalidate: 0 } }),
      fetch('https://api.coingecko.com/api/v3/global/market_cap_chart?vs_currency=usd&days=4', { next: { revalidate: 0 } }),
    ])

    if (!btcRes.ok || !totalRes.ok) return null

    const btcData   = await btcRes.json()
    const totalData = await totalRes.json()

    const btcCaps   = btcData.market_caps   ?? []  // [[ts, value], ...]
    const totalCaps = totalData.market_cap_chart?.market_cap ?? []

    if (btcCaps.length < 2 || totalCaps.length < 2) return null

    // Oldest point (~3-4 days ago)
    const btcOld   = btcCaps[0][1]
    const totalOld = totalCaps[0][1]
    // Newest point
    const btcNew   = btcCaps[btcCaps.length - 1][1]
    const totalNew = totalCaps[totalCaps.length - 1][1]

    if (!btcOld || !totalOld || !btcNew || !totalNew) return null

    const dominanceNow  = (btcNew / totalNew) * 100
    const dominance3dAgo = (btcOld / totalOld) * 100
    const delta = dominanceNow - dominance3dAgo

    const trend = Math.abs(delta) < 0.3 ? 'flat' : delta > 0 ? 'rising' : 'falling'

    return {
      dominanceNow:   parseFloat(dominanceNow.toFixed(2)),
      dominance3dAgo: parseFloat(dominance3dAgo.toFixed(2)),
      delta:          parseFloat(delta.toFixed(2)),
      trend,
    }
  } catch { return null }
}

export function buildChecklist({ frOi, fearGreed, tpiSignal, oiPrev, oiCurr, takerBuyRatio, dominance }) {
  const frPct       = frOi.fundingRate * 100
  const oiUsd       = frOi.openInterestValue
  const price24hPct = frOi.price24hPcnt * 100

  // ── Condition availability flags ──────────────────────────────────────────
  const hasOiDelta = oiPrev !== null && oiCurr !== null
  const hasTaker   = takerBuyRatio !== null
  const hasDom     = dominance !== null && dominance?.trend !== null
  const hasTpi     = tpiSignal !== null

  const oiRising   = hasOiDelta ? oiCurr > oiPrev : null
  const oiDeltaPct = hasOiDelta ? ((oiCurr - oiPrev) / oiPrev) * 100 : null
  const priceUp    = price24hPct > 0
  const priceDown  = price24hPct < 0

  // ── CONDITION 1: Funding Rate ─────────────────────────────────────────────
  const c1Long  = frPct <= 0.005
  const c1Short = frPct > 0.05
  const c1LongDetail  = c1Long
    ? `Funding ${frPct >= 0 ? '+' : ''}${frPct.toFixed(4)}% — longs not overpaying, no flush risk`
    : `Funding +${frPct.toFixed(4)}% — longs paying premium, elevated flush risk`
  const c1ShortDetail = c1Short
    ? `Funding +${frPct.toFixed(4)}% — longs overextended, squeeze candidate`
    : `Funding ${frPct >= 0 ? '+' : ''}${frPct.toFixed(4)}% — not overheated`

  // ── CONDITION 2: Fear & Greed ─────────────────────────────────────────────
  const c2Long  = fearGreed !== null ? fearGreed < 30 : null
  const c2Short = fearGreed !== null ? fearGreed > 70 : null
  const c2Val   = fearGreed !== null ? `${fearGreed}/100` : '—'
  const c2LongDetail  = fearGreed === null ? 'F&G unavailable'
    : fearGreed < 30 ? `Extreme fear (${fearGreed}) — capitulation zone, strong long risk/reward`
    : fearGreed < 50 ? `Fear (${fearGreed}) — below neutral, not extreme enough for contrarian long`
    : fearGreed < 70 ? `Neutral/greed (${fearGreed}) — no contrarian long signal`
    : `Greed (${fearGreed}) — crowd is long, against long entry`
  const c2ShortDetail = fearGreed === null ? 'F&G unavailable'
    : fearGreed > 70 ? `Greed (${fearGreed}) — late cycle euphoria, contrarian short setup`
    : `Not in greed zone (${fearGreed}) — no contrarian short signal`

  // ── CONDITION 3: TPI State ────────────────────────────────────────────────
  const c3Long  = hasTpi ? tpiSignal === 'LONG'  : null
  const c3Short = hasTpi ? tpiSignal === 'SHORT' : null
  const c3LongDetail  = !hasTpi ? 'TPI signal unavailable — connect webhook'
    : tpiSignal === 'LONG'  ? 'TPI confirmed LONG — multi-factor trend aligned bullish'
    : tpiSignal === 'SHORT' ? 'TPI confirmed SHORT — trend structure bearish'
    : 'TPI NEUTRAL — no directional edge'
  const c3ShortDetail = !hasTpi ? 'TPI signal unavailable'
    : tpiSignal === 'SHORT' ? 'TPI confirmed SHORT — multi-factor trend aligned bearish'
    : tpiSignal === 'LONG'  ? 'TPI confirmed LONG — trend structure bullish'
    : 'TPI NEUTRAL'

  // ── CONDITION 4: OI + Price Direction ─────────────────────────────────────
  const c4Long  = hasOiDelta ? (oiRising && priceUp)   : null
  const c4Short = hasOiDelta ? (oiRising && priceDown) : null
  const c4Val   = oiUsd > 0  ? `OI $${(oiUsd / 1e9).toFixed(2)}B` : '—'
  const c4LongDetail = !hasOiDelta ? 'OI data unavailable'
    : oiRising && priceUp   ? `OI +${oiDeltaPct?.toFixed(2)}% with price up — real conviction buying`
    : oiRising && priceDown ? `OI rising but price falling — shorts adding, not long-friendly`
    : !oiRising && priceUp  ? `Price up but OI declining — short squeeze, not organic buying`
    : `OI declining — money leaving market`
  const c4ShortDetail = !hasOiDelta ? 'OI data unavailable'
    : oiRising && priceDown ? `OI +${oiDeltaPct?.toFixed(2)}% with price down — real selling conviction`
    : oiRising && priceUp   ? `OI rising with price — buyers in control, not short-friendly`
    : `No OI confirmation for short`

  // ── CONDITION 5: BTC Dominance 3-day trend ───────────────────────────────
  // Long:  dominance rising — capital rotating INTO BTC, structurally bullish
  // Short: dominance falling — capital rotating OUT of BTC into alts/risk-off
  const domRising  = hasDom ? dominance.trend === 'rising' : null
  const domFalling = hasDom ? dominance.trend === 'falling' : null
  const c5Long  = hasDom ? domRising  : null
  const c5Short = hasDom ? domFalling : null
  const c5Val   = hasDom ? `Dom ${dominance.dominanceNow?.toFixed(1)}% (${dominance.delta >= 0 ? '+' : ''}${dominance.delta?.toFixed(2)}% 3d)` : '—'
  const c5LongDetail  = !hasDom ? 'Dominance data unavailable'
    : domRising  ? `BTC dominance ${dominance.dominanceNow?.toFixed(1)}% rising — capital rotating into BTC, bullish`
    : domFalling ? `BTC dominance ${dominance.dominanceNow?.toFixed(1)}% falling — capital rotating to alts`
    : `BTC dominance ${dominance.dominanceNow?.toFixed(1)}% flat — no directional rotation signal`
  const c5ShortDetail = !hasDom ? 'Dominance data unavailable'
    : domFalling ? `BTC dominance ${dominance.dominanceNow?.toFixed(1)}% falling — capital leaving BTC, bearish`
    : domRising  ? `BTC dominance ${dominance.dominanceNow?.toFixed(1)}% rising — BTC preferred, not short-friendly`
    : `BTC dominance ${dominance.dominanceNow?.toFixed(1)}% flat — no directional signal`

  // ── CONDITION 6: CVD — Taker Buy/Sell Pressure ───────────────────────────
  const c6Long  = hasTaker ? takerBuyRatio > 52 : null
  const c6Short = hasTaker ? takerBuyRatio < 48 : null
  const c6Val   = hasTaker ? `Buy ${takerBuyRatio?.toFixed(1)}%` : '—'
  const c6LongDetail  = !hasTaker ? 'Taker data unavailable'
    : takerBuyRatio > 52 ? `${takerBuyRatio?.toFixed(1)}% taker buys — aggressive buying dominant`
    : takerBuyRatio > 48 ? `${takerBuyRatio?.toFixed(1)}% taker buys — slight buy lean, not strong`
    : `${takerBuyRatio?.toFixed(1)}% taker buys — sellers aggressive, not long-friendly`
  const c6ShortDetail = !hasTaker ? 'Taker data unavailable'
    : takerBuyRatio < 48 ? `${takerBuyRatio?.toFixed(1)}% taker buys — aggressive selling dominant`
    : takerBuyRatio < 52 ? `${takerBuyRatio?.toFixed(1)}% taker buys — slight sell lean`
    : `${takerBuyRatio?.toFixed(1)}% taker buys — buyers dominant, not short-friendly`

  // ── ASSEMBLE CONDITIONS ───────────────────────────────────────────────────
  const longConditions = [
    { id: 'funding', label: 'Funding neutral/negative (≤ +0.005%)',    pass: c1Long,  value: `${frPct >= 0 ? '+' : ''}${frPct.toFixed(4)}%`, detail: c1LongDetail },
    { id: 'fg',      label: 'Extreme fear (F&G < 30)',                 pass: c2Long,  value: c2Val, detail: c2LongDetail },
    { id: 'tpi',     label: 'TPI confirmed LONG',                      pass: c3Long,  value: hasTpi ? tpiSignal : '—', detail: c3LongDetail },
    { id: 'oi',      label: 'OI rising with price rising',             pass: c4Long,  value: c4Val, detail: c4LongDetail },
    { id: 'dom',     label: 'BTC dominance rising (3-day trend)',      pass: c5Long,  value: c5Val, detail: c5LongDetail },
    { id: 'cvd',     label: 'Taker buy pressure dominant (> 52%)',     pass: c6Long,  value: c6Val, detail: c6LongDetail },
  ]

  const shortConditions = [
    { id: 'funding', label: 'Funding overheated (> +0.05%)',           pass: c1Short, value: `${frPct >= 0 ? '+' : ''}${frPct.toFixed(4)}%`, detail: c1ShortDetail },
    { id: 'fg',      label: 'Euphoria (F&G > 70)',                     pass: c2Short, value: c2Val, detail: c2ShortDetail },
    { id: 'tpi',     label: 'TPI confirmed SHORT',                     pass: c3Short, value: hasTpi ? tpiSignal : '—', detail: c3ShortDetail },
    { id: 'oi',      label: 'OI rising with price falling',            pass: c4Short, value: c4Val, detail: c4ShortDetail },
    { id: 'dom',     label: 'BTC dominance falling (3-day trend)',     pass: c5Short, value: c5Val, detail: c5ShortDetail },
    { id: 'cvd',     label: 'Taker sell pressure dominant (< 48%)',    pass: c6Short, value: c6Val, detail: c6ShortDetail },
  ]

  const longScore  = longConditions.filter(c => c.pass === true).length
  const shortScore = shortConditions.filter(c => c.pass === true).length
  const total      = 6
  const bias       = longScore > shortScore ? 'LONG' : shortScore > longScore ? 'SHORT' : 'NEUTRAL'

  // ── LEVERAGE VERDICT ──────────────────────────────────────────────────────
  let leverageVerdict = null
  if (tpiSignal) {
    const conflict = (tpiSignal === 'LONG' && shortScore > longScore)
      || (tpiSignal === 'SHORT' && longScore > shortScore)

    if (conflict) {
      leverageVerdict = { action: 'CONFLICT', label: 'Signal conflict — stay flat', color: '#f97316',
        detail: `TPI is ${tpiSignal} but checklist favours ${longScore > shortScore ? 'LONG' : 'SHORT'} — no new entries until resolved` }
    } else if (tpiSignal === 'LONG') {
      const r = longScore / total
      if (r >= 0.83)     leverageVerdict = { action: 'LEVERAGE_OK', label: '2x Long permissible',         color: '#22c55e', detail: `TPI LONG + checklist ${longScore}/${total} — strong confluence` }
      else if (r >= 0.5) leverageVerdict = { action: 'SPOT_ONLY',   label: 'Spot only — no leverage',     color: '#eab308', detail: `TPI LONG but checklist only ${longScore}/${total} — insufficient confluence for leverage` }
      else               leverageVerdict = { action: 'REDUCE',       label: 'Reduce / stay flat',          color: '#ef4444', detail: `TPI LONG but checklist ${longScore}/${total} — conditions not supporting` }
    } else if (tpiSignal === 'SHORT') {
      const r = shortScore / total
      if (r >= 0.83)     leverageVerdict = { action: 'SHORT_OK',    label: 'Short with leverage',          color: '#ef4444', detail: `TPI SHORT + checklist ${shortScore}/${total} — strong confluence` }
      else if (r >= 0.5) leverageVerdict = { action: 'LIGHT_SHORT', label: 'Light short only',             color: '#eab308', detail: `TPI SHORT but checklist only ${shortScore}/${total} — reduce size` }
      else               leverageVerdict = { action: 'HOLD_SHORT',   label: 'Hold — no new short entries', color: '#6b7280', detail: `TPI SHORT but checklist ${shortScore}/${total} — wait for confluence` }
    }
  }

  return {
    ok: true, bias, longScore, shortScore, total,
    longConditions, shortConditions, leverageVerdict,
    tpiSignal,
    meta: { frPct, fearGreed, oiUsd, price24hPct, takerBuyRatio,
      dominance: dominance?.dominanceNow ?? null,
      dominanceTrend: dominance?.trend ?? null,
      oiDeltaPct: oiDeltaPct ? parseFloat(oiDeltaPct.toFixed(3)) : null },
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)

    // Bybit ticker — client-side only (Vercel IP blocked)
    const fundingRate  = searchParams.get('fundingRate')  ? parseFloat(searchParams.get('fundingRate'))  : 0
    const oiUsdParam   = searchParams.get('oiUsd')        ? parseFloat(searchParams.get('oiUsd'))        : 0
    const price24hPcnt = searchParams.get('price24hPcnt') ? parseFloat(searchParams.get('price24hPcnt')) : 0
    const frOi = { fundingRate, openInterestValue: oiUsdParam, markPrice: 0, price24hPcnt }

    // Bybit OI + taker — client-side only
    const oiPrev        = searchParams.get('oiPrev')        ? parseFloat(searchParams.get('oiPrev'))        : null
    const oiCurr        = searchParams.get('oiCurr')        ? parseFloat(searchParams.get('oiCurr'))        : null
    const takerBuyRatio = searchParams.get('takerBuyRatio') ? parseFloat(searchParams.get('takerBuyRatio')) : null

    const [fgR, tpiR, domR] = await Promise.allSettled([
      getFearGreed(),
      getTpiSignal(),
      getBtcDominance(),
    ])

    const fearGreed = fgR.status  === 'fulfilled' ? fgR.value  : null
    const tpiSignal = tpiR.status === 'fulfilled' ? tpiR.value : null
    const dominance = domR.status === 'fulfilled' ? domR.value : null

    return Response.json(buildChecklist({ frOi, fearGreed, tpiSignal, oiPrev, oiCurr, takerBuyRatio, dominance }))
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
