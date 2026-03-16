// app/api/backfill-rotation/route.js
// ONE-TIME: Seeds rotation:daily and rotation:transitions
// Supports ?asset=bnb to retry a single failed asset
// DELETE THIS FILE after running once.

const REDIS_URL      = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN    = process.env.UPSTASH_REDIS_REST_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'Arpi-vypi-2026-btc'

const redisHeaders = { Authorization: `Bearer ${REDIS_TOKEN}` }

async function redisHSet(hashKey, field, value) {
  const key = encodeURIComponent(hashKey)
  const f   = encodeURIComponent(field)
  const v   = encodeURIComponent(JSON.stringify(value))
  const res = await fetch(`${REDIS_URL}/hset/${key}/${f}/${v}`, {
    method: 'GET', headers: redisHeaders,
  })
  return res.json()
}

async function redisHGet(hashKey, field) {
  const res = await fetch(
    `${REDIS_URL}/hget/${encodeURIComponent(hashKey)}/${encodeURIComponent(field)}`,
    { method: 'GET', headers: redisHeaders }
  )
  const d = await res.json()
  if (!d.result) return null
  try { return JSON.parse(d.result) } catch { return d.result }
}

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

  const singleAsset = searchParams.get('asset') // e.g. ?asset=bnb to patch one asset

  const START = '2025-03-16'
  const END   = '2026-03-16'
  const startTs = Math.floor(new Date(START + 'T00:00:00Z').getTime() / 1000)
  const endTs   = Math.floor(new Date(END   + 'T23:59:59Z').getTime() / 1000)

  const assetMap = buildAssetMap()

  // Determine which assets to fetch
  const allNeeded = [...new Set(ROTATIONS.map(r => r.asset).filter(a => a !== 'usd'))]
  const toFetch   = singleAsset ? [singleAsset] : allNeeded

  // Fetch prices
  const prices = {}
  const fetchErrors = []

  for (const asset of toFetch) {
    const cgId = COINGECKO_IDS[asset]
    if (!cgId) { fetchErrors.push(`unknown asset: ${asset}`); continue }
    try {
      prices[asset] = await fetchPrices(cgId, startTs, endTs)
      await sleep(1500)
    } catch (e) {
      fetchErrors.push(`${asset}: ${e.message}`)
      prices[asset] = {}
    }
  }

  if (singleAsset) {
    // Patch mode: only update days where this asset was held
    // Read existing entries, update equity for affected segments, rewrite
    const asset = singleAsset
    const assetPrices = prices[asset] ?? {}

    if (Object.keys(assetPrices).length === 0) {
      return Response.json({ ok: false, error: `No prices fetched for ${asset}`, fetchErrors })
    }

    // Find all segments for this asset and their preceding cumulative equity
    let cumEquity = 1.0
    let written = 0

    for (let i = 0; i < ROTATIONS.length; i++) {
      const { date: segStart, asset: segAsset } = ROTATIONS[i]
      const segEnd    = ROTATIONS[i + 1]?.date ?? END
      const segDates  = dateRange(segStart, segEnd).filter(d => d <= END)
      const entryPrice = assetPrices[segStart] ?? null
      const segStartEquity = cumEquity

      if (segAsset === asset && entryPrice) {
        // Rewrite these days with correct equity
        for (const d of segDates) {
          const currentPrice = assetPrices[d] ?? null
          const equity = currentPrice ? segStartEquity * (currentPrice / entryPrice) : segStartEquity
          await redisHSet('rotation:daily', d, {
            date: d, asset, equity: Math.round(equity * 100000) / 100000,
            price: currentPrice ?? null,
            ts: new Date(d + 'T00:00:00Z').getTime(),
          })
          written++
        }
      }

      // Advance cumEquity — need all prices for non-patched segments too
      // Read from Redis for segments we didn't just fetch
      const exitDate = ROTATIONS[i + 1]?.date ?? END
      if (segAsset !== 'usd') {
        const exitPriceForAsset = (segAsset === asset)
          ? (assetPrices[exitDate] ?? assetPrices[segEnd] ?? null)
          : null

        if (exitPriceForAsset && entryPrice) {
          cumEquity = segStartEquity * (exitPriceForAsset / entryPrice)
        } else if (segAsset !== asset) {
          // Read terminal equity from Redis for this segment
          const lastDay = segDates[segDates.length - 1]
          const stored  = await redisHGet('rotation:daily', lastDay)
          if (stored?.equity) cumEquity = stored.equity
        }
      }
    }

    return Response.json({
      ok: true, mode: 'patch', asset,
      days_written: written,
      prices_fetched: Object.keys(assetPrices).length,
      fetch_errors: fetchErrors,
    })
  }

  // Full mode: compute entire equity curve and write all days
  let cumEquity = 1.0
  const dailyEntries = []

  for (let i = 0; i < ROTATIONS.length; i++) {
    const { date: segStart, asset } = ROTATIONS[i]
    const segEnd   = ROTATIONS[i + 1]?.date ?? END
    const segDates = dateRange(segStart, segEnd).filter(d => d <= END)
    const assetPrices = prices[asset] ?? {}
    const entryPrice  = asset !== 'usd' ? assetPrices[segStart] ?? null : null
    const segStartEquity = cumEquity

    for (const d of segDates) {
      const currentPrice = asset !== 'usd' ? assetPrices[d] ?? null : null
      let equity = segStartEquity
      if (asset !== 'usd' && entryPrice && currentPrice) {
        equity = segStartEquity * (currentPrice / entryPrice)
      }
      dailyEntries.push({
        date: d, asset,
        equity: Math.round(equity * 100000) / 100000,
        price:  currentPrice ?? null,
        ts:     new Date(d + 'T00:00:00Z').getTime(),
      })
    }

    const exitDate  = ROTATIONS[i + 1]?.date ?? END
    const exitPrice = asset !== 'usd' ? (assetPrices[exitDate] ?? assetPrices[segEnd] ?? null) : null
    if (asset !== 'usd' && entryPrice && exitPrice) {
      cumEquity = segStartEquity * (exitPrice / entryPrice)
    }
  }

  let dailyOk = 0, dailyFail = 0
  for (const entry of dailyEntries) {
    const r = await redisHSet('rotation:daily', entry.date, entry)
    if (r?.result !== null) dailyOk++; else dailyFail++
  }

  let transOk = 0
  for (const { date, asset } of ROTATIONS) {
    await redisHSet('rotation:transitions', date, {
      asset, date, ts: new Date(date + 'T00:00:00Z').getTime(),
    })
    transOk++
  }

  return Response.json({
    ok: true, mode: 'full',
    daily_written: dailyOk, daily_failed: dailyFail,
    transitions_written: transOk,
    fetch_errors: fetchErrors,
    final_equity: dailyEntries[dailyEntries.length - 1]?.equity ?? 1,
    assets_fetched: Object.fromEntries(
      Object.entries(prices).map(([k, v]) => [k, Object.keys(v).length])
    ),
  })
}
