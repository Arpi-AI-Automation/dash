export const revalidate = 0

// Bybit V5 tickers — public endpoint, no API key, no Vercel IP block
// Returns lastFundingRate + nextFundingTime per symbol

const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'SUIUSDT', 'XRPUSDT',
  'XMRUSDT', 'BNBUSDT', 'AAVEUSDT', 'DOGEUSDT', 'HYPEUSDT',
]

async function fetchBybitTicker(symbol) {
  const url = `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`Bybit ${symbol}: ${res.status}`)
  const json = await res.json()
  if (json.retCode !== 0) throw new Error(`Bybit ${symbol}: ${json.retMsg}`)
  const t = json.result?.list?.[0]
  if (!t) throw new Error(`No data for ${symbol}`)
  return {
    symbol:          symbol.replace('USDT', ''),
    fundingRate:     parseFloat(t.fundingRate),
    nextFundingTime: parseInt(t.nextFundingTime),
    markPrice:       parseFloat(t.markPrice),
  }
}

export async function GET() {
  try {
    const results = await Promise.allSettled(SYMBOLS.map(fetchBybitTicker))

    const order = SYMBOLS.map(s => s.replace('USDT', ''))
    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .sort((a, b) => order.indexOf(a.symbol) - order.indexOf(b.symbol))

    return Response.json({ ok: true, data })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
