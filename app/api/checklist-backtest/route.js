export const revalidate = 0

// Pure compute — client POSTs raw data, we score it.
// TPI history: provided by user as a manual date array.
// Format: [{ date: 'YYYY-MM-DD', state: 'LONG'|'SHORT' }, ...]
// Dates represent transition points — state persists until next entry.

function interpolateTpi(transitions, date) {
  if (!transitions || transitions.length === 0) return null
  // Find the most recent transition on or before this date
  let state = transitions[0].state
  for (const t of transitions) {
    if (t.date <= date) state = t.state
    else break
  }
  return state
}

function scoreDay({ price, prevPrice, fg, frPct, tpiState, oiPrev, oiCurr, takerBuyRatio, lsLongRatio }) {
  const change24h  = ((price - prevPrice) / prevPrice) * 100
  const priceUp    = change24h > 0
  const priceDown  = change24h < 0
  const oiRising   = (oiPrev !== null && oiCurr !== null) ? oiCurr > oiPrev : null
  const lsShortRat = lsLongRatio !== null ? 100 - lsLongRatio : null

  const longScores = [
    frPct !== null           ? (frPct <= 0.005 ? 1 : 0)                          : null, // c1
    fg    !== null           ? (fg    <  30     ? 1 : 0)                          : null, // c2
    tpiState !== null        ? (tpiState === 'LONG'  ? 1 : 0)                     : null, // c3
    oiRising !== null        ? (oiRising && priceUp  ? 1 : 0)                     : null, // c4
    lsShortRat !== null      ? (lsShortRat > 52      ? 1 : 0)                     : null, // c5
    takerBuyRatio !== null   ? (takerBuyRatio > 52   ? 1 : 0)                     : null, // c6
  ]
  const shortScores = [
    frPct !== null           ? (frPct > 0.05          ? 1 : 0)                    : null,
    fg    !== null           ? (fg    > 70             ? 1 : 0)                    : null,
    tpiState !== null        ? (tpiState === 'SHORT'   ? 1 : 0)                    : null,
    oiRising !== null        ? (oiRising && priceDown  ? 1 : 0)                    : null,
    lsLongRatio !== null     ? (lsLongRatio > 56       ? 1 : 0)                    : null,
    takerBuyRatio !== null   ? (takerBuyRatio < 48     ? 1 : 0)                    : null,
  ]

  const longScore  = longScores.filter(v => v === 1).length
  const shortScore = shortScores.filter(v => v === 1).length

  return {
    price: Math.round(price),
    change24h: parseFloat(change24h.toFixed(2)),
    fg, frPct: frPct !== null ? parseFloat(frPct.toFixed(4)) : null,
    tpiState,
    longScore, shortScore, total: 6,
    net: longScore - shortScore,
    fundingAvail: frPct !== null,
    tpiAvail: tpiState !== null,
  }
}

export async function POST(request) {
  try {
    const { prices, fgMap, fundingMap, tpiTransitions } = await request.json()
    // prices: [{date, price}] oldest→newest
    // tpiTransitions: [{date, state}] sorted ascending — null = not provided

    const days = []
    for (let i = 1; i < prices.length; i++) {
      const { date, price } = prices[i]
      const prevPrice = prices[i - 1].price
      const fg        = fgMap[date]      ?? null
      const fr        = fundingMap[date] ?? null
      const frPct     = fr !== null ? fr * 100 : null
      const tpiState  = tpiTransitions ? interpolateTpi(tpiTransitions, date) : null

      const scored = scoreDay({ price, prevPrice, fg, frPct, tpiState,
        oiPrev: null, oiCurr: null, takerBuyRatio: null, lsLongRatio: null })
      days.push({ date, ...scored })
    }

    return Response.json({ ok: true, days, count: days.length })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
