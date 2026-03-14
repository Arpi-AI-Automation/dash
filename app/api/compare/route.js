export const revalidate = 0

// Returns % return for each asset over 1d, 7d, 30d
// minus BTC % return over same period = relative performance vs BTC

const YAHOO_SYMBOLS = ['SPY', 'QQQ', 'AUDUSD=X', 'AUDJPY=X', 'EURJPY=X', 'GC=F', 'CL=F', 'HG=F']

const COINGECKO_IDS = [
  'bitcoin', 'ethereum', 'solana', 'sui', 'ripple',
  'monero', 'binancecoin', 'aave', 'dogecoin', 'pax-gold', 'hyperliquid'
]

// Fetch 31 days of daily closes from Yahoo Finance v8 chart endpoint
async function fetchYahooHistory(symbol) {
  const now    = Math.floor(Date.now() / 1000)
  const p1     = now - 32 * 86400 // 32 days back for buffer
  const url    = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${now}&interval=1d`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Yahoo ${symbol}: ${res.status}`)
  const json   = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`No data for ${symbol}`)

  const closes = result.indicators.quote[0].close
  // Filter nulls (weekends/holidays), return as array newest-last
  return closes.filter(c => c != null)
}

// CoinGecko market_chart — returns [timestamp, price] array for 30 days
async function fetchCGHistory(id) {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=31&interval=daily`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`CoinGecko ${id}: ${res.status}`)
  const json = await res.json()
  return json.prices.map(p => p[1]) // just the price values
}

// Given an array of prices (oldest→newest), compute % return from N days ago to now
function pctReturn(prices, daysAgo) {
  if (prices.length < daysAgo + 1) return null
  const current = prices[prices.length - 1]
  const past    = prices[prices.length - 1 - daysAgo]
  if (!past || past === 0) return null
  return ((current - past) / past) * 100
}

export async function GET() {
  try {
    // Fetch BTC history first (we need it as base for all comparisons)
    const btcPrices = await fetchCGHistory('bitcoin')
    const btc1d  = pctReturn(btcPrices, 1)
    const btc7d  = pctReturn(btcPrices, 7)
    const btc30d = pctReturn(btcPrices, 30)

    const results = { bitcoin: { ret1d: 0, ret7d: 0, ret30d: 0, vs1d: 0, vs7d: 0, vs30d: 0 } }

    // Crypto (excluding BTC)
    const cryptoFetches = COINGECKO_IDS.filter(id => id !== 'bitcoin').map(async id => {
      try {
        const prices = await fetchCGHistory(id)
        const r1d  = pctReturn(prices, 1)
        const r7d  = pctReturn(prices, 7)
        const r30d = pctReturn(prices, 30)
        results[id] = {
          ret1d:  r1d,
          ret7d:  r7d,
          ret30d: r30d,
          vs1d:   r1d  != null && btc1d  != null ? r1d  - btc1d  : null,
          vs7d:   r7d  != null && btc7d  != null ? r7d  - btc7d  : null,
          vs30d:  r30d != null && btc30d != null ? r30d - btc30d : null,
        }
      } catch { results[id] = null }
    })

    // Yahoo symbols
    const yahooFetches = YAHOO_SYMBOLS.map(async sym => {
      try {
        const prices = await fetchYahooHistory(sym)
        const r1d  = pctReturn(prices, 1)
        const r7d  = pctReturn(prices, 7)
        const r30d = pctReturn(prices, 30)
        results[sym] = {
          ret1d:  r1d,
          ret7d:  r7d,
          ret30d: r30d,
          vs1d:   r1d  != null && btc1d  != null ? r1d  - btc1d  : null,
          vs7d:   r7d  != null && btc7d  != null ? r7d  - btc7d  : null,
          vs30d:  r30d != null && btc30d != null ? r30d - btc30d : null,
        }
      } catch { results[sym] = null }
    })

    await Promise.all([...cryptoFetches, ...yahooFetches])

    return Response.json({ ok: true, btc: { ret1d: btc1d, ret7d: btc7d, ret30d: btc30d }, data: results })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
