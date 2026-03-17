export const revalidate = 0

// Stocks: Yahoo Finance (open, reliable for daily % change)
// Forex: frankfurter.app (ECB rates)

async function fetchYahoo(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=8d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 0 }
    })
    if (!res.ok) return null
    const json = await res.json()
    const meta   = json.chart?.result?.[0]?.meta
    const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close
    if (!meta || !closes) return null
    const price     = meta.regularMarketPrice ?? closes[closes.length - 1]
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? closes[closes.length - 2]
    if (!price || !prevClose) return null
    const change24h  = ((price - prevClose) / prevClose) * 100
    // 7D sparkline: last 7 valid closes
    const spark7d = closes.filter(Boolean).slice(-7)
    return { price, change24h, spark7d, currency: 'USD' }
  } catch { return null }
}

async function fetchFrankfurter(from, to) {
  try {
    // Current price
    const resNow = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`, { next: { revalidate: 0 } })
    if (!resNow.ok) return null
    const now   = await resNow.json()
    const price = now.rates?.[to]
    if (!price) return null

    // 7D history for sparkline + change24h
    const end = new Date()
    const start = new Date(); start.setDate(start.getDate() - 10) // extra buffer for weekends
    const startStr = start.toISOString().split('T')[0]
    const endStr   = end.toISOString().split('T')[0]

    const resH = await fetch(`https://api.frankfurter.app/${startStr}..${endStr}?from=${from}&to=${to}`, { next: { revalidate: 0 } })
    let spark7d = null
    let change24h = null
    if (resH.ok) {
      const hist = await resH.json()
      const vals = Object.values(hist.rates ?? {}).map(r => r[to]).filter(Boolean)
      spark7d = vals.slice(-7)
      if (vals.length >= 2) {
        const prev = vals[vals.length - 2]
        change24h = ((price - prev) / prev) * 100
      }
    }

    return { price, change24h, spark7d, currency: to }
  } catch { return null }
}

export async function GET() {
  const [spy, qqq, audusd, audjpy, eurjpy, gbpjpy, usdjpy] = await Promise.all([
    fetchYahoo('SPY'),
    fetchYahoo('QQQ'),
    fetchFrankfurter('AUD', 'USD'),
    fetchFrankfurter('AUD', 'JPY'),
    fetchFrankfurter('EUR', 'JPY'),
    fetchFrankfurter('GBP', 'JPY'),
    fetchFrankfurter('USD', 'JPY'),
  ])

  const data = {}
  if (spy)    data['SPY']     = spy
  if (qqq)    data['QQQ']     = qqq
  if (audusd) data['AUD/USD'] = audusd
  if (audjpy) data['AUD/JPY'] = audjpy
  if (eurjpy) data['EUR/JPY'] = eurjpy
  if (gbpjpy) data['GBP/JPY'] = gbpjpy
  if (usdjpy) data['USD/JPY'] = usdjpy

  return Response.json({ ok: true, data })
}
