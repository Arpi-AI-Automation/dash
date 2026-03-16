// app/api/backfill-transitions/route.js
// ONE-TIME: Seeds btc:transitions hash with historical TV transitions
// DELETE THIS FILE after running once.

const REDIS_URL      = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN    = process.env.UPSTASH_REDIS_REST_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'Arpi-vypi-2026-btc'

async function redisHSet(hashKey, field, value) {
  const key = encodeURIComponent(hashKey)
  const f   = encodeURIComponent(field)
  const v   = encodeURIComponent(JSON.stringify(value))
  const res = await fetch(`${REDIS_URL}/hset/${key}/${f}/${v}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  })
  return res.json()
}

const HISTORICAL_TRANSITIONS = [
  { date: '2025-03-17', state: 'SHORT', price: 82611.00  },
  { date: '2025-04-21', state: 'LONG',  price: 87500.18  },
  { date: '2025-06-17', state: 'SHORT', price: 104639.20 },
  { date: '2025-06-29', state: 'LONG',  price: 108381.92 },
  { date: '2025-07-01', state: 'SHORT', price: 105760.21 },
  { date: '2025-07-02', state: 'LONG',  price: 108900.07 },
  { date: '2025-08-18', state: 'SHORT', price: 116302.93 },
  { date: '2025-09-16', state: 'LONG',  price: 116818.45 },
  { date: '2025-09-19', state: 'SHORT', price: 115724.93 },
  { date: '2025-10-01', state: 'LONG',  price: 118639.48 },
  { date: '2025-10-10', state: 'SHORT', price: 113014.09 },
  { date: '2026-01-05', state: 'LONG',  price: 93842.25  },
  { date: '2026-01-09', state: 'SHORT', price: 90541.15  },
  { date: '2026-01-11', state: 'LONG',  price: 90894.46  },
  { date: '2026-01-20', state: 'SHORT', price: 88341.87  },
]

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('secret') !== WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = []
  for (const t of HISTORICAL_TRANSITIONS) {
    const r = await redisHSet('btc:transitions', t.date, {
      state: t.state, price: t.price, date: t.date,
      ts: new Date(t.date + 'T00:00:00Z').getTime(),
    })
    results.push({ date: t.date, state: t.state, price: t.price, r })
  }

  return Response.json({ ok: true, written: results.length, results })
}
