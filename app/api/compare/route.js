export const revalidate = 0

// Returns % return for each asset over 1d, 7d, 30d
// minus BTC % return over same period = relative performance vs BTC
// Yahoo Finance replaced with Twelve Data (no Vercel IP block)

const TD_KEY = process.env.TWELVE_DATA_API_KEY

// Twelve Data symbols for non-crypto assets
const TD_SYMBOLS = ['SPY', 'QQQ', 'AUD/USD', 'AUD/JPY', 'EUR/JPY', 'XAU/USD', 'WTI', 'COPPER']

// Original Yahoo symbol → Twelve Data symbol map (for results keying)
const TD_TO_YAHOO_KEY = {
  'SPY':     'SPY',
  'QQQ':     'QQQ',
  'AUD/USD': 'AUDUSD=X',
  'AUD/JPY': 'AUDJPY=X',
  'EUR/JPY': 'EURJPY=X',
  'XAU/USD': 'GC=F',
  'WTI':     'CL=F',
  'COPPER':  'HG=F',
}

const COINGECKO_IDS = [
  'bitcoin', 'ethereum', 'solana', 'sui', 'ripple',
  'monero', 'binancecoin', 'aave', 'dogecoin', 'pax-gold', 'hyperliquid'
]

// Fetch 31 days of daily closes from Twelve Data
async function fetchTDHistory(symbol) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=32&apikey=${TD_KEY}`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`TD ${symbol}: ${res.status}`)
  const json = await res.json()
  if (json.status === 'error') throw new Error(`TD ${symbol}: ${json.message}`)

  // values array is newest-first; reverse to oldest-first for pctReturn
  const closes = json.values.map(v => parseFloat(v.close)).reverse()
  return closes
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
  if (!TD_KEY) {
    return Response.json({ ok: false, error: 'TWELVE_DATA_API_KEY not set' }, { status: 500 })
  }

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

    // Twelve Data symbols — fetch sequentially to avoid rate limits on free tier
    const tdFetches = TD_SYMBOLS.map(async tdSym => {
      const yahooKey = TD_TO_YAHOO_KEY[tdSym]
      try {
        const prices = await fetchTDHistory(tdSym)
        const r1d  = pctReturn(prices, 1)
        const r7d  = pctReturn(prices, 7)
        const r30d = pctReturn(prices, 30)
        results[yahooKey] = {
          ret1d:  r1d,
          ret7d:  r7d,
          ret30d: r30d,
          vs1d:   r1d  != null && btc1d  != null ? r1d  - btc1d  : null,
          vs7d:   r7d  != null && btc7d  != null ? r7d  - btc7d  : null,
          vs30d:  r30d != null && btc30d != null ? r30d - btc30d : null,
        }
      } catch { results[yahooKey] = null }
    })

    await Promise.all([...cryptoFetches, ...tdFetches])

    return Response.json({ ok: true, btc: { ret1d: btc1d, ret7d: btc7d, ret30d: btc30d }, data: results })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
