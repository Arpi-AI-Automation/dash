export const revalidate = 0

const ETFs = ['SMH', 'NLR', 'DTCR', 'IGV', 'BOTZ']

const ETF_META = {
  SMH:  { name: 'Semiconductors',   color: '#818cf8' },
  NLR:  { name: 'Nuclear Energy',   color: '#34d399' },
  DTCR: { name: 'Data Centers',     color: '#fb923c' },
  IGV:  { name: 'Software',         color: '#60a5fa' },
  BOTZ: { name: 'Robotics & AI',    color: '#f472b6' },
}

async function fetchETF(symbol) {
  try {
    // range=35d gives enough trading days for 30D change + 30D sparkline
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=35d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 0 },
    })
    if (!res.ok) return null
    const json = await res.json()
    const meta   = json.chart?.result?.[0]?.meta
    const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close
    if (!meta || !closes) return null

    const valid = closes.filter(Boolean)
    if (valid.length < 2) return null

    const price = meta.regularMarketPrice ?? valid[valid.length - 1]

    // 10D change: price vs close 10 trading days ago
    const close10d = valid.length >= 11 ? valid[valid.length - 11] : valid[0]
    const change10d = ((price - close10d) / close10d) * 100

    // 30D change: price vs oldest close in range
    const close30d = valid[0]
    const change30d = ((price - close30d) / close30d) * 100

    // 30-point sparkline (all valid closes)
    const spark = valid.slice(-30)

    return {
      price:     parseFloat(price.toFixed(2)),
      change10d: parseFloat(change10d.toFixed(2)),
      change30d: parseFloat(change30d.toFixed(2)),
      spark,
      ...ETF_META[symbol],
    }
  } catch { return null }
}

export async function GET() {
  const results = await Promise.all(ETFs.map(sym => fetchETF(sym).then(d => [sym, d])))
  const data = {}
  for (const [sym, d] of results) {
    if (d) data[sym] = d
  }
  return Response.json({ ok: true, data })
}
