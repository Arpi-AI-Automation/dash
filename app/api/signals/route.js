// app/api/signals/route.js
// Reads current signals and history from Upstash Redis

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      next: { revalidate: 0 },
    })
    const data = await res.json()
    if (!data.result) return null
    return JSON.parse(data.result)
  } catch {
    return null
  }
}

async function redisList(key, count = 180) {
  try {
    const res = await fetch(`${REDIS_URL}/lrange/${key}/0/${count - 1}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      next: { revalidate: 0 },
    })
    const data = await res.json()
    if (!data.result) return []
    // Items are stored as JSON strings, parse each
    return data.result.map((item) => {
      try {
        return typeof item === 'string' ? JSON.parse(item) : item
      } catch {
        return item
      }
    })
  } catch {
    return []
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const includeHistory = searchParams.get('history') !== 'false'

  const [btcSignal, rotationSignal, btcHistory, rotationHistory] = await Promise.all([
    redisGet('signal:btc'),
    redisGet('signal:rotation'),
    includeHistory ? redisList('history:btc', 180) : Promise.resolve([]),
    includeHistory ? redisList('history:rotation', 90) : Promise.resolve([]),
  ])

  return Response.json({
    btc: btcSignal,
    rotation: rotationSignal,
    history: {
      btc: btcHistory,       // newest first (lpush order)
      rotation: rotationHistory,
    },
    fetched_at: new Date().toISOString(),
  })
}
