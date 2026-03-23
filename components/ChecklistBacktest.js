'use client'
import { useEffect, useRef, useState } from 'react'

// ── TPI transitions (pre-webhook era hardcoded + live from Redis) ─────────────
const TPI_TRANSITIONS_HISTORICAL = [
  {"date":"2024-12-07","state":"LONG"},  {"date":"2024-12-21","state":"SHORT"},
  {"date":"2025-01-16","state":"LONG"},  {"date":"2025-02-01","state":"SHORT"},
  {"date":"2025-04-21","state":"LONG"},  {"date":"2025-06-17","state":"SHORT"},
  {"date":"2025-06-29","state":"LONG"},  {"date":"2025-07-01","state":"SHORT"},
  {"date":"2025-07-02","state":"LONG"},  {"date":"2025-08-18","state":"SHORT"},
  {"date":"2025-09-16","state":"LONG"},  {"date":"2025-09-19","state":"SHORT"},
  {"date":"2025-10-01","state":"LONG"},  {"date":"2025-10-10","state":"SHORT"},
  {"date":"2026-01-05","state":"LONG"},  {"date":"2026-01-09","state":"SHORT"},
  {"date":"2026-01-11","state":"LONG"},  {"date":"2026-01-20","state":"SHORT"},
]

function interpolateTpi(transitions, date) {
  if (!transitions?.length) return null
  let state = transitions[0].state
  for (const t of transitions) {
    if (t.date <= date) state = t.state
    else break
  }
  return state
}

// ── Score one day — IDENTICAL thresholds to checklist/route.js buildChecklist()
// priceChangePct = (close - open) / open * 100  (Bybit kline, same-day)
function scoreDay({ frPct, fg, tpiState, oiPrev, oiCurr, priceChangePct, takerBuyRatio, domTrend }) {
  const priceUp    = priceChangePct > 0
  const priceDown  = priceChangePct < 0
  const oiRising   = oiPrev !== null && oiCurr !== null ? oiCurr > oiPrev : null
  const hasDom     = domTrend !== null && domTrend !== undefined

  // Long conditions — exactly matches buildChecklist()
  const lc = [
    frPct         !== null ? (frPct <= 0.005 ? 1 : 0)          : null, // C1 FR ≤ +0.005%
    fg            !== null ? (fg < 30 ? 1 : 0)                 : null, // C2 F&G < 30
    tpiState      !== null ? (tpiState === 'LONG' ? 1 : 0)      : null, // C3 TPI LONG
    oiRising      !== null ? (oiRising && priceUp ? 1 : 0)      : null, // C4 OI↑ + price↑
    hasDom               ? (domTrend === 'rising' ? 1 : 0)      : null, // C5 Dom rising
    takerBuyRatio !== null ? (takerBuyRatio > 52 ? 1 : 0)       : null, // C6 CVD buy > 52%
  ]
  // Short conditions
  const sc = [
    frPct         !== null ? (frPct > 0.05 ? 1 : 0)            : null, // C1 FR > +0.05%
    fg            !== null ? (fg > 70 ? 1 : 0)                 : null, // C2 F&G > 70
    tpiState      !== null ? (tpiState === 'SHORT' ? 1 : 0)     : null, // C3 TPI SHORT
    oiRising      !== null ? (oiRising && priceDown ? 1 : 0)    : null, // C4 OI↑ + price↓
    hasDom               ? (domTrend === 'falling' ? 1 : 0)     : null, // C5 Dom falling
    takerBuyRatio !== null ? (takerBuyRatio < 48 ? 1 : 0)       : null, // C6 CVD buy < 48%
  ]

  return {
    longScore:  lc.filter(v => v === 1).length,
    shortScore: sc.filter(v => v === 1).length,
    available:  lc.filter(v => v !== null).length,
  }
}

// ── Fetch all data client-side ────────────────────────────────────────────────
// Bybit is accessible from browsers (not from Vercel servers).
// We fetch OI and taker from Bybit for 100 days — same sources as the live checklist.
// For dominance (C5): use the stored btc:checklist-daily dominanceTrend field only
// where it exists. If not stored, C5 = null (won't affect the other 5 conditions).
async function fetchBacktestData() {
  const LIMIT = 103  // a few extra for OI delta computation

  const [fgRes, fundingRes, oiRes, takerRes, klRes, signalsRes] = await Promise.all([
    fetch('https://api.alternative.me/fng/?limit=101&format=json'),
    fetch(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=300`),
    fetch(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=${LIMIT}`),
    fetch(`https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1d&limit=${LIMIT}`),
    // Bybit kline: [startTime, open, high, low, close, volume, turnover] newest-first
    fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=D&limit=${LIMIT}`),
    fetch('/api/signals?history=true').catch(() => null),
  ])

  const [fgData, fundingData, oiData, takerData, klData] = await Promise.all([
    fgRes.json(), fundingRes.json(), oiRes.json(), takerRes.json(), klRes.json(),
  ])
  const signalsData = signalsRes ? await signalsRes.json().catch(() => null) : null

  // F&G map: date → value
  const fgMap = {}
  for (const item of fgData.data) {
    fgMap[new Date(parseInt(item.timestamp) * 1000).toISOString().slice(0, 10)] = parseInt(item.value)
  }

  // Funding map: date → FIRST 8h funding rate of that day * 100 → frPct
  const fundingMap = {}
  for (const item of (fundingData.result?.list ?? [])) {
    const date = new Date(parseInt(item.fundingRateTimestamp)).toISOString().slice(0, 10)
    if (!fundingMap[date]) fundingMap[date] = parseFloat(item.fundingRate) * 100
  }

  // OI map: date → openInterest (BTC contracts)
  const oiMap = {}
  for (const item of (oiData.result?.list ?? [])) {
    oiMap[new Date(parseInt(item.timestamp)).toISOString().slice(0, 10)] = parseFloat(item.openInterest)
  }

  // Taker map: date → buyRatio (0–100%)
  const takerMap = {}
  for (const item of (takerData.result?.list ?? [])) {
    takerMap[new Date(parseInt(item.timestamp)).toISOString().slice(0, 10)] = parseFloat(item.buyRatio) * 100
  }

  // Kline map: date → { open, close, changePct }
  // Bybit returns NEWEST first — same-day open→close = daily candle change
  // This avoids the CoinGecko double-entry problem entirely
  const klMap = {}
  for (const k of (klData.result?.list ?? [])) {
    const date  = new Date(parseInt(k[0])).toISOString().slice(0, 10)
    const open  = parseFloat(k[1])
    const close = parseFloat(k[4])
    klMap[date] = { open, close, changePct: ((close - open) / open) * 100, price: close }
  }

  // Merge TPI transitions: historical + live from Redis
  let tpiTransitions = [...TPI_TRANSITIONS_HISTORICAL]
  if (signalsData?.transitions) {
    const live = Array.isArray(signalsData.transitions)
      ? signalsData.transitions : Object.values(signalsData.transitions)
    const merged = Object.fromEntries(tpiTransitions.map(t => [t.date, t]))
    for (const t of live) { if (t.date && t.state) merged[t.date] = { date: t.date, state: t.state } }
    tpiTransitions = Object.values(merged).sort((a, b) => a.date.localeCompare(b.date))
  }

  // Dominance trend from stored checklist daily (server-computed, only where available)
  const domMap = {}
  const cdArray = Array.isArray(signalsData?.checklistDaily)
    ? signalsData.checklistDaily
    : Object.values(signalsData?.checklistDaily ?? {})
  for (const e of cdArray) {
    if (e.date && e.dominanceTrend) domMap[e.date] = e.dominanceTrend
  }

  return { fgMap, fundingMap, oiMap, takerMap, klMap, tpiTransitions, domMap }
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const LBL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

// ── Chart ─────────────────────────────────────────────────────────────────────
function drawChart(canvas, days, hoveredIdx) {
  if (!canvas || !days.length) return
  const dpr = window.devicePixelRatio || 1
  const W = canvas.offsetWidth, H = canvas.offsetHeight
  canvas.width = W * dpr; canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const PAD = { top: 16, right: 52, bottom: 32, left: 12 }
  const cW  = W - PAD.left - PAD.right
  const cH  = H - PAD.top - PAD.bottom
  const priceH = Math.floor(cH * 0.55)
  const histH  = cH - priceH - 10
  const histY0 = PAD.top + priceH + 10
  const zeroY  = histY0 + histH / 2

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#f9fafb'; ctx.fillRect(PAD.left, PAD.top, cW, priceH)
  ctx.fillStyle = '#f9fafb'; ctx.fillRect(PAD.left, histY0, cW, histH)

  const n = days.length, step = cW / n, barW = Math.max(2, step - 1)
  const validPrices = days.map(d => d.price).filter(Boolean)
  const minP = Math.min(...validPrices) * 0.994
  const maxP = Math.max(...validPrices) * 1.006
  const pY = p => PAD.top + priceH - ((p - minP) / (maxP - minP)) * priceH

  // TPI shading
  let tpiStart = null, tpiState = null
  const shadeTpi = (endX, state) => {
    if (tpiStart === null) return
    ctx.fillStyle = state === 'LONG' ? 'rgba(16,185,129,.07)' : 'rgba(239,68,68,.07)'
    ctx.fillRect(tpiStart, PAD.top, endX - tpiStart, priceH + histH + 10)
  }
  days.forEach((d, i) => {
    const x = PAD.left + i * step
    if (d.tpiState !== tpiState) { shadeTpi(x, tpiState); tpiStart = x; tpiState = d.tpiState }
    if (i === n - 1) shadeTpi(x + step, tpiState)
  })

  // Price grid
  ctx.font = '9px -apple-system,sans-serif'
  for (let i = 0; i <= 4; i++) {
    const val = minP + ((maxP - minP) / 4) * i
    const y   = pY(val)
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke()
    ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'left'
    ctx.fillText(`$${Math.round(val / 1000)}k`, W - PAD.right + 4, y + 3)
  }

  // Price line
  ctx.beginPath(); ctx.strokeStyle = '#f7931a'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
  let started = false
  days.forEach((d, i) => {
    if (!d.price) return
    const x = PAD.left + i * step + step / 2, y = pY(d.price)
    if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
  })
  ctx.stroke()

  // Histogram zero line
  ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD.left, zeroY); ctx.lineTo(PAD.left + cW, zeroY); ctx.stroke()

  // Score axis labels
  ctx.fillStyle = '#9ca3af'; ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'left'
  ctx.fillText('+6', W - PAD.right + 4, histY0 + 8)
  ctx.fillText(' 0', W - PAD.right + 4, zeroY + 3)
  ctx.fillText('−6', W - PAD.right + 4, histY0 + histH - 2)

  const bScale = (histH / 2) / 6
  days.forEach((d, i) => {
    const x = PAD.left + i * step
    ctx.globalAlpha = i === hoveredIdx ? 1 : 0.8
    if (d.longScore  > 0) { ctx.fillStyle = '#10b981'; ctx.fillRect(x + 0.5, zeroY - d.longScore * bScale, barW, d.longScore * bScale) }
    if (d.shortScore > 0) { ctx.fillStyle = '#ef4444'; ctx.fillRect(x + 0.5, zeroY, barW, d.shortScore * bScale) }
    if (!d.longScore && !d.shortScore) { ctx.fillStyle = '#e5e7eb'; ctx.fillRect(x + 0.5, zeroY - 1, barW, 2) }
    ctx.globalAlpha = 1
  })

  // X labels
  ctx.fillStyle = '#9ca3af'; ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'center'
  const every = Math.ceil(n / 10)
  days.forEach((d, i) => {
    if (i % every === 0 || i === n - 1)
      ctx.fillText(d.date.slice(5), PAD.left + i * step + step / 2, H - PAD.bottom + 13)
  })

  // Hover crosshair
  if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < n) {
    const x = PAD.left + hoveredIdx * step + step / 2
    ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke()
    ctx.setLineDash([])
    if (days[hoveredIdx].price) {
      ctx.beginPath(); ctx.arc(x, pY(days[hoveredIdx].price), 3.5, 0, Math.PI * 2)
      ctx.fillStyle = '#f7931a'; ctx.fill()
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ChecklistBacktest() {
  const canvasRef = useRef(null)
  const [days,    setDays]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [hovered, setHovered] = useState(null)
  const [stats,   setStats]   = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const { fgMap, fundingMap, oiMap, takerMap, klMap, tpiTransitions, domMap } =
          await fetchBacktestData()

        // Build date list from kline (Bybit, always one entry per day, newest first)
        // Sort oldest→newest, take last 100
        const kldates = Object.keys(klMap).sort()
        const dates   = kldates.slice(-100)

        const computed = []
        for (let i = 0; i < dates.length; i++) {
          const date     = dates[i]
          const prevDate = i > 0 ? dates[i - 1] : null
          const kl       = klMap[date]

          // Price change: Bybit kline open→close for THIS day
          // This matches the live checklist's price24hPcnt (current day candle)
          const priceChangePct = kl?.changePct ?? null

          // FR: first funding rate of the day in %
          const frPct = fundingMap[date] ?? null

          // F&G
          const fg = fgMap[date] ?? null

          // TPI
          const tpiState = interpolateTpi(tpiTransitions, date)

          // OI: today vs previous day
          const oiCurr = oiMap[date]    ?? null
          const oiPrev = prevDate ? (oiMap[prevDate] ?? null) : null

          // Taker CVD
          const takerBuyRatio = takerMap[date] ?? null

          // Dominance: from stored server-side data (where available)
          const domTrend = domMap[date] ?? null

          const { longScore, shortScore, available } = scoreDay({
            frPct, fg, tpiState, oiPrev, oiCurr, priceChangePct, takerBuyRatio, domTrend,
          })

          computed.push({
            date,
            price:         Math.round(kl?.close ?? 0),
            priceChangePct: priceChangePct !== null ? parseFloat(priceChangePct.toFixed(2)) : null,
            longScore, shortScore, available,
            fg, frPct, tpiState, takerBuyRatio, domTrend,
          })
        }

        setDays(computed)

        // Win-rate: signal ≥4/6, did price go right direction next day?
        const longSig  = computed.filter(d => d.longScore  >= 4)
        const shortSig = computed.filter(d => d.shortScore >= 4)
        const longWins = longSig.filter(d => {
          const ni = computed.indexOf(d) + 1
          return ni < computed.length && (computed[ni].priceChangePct ?? 0) > 0
        })
        const shortWins = shortSig.filter(d => {
          const ni = computed.indexOf(d) + 1
          return ni < computed.length && (computed[ni].priceChangePct ?? 0) < 0
        })

        setStats({
          total: computed.length,
          longSignals:  longSig.length,
          shortSignals: shortSig.length,
          longWinRate:  longSig.length  ? Math.round(longWins.length  / longSig.length  * 100) : null,
          shortWinRate: shortSig.length ? Math.round(shortWins.length / shortSig.length * 100) : null,
        })
        setError(null)
      } catch(e) { setError(e.message) }
      finally { setLoading(false) }
    })()
  }, [])

  useEffect(() => {
    if (!days.length || !canvasRef.current) return
    drawChart(canvasRef.current, days, hovered)
    const onResize = () => drawChart(canvasRef.current, days, hovered)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [days, hovered])

  const today      = days[days.length - 1]
  const hoveredDay = hovered !== null ? days[hovered] : null
  const displayDay = hoveredDay ?? today

  const bias = displayDay
    ? displayDay.longScore > displayDay.shortScore  ? { text: `LONG ${displayDay.longScore}/6`,  color: '#10b981' }
    : displayDay.shortScore > displayDay.longScore  ? { text: `SHORT ${displayDay.shortScore}/6`, color: '#ef4444' }
    : displayDay.longScore === displayDay.shortScore && displayDay.longScore > 0
      ? { text: `NEUTRAL ${displayDay.longScore}/${displayDay.longScore}`, color: '#f59e0b' }
    : { text: 'NEUTRAL', color: '#f59e0b' }
    : null

  const handleMouseMove = e => {
    const canvas = canvasRef.current
    if (!canvas || !days.length) return
    const rect = canvas.getBoundingClientRect()
    const step = (canvas.offsetWidth - 12 - 52) / days.length
    const idx  = Math.floor((e.clientX - rect.left - 12) / step)
    setHovered(idx >= 0 && idx < days.length ? idx : null)
  }

  return (
    <div>
      {/* Subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>
          All 6 conditions computed from live Bybit data — matches the Decision Checklist exactly
        </div>
        {today && (
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
            background: today.longScore > today.shortScore ? 'rgba(16,185,129,.1)'
              : today.shortScore > today.longScore ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)',
            color: today.longScore > today.shortScore ? '#059669'
              : today.shortScore > today.longScore ? '#dc2626' : '#f59e0b',
            border: `1px solid ${today.longScore > today.shortScore ? 'rgba(16,185,129,.3)'
              : today.shortScore > today.longScore ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.3)'}`,
          }}>
            Today: {today.longScore}L / {today.shortScore}S
          </span>
        )}
      </div>

      {/* Win-rate stat cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { label: 'Long signals (≥4/6)',  value: stats.longSignals,                                         color: '#10b981', bg: 'rgba(16,185,129,.08)', border: 'rgba(16,185,129,.2)' },
            { label: 'Long next-day hit%',   value: stats.longWinRate  !== null ? stats.longWinRate  + '%' : '—', color: '#10b981', bg: 'rgba(16,185,129,.08)', border: 'rgba(16,185,129,.2)' },
            { label: 'Short signals (≥4/6)', value: stats.shortSignals,                                        color: '#ef4444', bg: 'rgba(239,68,68,.08)',  border: 'rgba(239,68,68,.2)'  },
            { label: 'Short next-day hit%',  value: stats.shortWinRate !== null ? stats.shortWinRate + '%' : '—', color: '#ef4444', bg: 'rgba(239,68,68,.08)',  border: 'rgba(239,68,68,.2)'  },
          ].map(s => (
            <div key={s.label} style={{ padding: '10px 14px', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}` }}>
              <div style={{ ...LBL, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div style={{ ...LBL, color: '#d1d5db', padding: '3rem 0', textAlign: 'center' }}>Loading 100 days…</div>}
      {error   && <div style={{ fontSize: 12, color: '#dc2626' }}>Error: {error}</div>}

      {!loading && !error && days.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)' }}>

          {/* Info bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid #f3f4f6', minHeight: 42, flexWrap: 'wrap' }}>
            {displayDay ? (
              <>
                <span style={{ ...LBL, textTransform: 'none' }}>
                  {displayDay.date}{!hoveredDay ? ' · today' : ''}
                </span>
                {displayDay.price > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f7931a' }}>
                    ${displayDay.price.toLocaleString()}
                  </span>
                )}
                {displayDay.priceChangePct !== null && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: displayDay.priceChangePct >= 0 ? '#10b981' : '#ef4444' }}>
                    {displayDay.priceChangePct >= 0 ? '+' : ''}{displayDay.priceChangePct}%
                  </span>
                )}
                {displayDay.fg !== null && <span style={{ fontSize: 11, color: '#6b7280' }}>F&G {displayDay.fg}</span>}
                {displayDay.frPct !== null && (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    FR {displayDay.frPct >= 0 ? '+' : ''}{displayDay.frPct.toFixed(4)}%
                  </span>
                )}
                {displayDay.tpiState && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: displayDay.tpiState === 'LONG' ? '#10b981' : '#ef4444' }}>
                    TPI {displayDay.tpiState}
                  </span>
                )}
                {displayDay.takerBuyRatio !== null && (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>CVD {displayDay.takerBuyRatio.toFixed(1)}%</span>
                )}
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{displayDay.available}/6 data points</span>
                {bias && (
                  <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: bias.color }}>
                    {bias.text}
                  </span>
                )}
              </>
            ) : (
              <span style={{ ...LBL, color: '#d1d5db' }}>Hover to inspect any day</span>
            )}
          </div>

          {/* Chart */}
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: 320, display: 'block', cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHovered(null)}
          />

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
            {[
              { color: '#f7931a',             label: 'BTC price (Bybit close)' },
              { color: '#10b981',             label: 'Long score (above 0)' },
              { color: '#ef4444',             label: 'Short score (below 0)' },
              { color: 'rgba(16,185,129,.2)', label: 'TPI LONG zone' },
              { color: 'rgba(239,68,68,.2)',  label: 'TPI SHORT zone' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: 'inline-block' }} />
                <span style={{ fontSize: 10, color: '#9ca3af' }}>{l.label}</span>
              </div>
            ))}
            <span style={{ fontSize: 10, color: '#d1d5db', marginLeft: 'auto' }}>
              Sources: Bybit (FR·OI·CVD·price) · Alternative.me (F&G) · TradingView (TPI)
            </span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
        <span style={{ fontWeight: 600, color: '#6b7280' }}>Dominance (C5)</span> uses server-stored values where available; shows null for earlier dates.
        {' '}<span style={{ fontWeight: 600, color: '#6b7280' }}>Win rate</span>: next-day price direction when signal ≥ 4/6 conditions.
        {' '}<span style={{ fontWeight: 600, color: '#6b7280' }}>Today's score</span> is computed in real-time and will match the Decision Checklist above.
      </div>
    </div>
  )
}
