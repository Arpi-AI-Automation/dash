export const revalidate = 0

const IDS = [
  'bitcoin', 'ethereum', 'solana', 'sui', 'ripple', 'hyperliquid', 'pax-gold'
]

export async function GET() {
  try {
    const ids = IDS.join(',')
    // Simple price + 24h change
    const [priceRes, ohlcResults] = await Promise.all([
      fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
        { headers: { 'Accept': 'application/json' }, cache: 'no-store' }
      ),
      // Fetch OHLC for each to get UTC daily close (prev completed candle)
      Promise.all(IDS.map(id =>
        fetch(`https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=2`, { cache: 'no-store' })
          .then(r => r.json())
          .then(data => ({ id, prevClose: Array.isArray(data) && data.length >= 2 ? data[data.length - 2]?.[4] : null }))
          .catch(() => ({ id, prevClose: null }))
      ))
    ])

    const prices = await priceRes.json()

    // Build response
    const result = {}
    IDS.forEach(id => {
      const p          = prices[id]
      const ohlc       = ohlcResults.find(o => o.id === id)
      const price      = p?.usd ?? null
      const change24h  = p?.usd_24h_change ?? null
      const prevClose  = ohlc?.prevClose ?? null
      const changeDC   = (price && prevClose) ? ((price - prevClose) / prevClose) * 100 : null
      result[id] = { price, change24h, changeDailyClose: changeDC }
    })

    return Response.json({ ok: true, data: result })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
