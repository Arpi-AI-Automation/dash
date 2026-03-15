export const revalidate = 0

// All Binance fapi calls replaced with Bybit V5 (no Vercel IP block)

async function getBtcData() {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
    { next: { revalidate: 0 } }
  )
  const d = await res.json()
  return { price: d.bitcoin.usd, change24h: d.bitcoin.usd_24h_change }
}

async function getFundingRate() {
  // Bybit: lastFundingRate is in the tickers endpoint
  const res = await fetch(
    'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
    { next: { revalidate: 0 } }
  )
  const json = await res.json()
  const t = json.result?.list?.[0]
  return parseFloat(t.fundingRate)
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
  // Bybit: account-ratio — buyRatio = longs, sellRatio = shorts
  const res = await fetch(
    'https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1h&limit=1',
    { next: { revalidate: 0 } }
  )
  const json = await res.json()
  const latest = json.result?.list?.[0]
  return {
    longRatio:  parseFloat(latest.buyRatio)  * 100,
    shortRatio: parseFloat(latest.sellRatio) * 100,
  }
}

async function getOpenInterest() {
  try {
    const [oiRes, tickerRes] = await Promise.all([
      fetch('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=5min&limit=1',
        { next: { revalidate: 0 } }),
      fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
        { next: { revalidate: 0 } }),
    ])
    if (!oiRes.ok) throw new Error(`OI ${oiRes.status}`)
    const oiJson     = await oiRes.json()
    const tickerJson = await tickerRes.json()
    if (oiJson.retCode !== 0) throw new Error(oiJson.retMsg)
    const oiBtc  = parseFloat(oiJson.result?.list?.[0]?.openInterest ?? 0)
    const markPx = parseFloat(tickerJson.result?.list?.[0]?.markPrice ?? 0)
    return oiBtc * markPx
  } catch { return 0 }
}

async function getOiHistory() {
  try {
    const res = await fetch(
      'https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=5min&limit=6',
      { next: { revalidate: 0 } }
    )
    if (!res.ok) throw new Error(`OI history ${res.status}`)
    const json = await res.json()
    if (json.retCode !== 0) throw new Error(json.retMsg)
    const list = json.result?.list
    if (!list || list.length < 2) return null
    const sorted = [...list].reverse()
    const oldest = parseFloat(sorted[0].openInterestValue)
    const newest = parseFloat(sorted[sorted.length - 1].openInterestValue)
    return { oldest, newest, rising: newest > oldest }
  } catch { return null }
}

export async function GET() {
  try {
    const settled = await Promise.allSettled([
      getBtcData(),
      getFundingRate(),
      getFearGreed(),
      getLongShort(),
      getOpenInterest(),
      getOiHistory(),
    ])
    const [btcR, frR, fgR, lsR, oiR, oiHR] = settled
    const btc         = btcR.status === 'fulfilled'  ? btcR.value  : { price: 0, change24h: 0 }
    const fundingRate = frR.status === 'fulfilled'   ? frR.value   : 0
    const fearGreed   = fgR.status === 'fulfilled'   ? fgR.value   : 50
    const longShort   = lsR.status === 'fulfilled'   ? lsR.value   : { longRatio: 50, shortRatio: 50 }
    const oiUsd       = oiR.status === 'fulfilled'   ? oiR.value   : 0
    const oiHistory   = oiHR.status === 'fulfilled'  ? oiHR.value  : null

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
