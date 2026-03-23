'use client'
import { useEffect, useRef, useState } from 'react'

// ── Hardcoded historical TPI transitions (pre-webhook) ────────────────────────
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

// ── Fetch all data client-side (Bybit not blocked from browser) ───────────────
async function fetchAllData() {
  const [priceRes, fgRes, fundingRes, oiRes, takerRes, signalsRes] = await Promise.all([
    fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=101&interval=daily'),
    fetch('https://api.alternative.me/fng/?limit=101&format=json'),
    fetch('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200'),
    fetch('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=101'),
    fetch('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1d&limit=101'),
    fetch('/api/signals?history=true').catch(() => null),
  ])

  const [priceData, fgData, fundingData, oiData, takerData] = await Promise.all([
    priceRes.json(), fgRes.json(), fundingRes.json(), oiRes.json(), takerRes.json(),
  ])
  const signalsData = signalsRes ? await signalsRes.json().catch(() => null) : null

  // Price map
  const prices = priceData.prices.map(([ts, price]) => ({
    date: new Date(ts).toISOString().slice(0, 10), price,
  }))

  // F&G map
  const fgMap = {}
  for (const item of fgData.data) {
    fgMap[new Date(parseInt(item.timestamp) * 1000).toISOString().slice(0, 10)] = parseInt(item.value)
  }

  // Funding map: date → first funding rate of day
  const fundingMap = {}
  for (const item of (fundingData.result?.list ?? [])) {
    const date = new Date(parseInt(item.fundingRateTimestamp)).toISOString().slice(0, 10)
    if (!fundingMap[date]) fundingMap[date] = parseFloat(item.fundingRate)
  }

  // OI map: date → openInterest (BTC quantity)
  const oiMap = {}
  for (const item of (oiData.result?.list ?? [])) {
    const date = new Date(parseInt(item.timestamp)).toISOString().slice(0, 10)
    oiMap[date] = parseFloat(item.openInterest)
  }

  // Taker map: date → buyRatio (0–100%)
  const takerMap = {}
  for (const item of (takerData.result?.list ?? [])) {
    const date = new Date(parseInt(item.timestamp)).toISOString().slice(0, 10)
    takerMap[date] = parseFloat(item.buyRatio) * 100
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

  // Stored daily checklist scores from Redis (already has dominance computed server-side)
  const storedScores = {}
  const checklistDaily = signalsData?.checklistDaily ?? []
  const cdArray = Array.isArray(checklistDaily) ? checklistDaily : Object.values(checklistDaily)
  for (const entry of cdArray) {
    if (entry.date) storedScores[entry.date] = entry
  }

  return { prices, fgMap, fundingMap, oiMap, takerMap, tpiTransitions, storedScores }
}

// ── Score a single day using IDENTICAL logic to the live checklist ────────────
function scoreDay({ price, prevPrice, fg, frPct, tpiState, oiPrev, oiCurr, takerBuyRatio, domTrend }) {
  const change24h   = prevPrice ? ((price - prevPrice) / prevPrice) * 100 : 0
  const priceUp     = change24h > 0
  const priceDown   = change24h < 0
  const oiRising    = oiPrev !== null && oiCurr !== null ? oiCurr > oiPrev : null
  const domRising   = domTrend === 'rising'
  const domFalling  = domTrend === 'falling'
  const hasDom      = domTrend !== null && domTrend !== undefined

  // SAME thresholds as checklist/route.js buildChecklist()
  const longScores = [
    frPct          !== null ? (frPct <= 0.005 ? 1 : 0)            : null, // C1
    fg             !== null ? (fg < 30 ? 1 : 0)                   : null, // C2
    tpiState       !== null ? (tpiState === 'LONG' ? 1 : 0)        : null, // C3
    oiRising       !== null ? (oiRising && priceUp ? 1 : 0)        : null, // C4
    hasDom                  ? (domRising ? 1 : 0)                  : null, // C5
    takerBuyRatio  !== null ? (takerBuyRatio > 52 ? 1 : 0)         : null, // C6
  ]
  const shortScores = [
    frPct          !== null ? (frPct > 0.05 ? 1 : 0)              : null,
    fg             !== null ? (fg > 70 ? 1 : 0)                   : null,
    tpiState       !== null ? (tpiState === 'SHORT' ? 1 : 0)       : null,
    oiRising       !== null ? (oiRising && priceDown ? 1 : 0)      : null,
    hasDom                  ? (domFalling ? 1 : 0)                 : null,
    takerBuyRatio  !== null ? (takerBuyRatio < 48 ? 1 : 0)         : null,
  ]

  const longScore  = longScores.filter(v => v === 1).length
  const shortScore = shortScores.filter(v => v === 1).length
  // Count only non-null conditions for "available" scoring
  const available  = longScores.filter(v => v !== null).length

  return {
    price: Math.round(price),
    change24h: parseFloat(change24h.toFixed(2)),
    fg, frPct: frPct !== null ? parseFloat(frPct.toFixed(4)) : null,
    tpiState, oiRising, takerBuyRatio, domTrend,
    longScore, shortScore, total: 6, available,
    net: longScore - shortScore,
    fundingAvail: frPct !== null,
    tpiAvail:     tpiState !== null,
    oiAvail:      oiRising !== null,
    takerAvail:   takerBuyRatio !== null,
    domAvail:     hasDom,
  }
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const LBL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

// ── Chart drawing ─────────────────────────────────────────────────────────────
function drawChart(canvas, days, hoveredIdx) {
  if (!canvas || !days.length) return
  const dpr = window.devicePixelRatio || 1
  const W = canvas.offsetWidth, H = canvas.offsetHeight
  canvas.width = W * dpr; canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const PAD = { top: 16, right: 52, bottom: 32, left: 12 }
  const cW = W - PAD.left - PAD.right
  const cH = H - PAD.top - PAD.bottom
  const priceH = Math.floor(cH * 0.55)
  const histH  = cH - priceH - 10
  const histY0 = PAD.top + priceH + 10
  const zeroY  = histY0 + histH / 2

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#f9fafb'
  ctx.fillRect(PAD.left, PAD.top, cW, priceH)
  ctx.fillStyle = '#f9fafb'
  ctx.fillRect(PAD.left, histY0, cW, histH)

  const n = days.length, step = cW / n, barW = Math.max(2, step - 1)
  const prices = days.map(d => d.price)
  const minP = Math.min(...prices) * 0.994, maxP = Math.max(...prices) * 1.006
  const pY = p => PAD.top + priceH - ((p - minP) / (maxP - minP)) * priceH

  // TPI background shading (light)
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
  ctx.beginPath(); ctx.strokeStyle = '#f7931a'; ctx.lineWidth = 1.5
  days.forEach((d, i) => {
    const x = PAD.left + i * step + step / 2, y = pY(d.price)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
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
    const alpha = i === hoveredIdx ? 1 : 0.8
    ctx.globalAlpha = alpha
    if (d.longScore > 0)  { ctx.fillStyle = '#10b981'; ctx.fillRect(x + 0.5, zeroY - d.longScore * bScale, barW, d.longScore * bScale) }
    if (d.shortScore > 0) { ctx.fillStyle = '#ef4444'; ctx.fillRect(x + 0.5, zeroY, barW, d.shortScore * bScale) }
    if (d.longScore === 0 && d.shortScore === 0) {
      ctx.fillStyle = '#e5e7eb'; ctx.fillRect(x + 0.5, zeroY - 1, barW, 2)
    }
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
    ctx.beginPath(); ctx.arc(x, pY(days[hoveredIdx].price), 3.5, 0, Math.PI * 2)
    ctx.fillStyle = '#f7931a'; ctx.fill()
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ChecklistBacktest() {
  const canvasRef  = useRef(null)
  const [days,     setDays]    = useState([])
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState(null)
  const [hovered,  setHovered] = useState(null)
  const [stats,    setStats]   = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const { prices, fgMap, fundingMap, oiMap, takerMap, tpiTransitions, storedScores } = await fetchAllData()

        const computed = []
        for (let i = 1; i < prices.length; i++) {
          const { date, price } = prices[i]
          const prevPrice = prices[i - 1].price

          const fg   = fgMap[date] ?? null
          const fr   = fundingMap[date] ?? null
          const frPct = fr !== null ? fr * 100 : null
          const tpiState = interpolateTpi(tpiTransitions, date)

          // OI: compare today vs previous day
          const oiCurr = oiMap[date] ?? null
          const oiPrev = oiMap[prices[i - 1].date] ?? null

          const takerBuyRatio = takerMap[date] ?? null

          // Dominance: use stored checklist score if available (has server-computed dominance)
          // Otherwise null
          const stored = storedScores[date]
          const domTrend = stored?.dominanceTrend ?? null

          const scored = scoreDay({ price, prevPrice, fg, frPct, tpiState, oiPrev, oiCurr, takerBuyRatio, domTrend })
          computed.push({ date, ...scored })
        }

        setDays(computed)

        // Compute win-rate stats
        const longSignalDays  = computed.filter(d => d.longScore  >= 4)
        const shortSignalDays = computed.filter(d => d.shortScore >= 4)
        const longWins  = longSignalDays.filter((d, i) => {
          // Did price go up the NEXT day?
          const nextIdx = computed.indexOf(d) + 1
          return nextIdx < computed.length && computed[nextIdx].change24h > 0
        })
        const shortWins = shortSignalDays.filter((d, i) => {
          const nextIdx = computed.indexOf(d) + 1
          return nextIdx < computed.length && computed[nextIdx].change24h < 0
        })

        setStats({
          longSignals:  longSignalDays.length,
          longWinRate:  longSignalDays.length ? Math.round(longWins.length  / longSignalDays.length  * 100) : null,
          shortSignals: shortSignalDays.length,
          shortWinRate: shortSignalDays.length ? Math.round(shortWins.length / shortSignalDays.length * 100) : null,
          daysWithAllData: computed.filter(d => d.available === 6).length,
          total: computed.length,
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

  const hoveredDay = hovered !== null ? days[hovered] : null
  const bias = hoveredDay
    ? hoveredDay.longScore > hoveredDay.shortScore ? { text: `LONG ${hoveredDay.longScore}/6`,  color: '#10b981' }
    : hoveredDay.shortScore > hoveredDay.longScore ? { text: `SHORT ${hoveredDay.shortScore}/6`, color: '#ef4444' }
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>
          Same 6 conditions as live checklist · Funding · F&G · TPI · OI+Price · BTC Dominance · CVD Taker
        </div>
        {stats && (
          <span style={{ fontSize: 10, color: '#9ca3af' }}>
            {stats.daysWithAllData}/{stats.total} days with full 6/6 data
          </span>
        )}
      </div>

      {/* Win rate stat cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { label: 'Long signals (≥4/6)',  value: stats.longSignals,  color: '#10b981', bg: 'rgba(16,185,129,.08)',  border: 'rgba(16,185,129,.2)'  },
            { label: 'Long next-day hit',    value: stats.longWinRate  !== null ? stats.longWinRate  + '%' : '—', color: '#10b981', bg: 'rgba(16,185,129,.08)',  border: 'rgba(16,185,129,.2)'  },
            { label: 'Short signals (≥4/6)', value: stats.shortSignals, color: '#ef4444', bg: 'rgba(239,68,68,.08)',   border: 'rgba(239,68,68,.2)'   },
            { label: 'Short next-day hit',   value: stats.shortWinRate !== null ? stats.shortWinRate + '%' : '—', color: '#ef4444', bg: 'rgba(239,68,68,.08)',   border: 'rgba(239,68,68,.2)'   },
          ].map(s => (
            <div key={s.label} style={{ padding: '10px 14px', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}` }}>
              <div style={{ ...LBL, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div style={{ ...LBL, color: '#d1d5db', padding: '3rem 0', textAlign: 'center' }}>Loading 100 days…</div>}
      {error   && <div style={{ fontSize: 12, color: '#dc2626', padding: '8px 0' }}>Error: {error}</div>}

      {!loading && !error && days.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)' }}>

          {/* Hover info bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px', borderBottom: '1px solid #f3f4f6', minHeight: 40, flexWrap: 'wrap' }}>
            {hoveredDay ? (
              <>
                <span style={{ ...LBL, textTransform: 'none' }}>{hoveredDay.date}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f7931a' }}>${hoveredDay.price.toLocaleString()}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: hoveredDay.change24h >= 0 ? '#10b981' : '#ef4444' }}>
                  {hoveredDay.change24h >= 0 ? '+' : ''}{hoveredDay.change24h}%
                </span>
                {hoveredDay.fg    !== null && <span style={{ fontSize: 11, color: '#6b7280' }}>F&G {hoveredDay.fg}</span>}
                {hoveredDay.frPct !== null && <span style={{ fontSize: 11, color: '#6b7280' }}>FR {hoveredDay.frPct >= 0 ? '+' : ''}{hoveredDay.frPct.toFixed(4)}%</span>}
                {hoveredDay.tpiState && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: hoveredDay.tpiState === 'LONG' ? '#10b981' : '#ef4444' }}>
                    TPI {hoveredDay.tpiState}
                  </span>
                )}
                {hoveredDay.takerBuyRatio !== null && <span style={{ fontSize: 11, color: '#6b7280' }}>CVD {hoveredDay.takerBuyRatio.toFixed(1)}%</span>}
                <span style={{ fontSize: 11, color: '#d1d5db' }}>{hoveredDay.available}/6 signals</span>
                {bias && (
                  <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: bias.color }}>{bias.text}</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
            {[
              { color: '#f7931a', label: 'BTC price' },
              { color: '#10b981', label: 'Long score (above 0)' },
              { color: '#ef4444', label: 'Short score (below 0)' },
              { color: 'rgba(16,185,129,.2)', label: 'TPI LONG zone' },
              { color: 'rgba(239,68,68,.2)',  label: 'TPI SHORT zone' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: 'inline-block', border: '1px solid #e5e7eb', boxSizing: 'border-box' }} />
                <span style={{ fontSize: 10, color: '#9ca3af' }}>{l.label}</span>
              </div>
            ))}
            <span style={{ fontSize: 10, color: '#d1d5db', marginLeft: 'auto' }}>
              Sources: CoinGecko · Alternative.me · Bybit · TradingView webhook
            </span>
          </div>
        </div>
      )}

      {/* Improvement note */}
      <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
        <span style={{ fontWeight: 600, color: '#6b7280' }}>Dominance (C5):</span> uses stored server-computed values where available; earlier dates may show as unavailable.
        {' '}<span style={{ fontWeight: 600, color: '#6b7280' }}>Win rate:</span> next-day price direction when signal strength ≥ 4/6.
      </div>
    </div>
  )
}
