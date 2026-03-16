'use client'
import { useEffect, useRef, useState } from 'react'
import SectionHeader from './SectionHeader'

const COLORS = {
  bg:         '#0a0a0a',
  grid:       '#1a1a1a',
  zeroline:   '#333',
  price:      '#f7931a',
  longBar:    '#22c55e',
  shortBar:   '#ef4444',
  nullBar:    '#2a2a2a',
  text:       '#555',
  textBright: '#888',
  tooltip:    '#111',
  funding_ok: '#1a3a1a',
}

function drawChart(canvas, days, hoveredIdx) {
  if (!canvas || !days.length) return
  const dpr = window.devicePixelRatio || 1
  const W   = canvas.offsetWidth
  const H   = canvas.offsetHeight
  canvas.width  = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const PAD  = { top: 20, right: 60, bottom: 36, left: 14 }
  const cW   = W - PAD.left - PAD.right
  const cH   = H - PAD.top  - PAD.bottom

  // Split canvas: top 55% for price, bottom 45% for histogram
  const priceH = Math.floor(cH * 0.55)
  const histH  = cH - priceH - 12  // 12px gap
  const histY0 = PAD.top + priceH + 12  // top of histogram area
  const zeroY  = histY0 + histH / 2     // zero line

  ctx.clearRect(0, 0, W, H)

  const n    = days.length
  const barW = Math.max(2, (cW / n) - 1)
  const step = cW / n

  // ── Price line ────────────────────────────────────────────────────────────
  const prices   = days.map(d => d.price)
  const minPrice = Math.min(...prices) * 0.995
  const maxPrice = Math.max(...prices) * 1.005
  const pScale   = p => PAD.top + priceH - ((p - minPrice) / (maxPrice - minPrice)) * priceH

  // Price grid lines
  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth   = 0.5
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (priceH / 4) * i
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke()
  }

  // Price labels (right axis)
  const priceSteps = 5
  for (let i = 0; i <= priceSteps; i++) {
    const val = minPrice + ((maxPrice - minPrice) / priceSteps) * i
    const y   = pScale(val)
    ctx.fillStyle  = COLORS.text
    ctx.font       = '10px monospace'
    ctx.textAlign  = 'left'
    ctx.fillText(`$${Math.round(val / 1000)}k`, W - PAD.right + 4, y + 3)
  }

  // Shade funding-unavailable region (older than 66 days)
  const firstFundingIdx = days.findIndex(d => d.fundingAvail)
  if (firstFundingIdx > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.015)'
    ctx.fillRect(PAD.left, PAD.top, firstFundingIdx * step, priceH)
    ctx.fillStyle = COLORS.text
    ctx.font      = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('FUNDING N/A', PAD.left + (firstFundingIdx * step) / 2, PAD.top + priceH - 6)
  }

  // Price line
  ctx.beginPath()
  ctx.strokeStyle = COLORS.price
  ctx.lineWidth   = 1.5
  days.forEach((d, i) => {
    const x = PAD.left + i * step + step / 2
    const y = pScale(d.price)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()

  // ── Histogram ─────────────────────────────────────────────────────────────
  const maxScore = 3  // max possible (funding + F&G + 24h change)
  const barScale = (histH / 2) / maxScore

  // Zero line
  ctx.strokeStyle = COLORS.zeroline
  ctx.lineWidth   = 1
  ctx.beginPath(); ctx.moveTo(PAD.left, zeroY); ctx.lineTo(W - PAD.right, zeroY); ctx.stroke()

  // Score labels
  ctx.fillStyle = COLORS.text
  ctx.font      = '9px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('+3', W - PAD.right + 4, histY0 + 9)
  ctx.fillText(' 0', W - PAD.right + 4, zeroY + 3)
  ctx.fillText('−3', W - PAD.right + 4, histY0 + histH - 3)

  // Histogram bars
  days.forEach((d, i) => {
    const x        = PAD.left + i * step
    const isHov    = i === hoveredIdx
    const alpha    = isHov ? 'ff' : 'cc'

    if (d.longScore > 0) {
      const barH = d.longScore * barScale
      ctx.fillStyle = COLORS.longBar + alpha
      ctx.fillRect(x + 0.5, zeroY - barH, barW, barH)
    }
    if (d.shortScore > 0) {
      const barH = d.shortScore * barScale
      ctx.fillStyle = COLORS.shortBar + alpha
      ctx.fillRect(x + 0.5, zeroY, barW, barH)
    }
    if (d.longScore === 0 && d.shortScore === 0) {
      ctx.fillStyle = COLORS.nullBar
      ctx.fillRect(x + 0.5, zeroY - 1, barW, 2)
    }
  })

  // ── X axis date labels ────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.text
  ctx.font      = '9px monospace'
  ctx.textAlign = 'center'
  const labelEvery = Math.ceil(n / 10)
  days.forEach((d, i) => {
    if (i % labelEvery === 0 || i === n - 1) {
      const x     = PAD.left + i * step + step / 2
      const label = d.date.slice(5)  // MM-DD
      ctx.fillText(label, x, H - PAD.bottom + 14)
    }
  })

  // Hover crosshair
  if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < n) {
    const x = PAD.left + hoveredIdx * step + step / 2
    ctx.strokeStyle = '#444'
    ctx.lineWidth   = 0.5
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke()
    ctx.setLineDash([])

    // Dot on price line
    const py = pScale(days[hoveredIdx].price)
    ctx.beginPath()
    ctx.arc(x, py, 3, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.price
    ctx.fill()
  }
}

export default function ChecklistBacktest() {
  const canvasRef  = useRef(null)
  const [days,     setDays]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [hovered,  setHovered]  = useState(null)
  const hoveredDay = hovered !== null ? days[hovered] : null

  useEffect(() => {
    fetch('/api/checklist-backtest').then(r => r.json()).then(d => {
      if (d.ok) setDays(d.days)
      else setError(d.error)
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!days.length) return
    const canvas = canvasRef.current
    if (!canvas) return
    drawChart(canvas, days, hovered)

    const handleResize = () => drawChart(canvas, days, hovered)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [days, hovered])

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas || !days.length) return
    const rect = canvas.getBoundingClientRect()
    const x    = e.clientX - rect.left
    const PAD_LEFT  = 14
    const PAD_RIGHT = 60
    const cW   = canvas.offsetWidth - PAD_LEFT - PAD_RIGHT
    const step = cW / days.length
    const idx  = Math.floor((x - PAD_LEFT) / step)
    setHovered(idx >= 0 && idx < days.length ? idx : null)
  }

  const biasLabel = (d) => {
    if (!d) return null
    if (d.longScore > d.shortScore) return { text: `LONG ${d.longScore}/${d.total}`, color: '#22c55e' }
    if (d.shortScore > d.longScore) return { text: `SHORT ${d.shortScore}/${d.total}`, color: '#ef4444' }
    return { text: `NEUTRAL`, color: '#eab308' }
  }
  const bias = biasLabel(hoveredDay)

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-1">
        <SectionHeader label="Checklist Backtest — 100 Days" />
        <span className="text-[10px] text-[#333] tracking-widest mb-4">4/6 SIGNALS · L/S + OI EXCLUDED</span>
      </div>

      <div className="text-[10px] text-[#444] tracking-wider mb-4">
        GREEN = long conditions met · RED = short conditions met · SIGNALS: funding rate · fear &amp; greed · 24h change
      </div>

      {loading && <div className="text-[#555] text-xs tracking-widest py-8 text-center">LOADING 100 DAYS...</div>}
      {error   && <div className="text-red-500 text-xs py-2">ERR: {error}</div>}

      {!loading && !error && days.length > 0 && (
        <div className="border border-[#1a1a1a] rounded-sm overflow-hidden bg-[#0a0a0a]">
          {/* Tooltip bar */}
          <div className="flex items-center gap-6 px-5 py-2.5 border-b border-[#111] min-h-[40px]">
            {hoveredDay ? (
              <>
                <span className="text-[10px] font-mono text-[#555]">{hoveredDay.date}</span>
                <span className="text-[10px] font-mono text-[#f7931a]">${hoveredDay.price.toLocaleString()}</span>
                <span className="text-[10px] font-mono" style={{ color: hoveredDay.change24h >= 0 ? '#22c55e' : '#ef4444' }}>
                  {hoveredDay.change24h >= 0 ? '+' : ''}{hoveredDay.change24h}%
                </span>
                {hoveredDay.fg !== null && (
                  <span className="text-[10px] font-mono text-[#555]">F&G {hoveredDay.fg}</span>
                )}
                {hoveredDay.frPct !== null && (
                  <span className="text-[10px] font-mono text-[#555]">FR {hoveredDay.frPct >= 0 ? '+' : ''}{hoveredDay.frPct.toFixed(4)}%</span>
                )}
                {bias && (
                  <span className="text-[10px] font-mono font-bold ml-auto" style={{ color: bias.color }}>{bias.text}</span>
                )}
              </>
            ) : (
              <span className="text-[10px] text-[#333] tracking-widest">HOVER TO INSPECT DAY</span>
            )}
          </div>

          {/* Canvas */}
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '320px', display: 'block', cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHovered(null)}
          />

          {/* Legend */}
          <div className="flex items-center gap-6 px-5 py-2.5 border-t border-[#111]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#f7931a] inline-block" />
              <span className="text-[10px] text-[#444]">BTC price</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#22c55e] inline-block" />
              <span className="text-[10px] text-[#444]">Long conditions (above 0)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444] inline-block" />
              <span className="text-[10px] text-[#444]">Short conditions (below 0)</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] text-[#333]">Shaded region = funding rate unavailable (pre-66d)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
