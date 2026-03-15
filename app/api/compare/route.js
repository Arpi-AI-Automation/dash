export const revalidate = 0

// Stocks: stooq.com time series
// Forex + Gold: frankfurter.app historical
// Crypto: CoinGecko

const COINGECKO_IDS = [
  'bitcoin', 'ethereum', 'solana', 'sui', 'ripple',
  'monero', 'binancecoin', 'aave', 'dogecoin', 'pax-gold', 'hyperliquid'
]

async function fetchCGHistory(id) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=31&interval=daily`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const json = await res.json()
    return json.prices.map(p => p[1])
  } catch { return null }
}

async function fetchStooqHistory(symbol) {
  try {
    const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const text = await res.text()
    const lines = text.trim().split('\n').slice(1) // skip header
    if (lines.length < 2) return null
    return lines.map(l => parseFloat(l.split(',')[4])).filter(v => !isNaN(v))
  } catch { return null }
}

async function fetchFrankfurterHistory(from, to) {
  try {
    const end = new Date().toISOString().split('T')[0]
    const start = new Date(Date.now() - 32 * 86400000).toISOString().split('T')[0]
    const url = `https://api.frankfurter.app/${start}..${end}?from=${from}&to=${to}`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const json = await res.json()
    const dates = Object.keys(json.rates).sort()
    return dates.map(d => json.rates[d][to])
  } catch { return null }
}

function pctReturn(prices, daysAgo) {
  if (!prices || prices.length < daysAgo + 1) return null
  const current = prices[prices.length - 1]
  const past    = prices[prices.length - 1 - daysAgo]
  if (!past || past === 0) return null
  return ((current - past) / past) * 100
}

function vsStats(r, btcR) {
  return {
    ret: r,
    vs: r != null && btcR != null ? r - btcR : null
  }
}

export async function GET() {
  try {
    const btcPrices = await fetchCGHistory('bitcoin')
    const btc1d  = pctReturn(btcPrices, 1)
    const btc7d  = pctReturn(btcPrices, 7)
    const btc30d = pctReturn(btcPrices, 30)

    const results = {
      bitcoin: { ret1d: 0, ret7d: 0, ret30d: 0, vs1d: 0, vs7d: 0, vs30d: 0 }
    }

    const jobs = [
      // Crypto
      ...COINGECKO_IDS.filter(id => id !== 'bitcoin').map(async id => {
        const prices = await fetchCGHistory(id)
        const r1d = pctReturn(prices, 1), r7d = pctReturn(prices, 7), r30d = pctReturn(prices, 30)
        results[id] = { ret1d: r1d, ret7d: r7d, ret30d: r30d,
          vs1d: vsStats(r1d, btc1d).vs, vs7d: vsStats(r7d, btc7d).vs, vs30d: vsStats(r30d, btc30d).vs }
      }),
      // Equities
      ...['spy.us', 'qqq.us'].map(async (sym) => {
        const key = sym === 'spy.us' ? 'SPY' : 'QQQ'
        const prices = await fetchStooqHistory(sym)
        const r1d = pctReturn(prices, 1), r7d = pctReturn(prices, 7), r30d = pctReturn(prices, 30)
        results[key] = { ret1d: r1d, ret7d: r7d, ret30d: r30d,
          vs1d: vsStats(r1d, btc1d).vs, vs7d: vsStats(r7d, btc7d).vs, vs30d: vsStats(r30d, btc30d).vs }
      }),
      // Forex + Gold
      ...[ ['AUD','USD','AUD/USD'], ['AUD','JPY','AUD/JPY'], ['EUR','JPY','EUR/JPY'], ['XAU','USD','XAU/USD'] ]
        .map(async ([from, to, key]) => {
          const prices = await fetchFrankfurterHistory(from, to)
          const r1d = pctReturn(prices, 1), r7d = pctReturn(prices, 7), r30d = pctReturn(prices, 30)
          results[key] = { ret1d: r1d, ret7d: r7d, ret30d: r30d,
            vs1d: vsStats(r1d, btc1d).vs, vs7d: vsStats(r7d, btc7d).vs, vs30d: vsStats(r30d, btc30d).vs }
        }),
    ]

    await Promise.all(jobs)

    return Response.json({ ok: true, btc: { ret1d: btc1d, ret7d: btc7d, ret30d: btc30d }, data: results })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
