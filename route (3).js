export const revalidate = 0

// Bybit V5 long/short ratio — public endpoint, no API key, no Vercel IP block
// GET /v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1h&limit=1

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'SUIUSDT', 'XRPUSDT', 'BNBUSDT', 'AAVEUSDT', 'DOGEUSDT']

async function fetchRatio(symbol) {
  const url = `https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${symbol}&period=1h&limit=1`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`${symbol}: ${res.status}`)
  const json = await res.json()
  if (json.retCode !== 0) throw new Error(`${symbol}: ${json.retMsg}`)
  const latest = json.result?.list?.[0]
  if (!latest) throw new Error(`No data for ${symbol}`)

  const longRatio  = parseFloat(latest.buyRatio)  * 100
  const shortRatio = parseFloat(latest.sellRatio) * 100

  return {
    symbol:     symbol.replace('USDT', ''),
    longRatio,
    shortRatio,
    lsRatio:    longRatio / (shortRatio || 1),
    timestamp:  parseInt(latest.timestamp),
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
