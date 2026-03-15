export const revalidate = 0

// Stocks: stooq.com (no key, no IP restrictions)
// Forex: frankfurter.app (ECB rates, completely open)
// Gold removed — covered by PAXG in crypto section

async function fetchStooq(symbol) {
  try {
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
    return { price: close, change24h: ((close - open) / open) * 100, currency: 'USD' }
  } catch { return null }
}

async function fetchFrankfurter(from, to) {
  try {
    const resNow = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`, { next: { revalidate: 0 } })
    if (!resNow.ok) return null
    const now = await resNow.json()
    const price = now.rates?.[to]
    if (!price) return null

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 2)
    if (yesterday.getDay() === 6) yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]

    const resY = await fetch(`https://api.frankfurter.app/${dateStr}?from=${from}&to=${to}`, { next: { revalidate: 0 } })
    const prev = resY.ok ? (await resY.json()).rates?.[to] : null
    const change24h = prev ? ((price - prev) / prev) * 100 : null

    return { price, change24h, currency: to }
  } catch { return null }
}

export async function GET() {
  const [spy, qqq, audusd, audjpy, eurjpy] = await Promise.all([
    fetchStooq('spy.us'),
    fetchStooq('qqq.us'),
    fetchFrankfurter('AUD', 'USD'),
    fetchFrankfurter('AUD', 'JPY'),
    fetchFrankfurter('EUR', 'JPY'),
  ])

  const data = {}
  if (spy)    data['SPY']     = spy
  if (qqq)    data['QQQ']     = qqq
  if (audusd) data['AUD/USD'] = audusd
  if (audjpy) data['AUD/JPY'] = audjpy
  if (eurjpy) data['EUR/JPY'] = eurjpy

  return Response.json({ ok: true, data })
}
