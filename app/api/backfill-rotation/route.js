// app/api/backfill-rotation/route.js
// ONE-TIME: Seeds rotation:daily and rotation:transitions from historical data
// Fetches real prices from CoinGecko for each held asset per day
// DELETE THIS FILE after running once.

const REDIS_URL      = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN    = process.env.UPSTASH_REDIS_REST_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'Arpi-vypi-2026-btc'

const headers = { Authorization: `Bearer ${REDIS_TOKEN}` }

async function redisHSet(hashKey, field, value) {
  const key = encodeURIComponent(hashKey)
  const f   = encodeURIComponent(field)
  const v   = encodeURIComponent(JSON.stringify(value))
  const res = await fetch(`${REDIS_URL}/hset/${key}/${f}/${v}`, {
    method: 'GET', headers,
  })
  return res.json()
}

// Rotation history — exact dates asset became dominant
const ROTATIONS = [
  { date: '2025-03-17', asset: 'paxg' },
  { date: '2025-04-23', asset: 'sol'  },
  { date: '2025-04-24', asset: 'sui'  },
  { date: '2025-05-26', asset: 'eth'  },
  { date: '2025-06-15', asset: 'paxg' },
  { date: '2025-06-27', asset: 'usd'  },
  { date: '2025-07-07', asset: 'xrp'  },
  { date: '2025-07-25', asset: 'eth'  },
  { date: '2025-09-03', asset: 'sol'  },
  { date: '2025-09-22', asset: 'bnb'  },
  { date: '2025-10-18', asset: 'paxg' },
  { date: '2025-10-27', asset: 'bnb'  },
  { date: '2025-11-04', asset: 'paxg' },
  { date: '2026-01-04', asset: 'sui'  },
  { date: '2026-01-20', asset: 'eth'  },
  { date: '2026-01-21', asset: 'bnb'  },
  { date: '2026-01-25', asset: 'paxg' },
  { date: '2026-03-15', asset: 'usd'  },
]

const COINGECKO_IDS = {
  bnb:  'binancecoin',
  eth:  'ethereum',
  sol:  'solana',
  xrp:  'ripple',
  paxg: 'pax-gold',
  sui:  'sui',
}

function dateRange(start, end) {
  const dates = []
  const d = new Date(start + 'T00:00:00Z')
  const e = new Date(end   + 'T00:00:00Z')
  while (d <= e) {
    dates.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return dates
}

function buildAssetMap() {
  const END = '2026-03-16'
  const map  = {}
  for (let i = 0; i < ROTATIONS.length; i++) {
    const { date, asset } = ROTATIONS[i]
    const endDate = ROTATIONS[i + 1]?.date ?? END
    for (const d of dateRange(date, endDate)) {
      if (!map[d]) map[d] = asset
    }
  }
  return map
}

async function fetchPrices(cgId, startTs, endTs) {
  const url = `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart/range?vs_currency=usd&from=${startTs}&to=${endTs}`
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } })
  if (!r.ok) throw new Error(`CoinGecko ${cgId}: HTTP ${r.status}`)
  const d = await r.json()
  const daily = {}
  for (const [tsMs, price] of (d.prices || [])) {
    const date = new Date(tsMs).toISOString().slice(0, 10)
    daily[date] = price
  }
  return daily
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('secret') !== WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const START = '2025-03-16'  // one day before for prev-close
  const END   = '2026-03-16'
  const startTs = Math.floor(new Date(START + 'T00:00:00Z').getTime() / 1000)
  const endTs   = Math.floor(new Date(END   + 'T23:59:59Z').getTime() / 1000)

  // 1. Fetch prices for all non-USD assets
  const prices = {}
  const fetchErrors = []

  const neededAssets = [...new Set(ROTATIONS.map(r => r.asset).filter(a => a !== 'usd'))]

  for (const asset of neededAssets) {
    const cgId = COINGECKO_IDS[asset]
    try {
      prices[asset] = await fetchPrices(cgId, startTs, endTs)
      await sleep(1500)  // CoinGecko rate limit
    } catch (e) {
      fetchErrors.push(`${asset}: ${e.message}`)
      prices[asset] = {}
    }
  }

  // 2. Build date→asset map
  const assetMap = buildAssetMap()
  const allDates = dateRange('2025-03-17', END)

  // 3. Compute equity curve day by day (fixed-quantity model within each segment)
  // Each rotation segment: equity[day] = segStartEquity * (price[day] / entryPrice)
  let cumEquity = 1.0
  const dailyEntries = []

  for (let i = 0; i < ROTATIONS.length; i++) {
    const { date: segStart, asset } = ROTATIONS[i]
    const segEnd = ROTATIONS[i + 1]?.date ?? END
    const segDates = dateRange(segStart, segEnd).filter(d => d <= END)

    const entryPrice = asset !== 'usd' ? prices[asset]?.[segStart] ?? null : null
    const segStartEquity = cumEquity

    for (const d of segDates) {
      const currentPrice = asset !== 'usd' ? prices[asset]?.[d] ?? null : null
      let equity = segStartEquity

      if (asset !== 'usd' && entryPrice && currentPrice) {
        equity = segStartEquity * (currentPrice / entryPrice)
      }

      dailyEntries.push({
        date:   d,
        asset,
        equity: Math.round(equity * 100000) / 100000,
        price:  currentPrice ?? null,
        ts:     new Date(d + 'T00:00:00Z').getTime(),
      })
    }

    // Advance cumEquity to terminal value of this segment
    const exitDate  = ROTATIONS[i + 1]?.date ?? END
    const exitPrice = asset !== 'usd' ? prices[asset]?.[exitDate] ?? prices[asset]?.[segEnd] ?? null : null

    if (asset !== 'usd' && entryPrice && exitPrice) {
      cumEquity = segStartEquity * (exitPrice / entryPrice)
    }
    // USD segment: cumEquity stays flat
  }

  // 4. Write rotation:daily hash
  let dailyOk = 0, dailyFail = 0
  for (const entry of dailyEntries) {
    const r = await redisHSet('rotation:daily', entry.date, entry)
    if (r?.result !== null) dailyOk++; else dailyFail++
  }

  // 5. Write rotation:transitions hash
  let transOk = 0
  for (const { date, asset } of ROTATIONS) {
    await redisHSet('rotation:transitions', date, {
      asset, date,
      ts: new Date(date + 'T00:00:00Z').getTime(),
    })
    transOk++
  }

  const finalEquity = dailyEntries[dailyEntries.length - 1]?.equity ?? 1

  return Response.json({
    ok: true,
    daily_written:       dailyOk,
    daily_failed:        dailyFail,
    transitions_written: transOk,
    fetch_errors:        fetchErrors,
    final_equity:        finalEquity,
    date_range:          { start: '2025-03-17', end: END },
    assets_fetched:      Object.fromEntries(
      Object.entries(prices).map(([k, v]) => [k, Object.keys(v).length])
    ),
  })
}
