export const revalidate = 0

// Pure computation endpoint — client fetches raw data, POSTs here for scoring.
// All upstream API calls happen client-side to bypass Vercel IP blocks.

function scoreDay({ price, prevPrice, fg, frPct }) {
  const change24h = ((price - prevPrice) / prevPrice) * 100

  const lFunding = frPct !== null ? (frPct <= 0.02 ? 1 : 0) : null
  const lFg      = fg    !== null ? (fg    <  75   ? 1 : 0) : null
  const lChange  = change24h > 0 ? 1 : 0

  const sFunding = frPct !== null ? (frPct >  0.05  ? 1 : 0) : null
  const sFg      = fg    !== null ? (fg    >  75    ? 1 : 0) : null
  const sChange  = change24h < 0 ? 1 : 0

  const longSignals  = [lFunding, lFg, lChange].filter(v => v !== null)
  const shortSignals = [sFunding, sFg, sChange].filter(v => v !== null)
  const total        = longSignals.length
  const longScore    = longSignals.reduce((a, b) => a + b, 0)
  const shortScore   = shortSignals.reduce((a, b) => a + b, 0)

  return {
    date: null, // filled by caller
    price: Math.round(price),
    change24h: parseFloat(change24h.toFixed(2)),
    fg,
    frPct: frPct !== null ? parseFloat(frPct.toFixed(4)) : null,
    longScore,
    shortScore,
    total,
    net: longScore - shortScore,
    fundingAvail: frPct !== null,
  }
}

export async function POST(request) {
  try {
    const { prices, fgMap, fundingMap } = await request.json()
    // prices: [{date, price}] sorted oldest→newest
    // fgMap:  {date: number}
    // fundingMap: {date: number}  (fundingRate raw, not pct)

    const days = []
    for (let i = 1; i < prices.length; i++) {
      const { date, price } = prices[i]
      const prevPrice  = prices[i - 1].price
      const fg         = fgMap[date]   ?? null
      const fr         = fundingMap[date] ?? null
      const frPct      = fr !== null ? fr * 100 : null

      const scored = scoreDay({ price, prevPrice, fg, frPct })
      scored.date = date
      days.push(scored)
    }

    return Response.json({ ok: true, days, count: days.length })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
