export const revalidate = 0

// Binance USDS-margined perps — returns lastFundingRate + nextFundingTime for all symbols
// No API key required for public market data endpoints

const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'SUIUSDT', 'XRPUSDT',
  'XMRUSDT', 'BNBUSDT', 'AAVEUSDT', 'DOGEUSDT', 'HYPEUSDT',
]

export async function GET() {
  try {
    // premiumIndex returns mark price + funding rate for ALL symbols in one shot
    const res = await fetch(
      'https://fapi.binance.com/fapi/v1/premiumIndex',
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 0 },
      }
    )
    if (!res.ok) throw new Error(`Binance fapi status ${res.status}`)
    const all = await res.json()

    // Filter to our symbols only
    const symbolSet = new Set(SYMBOLS)
    const filtered = all
      .filter(d => symbolSet.has(d.symbol))
      .map(d => ({
        symbol:          d.symbol.replace('USDT', ''),
        fundingRate:     parseFloat(d.lastFundingRate),
        nextFundingTime: d.nextFundingTime,
        markPrice:       parseFloat(d.markPrice),
      }))
      // Sort to match our preferred order
      .sort((a, b) => {
        const order = SYMBOLS.map(s => s.replace('USDT', ''))
        return order.indexOf(a.symbol) - order.indexOf(b.symbol)
      })

    return Response.json({ ok: true, data: filtered })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
