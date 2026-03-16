export const revalidate = 0

export async function GET() {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/global', { next: { revalidate: 0 } })
    const d = await r.json()
    return Response.json({
      ok: true,
      status: r.status,
      dominance: d.data?.market_cap_percentage?.btc,
      mcap_change_24h: d.data?.market_cap_change_percentage_24h_usd,
      updated_at: d.data?.updated_at,
    })
  } catch(e) {
    return Response.json({ ok: false, error: e.message })
  }
}
