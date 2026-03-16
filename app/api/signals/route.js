// app/api/signals/route.js
// Reads current signals, history, and transitions from Upstash Redis

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

const headers = { Authorization: `Bearer ${REDIS_TOKEN}` }

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers, next: { revalidate: 0 } })
    const data = await res.json()
    if (!data.result) return null
    return JSON.parse(data.result)
  } catch { return null }
}

// Read a Redis HASH — returns entries sorted ascending by key
async function redisHGetAll(hashKey) {
  try {
    const res  = await fetch(`${REDIS_URL}/hgetall/${encodeURIComponent(hashKey)}`, {
      headers, next: { revalidate: 0 },
    })
    const data = await res.json()
    if (!data.result || !Array.isArray(data.result)) return []

    const entries = []
    for (let i = 0; i < data.result.length; i += 2) {
      const field = data.result[i]
      const raw   = data.result[i + 1]
      try {
        let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (typeof parsed === 'string') parsed = JSON.parse(parsed)
        entries.push({ date: field, ...parsed })
      } catch {}
    }
    entries.sort((a, b) => a.date.localeCompare(b.date))
    return entries
  } catch { return [] }
}

async function redisList(key, count = 500) {
  try {
    const res  = await fetch(`${REDIS_URL}/lrange/${key}/0/${count - 1}`, {
      headers, next: { revalidate: 0 },
    })
    const data = await res.json()
    if (!data.result) return []
    return data.result.map(item => {
      try {
        let p = typeof item === 'string' ? JSON.parse(item) : item
        if (typeof p === 'string') p = JSON.parse(p)
        return p
      } catch { return item }
    })
  } catch { return [] }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const includeHistory  = searchParams.get('history') !== 'false'

  const [
    btcSignal, rotationSignal,
    dailyHistory, transitions,
    legacyHistory, rotationHistory,
    rotationDaily, rotationTransitions,
  ] = await Promise.all([
    redisGet('signal:btc'),
    redisGet('signal:rotation'),
    includeHistory ? redisHGetAll('btc:daily')              : Promise.resolve([]),
    includeHistory ? redisHGetAll('btc:transitions')        : Promise.resolve([]),
    includeHistory ? redisList('history:btc', 500)          : Promise.resolve([]),
    includeHistory ? redisList('history:rotation', 500)     : Promise.resolve([]),
    includeHistory ? redisHGetAll('rotation:daily')         : Promise.resolve([]),
    includeHistory ? redisHGetAll('rotation:transitions')   : Promise.resolve([]),
  ])

  const btcHistory = dailyHistory.length > 0 ? dailyHistory : legacyHistory

  return Response.json({
    btc:      btcSignal,
    rotation: rotationSignal,
    history: {
      btc:      btcHistory,
      rotation: rotationDaily.length > 0 ? rotationDaily : rotationHistory,
    },
    transitions,            // BTC state transitions
    rotationTransitions,    // Asset rotation transitions
    meta: {
      btc_daily_count:            dailyHistory.length,
      btc_transitions_count:      transitions.length,
      btc_legacy_count:           legacyHistory.length,
      rotation_daily_count:       rotationDaily.length,
      rotation_transitions_count: rotationTransitions.length,
      source: dailyHistory.length > 0 ? 'btc:daily hash' : 'history:btc list (legacy)',
    },
    fetched_at: new Date().toISOString(),
  })
}
