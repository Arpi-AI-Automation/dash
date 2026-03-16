export const revalidate = 0

// Returns 100 days of scored checklist data for the backtest chart.
// Signals available historically:
//   ✅ BTC price + 24h change  — CoinGecko daily (100 days)
//   ✅ Fear & Greed            — alternative.me (100 days)
//   ✅ Funding rate            — Bybit history (~66 days, null beyond)
//   ❌ L/S ratio               — no free historical API
//   ❌ OI trend                — no free historical API

async function getBtcPrices() {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=101&interval=daily',
    { next: { revalidate: 0 } }
  )
  const d = await res.json()
  return d.prices.map(([ts, price]) => ({
    date: new Date(ts).toISOString().slice(0, 10),
    price,
  }))
}

async function getFearGreedHistory() {
  const res = await fetch(
    'https://api.alternative.me/fng/?limit=101&format=json',
    { next: { revalidate: 0 } }
  )
  const d = await res.json()
  const map = {}
  for (const item of d.data) {
    const date = new Date(parseInt(item.timestamp) * 1000).toISOString().slice(0, 10)
    map[date] = parseInt(item.value)
  }
  return map
}

async function getFundingHistory() {
  const res = await fetch(
    'https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200',
    { next: { revalidate: 0 } }
  )
  const d = await res.json()
  const map = {}
  for (const item of (d.result?.list ?? [])) {
    const date = new Date(parseInt(item.fundingRateTimestamp)).toISOString().slice(0, 10)
    if (!map[date]) map[date] = parseFloat(item.fundingRate)
  }
  return map
}

export async function GET() {
  try {
    const [prices, fgMap, fundingMap] = await Promise.all([
      getBtcPrices(),
      getFearGreedHistory(),
      getFundingHistory(),
    ])

    const days = []
    for (let i = 1; i < prices.length; i++) {
      const { date, price } = prices[i]
      const prevPrice  = prices[i - 1].price
      const change24h  = ((price - prevPrice) / prevPrice) * 100
      const fg         = fgMap[date] ?? null
      const fundingRate = fundingMap[date] ?? null
      const frPct      = fundingRate !== null ? fundingRate * 100 : null

      const lFunding = frPct !== null ? (frPct <= 0.02 ? 1 : 0) : null
      const lFg      = fg    !== null ? (fg    <  75   ? 1 : 0) : null
      const lChange  = change24h > 0 ? 1 : 0

      const sFunding = frPct !== null ? (frPct >  0.05  ? 1 : 0) : null
      const sFg      = fg    !== null ? (fg    >  75    ? 1 : 0) : null
      const sChange  = change24h < 0 ? 1 : 0

      const longSignals  = [lFunding, lFg, lChange].filter(v => v !== null)
      const shortSignals = [sFunding, sFg, sChange].filter(v => v !== null)
      const total        = longSignals.length

      const longScore  = longSignals.reduce((a, b) => a + b, 0)
      const shortScore = shortSignals.reduce((a, b) => a + b, 0)

      days.push({
        date,
        price: Math.round(price),
        change24h: parseFloat(change24h.toFixed(2)),
        fg,
        frPct: frPct !== null ? parseFloat(frPct.toFixed(4)) : null,
        longScore,
        shortScore,
        total,
        net: longScore - shortScore,
        fundingAvail: frPct !== null,
      })
    }

    return Response.json({ ok: true, days, count: days.length })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
