export const revalidate = 0

async function getBtcData() {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
    { next: { revalidate: 0 } }
  )
  const d = await res.json()
  return { price: d.bitcoin.usd, change24h: d.bitcoin.usd_24h_change }
}

async function getFundingRateAndOI() {
  // Single call to Bybit ticker — has fundingRate, markPrice, openInterestValue
  const res = await fetch(
    'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
    { next: { revalidate: 0 } }
  )
  const json = await res.json()
  const t = json.result?.list?.[0]
  return {
    fundingRate:       parseFloat(t?.fundingRate      ?? 0),
    openInterestValue: parseFloat(t?.openInterestValue ?? 0),  // USD value directly
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

async function getLongShort() {
  // Binance global long/short account ratio — more granular than Bybit's rounded values
  const res = await fetch(
    'https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1',
    { next: { revalidate: 0 } }
  )
  const d = await res.json()
  const latest = Array.isArray(d) ? d[0] : null
  if (!latest) throw new Error('No L/S data')
  return {
    longRatio:  parseFloat(latest.longAccount)  * 100,
    shortRatio: parseFloat(latest.shortAccount) * 100,
  }
}

async function getOiHistory() {
  // Bybit 5min OI — get last 6 intervals to detect rising/falling trend
  try {
    const res = await fetch(
      'https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=5min&limit=6',
      { next: { revalidate: 0 } }
    )
    const json = await res.json()
    if (json.retCode !== 0) throw new Error(json.retMsg)
    const list = json.result?.list
    if (!list || list.length < 2) return null
    // list[0] = most recent, reverse for chronological
    const sorted = [...list].reverse()
    const oldest = parseFloat(sorted[0].openInterest)
    const newest = parseFloat(sorted[sorted.length - 1].openInterest)
    return { oldest, newest, rising: newest > oldest, changePct: ((newest - oldest) / oldest) * 100 }
  } catch { return null }
}

async function getBtcSignal() {
  // Read BTC strategy signal from Redis via our own signals API
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://dash-3n2o.vercel.app'}/api/signals?history=false`,
      { next: { revalidate: 0 } }
    )
    const d = await res.json()
    return d?.btc?.state ?? null  // 'LONG', 'SHORT', 'NEUTRAL'
  } catch { return null }
}

export async function GET() {
  try {
    const settled = await Promise.allSettled([
      getBtcData(),
      getFundingRateAndOI(),
      getFearGreed(),
      getLongShort(),
      getOiHistory(),
      getBtcSignal(),
    ])

    const [btcR, frOiR, fgR, lsR, oiHR, sigR] = settled

    const btc         = btcR.status   === 'fulfilled' ? btcR.value   : { price: 0, change24h: 0 }
    const frOi        = frOiR.status  === 'fulfilled' ? frOiR.value  : { fundingRate: 0, openInterestValue: 0 }
    const fearGreed   = fgR.status    === 'fulfilled' ? fgR.value    : 50
    const longShort   = lsR.status    === 'fulfilled' ? lsR.value    : null  // null = data unavailable
    const oiHistory   = oiHR.status   === 'fulfilled' ? oiHR.value   : null
    const btcSignal   = sigR.status   === 'fulfilled' ? sigR.value   : null

    const frPct    = frOi.fundingRate * 100
    const oiUsd    = frOi.openInterestValue
    const lsAvail  = longShort !== null

    // ─── LONG CONDITIONS ─────────────────────────────────────────────────────
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
        pass: oiHistory ? (oiHistory.rising && btc.change24h > 0) : null,
        value: oiUsd > 0 ? `OI: $${(oiUsd / 1e9).toFixed(2)}B` : '—',
        detail: !oiHistory ? 'OI data unavailable'
          : oiHistory.rising && btc.change24h > 0
          ? `New money entering long — OI ${oiHistory.changePct > 0 ? '+' : ''}${oiHistory.changePct?.toFixed(2)}% (5min)`
          : oiHistory.rising
          ? 'OI rising but price not confirming — possible shorts adding'
          : `OI declining — money leaving the market (${oiHistory.changePct?.toFixed(2)}%)`,
      },
    ]

    // ─── SHORT CONDITIONS ─────────────────────────────────────────────────────
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
        pass: oiHistory ? (oiHistory.rising && btc.change24h < 0) : null,
        value: oiUsd > 0 ? `OI: $${(oiUsd / 1e9).toFixed(2)}B` : '—',
        detail: !oiHistory ? 'OI data unavailable'
          : oiHistory.rising && btc.change24h < 0
          ? `Real selling pressure — OI ${oiHistory.changePct?.toFixed(2)}% (5min)`
          : 'No OI confirmation for bearish move',
      },
    ]

    const longScore  = longConditions.filter(c => c.pass === true).length
    const shortScore = shortConditions.filter(c => c.pass === true).length
    const total      = longConditions.length

    const bias = longScore > shortScore ? 'LONG'
      : shortScore > longScore ? 'SHORT'
      : 'NEUTRAL'

    // ─── LEVERAGE VERDICT ─────────────────────────────────────────────────────
    // Cross-reference checklist with BTC strategy signal
    let leverageVerdict = null
    if (btcSignal) {
      const longRatio  = longScore  / total
      const shortRatio = shortScore / total

      if (btcSignal === 'LONG') {
        if (longRatio >= 0.83)      leverageVerdict = { action: 'LEVERAGE_OK',  label: '2x Long permissible',          color: '#22c55e', detail: `Strategy LONG + checklist ${longScore}/${total} — strong confluence` }
        else if (longRatio >= 0.5)  leverageVerdict = { action: 'SPOT_ONLY',    label: 'Spot only — no leverage',       color: '#eab308', detail: `Strategy LONG but checklist only ${longScore}/${total} — insufficient confluence for leverage` }
        else                        leverageVerdict = { action: 'REDUCE',        label: 'Reduce position / stay flat',   color: '#ef4444', detail: `Strategy LONG but checklist ${longScore}/${total} — conditions deteriorating` }
      } else if (btcSignal === 'SHORT') {
        if (shortRatio >= 0.83)     leverageVerdict = { action: 'SHORT_OK',     label: 'Short with leverage permissible', color: '#ef4444', detail: `Strategy SHORT + checklist ${shortScore}/${total} — strong confluence` }
        else if (shortRatio >= 0.5) leverageVerdict = { action: 'LIGHT_SHORT',  label: 'Light short only',              color: '#eab308', detail: `Strategy SHORT but checklist only ${shortScore}/${total} — reduce size` }
        else                        leverageVerdict = { action: 'HOLD_SHORT',    label: 'Hold position — no new entries', color: '#6b7280', detail: `Strategy SHORT but checklist ${shortScore}/${total} — wait for confluence` }
      }

      // Conflict detection: strategy says one thing, checklist says opposite
      const conflict = (btcSignal === 'LONG' && shortScore > longScore)
        || (btcSignal === 'SHORT' && longScore > shortScore)
      if (conflict) {
        leverageVerdict = { action: 'CONFLICT', label: 'Signal conflict — stay flat', color: '#f97316', detail: `Strategy is ${btcSignal} but checklist favours ${longScore > shortScore ? 'LONG' : 'SHORT'} — no new entries until resolved` }
      }
    }

    return Response.json({
      ok: true,
      bias,
      longScore,
      shortScore,
      total,
      longConditions,
      shortConditions,
      leverageVerdict,
      btcSignal,
      meta: {
        btcPrice:    btc.price,
        btcChange24h: btc.change24h,
        fearGreed,
        frPct,
        oiUsd,
        lsSource:    lsAvail ? 'binance' : 'unavailable',
        longRatio:   longShort?.longRatio  ?? null,
        shortRatio:  longShort?.shortRatio ?? null,
      },
    })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
