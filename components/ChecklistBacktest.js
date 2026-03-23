'use client'
import { useEffect, useRef, useState } from 'react'

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
  if (!validPrices.length) return
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
    if (d.longScore  > 0) { ctx.fillStyle = '#10b981'; ctx.fillRect(x + 0.5, zeroY - d.longScore  * bScale, barW, d.longScore  * bScale) }
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
    const load = async () => {
      try {
        const signalsData = await fetch('/api/signals?history=true', { cache: 'no-store' }).then(r => r.json())

        // Stored daily scores — written by DecisionChecklist after each live computation
        const cdArray = Array.isArray(signalsData?.checklistDaily)
          ? signalsData.checklistDaily
          : Object.values(signalsData?.checklistDaily ?? {})

        // Sort oldest → newest, take last 100
        const sorted = [...cdArray].sort((a, b) => a.date.localeCompare(b.date)).slice(-100)

        // BTC price for display — from btc:daily in Redis
        const priceMap = {}
        const btcDaily = Array.isArray(signalsData?.history?.btc)
          ? signalsData.history.btc
          : Object.values(signalsData?.history?.btc ?? {})
        for (const e of btcDaily) {
          if (e.date && e.price) priceMap[e.date] = e.price
        }

        const computed = sorted.map(e => ({
          date:          e.date,
          longScore:     e.longScore  ?? 0,
          shortScore:    e.shortScore ?? 0,
          fg:            e.fg         ?? null,
          frPct:         e.frPct      ?? null,
          tpiState:      e.tpiState   ?? null,
          takerBuyRatio: e.takerBuyRatio ?? null,
          priceChangePct: e.priceChangePct ?? null,
          price:         priceMap[e.date] ?? e.price ?? null,
          source:        e.source     ?? 'stored',
        }))

        setDays(computed)

        // Win-rate stats: signal ≥4/6, did price move right direction next day?
        const longSig   = computed.filter(d => d.longScore  >= 4)
        const shortSig  = computed.filter(d => d.shortScore >= 4)
        const longWins  = longSig.filter(d => {
          const ni = computed.indexOf(d) + 1
          return ni < computed.length && (computed[ni].priceChangePct ?? 0) > 0
        })
        const shortWins = shortSig.filter(d => {
          const ni = computed.indexOf(d) + 1
          return ni < computed.length && (computed[ni].priceChangePct ?? 0) < 0
        })

        setStats({
          total:        computed.length,
          longSignals:  longSig.length,
          shortSignals: shortSig.length,
          longWinRate:  longSig.length  ? Math.round(longWins.length  / longSig.length  * 100) : null,
          shortWinRate: shortSig.length ? Math.round(shortWins.length / shortSig.length * 100) : null,
        })
        setError(null)
      } catch(e) { setError(e.message) }
      finally { setLoading(false) }
    }
    load()
    // Refetch every 90s so the backtest picks up new scores written by the checklist
    const iv = setInterval(load, 90_000)
    return () => clearInterval(iv)
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
    : { text: `NEUTRAL ${displayDay.longScore}L / ${displayDay.shortScore}S`, color: '#f59e0b' }
    : null

  const handleMouseMove = e => {
    const canvas = canvasRef.current
    if (!canvas || !days.length) return
    const rect = canvas.getBoundingClientRect()
    const step = (canvas.offsetWidth - 12 - 52) / days.length
    const idx  = Math.floor((e.clientX - rect.left - 12) / step)
    setHovered(idx >= 0 && idx < days.length ? idx : null)
  }

  const todayColor = today
    ? today.longScore > today.shortScore  ? '#059669'
    : today.shortScore > today.longScore  ? '#dc2626'
    : '#f59e0b'
    : '#6b7280'

  const todayBg = today
    ? today.longScore > today.shortScore  ? 'rgba(16,185,129,.1)'
    : today.shortScore > today.longScore  ? 'rgba(239,68,68,.1)'
    : 'rgba(245,158,11,.1)'
    : 'transparent'

  const todayBorder = today
    ? today.longScore > today.shortScore  ? 'rgba(16,185,129,.3)'
    : today.shortScore > today.longScore  ? 'rgba(239,68,68,.3)'
    : 'rgba(245,158,11,.3)'
    : '#e5e7eb'

  return (
    <div>
      {/* Subtitle + today badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>
          Scores written by the live checklist at each page load · Bybit OI, CVD, FR included
        </div>
        {today && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 12px', borderRadius: 20, background: todayBg, color: todayColor, border: `1px solid ${todayBorder}` }}>
            Today: {today.longScore}L / {today.shortScore}S
          </span>
        )}
      </div>

      {/* Win-rate cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { label: 'Long signals (≥4/6)',  value: stats.longSignals,                                            color: '#10b981', bg: 'rgba(16,185,129,.08)', border: 'rgba(16,185,129,.2)' },
            { label: 'Long next-day hit%',   value: stats.longWinRate  !== null ? stats.longWinRate  + '%' : '—', color: '#10b981', bg: 'rgba(16,185,129,.08)', border: 'rgba(16,185,129,.2)' },
            { label: 'Short signals (≥4/6)', value: stats.shortSignals,                                           color: '#ef4444', bg: 'rgba(239,68,68,.08)',  border: 'rgba(239,68,68,.2)'  },
            { label: 'Short next-day hit%',  value: stats.shortWinRate !== null ? stats.shortWinRate + '%' : '—', color: '#ef4444', bg: 'rgba(239,68,68,.08)',  border: 'rgba(239,68,68,.2)'  },
          ].map(s => (
            <div key={s.label} style={{ padding: '10px 14px', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}` }}>
              <div style={{ ...LBL, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div style={{ ...LBL, color: '#d1d5db', padding: '3rem 0', textAlign: 'center' }}>Loading…</div>}
      {error   && <div style={{ fontSize: 12, color: '#dc2626' }}>Error: {error}</div>}

      {!loading && !error && days.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          No data yet — scores accumulate as the checklist is viewed each day.
        </div>
      )}

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
                    ${Math.round(displayDay.price).toLocaleString()}
                  </span>
                )}
                {displayDay.priceChangePct !== null && displayDay.priceChangePct !== undefined && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: displayDay.priceChangePct >= 0 ? '#10b981' : '#ef4444' }}>
                    {displayDay.priceChangePct >= 0 ? '+' : ''}{Number(displayDay.priceChangePct).toFixed(2)}%
                  </span>
                )}
                {displayDay.fg !== null && <span style={{ fontSize: 11, color: '#6b7280' }}>F&G {displayDay.fg}</span>}
                {displayDay.frPct !== null && (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    FR {displayDay.frPct >= 0 ? '+' : ''}{Number(displayDay.frPct).toFixed(4)}%
                  </span>
                )}
                {displayDay.tpiState && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: displayDay.tpiState === 'LONG' ? '#10b981' : '#ef4444' }}>
                    TPI {displayDay.tpiState}
                  </span>
                )}
                {displayDay.takerBuyRatio !== null && (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>CVD {Number(displayDay.takerBuyRatio).toFixed(1)}%</span>
                )}
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
              { color: '#f7931a',             label: 'BTC price' },
              { color: '#10b981',             label: 'Long score' },
              { color: '#ef4444',             label: 'Short score' },
              { color: 'rgba(16,185,129,.2)', label: 'TPI LONG zone' },
              { color: 'rgba(239,68,68,.2)',  label: 'TPI SHORT zone' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: 'inline-block' }} />
                <span style={{ fontSize: 10, color: '#9ca3af' }}>{l.label}</span>
              </div>
            ))}
            <span style={{ fontSize: 10, color: '#d1d5db', marginLeft: 'auto' }}>
              {stats?.total ?? 0} days stored
            </span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af', lineHeight: 1.6 }}>
        Scores are recorded each time the Decision Checklist loads with live data.
        History builds from today — older days accumulate over time.
        <span style={{ fontWeight: 600, color: '#6b7280' }}> Win rate</span>: next-day price direction when signal ≥ 4/6.
      </div>
    </div>
  )
}
