'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

// ── Axis: X = OI change %, Y = Price change % (matches checkonchain) ──────────

const WINDOWS = [
  { label: 'Today (7d)',    offset: 0,  color: '#111827', lineColor: '#111827', dotColor: '#111827' },
  { label: '1-week ago',   offset: 7,  color: '#f43f5e', lineColor: '#f43f5e', dotColor: '#f43f5e' },
  { label: '2-weeks ago',  offset: 14, color: '#f97316', lineColor: '#f97316', dotColor: '#f97316' },
  { label: '1-month ago',  offset: 30, color: '#22c55e', lineColor: '#22c55e', dotColor: '#22c55e' },
  { label: '2-months ago', offset: 60, color: '#3b82f6', lineColor: '#3b82f6', dotColor: '#3b82f6' },
  { label: '3-months ago', offset: 90, color: '#8b5cf6', lineColor: '#8b5cf6', dotColor: '#8b5cf6' },
]

const LBL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

async function fetchAllPoints() {
  const [oiRes, klRes, frRes] = await Promise.all([
    fetch('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=100'),
    fetch('https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=D&limit=100'),
    fetch('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200'),
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
      priceChg: +((priceMap[d].close - priceMap[d].open) / priceMap[d].open * 100).toFixed(3),
      oiChg:    +((oiMap[d] - oiMap[prev]) / oiMap[prev] * 100).toFixed(3),
      price:    +priceMap[d].close.toFixed(0),
      fr:       frs.length ? +(frs.reduce((a, b) => a + b, 0) / frs.length).toFixed(4) : null,
    })
  }
  return pts
}

// Draw an arrowhead at the end of a line segment
function drawArrow(ctx, x1, y1, x2, y2, color, size = 7) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle   = color
  ctx.lineWidth   = 1.5
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 7), y2 - size * Math.sin(angle - Math.PI / 7))
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 7), y2 - size * Math.sin(angle + Math.PI / 7))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export default function OIScatter() {
  const canvasRef  = useRef(null)
  const layoutRef  = useRef(null)
  const [allPts,   setAllPts]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [tooltip,  setTooltip]  = useState(null)
  const [hovered,  setHovered]  = useState(null) // { windowIdx, ptIdx }

  useEffect(() => {
    fetchAllPoints()
      .then(pts => { setAllPts(pts); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [])

  // Build the 6 window slices from allPts
  const windows = WINDOWS.map(w => {
    if (allPts.length < 8) return { ...w, pts: [] }
    // offset=0 → last 7 pts; offset=7 → pts ending 7 days before last, etc.
    const end   = allPts.length - w.offset
    const start = Math.max(0, end - 7)
    return { ...w, pts: allPts.slice(start, end) }
  }).filter(w => w.pts.length >= 2)

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

    const PAD = { left: 52, right: 24, top: 32, bottom: 40 }
    const cW  = W - PAD.left - PAD.right
    const cH  = H - PAD.top  - PAD.bottom

    // Compute axis range from all window points
    const allX = windows.flatMap(w => w.pts.map(p => p.oiChg))
    const allY = windows.flatMap(w => w.pts.map(p => p.priceChg))
    const maxX = Math.max(Math.abs(Math.min(...allX)), Math.abs(Math.max(...allX))) * 1.3 || 10
    const maxY = Math.max(Math.abs(Math.min(...allY)), Math.abs(Math.max(...allY))) * 1.3 || 8

    const toX = v => PAD.left + ((v + maxX) / (maxX * 2)) * cW
    const toY = v => PAD.top  + ((maxY - v) / (maxY * 2)) * cH
    const midX = toX(0), midY = toY(0)

    layoutRef.current = { PAD, cW, cH, maxX, maxY, toX, toY, midX, midY, W, H, windows }

    ctx.clearRect(0, 0, W, H)

    // ── Background ────────────────────────────────────────────────────────────
    ctx.fillStyle = '#f9fafb'
    ctx.fillRect(PAD.left, PAD.top, cW, cH)

    // Quadrant fills
    const fills = [
      { x: PAD.left,  y: PAD.top, w: midX - PAD.left,          h: midY - PAD.top,        c: 'rgba(59,130,246,.04)'  }, // TL: Spot Rally
      { x: midX,      y: PAD.top, w: PAD.left + cW - midX,      h: midY - PAD.top,        c: 'rgba(59,130,246,.04)'  }, // TR: Leveraged Rally
      { x: PAD.left,  y: midY,    w: midX - PAD.left,           h: PAD.top + cH - midY,   c: 'rgba(239,68,68,.04)'   }, // BL: Deleveraging Sell-Off
      { x: midX,      y: midY,    w: PAD.left + cW - midX,      h: PAD.top + cH - midY,   c: 'rgba(245,158,11,.04)'  }, // BR: Leveraged Sell-Off
    ]
    for (const f of fills) {
      ctx.fillStyle = f.c
      ctx.fillRect(f.x, f.y, f.w, f.h)
    }

    // ── Grid lines ────────────────────────────────────────────────────────────
    ctx.font = '9px -apple-system,sans-serif'
    const xStep = maxX > 15 ? 10 : maxX > 8 ? 5 : 2
    const yStep = maxY > 10 ? 5  : maxY > 5  ? 2 : 1

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
      ctx.fillText(`${v > 0 ? '+' : ''}${v}%`, PAD.left - 5, toY(v) + 3)
    }

    // ── Zero axes ─────────────────────────────────────────────────────────────
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(PAD.left, midY);  ctx.lineTo(PAD.left + cW, midY);  ctx.stroke()
    ctx.beginPath(); ctx.moveTo(midX, PAD.top);   ctx.lineTo(midX, PAD.top + cH);   ctx.stroke()

    // ── Axis labels ───────────────────────────────────────────────────────────
    ctx.fillStyle = '#6b7280'; ctx.font = '10px -apple-system,sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('OI Change % →', PAD.left + cW / 2, PAD.top + cH + 30)
    ctx.save(); ctx.translate(12, PAD.top + cH / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('Price Change %', 0, 0); ctx.restore()

    // ── Quadrant corner labels ────────────────────────────────────────────────
    const QLPad = 10
    const quadLabels = [
      { x: PAD.left + QLPad, y: PAD.top + 18,        align: 'left',  label: 'Spot Rally',            color: '#3b82f6' },
      { x: PAD.left + cW - QLPad, y: PAD.top + 18,   align: 'right', label: 'Leveraged Rally',       color: '#3b82f6' },
      { x: PAD.left + QLPad, y: PAD.top + cH - QLPad,align: 'left',  label: 'Deleveraging Sell-Off', color: '#ef4444' },
      { x: PAD.left + cW - QLPad, y: PAD.top + cH - QLPad, align: 'right', label: 'Leveraged Sell-Off', color: '#f59e0b' },
    ]
    ctx.font = 'bold 11px -apple-system,sans-serif'
    for (const q of quadLabels) {
      ctx.fillStyle = q.color + 'cc'
      ctx.textAlign = q.align
      ctx.fillText(q.label, q.x, q.y)
    }

    // ── Draw window traces (oldest windows first so today is on top) ──────────
    for (let wi = windows.length - 1; wi >= 0; wi--) {
      const w   = windows[wi]
      const pts = w.pts
      if (pts.length < 2) continue
      const isToday   = wi === 0
      const lineAlpha = isToday ? 1 : 0.65
      const lineWidth = isToday ? 2 : 1.5

      ctx.globalAlpha = lineAlpha

      // Draw connected path with arrowheads between each pair
      for (let i = 1; i < pts.length; i++) {
        const x1 = toX(pts[i - 1].oiChg),   y1 = toY(pts[i - 1].priceChg)
        const x2 = toX(pts[i].oiChg),         y2 = toY(pts[i].priceChg)

        // Line segment
        ctx.beginPath()
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
        ctx.strokeStyle = w.lineColor
        ctx.lineWidth   = lineWidth
        ctx.stroke()

        // Arrowhead at end of each segment
        drawArrow(ctx, x1, y1, x2, y2, w.lineColor, isToday ? 8 : 6)
      }

      // Dots at each point
      for (let i = 0; i < pts.length; i++) {
        const x = toX(pts[i].oiChg), y = toY(pts[i].priceChg)
        const isEndPt = i === pts.length - 1
        const r = isToday && isEndPt ? 7 : isEndPt ? 4 : 3

        // Hovered glow
        if (hovered && hovered.windowIdx === wi && hovered.ptIdx === i) {
          ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2)
          ctx.fillStyle = w.dotColor + '25'; ctx.fill()
        }

        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = isToday && isEndPt ? '#111827' : w.dotColor
        ctx.fill()

        if (isToday && isEndPt) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
        }
      }

      ctx.globalAlpha = 1
    }

    // "TODAY" label next to the last point of window 0
    if (windows[0]?.pts.length) {
      const last = windows[0].pts[windows[0].pts.length - 1]
      const x = toX(last.oiChg), y = toY(last.priceChg)
      ctx.fillStyle = '#111827'
      ctx.font      = 'bold 10px -apple-system,sans-serif'
      ctx.textAlign = x > W / 2 ? 'right' : 'left'
      ctx.fillText('TODAY', x + (x > W / 2 ? -11 : 11), y - 9)
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
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const { toX, toY } = layout

    let best = null, bestDist = 20
    for (let wi = 0; wi < windows.length; wi++) {
      for (let pi = 0; pi < windows[wi].pts.length; pi++) {
        const p  = windows[wi].pts[pi]
        const dx = toX(p.oiChg) - mx
        const dy = toY(p.priceChg) - my
        const d  = Math.sqrt(dx * dx + dy * dy)
        if (d < bestDist) { bestDist = d; best = { windowIdx: wi, ptIdx: pi, pt: p, w: windows[wi] } }
      }
    }

    if (best !== hovered) {
      setHovered(best ? { windowIdx: best.windowIdx, ptIdx: best.ptIdx } : null)
      if (best) {
        const { pt, w } = best
        const regime = pt.priceChg >= 0 && pt.oiChg >= 0 ? 'Leveraged Rally'
                     : pt.priceChg <  0 && pt.oiChg >= 0 ? 'Leveraged Sell-Off'
                     : pt.priceChg >= 0 && pt.oiChg <  0 ? 'Spot Rally'
                     : 'Deleveraging Sell-Off'
        setTooltip({ x: mx, y: my, pt, color: w.color, label: w.label, regime })
      } else {
        setTooltip(null)
      }
    }
  }, [windows, hovered])

  // Current state summary from today's window last point
  const todayPt  = windows[0]?.pts?.[windows[0].pts.length - 1]
  const todayReg = todayPt
    ? (todayPt.priceChg >= 0 && todayPt.oiChg >= 0 ? { label: 'Leveraged Rally',       color: '#3b82f6' }
     : todayPt.priceChg <  0 && todayPt.oiChg >= 0 ? { label: 'Leveraged Sell-Off',    color: '#f59e0b' }
     : todayPt.priceChg >= 0 && todayPt.oiChg <  0 ? { label: 'Spot Rally',             color: '#3b82f6' }
     :                                                 { label: 'Deleveraging Sell-Off', color: '#ef4444' })
    : null

  if (loading) return <div style={{ ...LBL, color: '#d1d5db', padding: '1rem 0' }}>Loading Bybit data…</div>
  if (error)   return <div style={{ fontSize: 12, color: '#dc2626' }}>Error: {error}</div>

  return (
    <div>
      {/* ── Subtitle + current state ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ ...LBL }}>7-day rolling window · Bybit BTCUSDT Perp</span>
        {todayPt && todayReg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...LBL, textTransform: 'none' }}>Current regime:</span>
            <span style={{
              fontSize: 12, fontWeight: 700, color: todayReg.color,
              background: todayReg.color + '15', border: `1px solid ${todayReg.color}40`,
              borderRadius: 20, padding: '3px 12px',
            }}>{todayReg.label}</span>
          </div>
        )}
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
        {windows.map(w => (
          <span key={w.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b7280' }}>
            <svg width="20" height="10" viewBox="0 0 20 10">
              <line x1="0" y1="5" x2="14" y2="5" stroke={w.lineColor} strokeWidth="2"/>
              <polygon points="14,2 20,5 14,8" fill={w.lineColor}/>
            </svg>
            {w.label}
          </span>
        ))}
      </div>

      {/* ── Canvas ───────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 420, display: 'block', borderRadius: 8, cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { setHovered(null); setTooltip(null) }}
        />

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: Math.min(tooltip.x + 14, (canvasRef.current?.offsetWidth ?? 400) - 190),
            top:  Math.max(8, tooltip.y - 80),
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
            padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,.1)',
            pointerEvents: 'none', zIndex: 10, minWidth: 170,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: tooltip.color, marginBottom: 4 }}>{tooltip.label}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{tooltip.pt.date}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' }}>
              {[
                ['Price', `${tooltip.pt.priceChg >= 0 ? '+' : ''}${tooltip.pt.priceChg}%`, tooltip.pt.priceChg >= 0 ? '#10b981' : '#ef4444'],
                ['OI',    `${tooltip.pt.oiChg >= 0 ? '+' : ''}${tooltip.pt.oiChg}%`,       tooltip.pt.oiChg >= 0 ? '#f59e0b' : '#6b7280'],
                ['BTC',   `$${tooltip.pt.price.toLocaleString('en-US')}`, '#374151'],
                ['FR',    tooltip.pt.fr !== null ? `${tooltip.pt.fr >= 0 ? '+' : ''}${tooltip.pt.fr}%` : '—', '#818cf8'],
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

      {/* ── Quadrant guide ───────────────────────────────────────────────────── */}
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
        {[
          { color: '#3b82f6', label: 'Leveraged Rally',       sub: 'OI↑ Price↑ — leverage-driven bull move' },
          { color: '#3b82f6', label: 'Spot Rally',             sub: 'OI↓ Price↑ — organic spot buying, healthy' },
          { color: '#f59e0b', label: 'Leveraged Sell-Off',    sub: 'OI↑ Price↓ — shorts piling in' },
          { color: '#ef4444', label: 'Deleveraging Sell-Off', sub: 'OI↓ Price↓ — forced liquidations, capitulation' },
        ].map(q => (
          <div key={q.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: q.color, flexShrink: 0, marginTop: 2 }} />
            <span><span style={{ fontWeight: 700, color: q.color }}>{q.label}</span>
              <span style={{ color: '#9ca3af' }}> — {q.sub.split('—')[1]?.trim()}</span>
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: '#d1d5db' }}>
        X axis = OI Change % · Y axis = Price Change % · Each window = 7 daily candles · Source: Bybit
      </div>
    </div>
  )
}
