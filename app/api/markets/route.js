export const revalidate = 0

// Yahoo Finance unofficial quote endpoint — no key needed
// Runs server-side so no CORS issues
export async function GET() {
  const symbols = [
    // Stocks (ETFs as proxies)
    'SPY',   // S&P 500
    'QQQ',   // Nasdaq
    // Forex
    'AUDUSD=X',
    'AUDJPY=X',
    'EURJPY=X',
    // Commodities
    'GC=F',  // Gold futures
    'CL=F',  // Crude Oil futures
    'HG=F',  // Copper futures
  ]

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketPreviousClose,currency`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) throw new Error(`Yahoo status ${res.status}`)

    const data = await res.json()
    const quotes = data?.quoteResponse?.result ?? []

    const mapped = {}
    for (const q of quotes) {
      mapped[q.symbol] = {
        price: q.regularMarketPrice,
        change24h: q.regularMarketChangePercent,
        currency: q.currency ?? 'USD',
      }
    }

    return Response.json({ ok: true, data: mapped })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
