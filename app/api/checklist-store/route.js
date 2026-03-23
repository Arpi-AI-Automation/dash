// app/api/checklist-store/route.js
// Called by DecisionChecklist component after computing today's score client-side.
// Saves the full score (including Bybit OI/taker data) to btc:checklist-daily in Redis.
// This makes the backtest's "today" entry always match the live checklist.

export const revalidate = 0

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

async function redisHSet(hashKey, field, value) {
  await fetch(
    `${REDIS_URL}/hset/${encodeURIComponent(hashKey)}/${encodeURIComponent(field)}/${encodeURIComponent(JSON.stringify(value))}`,
    { method: 'GET', headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }
  )
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { date, longScore, shortScore, fg, frPct, tpiState,
            oiRising, takerBuyRatio, domTrend, priceChangePct, price } = body

    if (!date || longScore === undefined || shortScore === undefined) {
      return Response.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
    }

    const entry = {
      date, longScore, shortScore,
      fg:             fg            ?? null,
      frPct:          frPct         ?? null,
      tpiState:       tpiState      ?? null,
      oiRising:       oiRising      ?? null,
      takerBuyRatio:  takerBuyRatio ?? null,
      dominanceTrend: domTrend      ?? null,
      priceChangePct: priceChangePct?? null,
      price:          price         ?? null,
      tpiAvail:       tpiState !== null,
      source:         'client-checklist',
      ts:             Date.now(),
    }

    await redisHSet('btc:checklist-daily', date, entry)
    return Response.json({ ok: true, date, longScore, shortScore })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
