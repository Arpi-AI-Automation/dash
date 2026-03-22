// app/api/s2-backfill/route.js
// One-time endpoint: seeds s2:daily with equity values for all dates
// from the first S2 signal to today, using CoinGecko historical prices.
//
// Call once: GET /api/s2-backfill?secret=Arpi-vypi-2026-btc
// Safe to re-run — overwrites existing entries with correct equity values.

export const revalidate = 0

const REDIS_URL    = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN  = process.env.UPSTASH_REDIS_REST_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'Arpi-vypi-2026-btc'

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    })
    const data = await res.json()
    if (!data.result) return null
    return JSON.parse(data.result)
  } catch { return null }
}

async function redisHSet(hashKey, field, value) {
  const res = await fetch(
    `${REDIS_URL}/hset/${encodeURIComponent(hashKey)}/${encodeURIComponent(field)}/${encodeURIComponent(JSON.stringify(value))}`,
    { method: 'GET', headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }
  )
  return res.json()
}

async function redisHGetAll(hashKey) {
  try {
    const res  = await fetch(`${REDIS_URL}/hgetall/${encodeURIComponent(hashKey)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    })
    const data = await res.json()
    if (!data.result || !Array.isArray(data.result)) return []
    const entries = []
    for (let i = 0; i < data.result.length; i += 2) {
      try {
        let parsed = JSON.parse(data.result[i + 1])
        if (typeof parsed === 'string') parsed = JSON.parse(parsed)
        entries.push({ date: data.result[i], ...parsed })
      } catch {}
    }
    return entries.sort((a, b) => a.date.localeCompare(b.date))
  } catch { return [] }
}

// Fetch historical daily prices from CoinGecko for a date range
// Returns { 'YYYY-MM-DD': { eth: price, paxg: price, ... }, ... }
async function fetchHistoricalPrices(startDate, endDate) {
  const start = Math.floor(new Date(startDate).getTime() / 1000)
  const end   = Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000)

  const COINS = {
    eth:  'ethereum',
    paxg: 'pax-gold',
    btc:  'bitcoin',
    sol:  'solana',
    xrp:  'ripple',
    bnb:  'binancecoin',
    sui:  'sui',
  }

  const results = {}

  // Fetch each coin's price history (CoinGecko free: up to 90 days at daily resolution)
  for (const [key, id] of Object.entries(COINS)) {
    try {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=usd&from=${start}&to=${end}`
      const res  = await fetch(url)
      const data = await res.json()
      const prices = data.prices ?? []

      for (const [ts, price] of prices) {
        const date = new Date(ts).toISOString().slice(0, 10)
        if (!results[date]) results[date] = { usd: 1.0 }
        results[date][key] = price
      }

      // Rate limit: 1 request/second on free tier
      await new Promise(r => setTimeout(r, 1200))
    } catch (e) {
      console.error(`[s2-backfill] Failed to fetch ${id}:`, e?.message)
    }
  }

  return results
}

// Generate array of YYYY-MM-DD strings between two dates inclusive
function dateRange(start, end) {
  const dates = []
  const cur   = new Date(start + 'T00:00:00Z')
  const last  = new Date(end   + 'T00:00:00Z')
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (secret !== WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Load current S2 signal and any existing daily entries
    const [s2Signal, existingEntries] = await Promise.all([
      redisGet('signal:s2'),
      redisHGetAll('s2:daily'),
    ])

    if (!s2Signal) {
      return Response.json({ error: 'No s2 signal found in Redis' }, { status: 400 })
    }

    const alloc = s2Signal.alloc  // e.g. { eth: 60, paxg: 40, btc: 0, ... }
    if (!alloc) {
      return Response.json({ error: 'S2 signal has no alloc field' }, { status: 400 })
    }

    // Date range: from first S2 signal to today
    const firstEntry = existingEntries[0]
    const startDate  = firstEntry?.date ?? new Date(s2Signal.ts).toISOString().slice(0, 10)
    const endDate    = new Date().toISOString().slice(0, 10)
    const dates      = dateRange(startDate, endDate)

    // Fetch historical prices for all assets over the range
    const pricesByDate = await fetchHistoricalPrices(startDate, endDate)

    // Compute equity for each day
    // Base = first day, equity = 1.0, base_prices stored there
    const basePrices   = pricesByDate[startDate]
    if (!basePrices) {
      return Response.json({ error: `No price data found for start date ${startDate}` }, { status: 500 })
    }

    const allocSum = Object.values(alloc).reduce((s, v) => s + v, 0)
    const scl      = allocSum > 1 ? 100 : 1  // normalise 60/40 → 0.6/0.4

    const written = []

    for (const date of dates) {
      const isBase     = date === startDate
      const todayPrices = pricesByDate[date]

      let equity = null
      if (isBase) {
        equity = 1.0
      } else if (todayPrices && basePrices) {
        let portfolioReturn = 0, totalWeight = 0
        for (const [asset, rawW] of Object.entries(alloc)) {
          const w = rawW / scl
          if (w === 0) continue
          const baseP  = basePrices[asset]
          const todayP = todayPrices[asset]
          if (!baseP || !todayP) continue
          portfolioReturn += w * (todayP / baseP)
          totalWeight     += w
        }
        if (totalWeight > 0) equity = parseFloat((portfolioReturn / totalWeight).toFixed(6))
      }

      // Look up existing entry for this date (to preserve asset/scores/alloc)
      const existing = existingEntries.find(e => e.date === date)

      const entry = {
        date,
        asset:      existing?.asset   ?? s2Signal.asset,
        alloc:      existing?.alloc   ?? alloc,
        scores:     existing?.scores  ?? s2Signal.scores ?? null,
        ts:         existing?.ts      ?? Date.now(),
        updated_at: existing?.updated_at ?? new Date().toISOString(),
        equity,
        ...(isBase ? { base_prices: basePrices } : {}),
      }

      await redisHSet('s2:daily', date, entry)
      written.push({ date, equity })
    }

    return Response.json({
      ok:      true,
      written: written.length,
      start:   startDate,
      end:     endDate,
      alloc,
      entries: written,
    })
  } catch (err) {
    console.error('[s2-backfill] Error:', err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
