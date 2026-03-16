export const revalidate = 0

// Fetches that work server-side on Vercel:
// ✅ CoinGecko (BTC price/24h)
// ✅ Bybit tickers (funding rate + OI value) 
// ✅ Alternative.me (fear & greed)
// ✅ Redis via signals API (BTC signal)
//
// Fetches that are Vercel-blocked — handled client-side in DecisionChecklist.js:
// ❌ Bybit account-ratio (L/S) — returns client-enriched data
// ❌ Bybit OI history        — returns client-enriched data

async function getBtcData() {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
    { next: { revalidate: 0 } }
  )
  const d = await res.json()
  return { price: d.bitcoin.usd, change24h: d.bitcoin.usd_24h_change }
}

async function getFundingRateAndOI() {
  const res = await fetch(
    'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
    { next: { revalidate: 0 } }
  )
  const json = await res.json()
  const t = json.result?.list?.[0]
  return {
    fundingRate:       parseFloat(t?.fundingRate      ?? 0),
    openInterestValue: parseFloat(t?.openInterestValue ?? 0),
    markPrice:         parseFloat(t?.markPrice         ?? 0),
  }
}

async function getFearGreed() {
  const res = await fetch(
    'https://api.alternative.me/fng/?limit=1&format=json',
    { next: { revalidate: 0 } }
  )
  const d = await res.json()
  return parseInt(d.data[0].value)
}

async function getBtcSignal() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://dash-3n2o.vercel.app'}/api/signals?history=false`,
      { next: { revalidate: 0 } }
    )
    const d = await res.json()
    return d?.btc?.state ?? null
  } catch { return null }
}

// Builds the full checklist response given all data
// longShort and oiHistory may be null if client hasn't enriched yet
export function buildChecklist({ btc, frOi, fearGreed, longShort, oiHistory, btcSignal }) {
  const frPct   = frOi.fundingRate * 100
  const oiUsd   = frOi.openInterestValue
  const lsAvail = longShort !== null
  const oiAvail = oiHistory !== null

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
      pass: lsAvail ? longShort.longRatio < 60 : null,
      value: lsAvail ? `L:${longShort.longRatio.toFixed(1)}% S:${longShort.shortRatio.toFixed(1)}%` : '—',
      detail: !lsAvail ? 'L/S data unavailable'
        : longShort.longRatio < 60
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
        : 'Bearish 24h momentum — against long bias',
    },
    {
      id: 'short_liquidity_above',
      label: 'More SHORT liquidity above price (shorts > 44%)',
      pass: lsAvail ? longShort.shortRatio > 44 : null,
      value: lsAvail ? `Shorts ${longShort.shortRatio.toFixed(1)}%` : '—',
      detail: !lsAvail ? 'L/S data unavailable'
        : longShort.shortRatio > 44
        ? 'Shorts dominant — market incentive to push up and sweep shorts'
        : 'Longs dominant — less upside sweep incentive',
    },
    {
      id: 'oi_rising',
      label: 'OI rising with price rising',
      pass: oiAvail ? (oiHistory.rising && btc.change24h > 0) : null,
      value: oiUsd > 0 ? `OI: $${(oiUsd / 1e9).toFixed(2)}B` : '—',
      detail: !oiAvail ? 'OI data unavailable'
        : oiHistory.rising && btc.change24h > 0
        ? `New money entering long — OI ${oiHistory.changePct >= 0 ? '+' : ''}${oiHistory.changePct?.toFixed(2)}% (5min)`
        : oiHistory.rising
        ? 'OI rising but price not confirming'
        : `OI declining — money leaving the market (${oiHistory.changePct?.toFixed(2)}%)`,
    },
  ]

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
      pass: lsAvail ? longShort.longRatio > 65 : null,
      value: lsAvail ? `L:${longShort.longRatio.toFixed(1)}% S:${longShort.shortRatio.toFixed(1)}%` : '—',
      detail: !lsAvail ? 'L/S data unavailable'
        : longShort.longRatio > 65
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
      label: 'More LONG liquidity below price (longs > 56%)',
      pass: lsAvail ? longShort.longRatio > 56 : null,
      value: lsAvail ? `Longs ${longShort.longRatio.toFixed(1)}%` : '—',
      detail: !lsAvail ? 'L/S data unavailable'
        : longShort.longRatio > 56
        ? 'Longs dominant — incentive to push down and liquidate longs'
        : 'Shorts dominant — less downside sweep incentive',
    },
    {
      id: 'oi_rising_price_down',
      label: 'OI rising with price falling',
      pass: oiAvail ? (oiHistory.rising && btc.change24h < 0) : null,
      value: oiUsd > 0 ? `OI: $${(oiUsd / 1e9).toFixed(2)}B` : '—',
      detail: !oiAvail ? 'OI data unavailable'
        : oiHistory.rising && btc.change24h < 0
        ? `Real selling pressure — OI ${oiHistory.changePct?.toFixed(2)}% (5min)`
        : 'No OI confirmation for bearish move',
    },
  ]

  const longScore  = longConditions.filter(c => c.pass === true).length
  const shortScore = shortConditions.filter(c => c.pass === true).length
  const total      = longConditions.length
  const bias       = longScore > shortScore ? 'LONG' : shortScore > longScore ? 'SHORT' : 'NEUTRAL'

  let leverageVerdict = null
  if (btcSignal) {
    const lRatio = longScore  / total
    const sRatio = shortScore / total
    const conflict = (btcSignal === 'LONG' && shortScore > longScore)
      || (btcSignal === 'SHORT' && longScore > shortScore)

    if (conflict) {
      leverageVerdict = { action: 'CONFLICT', label: 'Signal conflict — stay flat', color: '#f97316',
        detail: `Strategy is ${btcSignal} but checklist favours ${longScore > shortScore ? 'LONG' : 'SHORT'} — no new entries until resolved` }
    } else if (btcSignal === 'LONG') {
      if (lRatio >= 0.83)      leverageVerdict = { action: 'LEVERAGE_OK', label: '2x Long permissible',        color: '#22c55e', detail: `Strategy LONG + checklist ${longScore}/${total} — strong confluence` }
      else if (lRatio >= 0.5)  leverageVerdict = { action: 'SPOT_ONLY',   label: 'Spot only — no leverage',    color: '#eab308', detail: `Strategy LONG but checklist only ${longScore}/${total} — insufficient confluence for leverage` }
      else                     leverageVerdict = { action: 'REDUCE',       label: 'Reduce position / stay flat',color: '#ef4444', detail: `Strategy LONG but checklist ${longScore}/${total} — conditions deteriorating` }
    } else if (btcSignal === 'SHORT') {
      if (sRatio >= 0.83)      leverageVerdict = { action: 'SHORT_OK',    label: 'Short with leverage permissible', color: '#ef4444', detail: `Strategy SHORT + checklist ${shortScore}/${total} — strong confluence` }
      else if (sRatio >= 0.5)  leverageVerdict = { action: 'LIGHT_SHORT', label: 'Light short only',                color: '#eab308', detail: `Strategy SHORT but checklist only ${shortScore}/${total} — reduce size` }
      else                     leverageVerdict = { action: 'HOLD_SHORT',   label: 'Hold position — no new entries', color: '#6b7280', detail: `Strategy SHORT but checklist ${shortScore}/${total} — wait for confluence` }
    }
  }

  return {
    ok: true, bias, longScore, shortScore, total,
    longConditions, shortConditions, leverageVerdict, btcSignal,
    meta: {
      btcPrice: btc.price, btcChange24h: btc.change24h,
      fearGreed, frPct, oiUsd,
      lsSource:   lsAvail  ? 'bybit' : 'unavailable',
      longRatio:  longShort?.longRatio  ?? null,
      shortRatio: longShort?.shortRatio ?? null,
    },
  }
}

export async function GET(request) {
  try {
    // Parse client-enriched data if provided via query params
    const { searchParams } = new URL(request.url)
    const clientLongRatio  = searchParams.get('longRatio')
    const clientShortRatio = searchParams.get('shortRatio')
    const clientOiOldest   = searchParams.get('oiOldest')
    const clientOiNewest   = searchParams.get('oiNewest')

    const longShort = (clientLongRatio && clientShortRatio) ? {
      longRatio:  parseFloat(clientLongRatio),
      shortRatio: parseFloat(clientShortRatio),
    } : null

    const oiHistory = (clientOiOldest && clientOiNewest) ? (() => {
      const oldest = parseFloat(clientOiOldest)
      const newest = parseFloat(clientOiNewest)
      const changePct = ((newest - oldest) / oldest) * 100
      return { oldest, newest, rising: newest > oldest, changePct }
    })() : null

    const settled = await Promise.allSettled([
      getBtcData(),
      getFundingRateAndOI(),
      getFearGreed(),
      getBtcSignal(),
    ])

    const [btcR, frOiR, fgR, sigR] = settled
    const btc       = btcR.status  === 'fulfilled' ? btcR.value  : { price: 0, change24h: 0 }
    const frOi      = frOiR.status === 'fulfilled' ? frOiR.value : { fundingRate: 0, openInterestValue: 0 }
    const fearGreed = fgR.status   === 'fulfilled' ? fgR.value   : 50
    const btcSignal = sigR.status  === 'fulfilled' ? sigR.value  : null

    return Response.json(buildChecklist({ btc, frOi, fearGreed, longShort, oiHistory, btcSignal }))
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
