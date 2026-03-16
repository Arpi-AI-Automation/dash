// app/api/backfill/route.js
// One-time migration: copies history:btc list → btc:daily hash
// Protected by webhook secret. DELETE this file after running once.

const REDIS_URL    = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN  = process.env.UPSTASH_REDIS_REST_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'Arpi-vypi-2026-btc'

const headers = {
  Authorization: `Bearer ${REDIS_TOKEN}`,
  'Content-Type': 'application/json',
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('secret') !== WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Read all 500 legacy entries
    const listRes = await fetch(`${REDIS_URL}/lrange/history%3Abtc/0/499`, { headers })
    const listData = await listRes.json()
    const raw = listData.result || []

    // 2. Parse and dedupe by UTC date — keep highest ts per day
    const dayMap = {}
    for (const item of raw) {
      try {
        let p = typeof item === 'string' ? JSON.parse(item) : item
        if (typeof p === 'string') p = JSON.parse(p)
        if (!p.price || p.price <= 0 || !p.ts) continue
        const date = new Date(p.ts).toISOString().slice(0, 10)
        if (!dayMap[date] || p.ts > dayMap[date].ts) {
          dayMap[date] = { state: p.state, tpi: p.tpi, roc: p.roc, price: p.price, ts: p.ts, date }
        }
      } catch {}
    }

    const entries = Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b))

    // 3. Write each to btc:daily hash
    let ok = 0, fail = 0, errors = []
    for (const [date, entry] of entries) {
      const f   = encodeURIComponent(date)
      const v   = encodeURIComponent(JSON.stringify(entry))
      const res = await fetch(`${REDIS_URL}/hset/btc%3Adaily/${f}/${v}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      })
      const j = await res.json()
      if (j.error) { fail++; errors.push({ date, error: j.error }) }
      else ok++
    }

    // 4. Verify final count
    const lenRes = await fetch(`${REDIS_URL}/hlen/btc%3Adaily`, { headers })
    const lenData = await lenRes.json()

    return Response.json({
      ok, fail, errors,
      rawListEntries: raw.length,
      uniqueDays: entries.length,
      hashLengthAfter: lenData.result,
      dateRange: entries.length > 0 ? { first: entries[0][0], last: entries[entries.length - 1][0] } : null,
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
