export const revalidate = 0

const COINGECKO_IDS = [
  'bitcoin', 'ethereum', 'solana', 'sui', 'ripple',
  'monero', 'binancecoin', 'aave', 'dogecoin', 'pax-gold', 'hyperliquid'
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchCGHistory(id, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=35&interval=daily`
      const res = await fetch(url, { next: { revalidate: 0 } })
      if (res.status === 429) {
        await sleep(2000 * (i + 1))
        continue
      }
      if (!res.ok) return null
      const json = await res.json()
      return json.prices?.map(p => p[1]) ?? null
    } catch { return null }
  }
  return null
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
    const end = new Date().toISOString().split('T')[0]
    const start = new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0]
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

function mkRow(prices, btc1d, btc7d, btc30d) {
  const r1d = pctReturn(prices, 1)
  const r7d = pctReturn(prices, 7)
  const r30d = pctReturn(prices, 30)
  return {
    ret1d: r1d, ret7d: r7d, ret30d: r30d,
    vs1d:  r1d  != null && btc1d  != null ? r1d  - btc1d  : null,
    vs7d:  r7d  != null && btc7d  != null ? r7d  - btc7d  : null,
    vs30d: r30d != null && btc30d != null ? r30d - btc30d : null,
  }
}

export async function GET() {
  try {
    // Fetch crypto sequentially to avoid CoinGecko rate limits
    const cgData = {}
    for (const id of COINGECKO_IDS) {
      cgData[id] = await fetchCGHistory(id)
      await sleep(300) // 300ms between each CG call
    }

    const btcPrices = cgData['bitcoin']
    const btc1d  = pctReturn(btcPrices, 1)
    const btc7d  = pctReturn(btcPrices, 7)
    const btc30d = pctReturn(btcPrices, 30)

    const results = {
      bitcoin: { ret1d: 0, ret7d: 0, ret30d: 0, vs1d: 0, vs7d: 0, vs30d: 0 }
    }

    // Crypto rows
    for (const id of COINGECKO_IDS.filter(x => x !== 'bitcoin')) {
      results[id] = mkRow(cgData[id], btc1d, btc7d, btc30d)
    }

    // Equities (parallel, different source)
    const [spyPrices, qqqPrices] = await Promise.all([
      fetchStooqHistory('spy.us'),
      fetchStooqHistory('qqq.us'),
    ])
    results['SPY'] = mkRow(spyPrices, btc1d, btc7d, btc30d)
    results['QQQ'] = mkRow(qqqPrices, btc1d, btc7d, btc30d)

    // Forex (45-day window → enough trading days for 30d)
    const [audUsd, audJpy, eurJpy] = await Promise.all([
      fetchFrankfurterHistory('AUD', 'USD'),
      fetchFrankfurterHistory('AUD', 'JPY'),
      fetchFrankfurterHistory('EUR', 'JPY'),
    ])
    results['AUD/USD'] = mkRow(audUsd, btc1d, btc7d, btc30d)
    results['AUD/JPY'] = mkRow(audJpy, btc1d, btc7d, btc30d)
    results['EUR/JPY'] = mkRow(eurJpy, btc1d, btc7d, btc30d)

    return Response.json({ ok: true, btc: { ret1d: btc1d, ret7d: btc7d, ret30d: btc30d }, data: results })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
