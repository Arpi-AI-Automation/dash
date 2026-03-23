'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

// ── Config ────────────────────────────────────────────────────────────────────
// Quadrant: X = OI change %, Y = Price change % (matches checkonchain)
// Only show 3 windows: today, 1-week ago, 2-weeks ago

const WINDOWS = [
  { label: 'Today (7d)',   offset: 0,  lineColor: '#111827' },
  { label: '1-week ago',  offset: 7,  lineColor: '#f43f5e' },
  { label: '2-weeks ago', offset: 14, lineColor: '#f97316' },
]

const LBL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getRegime(priceChg, oiChg) {
  if (priceChg >= 0 && oiChg >= 0) return { label: 'LEVERAGE BUILDING', sub: 'OI↑ Price↑ · Bullish momentum, check funding',  color: '#f59e0b', bg: 'rgba(245,158,11,.08)',  border: 'rgba(245,158,11,.25)' }
  if (priceChg <  0 && oiChg >= 0) return { label: 'SHORTS PRESSING',   sub: 'OI↑ Price↓ · Bearish pressure, longs at risk',  color: '#ef4444', bg: 'rgba(239,68,68,.08)',   border: 'rgba(239,68,68,.25)'  }
  if (priceChg >= 0 && oiChg <  0) return { label: 'SHORT COVERING',    sub: 'OI↓ Price↑ · Spot-driven rally, healthy',       color: '#10b981', bg: 'rgba(16,185,129,.08)',  border: 'rgba(16,185,129,.25)' }
  return                                   { label: 'LONG FLUSH',        sub: 'OI↓ Price↓ · Longs capitulating, exhaustion',  color: '#6b7280', bg: 'rgba(107,114,128,.08)', border: 'rgba(107,114,128,.2)' }
}

function getQuadrantLabel(priceChg, oiChg) {
  if (priceChg >= 0 && oiChg >= 0) return 'Leveraged Rally'
  if (priceChg <  0 && oiChg >= 0) return 'Leveraged Sell-Off'
  if (priceChg >= 0 && oiChg <  0) return 'Spot Rally'
  return 'Deleveraging Sell-Off'
}

function fundingMeta(fr) {
  if (fr === null || fr === undefined) return { color: '#9ca3af', dot: '#9ca3af' }
  if (fr >  0.05) return { color: '#dc2626', dot: '#ef4444' }
  if (fr >  0.01) return { color: '#f97316', dot: '#f97316' }
  if (fr > -0.01) return { color: '#6b7280', dot: '#94a3b8' }
  if (fr > -0.05) return { color: '#818cf8', dot: '#818cf8' }
  return               { color: '#10b981', dot: '#22c55e' }
}

function fmtDay(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function drawArrow(ctx, x1, y1, x2, y2, color, size = 7) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 7), y2 - size * Math.sin(angle - Math.PI / 7))
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 7), y2 - size * Math.sin(angle + Math.PI / 7))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// ── Data fetch ────────────────────────────────────────────────────────────────
async function fetchAllPoints() {
  const [oiRes, klRes, frRes] = await Promise.all([
    fetch('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=30'),
    fetch('https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=D&limit=30'),
    fetch('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=90'),
  ])
  const [oiData, klData, frData] = await Promise.all([oiRes.json(), klRes.json(), frRes.json()])

  const oiMap = {}, priceMap = {}, frByDate = {}
  for (const item of oiData.result.list)
    oiMap[new Date(+item.timestamp).toISOString().slice(0, 10)] = +item.openInterest
  for (const k of klData.result.list)
    priceMap[new Date(+k[0]).toISOString().slice(0, 10)] = { open: +k[1], close: +k[4] }
  for (const f of frData.result.list) {
    const d = new Date(+f.fundingRateTimestamp).toISOString().slice(0, 10)
    if (!frByDate[d]) frByDate[d] = []
    frByDate[d].push(+f.fundingRate * 100)
  }

  const dates = Object.keys(oiMap).filter(d => priceMap[d]).sort()
  const pts = []
  for (let i = 1; i < dates.length; i++) {
    const d = dates[i], prev = dates[i - 1]
    const frs = frByDate[d] ?? []
    pts.push({
      date:     d,
      priceChg: +((priceMap[d].close - priceMap[d].open) / priceMap[d].open * 100).toFixed(2),
      oiChg:    +((oiMap[d] - oiMap[prev]) / oiMap[prev] * 100).toFixed(2),
      price:    +priceMap[d].close.toFixed(0),
      fr:       frs.length ? +(frs.reduce((a, b) => a + b, 0) / frs.length).toFixed(4) : null,
    })
  }
  return pts
}

// ── Scatter quadrant canvas ───────────────────────────────────────────────────
function ScatterChart({ windows, allPts }) {
  const canvasRef = useRef(null)
  const layoutRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [hovered, setHovered] = useState(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !windows.length) return
    const dpr = window.devicePixelRatio || 1
    const W   = canvas.offsetWidth
    const H   = canvas.offsetHeight
    if (W === 0 || H === 0) return
    canvas.width  = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const PAD = { left: 50, right: 20, top: 28, bottom: 38 }
    const cW  = W - PAD.left - PAD.right
    const cH  = H - PAD.top  - PAD.bottom

    // Axis range from all 3 windows
    const allX = windows.flatMap(w => w.pts.map(p => p.oiChg))
    const allY = windows.flatMap(w => w.pts.map(p => p.priceChg))
    const maxX = Math.max(Math.abs(Math.min(...allX)), Math.abs(Math.max(...allX))) * 1.3 || 8
    const maxY = Math.max(Math.abs(Math.min(...allY)), Math.abs(Math.max(...allY))) * 1.3 || 5

    const toX = v => PAD.left + ((v + maxX) / (maxX * 2)) * cW
    const toY = v => PAD.top  + ((maxY - v) / (maxY * 2)) * cH
    const midX = toX(0), midY = toY(0)

    layoutRef.current = { PAD, cW, cH, maxX, maxY, toX, toY, midX, midY, W, H }

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#f9fafb'
    ctx.fillRect(PAD.left, PAD.top, cW, cH)

    // Quadrant fills
    ;[
      [PAD.left, PAD.top,  midX - PAD.left,       midY - PAD.top,      'rgba(59,130,246,.04)' ],  // TL Spot Rally
      [midX,     PAD.top,  PAD.left + cW - midX,  midY - PAD.top,      'rgba(59,130,246,.04)' ],  // TR Leveraged Rally
      [PAD.left, midY,     midX - PAD.left,        PAD.top + cH - midY, 'rgba(239,68,68,.04)'  ],  // BL Deleveraging
      [midX,     midY,     PAD.left + cW - midX,   PAD.top + cH - midY, 'rgba(245,158,11,.04)' ],  // BR Leveraged Sell-Off
    ].forEach(([x, y, w, h, c]) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) })

    // Grid lines
    const xStep = maxX > 15 ? 10 : maxX > 6 ? 4 : 2
    const yStep = maxY > 10 ? 5  : maxY > 4  ? 2 : 1
    ctx.font = '9px -apple-system,sans-serif'

    for (let v = -Math.ceil(maxX); v <= Math.ceil(maxX); v += xStep) {
      if (v === 0) continue
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(toX(v), PAD.top); ctx.lineTo(toX(v), PAD.top + cH); ctx.stroke()
      ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'
      ctx.fillText(`${v > 0 ? '+' : ''}${v}%`, toX(v), PAD.top + cH + 14)
    }
    for (let v = -Math.ceil(maxY); v <= Math.ceil(maxY); v += yStep) {
      if (v === 0) continue
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(PAD.left, toY(v)); ctx.lineTo(PAD.left + cW, toY(v)); ctx.stroke()
      ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'right'
      ctx.fillText(`${v > 0 ? '+' : ''}${v}%`, PAD.left - 4, toY(v) + 3)
    }

    // Zero axes
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(PAD.left, midY); ctx.lineTo(PAD.left + cW, midY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(midX, PAD.top);  ctx.lineTo(midX, PAD.top + cH);  ctx.stroke()

    // Axis titles
    ctx.fillStyle = '#9ca3af'; ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('← OI Change % →', PAD.left + cW / 2, PAD.top + cH + 28)
    ctx.save(); ctx.translate(10, PAD.top + cH / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('← Price Change % →', 0, 0); ctx.restore()

    // Quadrant labels
    const QL = 8
    ctx.font = 'bold 10px -apple-system,sans-serif'
    ;[
      [PAD.left + QL, PAD.top + 15,       'left',  'Spot Rally',            '#3b82f6'],
      [PAD.left + cW - QL, PAD.top + 15,  'right', 'Leveraged Rally',       '#3b82f6'],
      [PAD.left + QL, PAD.top + cH - QL,  'left',  'Deleveraging Sell-Off', '#ef4444'],
      [PAD.left + cW - QL, PAD.top + cH - QL, 'right', 'Leveraged Sell-Off', '#f59e0b'],
    ].forEach(([x, y, align, label, color]) => {
      ctx.fillStyle = color + 'bb'; ctx.textAlign = align
      ctx.fillText(label, x, y)
    })

    // Draw traces — oldest first (index 2 → 1 → 0) so today is on top
    for (let wi = WINDOWS.length - 1; wi >= 0; wi--) {
      const w   = windows[wi]
      if (!w || w.pts.length < 2) continue
      const isToday = wi === 0
      ctx.globalAlpha = isToday ? 1 : 0.6

      // Path with arrowheads
      for (let i = 1; i < w.pts.length; i++) {
        const x1 = toX(w.pts[i-1].oiChg), y1 = toY(w.pts[i-1].priceChg)
        const x2 = toX(w.pts[i].oiChg),   y2 = toY(w.pts[i].priceChg)
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
        ctx.strokeStyle = w.lineColor; ctx.lineWidth = isToday ? 2 : 1.5; ctx.stroke()
        drawArrow(ctx, x1, y1, x2, y2, w.lineColor, isToday ? 8 : 6)
      }

      // Dots
      for (let i = 0; i < w.pts.length; i++) {
        const x = toX(w.pts[i].oiChg), y = toY(w.pts[i].priceChg)
        const isEnd = i === w.pts.length - 1
        const r = isToday && isEnd ? 7 : isEnd ? 4 : 2.5
        if (hovered && hovered.wi === wi && hovered.pi === i) {
          ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2)
          ctx.fillStyle = w.lineColor + '20'; ctx.fill()
        }
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = isToday && isEnd ? '#111827' : w.lineColor; ctx.fill()
        if (isToday && isEnd) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke() }
      }

      ctx.globalAlpha = 1
    }

    // TODAY label
    const todayW = windows[0]
    if (todayW?.pts.length) {
      const last = todayW.pts[todayW.pts.length - 1]
      const x = toX(last.oiChg), y = toY(last.priceChg)
      ctx.fillStyle = '#111827'; ctx.font = 'bold 10px -apple-system,sans-serif'
      ctx.textAlign = x > W * 0.6 ? 'right' : 'left'
      ctx.fillText('TODAY', x + (x > W * 0.6 ? -11 : 11), y - 10)
    }
  }, [windows, hovered])

  useEffect(() => {
    draw()
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])

  const handleMouseMove = useCallback(e => {
    const canvas = canvasRef.current
    const layout = layoutRef.current
    if (!canvas || !layout) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { toX, toY } = layout
    let best = null, bestDist = 18
    for (let wi = 0; wi < windows.length; wi++) {
      for (let pi = 0; pi < (windows[wi]?.pts.length ?? 0); pi++) {
        const p = windows[wi].pts[pi]
        const d = Math.hypot(toX(p.oiChg) - mx, toY(p.priceChg) - my)
        if (d < bestDist) { bestDist = d; best = { wi, pi, p, w: windows[wi] } }
      }
    }
    setHovered(best ? { wi: best.wi, pi: best.pi } : null)
    setTooltip(best ? {
      x: mx, y: my, pt: best.p, color: best.w.lineColor, label: best.w.label,
      regime: getQuadrantLabel(best.p.priceChg, best.p.oiChg),
    } : null)
  }, [windows])

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 380, display: 'block', borderRadius: 8, cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHovered(null); setTooltip(null) }}
      />
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: Math.min(tooltip.x + 14, (canvasRef.current?.offsetWidth ?? 400) - 185),
          top:  Math.max(8, tooltip.y - 90),
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
          padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,.1)',
          pointerEvents: 'none', zIndex: 10, minWidth: 165,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: tooltip.color, marginBottom: 3 }}>{tooltip.label}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{tooltip.pt.date}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' }}>
            {[
              ['Price',  `${tooltip.pt.priceChg >= 0 ? '+' : ''}${tooltip.pt.priceChg}%`, tooltip.pt.priceChg >= 0 ? '#10b981' : '#ef4444'],
              ['OI',     `${tooltip.pt.oiChg >= 0 ? '+' : ''}${tooltip.pt.oiChg}%`,       tooltip.pt.oiChg >= 0 ? '#f59e0b' : '#6b7280'],
              ['BTC',    `$${tooltip.pt.price.toLocaleString()}`,                           '#374151'],
              ['FR/day', tooltip.pt.fr !== null ? `${tooltip.pt.fr >= 0 ? '+' : ''}${tooltip.pt.fr}%` : '—', '#818cf8'],
            ].map(([k, v, c]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>{k}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: tooltip.color }}>{tooltip.regime}</div>
        </div>
      )}
    </div>
  )
}

// ── Timeline table (7 rows, today most prominent) ─────────────────────────────
function TimelineTable({ pts7 }) {
  if (!pts7.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {[...pts7].reverse().map((p, i) => {
        const isToday = i === 0
        const regime  = getRegime(p.priceChg, p.oiChg)
        const fr      = fundingMeta(p.fr)
        return (
          <div key={p.date} style={{
            display: 'grid', gridTemplateColumns: '110px 1fr auto',
            alignItems: 'center', gap: 10,
            padding: isToday ? '13px 14px' : '8px 12px',
            borderRadius: 10,
            border: isToday ? `1.5px solid ${regime.border}` : '1px solid #f3f4f6',
            background: isToday ? regime.bg : '#fafafa',
          }}>
            {/* Date */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Arrow icon */}
              <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
                <g transform={`rotate(${
                  p.priceChg >= 0 && p.oiChg >= 0 ? -45
                : p.priceChg <  0 && p.oiChg >= 0 ? 225
                : p.priceChg >= 0 && p.oiChg <  0 ? 45
                : 135}, 9, 9)`}>
                  <line x1="9" y1="14" x2="9" y2="4" stroke={p.priceChg >= 0 ? '#10b981' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round"/>
                  <polyline points="5.5,7.5 9,4 12.5,7.5" fill="none" stroke={p.priceChg >= 0 ? '#10b981' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </g>
              </svg>
              <div>
                <div style={{ fontSize: isToday ? 12 : 11, fontWeight: isToday ? 700 : 500, color: isToday ? '#111827' : '#6b7280' }}>
                  {fmtDay(p.date)}
                </div>
                {isToday && <div style={{ fontSize: 10, fontWeight: 700, color: regime.color }}>TODAY</div>}
              </div>
            </div>

            {/* Regime pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: isToday ? 12 : 11, fontWeight: 700, color: regime.color,
                background: regime.bg, border: `1px solid ${regime.border}`,
                borderRadius: 20, padding: isToday ? '3px 10px' : '2px 8px', whiteSpace: 'nowrap',
              }}>{regime.label}</span>
              {isToday && <span style={{ fontSize: 11, color: '#9ca3af' }}>{regime.sub}</span>}
            </div>

            {/* Numbers */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
              <div style={{ textAlign: 'right', minWidth: 54 }}>
                <div style={{ ...LBL, marginBottom: 1 }}>Price</div>
                <div style={{ fontSize: isToday ? 14 : 12, fontWeight: 700, color: p.priceChg >= 0 ? '#10b981' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                  {p.priceChg >= 0 ? '+' : ''}{p.priceChg}%
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 50 }}>
                <div style={{ ...LBL, marginBottom: 1 }}>OI</div>
                <div style={{ fontSize: isToday ? 14 : 12, fontWeight: 700, color: p.oiChg >= 0 ? '#f59e0b' : '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                  {p.oiChg >= 0 ? '+' : ''}{p.oiChg}%
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 66 }}>
                <div style={{ ...LBL, marginBottom: 1 }}>Funding</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: fr.dot, display: 'inline-block' }} />
                  <span style={{ fontSize: isToday ? 13 : 11, fontWeight: 700, color: fr.color, fontVariantNumeric: 'tabular-nums' }}>
                    {p.fr !== null ? (p.fr >= 0 ? '+' : '') + p.fr + '%' : '—'}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 70 }}>
                <div style={{ ...LBL, marginBottom: 1 }}>BTC close</div>
                <div style={{ fontSize: isToday ? 13 : 11, fontWeight: isToday ? 700 : 500, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                  ${p.price.toLocaleString('en-US')}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OIScatter() {
  const [allPts,  setAllPts]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    fetchAllPoints()
      .then(pts => { setAllPts(pts); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div style={{ ...LBL, color: '#d1d5db', padding: '1rem 0' }}>Loading Bybit data…</div>
  if (error)   return <div style={{ fontSize: 12, color: '#dc2626' }}>Error: {error}</div>
  if (!allPts.length) return <div style={{ ...LBL, color: '#d1d5db' }}>No data</div>

  // 7 most recent daily points for the table
  const pts7 = allPts.slice(-7)

  // Build scatter windows (each = 7 consecutive daily points)
  const scatterWindows = WINDOWS.map(w => {
    const end   = allPts.length - w.offset
    const start = Math.max(0, end - 7)
    return { ...w, pts: allPts.slice(start, end) }
  }).filter(w => w.pts.length >= 2)

  const todayPt  = pts7[pts7.length - 1]
  const todayReg = todayPt ? getRegime(todayPt.priceChg, todayPt.oiChg) : null

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ ...LBL }}>Daily % change · Bybit BTCUSDT Perp · last 7 days</span>
        {todayPt && todayReg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...LBL, textTransform: 'none' }}>Current regime:</span>
            <span style={{
              fontSize: 12, fontWeight: 700, color: todayReg.color,
              background: todayReg.bg, border: `1px solid ${todayReg.border}`,
              borderRadius: 20, padding: '3px 12px',
            }}>{todayReg.label}</span>
          </div>
        )}
      </div>

      {/* ── Timeline table ──────────────────────────────────────────────────── */}
      <TimelineTable pts7={pts7} />

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #f3f4f6', margin: '18px 0 14px' }} />

      {/* ── Scatter chart header ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ ...LBL }}>OI vs Price quadrant · 7-day rolling windows</span>
        <div style={{ display: 'flex', gap: 14 }}>
          {WINDOWS.map(w => (
            <span key={w.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b7280' }}>
              <svg width="20" height="10" viewBox="0 0 20 10">
                <line x1="0" y1="5" x2="13" y2="5" stroke={w.lineColor} strokeWidth="2"/>
                <polygon points="13,2 20,5 13,8" fill={w.lineColor}/>
              </svg>
              {w.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Scatter canvas ──────────────────────────────────────────────────── */}
      <ScatterChart windows={scatterWindows} allPts={allPts} />

      {/* ── Quadrant legend ─────────────────────────────────────────────────── */}
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
        {[
          ['#3b82f6', 'Leveraged Rally',       'OI↑ Price↑ — leveraged bull move'],
          ['#3b82f6', 'Spot Rally',             'OI↓ Price↑ — organic spot buying, healthy'],
          ['#f59e0b', 'Leveraged Sell-Off',    'OI↑ Price↓ — shorts pressing'],
          ['#ef4444', 'Deleveraging Sell-Off', 'OI↓ Price↓ — forced liquidations, capitulation'],
        ].map(([color, label, sub]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 2 }} />
            <span>
              <span style={{ fontWeight: 700, color }}>{label}</span>
              <span style={{ color: '#9ca3af' }}> — {sub}</span>
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: '#d1d5db' }}>
        Quadrant: X = OI Change %, Y = Price Change % · Source: Bybit perpetuals
      </div>
    </div>
  )
}
