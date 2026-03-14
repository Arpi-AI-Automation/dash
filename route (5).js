export const revalidate = 0

export async function GET() {
  try {
    // Alternative.me — the canonical crypto F&G index, no key needed
    // limit=90 gives us 90 days of daily values for the chart
    const res = await fetch(
      'https://api.alternative.me/fng/?limit=90&format=json',
      { next: { revalidate: 0 } }
    )
    if (!res.ok) throw new Error(`alternative.me status ${res.status}`)
    const json = await res.json()

    // data comes newest-first, reverse for charting oldest→newest
    const points = json.data.reverse().map(d => ({
      ts:    parseInt(d.timestamp) * 1000,
      value: parseInt(d.value),
      label: d.value_classification,
    }))

    return Response.json({ ok: true, data: points })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
