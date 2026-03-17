export const revalidate = 0

const IDS = [
  'bitcoin', 'ethereum', 'solana', 'sui', 'ripple', 'hyperliquid', 'pax-gold'
]

export async function GET() {
  try {
    const ids = IDS.join(',')
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { headers: { 'Accept': 'application/json' }, cache: 'no-store' }
    )
    const prices = await res.json()

    const result = {}
    IDS.forEach(id => {
      const p = prices[id]
      result[id] = {
        price:     p?.usd            ?? null,
        change24h: p?.usd_24h_change ?? null,
      }
    })

    return Response.json({ ok: true, data: result })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
