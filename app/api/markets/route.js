export const revalidate = 0

// Twelve Data — stocks, forex, commodities
// Free tier: 800 API credits/day. Batch call = 1 credit per symbol.
// Set TWELVE_DATA_API_KEY in Vercel environment variables.

const TD_KEY = process.env.TWELVE_DATA_API_KEY

// Twelve Data symbol format (no Yahoo =X or =F suffixes needed)
const TD_SYMBOLS = {
  // Stocks
  SPY:        { name: 'S&P 500',   currency: 'USD' },
  QQQ:        { name: 'Nasdaq',    currency: 'USD' },
  // Forex
  'AUD/USD':  { name: 'AUD/USD',   currency: 'USD' },
  'AUD/JPY':  { name: 'AUD/JPY',   currency: 'JPY' },
  'EUR/JPY':  { name: 'EUR/JPY',   currency: 'JPY' },
  // Commodities (Twelve Data uses XAU/USD, WTI, COPPER)
  'XAU/USD':  { name: 'Gold',      currency: 'USD' },
  'WTI':      { name: 'Crude Oil', currency: 'USD' },
  'COPPER':   { name: 'Copper',    currency: 'USD' },
}

export async function GET() {
  if (!TD_KEY) {
    return Response.json({ ok: false, error: 'TWELVE_DATA_API_KEY not set' }, { status: 500 })
  }

  const symbolList = Object.keys(TD_SYMBOLS).join(',')
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolList)}&apikey=${TD_KEY}`

  try {
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) throw new Error(`Twelve Data status ${res.status}`)

    const raw = await res.json()

    // When multiple symbols, response is keyed by symbol
    // When single symbol, response is the object directly
    const isMulti = !raw.symbol

    const mapped = {}
    for (const [sym, meta] of Object.entries(TD_SYMBOLS)) {
      const q = isMulti ? raw[sym] : raw
      if (!q || q.status === 'error' || !q.close) continue

      // Twelve Data quote: close = current price, percent_change = 1d % change
      mapped[sym] = {
        price:    parseFloat(q.close),
        change24h: parseFloat(q.percent_change),
        currency:  meta.currency,
      }
    }

    return Response.json({ ok: true, data: mapped })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
