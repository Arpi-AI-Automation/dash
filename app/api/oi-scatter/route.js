export const revalidate = 0

async function getBybitHistory(days = 90) {
  try {
    const limit = days + 5
    const [oiRes, klinesRes, frRes] = await Promise.all([
      fetch(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=${limit}`),
      fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=D&limit=${limit}`),
      fetch(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=${limit * 3}`),
    ])

    const [oiData, klinesData, frData] = await Promise.all([
      oiRes.json(), klinesRes.json(), frRes.json()
    ])

    const oiList     = oiData?.result?.list     ?? []
    const klinesList = klinesData?.result?.list ?? []
    const frList     = frData?.result?.list     ?? []

    if (oiList.length < 2 || klinesList.length < 2) return []

    // Build OI map: date → OI value
    const oiMap = {}
    for (const item of oiList) {
      const date = new Date(parseInt(item.timestamp)).toISOString().slice(0, 10)
      oiMap[date] = parseFloat(item.openInterest)
    }

    // Build price map: date → { open, close }
    const priceMap = {}
    for (const k of klinesList) {
      const date = new Date(parseInt(k[0])).toISOString().slice(0, 10)
      priceMap[date] = { open: parseFloat(k[1]), close: parseFloat(k[4]) }
    }

    // Build funding map: date → avg funding rate for that day
    // Bybit funding history has multiple entries per day (8h intervals)
    const frByDate = {}
    for (const f of frList) {
      const date = new Date(parseInt(f.fundingRateTimestamp)).toISOString().slice(0, 10)
      if (!frByDate[date]) frByDate[date] = []
      frByDate[date].push(parseFloat(f.fundingRate))
    }
    const frMap = {}
    for (const [date, rates] of Object.entries(frByDate)) {
      frMap[date] = rates.reduce((a, b) => a + b, 0) / rates.length
    }

    // Build sorted date list with all three data sources
    const dates = Object.keys(oiMap).filter(d => priceMap[d]).sort()

    const points = []
    for (let i = 1; i < dates.length; i++) {
      const date     = dates[i]
      const prevDate = dates[i - 1]

      const oiNow  = oiMap[date]
      const oiPrev = oiMap[prevDate]
      const price  = priceMap[date]
      if (!oiNow || !oiPrev || !price) continue

      const oiChg    = ((oiNow - oiPrev) / oiPrev) * 100
      const priceChg = ((price.close - price.open) / price.open) * 100

      // Funding: use that day's avg, fallback prev day, fallback null
      const funding = frMap[date] ?? frMap[prevDate] ?? null

      points.push({
        date,
        priceChg: parseFloat(priceChg.toFixed(2)),
        oiChg:    parseFloat(oiChg.toFixed(2)),
        price:    parseFloat(price.close.toFixed(0)),
        funding:  funding !== null ? parseFloat((funding * 100).toFixed(4)) : null, // as %
      })
    }

    return points.slice(-days)
  } catch (e) {
    console.error('[oi-scatter]', e?.message)
    return []
  }
}

export async function GET() {
  const points = await getBybitHistory(90)
  return Response.json({ ok: true, points })
}
