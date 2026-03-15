export const revalidate = 0

export async function GET() {
  try {
    // Alternative.me — limit=0 returns ALL available history (~2018 onwards)
    const res = await fetch('https://api.alternative.me/fng/?limit=0&format=json', { next: { revalidate: 0 } })
    if (!res.ok) throw new Error(`alternative.me status ${res.status}`)
    const json = await res.json()

    // newest-first → reverse to oldest-first
    const fg = json.data.reverse().map(d => ({
      ts:    parseInt(d.timestamp) * 1000,
      value: parseInt(d.value),
      label: d.value_classification,
    }))

    return Response.json({ ok: true, fg })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
