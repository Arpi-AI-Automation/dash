export const revalidate = 0

async function getBtcData() {
  // CoinGecko: BTC price + 24h change
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
    { next: { revalidate: 0 } }
  )
  const d = await res.json()
  return { price: d.bitcoin.usd, change24h: d.bitcoin.usd_24h_change }
}

async function getFundingRate() {
  // Binance: BTC funding rate
  const res = await fetch(
    'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT',
    { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 0 } }
  )
  const d = await res.json()
  return parseFloat(d.lastFundingRate)
}

async function getFearGreed() {
  const res = await fetch(
    'https://api.alternative.me/fng/?limit=1&format=json',
    { next: { revalidate: 0 } }
  )
  const d = await res.json()
  return parseInt(d.data[0].value)
}

async function getLongShort() {
  const res = await fetch(
    'https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1',
    { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 0 } }
  )
  const d = await res.json()
  return {
    longRatio:  parseFloat(d[0].longAccount) * 100,
    shortRatio: parseFloat(d[0].shortAccount) * 100,
  }
}

async function getOpenInterest() {
  // Current OI in BTC units
  const [oiRes, priceRes] = await Promise.all([
    fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 0 } }),
    fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 0 } }),
  ])
  const oi    = await oiRes.json()
  const price = await priceRes.json()
  const oiBtc = parseFloat(oi.openInterest)
  const markPx = parseFloat(price.markPrice)
  return oiBtc * markPx // USD notional
}

async function getOiHistory() {
  // OI history to detect direction (rising vs falling)
  // Use 2 data points: now and 4h ago
  const res = await fetch(
    'https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=5',
    { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 0 } }
  )
  const d = await res.json()
  if (!d?.length || d.length < 2) return null
  // d[0] is oldest, d[last] is newest
  const oldest = parseFloat(d[0].sumOpenInterestValue)
  const newest = parseFloat(d[d.length - 1].sumOpenInterestValue)
  return { oldest, newest, rising: newest > oldest }
}

export async function GET() {
  try {
    const [btc, fundingRate, fearGreed, longShort, oiUsd, oiHistory] = await Promise.all([
      getBtcData(),
      getFundingRate(),
      getFearGreed(),
      getLongShort(),
      getOpenInterest(),
      getOiHistory(),
    ])

    const frPct = fundingRate * 100

    // ─── LONG CONDITIONS ────────────────────────────────────────────────────
    const longConditions = [
      {
        id: 'fr_neutral',
        label: 'Funding Rate neutral or negative (≤ +0.02%)',
        pass: frPct <= 0.02,
        value: `${frPct >= 0 ? '+' : ''}${frPct.toFixed(4)}%`,
        detail: frPct <= 0.02
          ? 'Longs not overpaying — market not overextended to upside'
          : 'Longs overpaying — overextended market, flush risk',
      },
      {
        id: 'fg_not_greedy',
        label: 'Fear & Greed not in euphoria (< 75)',
        pass: fearGreed < 75,
        value: `${fearGreed}/100`,
        detail: fearGreed < 75
          ? 'Sentiment not overextended — room to run higher'
          : 'Extreme greed — contrarian bearish signal',
      },
      {
        id: 'ls_not_extreme_long',
        label: 'Top traders NOT massively long (< 60%)',
        pass: longShort.longRatio < 60,
        value: `L:${longShort.longRatio.toFixed(0)}% S:${longShort.shortRatio.toFixed(0)}%`,
        detail: longShort.longRatio < 60
          ? 'No long excess — market not vulnerable to long flush'
          : 'Excess longs — vulnerable to cascading liquidations',
      },
      {
        id: 'btc_positive_24h',
        label: 'BTC positive in 24h',
        pass: btc.change24h > 0,
        value: `${btc.change24h >= 0 ? '+' : ''}${btc.change24h?.toFixed(2)}% 24h`,
        detail: btc.change24h > 0
          ? 'Bullish momentum — price in favorable trend'
          : 'Bearish 24h momentum — price in downtrend',
      },
      {
        id: 'short_liquidity_above',
        label: 'More SHORT liquidity above price',
        pass: longShort.shortRatio > 44,
        value: `Shorts ${longShort.shortRatio.toFixed(0)}%`,
        detail: longShort.shortRatio > 44
          ? 'Shorts dominant — market incentive to push up and sweep shorts'
          : 'Longs dominant — less upside sweep incentive',
      },
      {
        id: 'oi_rising',
        label: 'OI rising with price rising',
        pass: oiHistory ? (oiHistory.rising && btc.change24h > 0) : null,
        value: oiUsd ? `OI: $${(oiUsd / 1e9).toFixed(2)}B` : '—',
        detail: oiHistory?.rising && btc.change24h > 0
          ? 'New money entering in bullish direction'
          : oiHistory?.rising
          ? 'OI rising but price not confirming'
          : 'OI declining — money leaving the market',
      },
    ]

    // ─── SHORT CONDITIONS ────────────────────────────────────────────────────
    const shortConditions = [
      {
        id: 'fr_high',
        label: 'Funding Rate very positive (> +0.05%)',
        pass: frPct > 0.05,
        value: `${frPct >= 0 ? '+' : ''}${frPct.toFixed(4)}%`,
        detail: frPct > 0.05
          ? 'Longs overpaying — overextended market, flush risk'
          : 'Funding not overheated — shorts not favoured by funding',
      },
      {
        id: 'fg_euphoria',
        label: 'Fear & Greed in euphoria (> 75)',
        pass: fearGreed > 75,
        value: `${fearGreed}/100`,
        detail: fearGreed > 75
          ? 'Extreme greed — contrarian bearish signal'
          : 'Sentiment not extreme — no contrarian short setup',
      },
      {
        id: 'ls_extreme_long',
        label: 'Top traders massively long (> 65%)',
        pass: longShort.longRatio > 65,
        value: `L:${longShort.longRatio.toFixed(0)}% S:${longShort.shortRatio.toFixed(0)}%`,
        detail: longShort.longRatio > 65
          ? 'Excess longs — vulnerable to cascading liquidations'
          : 'No long excess — long flush less likely',
      },
      {
        id: 'btc_negative_24h',
        label: 'BTC negative in 24h',
        pass: btc.change24h < 0,
        value: `${btc.change24h >= 0 ? '+' : ''}${btc.change24h?.toFixed(2)}% 24h`,
        detail: btc.change24h < 0
          ? 'Bearish momentum — price in favorable trend for short'
          : 'Positive 24h — momentum against short bias',
      },
      {
        id: 'long_liquidity_below',
        label: 'More LONG liquidity below price',
        pass: longShort.longRatio > 56,
        value: `Longs ${longShort.longRatio.toFixed(0)}%`,
        detail: longShort.longRatio > 56
          ? 'Longs dominant — incentive to push down and liquidate longs'
          : 'Shorts dominant — less downside sweep incentive',
      },
      {
        id: 'volume_price_down',
        label: 'High OI with price falling',
        pass: oiHistory ? (oiHistory.rising && btc.change24h < 0) : null,
        value: oiUsd ? `OI: $${(oiUsd / 1e9).toFixed(2)}B` : '—',
        detail: oiHistory?.rising && btc.change24h < 0
          ? 'Real selling pressure with institutional participation'
          : 'No confirmation from OI for bearish move',
      },
    ]

    const longScore  = longConditions.filter(c => c.pass === true).length
    const shortScore = shortConditions.filter(c => c.pass === true).length
    const total      = longConditions.length

    const bias = longScore > shortScore ? 'LONG' : shortScore > longScore ? 'SHORT' : 'NEUTRAL'

    return Response.json({
      ok: true,
      bias,
      longScore,
      shortScore,
      total,
      longConditions,
      shortConditions,
      meta: { btcPrice: btc.price, btcChange24h: btc.change24h, fearGreed, frPct, oiUsd },
    })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
