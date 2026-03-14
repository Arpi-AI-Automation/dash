export const revalidate = 0

// Binance: GET /futures/data/globalLongShortAccountRatio
// Requires symbol + period per call — no API key needed
// We fetch all symbols in parallel

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'SUIUSDT', 'XRPUSDT', 'BNBUSDT', 'AAVEUSDT', 'DOGEUSDT']

async function fetchRatio(symbol) {
  // limit=1 gives us just the latest value
  const url = `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`${symbol}: ${res.status}`)
  const data = await res.json()
  const latest = data[0]
  return {
    symbol:     symbol.replace('USDT', ''),
    longRatio:  parseFloat(latest.longAccount)  * 100,
    shortRatio: parseFloat(latest.shortAccount) * 100,
    lsRatio:    parseFloat(latest.longShortRatio), // raw ratio (longs/shorts)
    timestamp:  latest.timestamp,
  }
}

export async function GET() {
  try {
    const results = await Promise.allSettled(SYMBOLS.map(fetchRatio))

    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)

    const failed = results
      .filter(r => r.status === 'rejected')
      .map(r => r.reason?.message)

    return Response.json({ ok: true, data, failed })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
