// app/api/cron/s2-sync/route.js
// Runs at 00:01, 00:02, 00:03, 00:04 UTC — fires before daily-score at 00:05.
// Ensures s2:daily is written with the correct signal each night.
// Does NOT apply a zero-guard — trusts signal:s2 as written by TradingView.
// The only thing it does: write today's entry + compute equity.

export const revalidate = 0

const REDIS_URL    = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN  = process.env.UPSTASH_REDIS_REST_TOKEN
const CRON_SECRET  = process.env.CRON_SECRET || 'arpi-cron-2026'

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

async function redisSet(key, value) {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  })
}

async function redisHSet(hashKey, field, value) {
  await fetch(
    `${REDIS_URL}/hset/${encodeURIComponent(hashKey)}/${encodeURIComponent(field)}/${encodeURIComponent(JSON.stringify(value))}`,
    { method: 'GET', headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }
  )
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

async function getCoinGeckoPrices() {
  try {
    const ids = 'ethereum,pax-gold,bitcoin,solana,ripple,binancecoin,sui'
    const res  = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)
    const data = await res.json()
    return {
      eth:  data.ethereum?.usd        ?? null,
      paxg: data['pax-gold']?.usd     ?? null,
      btc:  data.bitcoin?.usd         ?? null,
      sol:  data.solana?.usd          ?? null,
      xrp:  data.ripple?.usd          ?? null,
      bnb:  data.binancecoin?.usd     ?? null,
      sui:  data.sui?.usd             ?? null,
      usd:  1.0,
    }
  } catch { return null }
}

function computeEquity(alloc, prices, basePrices) {
  if (!alloc || !prices || !basePrices) return null
  const allocSum = Object.values(alloc).reduce((s, v) => s + v, 0)
  if (allocSum === 0) return null  // cash — caller handles
  const scl = allocSum > 1 ? 100 : 1
  let portfolioReturn = 0, totalWeight = 0
  for (const [asset, rawW] of Object.entries(alloc)) {
    const w = rawW / scl
    if (w === 0) continue
    const baseP  = basePrices[asset]
    const todayP = prices[asset]
    if (!baseP || !todayP) continue
    portfolioReturn += w * (todayP / baseP)
    totalWeight     += w
  }
  if (totalWeight === 0) return null
  return parseFloat((portfolioReturn / totalWeight).toFixed(6))
}

function isCashSignal(s2Signal) {
  const asset = (s2Signal?.asset ?? '').toUpperCase()
  return asset === 'USD' || asset === ''
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret')
  if (secret !== CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dateKey = new Date().toISOString().slice(0, 10)

  try {
    const [s2Signal, prices, allDaily] = await Promise.all([
      redisGet('signal:s2'),
      getCoinGeckoPrices(),
      redisHGetAll('s2:daily'),
    ])

    if (!s2Signal) {
      return Response.json({ ok: false, reason: 'No signal:s2 yet', date: dateKey })
    }

    const cash       = isCashSignal(s2Signal)
    const baseEntry  = allDaily.find(e => e.base_prices != null)
    const basePrices = baseEntry?.base_prices ?? null

    // Equity: for cash, lock at last non-cash equity; otherwise compute
    let equity
    if (cash) {
      const lastNonCash = [...allDaily]
        .reverse()
        .find(e => {
          const a = (e.asset ?? '').toUpperCase()
          return a !== 'USD' && a.length > 0 && e.equity != null
        })
      equity = lastNonCash?.equity ?? 1.0
    } else {
      equity = computeEquity(s2Signal.alloc, prices, basePrices)
    }

    await redisHSet('s2:daily', dateKey, {
      date:       dateKey,
      asset:      s2Signal.asset,
      alloc:      s2Signal.alloc,
      scores:     s2Signal.scores,
      ts:         Date.now(),
      updated_at: new Date().toISOString(),
      equity,
      source:     's2-sync-cron',
      is_cash:    cash,
    })

    const signalDate = s2Signal.updated_at
      ? new Date(s2Signal.updated_at).toISOString().slice(0, 10)
      : null

    return Response.json({
      ok:          true,
      date:        dateKey,
      asset:       s2Signal.asset,
      is_cash:     cash,
      equity,
      signal_date: signalDate,
      is_stale:    signalDate !== dateKey,
    })
  } catch (err) {
    console.error('[s2-sync] Error:', err)
    return Response.json({ ok: false, error: err.message, date: dateKey }, { status: 500 })
  }
}
