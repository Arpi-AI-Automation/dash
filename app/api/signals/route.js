// app/api/signals/route.js
// Reads current signals and history from Upstash Redis
//
// Primary history source: btc:daily (Redis HASH, permanent, one entry per day)
// Fallback: history:btc (legacy list, 500 entries, kept for backward compat)

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

const headers = {
  Authorization: `Bearer ${REDIS_TOKEN}`,
}

async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${key}`, {
      headers,
      next: { revalidate: 0 },
    })
    const data = await res.json()
    if (!data.result) return null
    return JSON.parse(data.result)
  } catch {
    return null
  }
}

// Read full btc:daily hash — returns all dates ever stored, sorted ascending
async function redisDailyHash() {
  try {
    const res = await fetch(`${REDIS_URL}/hgetall/btc%3Adaily`, {
      headers,
      next: { revalidate: 0 },
    })
    const data = await res.json()
    if (!data.result || !Array.isArray(data.result)) return []

    // hgetall returns flat array: [field, value, field, value, ...]
    const entries = []
    for (let i = 0; i < data.result.length; i += 2) {
      const date  = data.result[i]
      const raw   = data.result[i + 1]
      try {
        let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (typeof parsed === 'string') parsed = JSON.parse(parsed)
        entries.push({ date, ...parsed })
      } catch {
        // skip malformed entries
      }
    }

    // Sort ascending by date string (YYYY-MM-DD sorts lexicographically)
    entries.sort((a, b) => a.date.localeCompare(b.date))
    return entries
  } catch {
    return []
  }
}

// Legacy list fallback (kept for backward compat)
async function redisList(key, count = 500) {
  try {
    const res = await fetch(`${REDIS_URL}/lrange/${key}/0/${count - 1}`, {
      headers,
      next: { revalidate: 0 },
    })
    const data = await res.json()
    if (!data.result) return []
    return data.result.map((item) => {
      try {
        let parsed = typeof item === 'string' ? JSON.parse(item) : item
        if (typeof parsed === 'string') parsed = JSON.parse(parsed)
        return parsed
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

  const [btcSignal, rotationSignal, dailyHistory, legacyHistory, rotationHistory] =
    await Promise.all([
      redisGet('signal:btc'),
      redisGet('signal:rotation'),
      includeHistory ? redisDailyHash()            : Promise.resolve([]),
      includeHistory ? redisList('history:btc', 500) : Promise.resolve([]),
      includeHistory ? redisList('history:rotation', 500) : Promise.resolve([]),
    ])

  // Use daily hash as primary source if it has data, else fall back to legacy list
  // The daily hash is sorted ascending; the legacy list is newest-first.
  // TvSignals.js expects newest-first for the legacy path, but we'll normalise here.
  const btcHistory = dailyHistory.length > 0 ? dailyHistory : legacyHistory

  return Response.json({
    btc:         btcSignal,
    rotation:    rotationSignal,
    history: {
      btc:       btcHistory,       // daily hash: oldest→newest (ascending)
      rotation:  rotationHistory,  // legacy list: newest first
    },
    meta: {
      btc_daily_count:  dailyHistory.length,
      btc_legacy_count: legacyHistory.length,
      source: dailyHistory.length > 0 ? 'btc:daily hash' : 'history:btc list (legacy)',
    },
    fetched_at: new Date().toISOString(),
  })
}
