export const revalidate = 0

// Stocks: stooq.com (no key, no IP restrictions)
// Forex + Gold: frankfurter.app (ECB rates, completely open)

async function fetchStooq(symbol) {
  try {
    // stooq returns CSV: Date,Open,High,Low,Close,Volume
    const url = `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null
    const cols = lines[1].split(',')
    const close = parseFloat(cols[4])
    const open  = parseFloat(cols[2])
    if (!close || !open || close === 0) return null
    const change24h = ((close - open) / open) * 100
    return { price: close, change24h, currency: 'USD' }
  } catch {
    return null
  }
}

async function fetchFrankfurter(from, to) {
  try {
    // Latest rate
    const url = `https://api.frankfurter.app/latest?from=${from}&to=${to}`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const json = await res.json()
    const price = json.rates?.[to]
    if (!price) return null

    // Yesterday for % change
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    // Skip weekends - go back to Friday
    if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 2)
    if (yesterday.getDay() === 6) yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]
    const resY = await fetch(`https://api.frankfurter.app/${dateStr}?from=${from}&to=${to}`, { next: { revalidate: 0 } })
    if (!resY.ok) return { price, change24h: null, currency: to }
    const jsonY = await resY.json()
    const prevPrice = jsonY.rates?.[to]
    const change24h = prevPrice ? ((price - prevPrice) / prevPrice) * 100 : null
    return { price, change24h, currency: to }
  } catch {
    return null
  }
}

export async function GET() {
  const [spy, qqq, audusd, audjpy, eurjpy, xauusd] = await Promise.all([
    fetchStooq('spy.us'),
    fetchStooq('qqq.us'),
    fetchFrankfurter('AUD', 'USD'),
    fetchFrankfurter('AUD', 'JPY'),
    fetchFrankfurter('EUR', 'JPY'),
    fetchFrankfurter('XAU', 'USD'),
  ])

  const data = {}
  if (spy)    data['SPY']     = spy
  if (qqq)    data['QQQ']     = qqq
  if (audusd) data['AUD/USD'] = audusd
  if (audjpy) data['AUD/JPY'] = audjpy
  if (eurjpy) data['EUR/JPY'] = eurjpy
  if (xauusd) data['XAU/USD'] = xauusd

  return Response.json({ ok: true, data })
}
