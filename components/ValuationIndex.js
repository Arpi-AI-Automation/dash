'use client'
import { useEffect, useRef, useState } from 'react'

const LBL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

function viColor(v) {
  if (v == null) return '#6b7280'
  if (v >= 2)  return '#dc2626'
  if (v >= 1)  return '#f97316'
  if (v > -1)  return '#f59e0b'
  if (v > -2)  return '#10b981'
  return             '#059669'
}

function viZone(v) {
  if (v == null) return '—'
  if (v >= 2)  return 'OVERBOUGHT'
  if (v >= 1)  return 'ELEVATED'
  if (v > -1)  return 'NEUTRAL'
  if (v > -2)  return 'VALUE'
  return             'DEEP VALUE'
}

// ── Combined chart: BTC price top, VI1+VI2 oscillator bottom ─────────────────
function CombinedChart({ btcHistory, vi1History, vi2History }) {
  const canvasRef = useRef(null)
  const [hovered, setHovered] = useState(null)

  // Build aligned date array from VI dates (the shorter series)
  const viDates = vi1History.map(d => d.date).filter(Boolean)
  if (viDates.length < 2) return (
    <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
      <span style={{ ...LBL, color: '#d1d5db' }}>Chart builds as daily data accumulates</span>
    </div>
  )

  // Build lookup maps
  const btcByDate = {}
  btcHistory.forEach(p => { if (p.date && p.price) btcByDate[p.date] = p.price })
  const vi1ByDate = {}
  vi1History.forEach(p => { if (p.date && p.value != null) vi1ByDate[p.date] = parseFloat(p.value) })
  const vi2ByDate = {}
  vi2History.forEach(p => { if (p.date && p.value != null) vi2ByDate[p.date] = parseFloat(p.value) })

  // Only render dates where we have BTC price AND at least one VI value
  const dates = viDates.filter(d => btcByDate[d] != null)
  if (dates.length < 2) return (
    <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
      <span style={{ ...LBL, color: '#d1d5db' }}>Aligning BTC price with VI history…</span>
    </div>
  )

  const btcPrices = dates.map(d => btcByDate[d])
  const vi1Values = dates.map(d => vi1ByDate[d] ?? null)
  const vi2Values = dates.map(d => vi2ByDate[d] ?? null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || dates.length < 2) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const PAD = { left: 52, right: 8, top: 8, bottom: 22 }
    const splitRatio = 0.52  // BTC takes top 52%, oscillator bottom 48%
    const splitY = Math.floor(H * splitRatio)
    const cW  = W - PAD.left - PAD.right
    const btcH = splitY - PAD.top - 4
    const oscH = H - splitY - PAD.bottom

    ctx.clearRect(0, 0, W, H)

    // Light chart backgrounds
    ctx.fillStyle = '#f9fafb'
    ctx.fillRect(PAD.left, PAD.top, cW, btcH)
    ctx.fillStyle = '#f9fafb'
    ctx.fillRect(PAD.left, splitY + 4, cW, oscH)

    const n  = dates.length
    const pX = i => PAD.left + (cW * i) / (n - 1)

    // ── BTC price panel ──────────────────────────────────────────────────────
    const minP = Math.min(...btcPrices), maxP = Math.max(...btcPrices)
    const rangeP = maxP - minP || 1
    const pY = p => PAD.top + btcH - (btcH * (p - minP)) / rangeP

    // Grid lines
    ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'right'
    for (let i = 0; i <= 3; i++) {
      const v = minP + (rangeP * i) / 3
      const y = PAD.top + btcH - (btcH * i) / 3
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke()
      ctx.fillStyle = '#9ca3af'
      ctx.fillText(`$${Math.round(v / 1000)}k`, PAD.left - 4, y + 3)
    }

    // BTC line — coloured by TPI state where available, else neutral grey
    ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
    for (let i = 1; i < n; i++) {
      ctx.strokeStyle = '#374151'
      ctx.beginPath()
      ctx.moveTo(pX(i - 1), pY(btcPrices[i - 1]))
      ctx.lineTo(pX(i),     pY(btcPrices[i]))
      ctx.stroke()
    }

    // Hovered BTC dot
    if (hovered !== null) {
      ctx.beginPath()
      ctx.arc(pX(hovered), pY(btcPrices[hovered]), 3, 0, Math.PI * 2)
      ctx.fillStyle = '#374151'; ctx.fill()
    }

    // Divider
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(PAD.left, splitY); ctx.lineTo(PAD.left + cW, splitY); ctx.stroke()
    ctx.setLineDash([])

    // ── Oscillator panel ─────────────────────────────────────────────────────
    const OSC_MIN = -3, OSC_MAX = 3
    const oY = v => splitY + 4 + oscH - (oscH * (v - OSC_MIN)) / (OSC_MAX - OSC_MIN)

    // Zone bands
    const bands = [
      { min: -3, max: -2, color: 'rgba(5,150,105,.06)' },
      { min: -2, max: -1, color: 'rgba(16,185,129,.04)' },
      { min:  1, max:  2, color: 'rgba(249,115,22,.04)' },
      { min:  2, max:  3, color: 'rgba(220,38,38,.06)' },
    ]
    for (const b of bands) {
      ctx.fillStyle = b.color
      ctx.fillRect(PAD.left, oY(b.max), cW, oY(b.min) - oY(b.max))
    }

    // Zero line
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(PAD.left, oY(0)); ctx.lineTo(PAD.left + cW, oY(0)); ctx.stroke()

    // Y axis labels for oscillator
    ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'right'
    for (const v of [-2, -1, 0, 1, 2]) {
      const y = oY(v)
      ctx.fillStyle = '#9ca3af'
      ctx.fillText(v > 0 ? `+${v}` : `${v}`, PAD.left - 4, y + 3)
    }

    // Draw VI2 first (behind), then VI1 on top
    const drawOscLine = (values, color) => {
      const pts = values.map((v, i) => v !== null ? { x: pX(i), y: oY(Math.max(OSC_MIN, Math.min(OSC_MAX, v))) } : null)
      // Fill above/below zero
      ctx.beginPath()
      let inPath = false
      for (let i = 0; i < pts.length; i++) {
        if (!pts[i]) { inPath = false; continue }
        if (!inPath) { ctx.moveTo(pts[i].x, oY(0)); ctx.lineTo(pts[i].x, pts[i].y); inPath = true }
        else ctx.lineTo(pts[i].x, pts[i].y)
      }
      if (inPath) ctx.lineTo(pts[pts.length - 1].x, oY(0))
      ctx.closePath()
      ctx.fillStyle = color + '22'; ctx.fill()

      // Line
      ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
      let started = false
      for (let i = 0; i < pts.length; i++) {
        if (!pts[i]) { started = false; continue }
        if (!started) { ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); started = true }
        else ctx.lineTo(pts[i].x, pts[i].y)
      }
      ctx.strokeStyle = color; ctx.stroke()
    }

    drawOscLine(vi2Values, '#818cf8')  // VI2 full-cycle — indigo
    drawOscLine(vi1Values, '#f59e0b')  // VI1 short-term — amber

    // Hover crosshair
    if (hovered !== null) {
      ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 0.5; ctx.setLineDash([2, 2])
      ctx.beginPath(); ctx.moveTo(pX(hovered), PAD.top); ctx.lineTo(pX(hovered), H - PAD.bottom); ctx.stroke()
      ctx.setLineDash([])
      const v1 = vi1Values[hovered], v2 = vi2Values[hovered]
      if (v1 !== null) {
        ctx.beginPath(); ctx.arc(pX(hovered), oY(Math.max(OSC_MIN, Math.min(OSC_MAX, v1))), 3, 0, Math.PI * 2)
        ctx.fillStyle = '#f59e0b'; ctx.fill()
      }
      if (v2 !== null) {
        ctx.beginPath(); ctx.arc(pX(hovered), oY(Math.max(OSC_MIN, Math.min(OSC_MAX, v2))), 3, 0, Math.PI * 2)
        ctx.fillStyle = '#818cf8'; ctx.fill()
      }
    }

    // X-axis date labels
    ctx.font = '9px -apple-system,sans-serif'; ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'
    const step = Math.max(1, Math.floor(n / 5))
    for (let i = 0; i < n; i += step) {
      ctx.fillText(dates[i].slice(5), pX(i), H - 6)  // MM-DD
    }
  }, [dates, btcPrices, vi1Values, vi2Values, hovered])

  const handleMouseMove = e => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x    = e.clientX - rect.left
    const cW   = canvas.offsetWidth - 52 - 8
    const idx  = Math.round((x - 52) / cW * (dates.length - 1))
    setHovered(idx >= 0 && idx < dates.length ? idx : null)
  }

  const h = hovered !== null ? hovered : dates.length - 1
  const hDate  = dates[h]
  const hBtc   = btcPrices[h]
  const hVi1   = vi1Values[h]
  const hVi2   = vi2Values[h]

  return (
    <div>
      {/* Hover info bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, minHeight: 22, flexWrap: 'wrap' }}>
        <span style={{ ...LBL, textTransform: 'none' }}>{hDate}</span>
        {hBtc != null && (
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
            BTC ${hBtc.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        )}
        {hVi1 != null && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>
            VI-1 {hVi1 >= 0 ? '+' : ''}{hVi1.toFixed(3)}
            <span style={{ color: '#f59e0b', marginLeft: 4, fontSize: 11 }}>{viZone(hVi1)}</span>
          </span>
        )}
        {hVi2 != null && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8' }}>
            VI-2 {hVi2 >= 0 ? '+' : ''}{hVi2.toFixed(3)}
            <span style={{ color: '#818cf8', marginLeft: 4, fontSize: 11 }}>{viZone(hVi2)}</span>
          </span>
        )}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 280, display: 'block', borderRadius: 8, cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
      />

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b7280' }}>
          <span style={{ display: 'inline-block', width: 16, height: 2, background: '#f59e0b', borderRadius: 2 }} />
          Short-term VI-1
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b7280' }}>
          <span style={{ display: 'inline-block', width: 16, height: 2, background: '#818cf8', borderRadius: 2 }} />
          Full-cycle VI-2
        </span>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
          Zones: <span style={{ color: '#059669' }}>deep value &lt;−2</span> · <span style={{ color: '#f59e0b' }}>neutral −1 to +1</span> · <span style={{ color: '#dc2626' }}>overbought &gt;+2</span>
        </span>
      </div>
    </div>
  )
}

// ── Gauge bar for current reading ─────────────────────────────────────────────
function GaugeRow({ label, signal, color }) {
  const v = signal?.value != null ? parseFloat(signal.value) : null
  const pct = v != null ? Math.min(100, Math.max(0, ((v + 3) / 6) * 100)) : 50
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ ...LBL, width: 120, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: '#e5e7eb', borderRadius: 9999, position: 'relative', overflow: 'visible' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '16.66%', background: 'rgba(5,150,105,.25)', borderRadius: '9999px 0 0 9999px' }} />
        <div style={{ position: 'absolute', left: '16.66%', top: 0, height: '100%', width: '16.66%', background: 'rgba(16,185,129,.15)' }} />
        <div style={{ position: 'absolute', left: '33.33%', top: 0, height: '100%', width: '33.33%', background: 'rgba(245,158,11,.08)' }} />
        <div style={{ position: 'absolute', left: '66.66%', top: 0, height: '100%', width: '16.66%', background: 'rgba(249,115,22,.15)' }} />
        <div style={{ position: 'absolute', left: '83.33%', top: 0, height: '100%', width: '16.66%', background: 'rgba(220,38,38,.25)', borderRadius: '0 9999px 9999px 0' }} />
        {v != null && (
          <div style={{ position: 'absolute', top: -3, left: `${pct}%`, width: 10, height: 10, borderRadius: '50%', background: color, border: '2px solid #fff', transform: 'translateX(-50%)', boxShadow: `0 0 0 1px ${color}` }} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 160, flexShrink: 0, justifyContent: 'flex-end' }}>
        {v != null ? (
          <>
            <span style={{ fontSize: 15, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
              {v >= 0 ? '+' : ''}{v.toFixed(3)}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, color,
              background: color + '18', border: `1px solid ${color}40`,
              borderRadius: 20, padding: '2px 8px',
            }}>{viZone(v)}</span>
          </>
        ) : (
          <span style={{ ...LBL, color: '#d1d5db' }}>—</span>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ValuationIndex() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/signals?history=true')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ ...LBL, color: '#d1d5db', padding: '1rem 0' }}>Loading…</div>

  const vi      = data?.vi  ?? null
  const vi2     = data?.vi2 ?? null
  const viHist  = (data?.viDaily  ?? []).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const vi2Hist = (data?.vi2Daily ?? []).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const btcHist = (data?.history?.btc ?? []).filter(p => p.date && p.price)

  return (
    <div>
      {/* Current readings — compact gauge row */}
      <div style={{ marginBottom: '1rem' }}>
        <GaugeRow label="Short-term VI-1" signal={vi}  color="#f59e0b" />
        <GaugeRow label="Full-cycle VI-2"  signal={vi2} color="#818cf8" />
      </div>

      {/* Combined time series chart */}
      <CombinedChart
        btcHistory={btcHist}
        vi1History={viHist}
        vi2History={vi2Hist}
      />

      {/* Data note */}
      {viHist.length < 14 && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af' }}>
          {viHist.length} days of VI history · chart fills automatically each night at 00:05 UTC
        </div>
      )}
    </div>
  )
}
