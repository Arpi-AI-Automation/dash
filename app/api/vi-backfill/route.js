// app/api/vi-backfill/route.js
// One-time backfill endpoint for VI / VI2 daily history
// POST with JSON array: [{"date":"2025-01-01","vi":-1.23,"vi2":-2.1}, ...]
// Protected by WEBHOOK_SECRET

const REDIS_URL      = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN    = process.env.UPSTASH_REDIS_REST_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'Arpi-vypi-2026-btc'

const rHeaders = { Authorization: `Bearer ${REDIS_TOKEN}` }

async function redisHSet(hashKey, field, value) {
  const key = encodeURIComponent(hashKey)
  const f   = encodeURIComponent(field)
  const v   = encodeURIComponent(JSON.stringify(value))
  await fetch(`${REDIS_URL}/hset/${key}/${f}/${v}`, { method: 'GET', headers: rHeaders })
}

export async function POST(request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret') || request.headers.get('x-webhook-secret')
  if (secret !== WEBHOOK_SECRET) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body    = await request.json()
  const entries = Array.isArray(body) ? body : [body]
  let written = 0
  const errors = []

  for (const e of entries) {
    const date = e.date
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`Bad date: ${date}`); continue }

    const writes = []
    if (e.vi  != null) writes.push(redisHSet('vi:daily',  date, { value: parseFloat(e.vi),  date, ts: new Date(date).getTime(), source: 'backfill' }))
    if (e.vi2 != null) writes.push(redisHSet('vi2:daily', date, { value: parseFloat(e.vi2), date, ts: new Date(date).getTime(), source: 'backfill' }))

    if (writes.length) { await Promise.all(writes); written++ }
  }

  return Response.json({ ok: true, written, errors, total: entries.length })
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret') || request.headers.get('x-webhook-secret')
  if (secret !== WEBHOOK_SECRET) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [r1, r2] = await Promise.all([
    fetch(`${REDIS_URL}/hlen/vi:daily`,  { headers: rHeaders }).then(r => r.json()),
    fetch(`${REDIS_URL}/hlen/vi2:daily`, { headers: rHeaders }).then(r => r.json()),
  ])
  return Response.json({ ok: true, vi_daily_count: r1.result ?? 0, vi2_daily_count: r2.result ?? 0 })
}
