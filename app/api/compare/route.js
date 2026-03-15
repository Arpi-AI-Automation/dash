export const revalidate = 0

const COINGECKO_IDS = [
  'bitcoin', 'ethereum', 'solana', 'sui', 'ripple',
  'monero', 'binancecoin', 'aave', 'dogecoin', 'pax-gold', 'hyperliquid'
]

// Single batch call for all coins - much faster than sequential
async function fetchAllCGHistory() {
  const results = {}
  try {
    // CoinGecko /coins/markets gives 24h + 7d change in one call
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COINGECKO_IDS.join(',')}&price_change_percentage=1h,24h,7d,30d&per_page=50`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return results
    const coins = await res.json()
    for (const coin of coins) {
      results[coin.id] = {
        ret1d:  coin.price_change_percentage_24h_in_currency ?? null,
        ret7d:  coin.price_change_percentage_7d_in_currency  ?? null,
        ret30d: coin.price_change_percentage_30d_in_currency ?? null,
      }
    }
  } catch {}
  return results
}

async function fetchStooqHistory(symbol) {
  try {
    const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const text = await res.text()
    const lines = text.trim().split('\n').slice(1)
    if (lines.length < 2) return null
    return lines.map(l => parseFloat(l.split(',')[4])).filter(v => !isNaN(v))
  } catch { return null }
}

async function fetchFrankfurterHistory(from, to) {
  try {
    const end   = new Date().toISOString().split('T')[0]
    const start = new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0]
    const url   = `https://api.frankfurter.app/${start}..${end}?from=${from}&to=${to}`
    const res   = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const json  = await res.json()
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

function mkRow(r1d, r7d, r30d, btc1d, btc7d, btc30d) {
  return {
    ret1d: r1d, ret7d: r7d, ret30d: r30d,
    vs1d:  r1d  != null && btc1d  != null ? r1d  - btc1d  : null,
    vs7d:  r7d  != null && btc7d  != null ? r7d  - btc7d  : null,
    vs30d: r30d != null && btc30d != null ? r30d - btc30d : null,
  }
}

function mkRowFromPrices(prices, btc1d, btc7d, btc30d) {
  return mkRow(
    pctReturn(prices, 1), pctReturn(prices, 7), pctReturn(prices, 30),
    btc1d, btc7d, btc30d
  )
}

export async function GET() {
  try {
    // All fetches in parallel - CG batch + stooq + frankfurter
    const [cgData, spyPrices, qqqPrices, audUsd, audJpy, eurJpy] = await Promise.all([
      fetchAllCGHistory(),
      fetchStooqHistory('spy.us'),
      fetchStooqHistory('qqq.us'),
      fetchFrankfurterHistory('AUD', 'USD'),
      fetchFrankfurterHistory('AUD', 'JPY'),
      fetchFrankfurterHistory('EUR', 'JPY'),
    ])

    const btc    = cgData['bitcoin'] ?? {}
    const btc1d  = btc.ret1d  ?? null
    const btc7d  = btc.ret7d  ?? null
    const btc30d = btc.ret30d ?? null

    const results = {
      bitcoin: { ret1d: 0, ret7d: 0, ret30d: 0, vs1d: 0, vs7d: 0, vs30d: 0 }
    }

    // Crypto from batch CG response
    for (const id of COINGECKO_IDS.filter(x => x !== 'bitcoin')) {
      const d = cgData[id] ?? {}
      results[id] = mkRow(d.ret1d ?? null, d.ret7d ?? null, d.ret30d ?? null, btc1d, btc7d, btc30d)
    }

    // Equities
    results['SPY'] = mkRowFromPrices(spyPrices, btc1d, btc7d, btc30d)
    results['QQQ'] = mkRowFromPrices(qqqPrices, btc1d, btc7d, btc30d)

    // Forex
    results['AUD/USD'] = mkRowFromPrices(audUsd, btc1d, btc7d, btc30d)
    results['AUD/JPY'] = mkRowFromPrices(audJpy, btc1d, btc7d, btc30d)
    results['EUR/JPY'] = mkRowFromPrices(eurJpy, btc1d, btc7d, btc30d)

    return Response.json({ ok: true, btc: { ret1d: btc1d, ret7d: btc7d, ret30d: btc30d }, data: results })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
