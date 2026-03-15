export const revalidate = 0

export async function GET() {
  try {
    // Alternative.me — limit=0 returns ALL available history (~2018 onwards)
    const [fgRes, btcRes] = await Promise.all([
      fetch('https://api.alternative.me/fng/?limit=0&format=json', { next: { revalidate: 0 } }),
      fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max&interval=daily', { next: { revalidate: 0 } }),
    ])

    if (!fgRes.ok) throw new Error(`alternative.me status ${fgRes.status}`)

    const fgJson  = await fgRes.json()
    const btcJson = btcRes.ok ? await btcRes.json() : null

    // F&G: newest-first → reverse to oldest-first
    const fg = fgJson.data.reverse().map(d => ({
      ts:    parseInt(d.timestamp) * 1000,
      value: parseInt(d.value),
      label: d.value_classification,
    }))

    // BTC: array of [timestamp_ms, price]
    const btc = btcJson?.prices?.map(([ts, price]) => ({ ts, price })) ?? []

    return Response.json({ ok: true, fg, btc })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
