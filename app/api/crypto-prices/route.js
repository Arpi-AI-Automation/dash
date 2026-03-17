export const revalidate = 0

const IDS = [
  'bitcoin', 'ethereum', 'solana', 'sui', 'ripple', 'hyperliquid', 'pax-gold'
]

export async function GET() {
  try {
    const ids = IDS.join(',')

    // Single price call — always reliable
    const priceRes = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { headers: { 'Accept': 'application/json' }, cache: 'no-store' }
    )
    const prices = await priceRes.json()

    // 7D daily closes via market_chart — one call per coin, daily granularity
    // days=7 returns daily OHLC which is stable and not rate-limited like /ohlc
    const sparkResults = await Promise.all(IDS.map(id =>
      fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=8&interval=daily`, {
        headers: { 'Accept': 'application/json' }, cache: 'no-store'
      })
        .then(r => r.json())
        .then(data => {
          const closes = data.prices?.map(p => p[1]) ?? []
          const spark7d = closes.slice(-8, -1) // last 7 completed days
          const prevClose = closes[closes.length - 2] ?? null // yesterday's close
          return { id, spark7d, prevClose }
        })
        .catch(() => ({ id, spark7d: null, prevClose: null }))
    ))

    const result = {}
    IDS.forEach(id => {
      const p    = prices[id]
      const s    = sparkResults.find(x => x.id === id)
      const price = p?.usd ?? null
      const change24h = p?.usd_24h_change ?? null
      const changeDailyClose = (price && s?.prevClose)
        ? ((price - s.prevClose) / s.prevClose) * 100
        : null
      result[id] = { price, change24h, changeDailyClose, spark7d: s?.spark7d ?? null }
    })

    return Response.json({ ok: true, data: result })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
