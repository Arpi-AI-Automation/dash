export const revalidate = 0

const ETFs = ['SMH', 'NLR', 'DTCR', 'IGV', 'BOTZ']

const ETF_META = {
  SMH:  { name: 'Semiconductors', color: '#818cf8' },
  NLR:  { name: 'Nuclear Energy',  color: '#34d399' },
  DTCR: { name: 'Data Centers',    color: '#fb923c' },
  IGV:  { name: 'Software',        color: '#60a5fa' },
  BOTZ: { name: 'Robotics & AI',   color: '#f472b6' },
}

async function fetchETF(symbol) {
  try {
    // 1y range gives us: 52W high, 30D spark, 30D change, volume avg
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 0 },
    })
    if (!res.ok) return null
    const json   = await res.json()
    const result = json.chart?.result?.[0]
    const meta   = result?.meta
    const closes = result?.indicators?.quote?.[0]?.close
    const volumes = result?.indicators?.quote?.[0]?.volume

    if (!meta || !closes) return null

    const valid = closes.map((c, i) => ({ c, v: volumes?.[i] ?? 0 })).filter(x => x.c != null)
    if (valid.length < 11) return null

    const price = meta.regularMarketPrice ?? valid[valid.length - 1].c

    // 30D change
    const close30d  = valid[valid.length - 31]?.c ?? valid[0].c
    const change30d = parseFloat((((price - close30d) / close30d) * 100).toFixed(2))

    // 52W high → drawdown
    const high52w   = meta.fiftyTwoWeekHigh ?? Math.max(...valid.map(x => x.c))
    const drawdown  = parseFloat((((price - high52w) / high52w) * 100).toFixed(2))

    // Volume: today vs 20D avg
    const recentVols  = valid.slice(-21, -1).map(x => x.v).filter(Boolean)
    const avgVol20d   = recentVols.length ? recentVols.reduce((a, b) => a + b, 0) / recentVols.length : null
    const todayVol    = meta.regularMarketVolume ?? valid[valid.length - 1].v
    const volRatio    = avgVol20d ? parseFloat((todayVol / avgVol20d).toFixed(2)) : null

    // 30-point spark from valid closes
    const spark = valid.slice(-30).map(x => x.c)

    return {
      price:     parseFloat(price.toFixed(2)),
      change30d,
      drawdown,
      volRatio,
      spark,
      high52w:   parseFloat(high52w.toFixed(2)),
      ...ETF_META[symbol],
    }
  } catch (e) {
    console.error(`[etf] ${symbol} error:`, e?.message)
    return null
  }
}

export async function GET() {
  const results = await Promise.all(ETFs.map(sym => fetchETF(sym).then(d => [sym, d])))
  const data = {}
  for (const [sym, d] of results) {
    if (d) data[sym] = d
  }

  // Rank by 30D change (1 = best)
  const ranked = Object.entries(data)
    .sort((a, b) => (b[1].change30d ?? -999) - (a[1].change30d ?? -999))
  ranked.forEach(([sym], i) => { data[sym].rank = i + 1 })

  return Response.json({ ok: true, data })
}
