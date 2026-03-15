export const revalidate = 0

// Twelve Data — stocks, forex, commodities
// Fetching individually so one bad symbol doesn't wipe the rest.

const TD_KEY = process.env.TWELVE_DATA_API_KEY

const TD_SYMBOLS = {
  SPY:       { name: 'S&P 500',   currency: 'USD' },
  QQQ:       { name: 'Nasdaq',    currency: 'USD' },
  'AUD/USD': { name: 'AUD/USD',   currency: 'USD' },
  'AUD/JPY': { name: 'AUD/JPY',   currency: 'JPY' },
  'EUR/JPY': { name: 'EUR/JPY',   currency: 'JPY' },
  'XAU/USD': { name: 'Gold',      currency: 'USD' },
  'WTI':     { name: 'Crude Oil', currency: 'USD' },
  'COPPER':  { name: 'Copper',    currency: 'USD' },
}

async function fetchSymbol(sym, meta) {
  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(sym)}&apikey=${TD_KEY}`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const q = await res.json()
    if (q.status === 'error' || !q.close) return null
    return {
      price:     parseFloat(q.close),
      change24h: parseFloat(q.percent_change),
      currency:  meta.currency,
    }
  } catch {
    return null
  }
}

export async function GET() {
  if (!TD_KEY) {
    return Response.json({ ok: false, error: 'TWELVE_DATA_API_KEY not set' }, { status: 500 })
  }

  const entries = Object.entries(TD_SYMBOLS)
  const results = await Promise.all(entries.map(([sym, meta]) => fetchSymbol(sym, meta)))

  const mapped = {}
  for (let i = 0; i < entries.length; i++) {
    if (results[i] !== null) {
      mapped[entries[i][0]] = results[i]
    }
  }

  return Response.json({ ok: true, data: mapped })
}
