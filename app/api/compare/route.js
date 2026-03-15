export const revalidate = 0

// Returns % return for each asset over 1d, 7d, 30d minus BTC return = relative vs BTC
// Twelve Data replaces Yahoo Finance (no Vercel IP block)

const TD_KEY = process.env.TWELVE_DATA_API_KEY

// Twelve Data symbols → result key (keep Yahoo-style keys for component compatibility)
const TD_SYMBOLS = [
  { tdSym: 'SPY',     key: 'SPY' },
  { tdSym: 'QQQ',     key: 'QQQ' },
  { tdSym: 'AUD/USD', key: 'AUD/USD' },
  { tdSym: 'AUD/JPY', key: 'AUD/JPY' },
  { tdSym: 'EUR/JPY', key: 'EUR/JPY' },
  { tdSym: 'XAU/USD', key: 'XAU/USD' },
  { tdSym: 'WTI',     key: 'WTI' },
  { tdSym: 'COPPER',  key: 'COPPER' },
]

const COINGECKO_IDS = [
  'bitcoin', 'ethereum', 'solana', 'sui', 'ripple',
  'monero', 'binancecoin', 'aave', 'dogecoin', 'pax-gold', 'hyperliquid'
]

// Twelve Data time_series for one symbol — returns oldest-first close array
async function fetchTDHistory(sym) {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=1day&outputsize=32&apikey=${TD_KEY}`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const json = await res.json()
    if (json.status === 'error' || !json.values?.length) return null
    return json.values.map(v => parseFloat(v.close)).reverse() // oldest first
  } catch {
    return null
  }
}

async function fetchCGHistory(id) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=31&interval=daily`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const json = await res.json()
    return json.prices.map(p => p[1])
  } catch {
    return null
  }
}

function pctReturn(prices, daysAgo) {
  if (!prices || prices.length < daysAgo + 1) return null
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
    const btcPrices = await fetchCGHistory('bitcoin')
    const btc1d  = pctReturn(btcPrices, 1)
    const btc7d  = pctReturn(btcPrices, 7)
    const btc30d = pctReturn(btcPrices, 30)

    const results = { bitcoin: { ret1d: 0, ret7d: 0, ret30d: 0, vs1d: 0, vs7d: 0, vs30d: 0 } }

    // Crypto (excluding BTC)
    const cryptoFetches = COINGECKO_IDS.filter(id => id !== 'bitcoin').map(async id => {
      const prices = await fetchCGHistory(id)
      const r1d  = pctReturn(prices, 1)
      const r7d  = pctReturn(prices, 7)
      const r30d = pctReturn(prices, 30)
      results[id] = {
        ret1d: r1d, ret7d: r7d, ret30d: r30d,
        vs1d:  r1d  != null && btc1d  != null ? r1d  - btc1d  : null,
        vs7d:  r7d  != null && btc7d  != null ? r7d  - btc7d  : null,
        vs30d: r30d != null && btc30d != null ? r30d - btc30d : null,
      }
    })

    // Twelve Data symbols — individual fetches
    const tdFetches = TD_SYMBOLS.map(async ({ tdSym, key }) => {
      const prices = await fetchTDHistory(tdSym)
      const r1d  = pctReturn(prices, 1)
      const r7d  = pctReturn(prices, 7)
      const r30d = pctReturn(prices, 30)
      results[key] = {
        ret1d: r1d, ret7d: r7d, ret30d: r30d,
        vs1d:  r1d  != null && btc1d  != null ? r1d  - btc1d  : null,
        vs7d:  r7d  != null && btc7d  != null ? r7d  - btc7d  : null,
        vs30d: r30d != null && btc30d != null ? r30d - btc30d : null,
      }
    })

    await Promise.all([...cryptoFetches, ...tdFetches])

    return Response.json({ ok: true, btc: { ret1d: btc1d, ret7d: btc7d, ret30d: btc30d }, data: results })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
