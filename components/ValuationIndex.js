'use client'
import { useEffect, useRef, useState } from 'react'

// VI range: -3 (oversold/peak value) to +3 (overbought/overheating)
// Zones:
//   ≤ -2.0  → deep green  (strong buy zone)
//   -2 to -1 → green
//   -1 to +1 → grey (neutral)
//   +1 to +2 → amber
//   ≥ +2.0  → red (overbought)

const ZONE_COLORS = [
  { min: -3,   max: -2,   long: '#16a34a', label: 'DEEP VALUE'  },
  { min: -2,   max: -1,   long: '#22c55e', label: 'VALUE'       },
  { min: -1,   max:  1,   long: '#555',    label: 'NEUTRAL'     },
  { min:  1,   max:  2,   long: '#f97316', label: 'ELEVATED'    },
  { min:  2,   max:  3,   long: '#ef4444', label: 'OVERBOUGHT'  },
]

function getZone(v) {
  return ZONE_COLORS.find(z => v >= z.min && v <= z.max) || ZONE_COLORS[2]
}

function getColor(v) {
  if (v <= -2) return '#16a34a'
  if (v <= -1) return '#22c55e'
  if (v <   1) return '#555555'
  if (v <   2) return '#f97316'
  return '#ef4444'
}

export default function ValuationIndex() {
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [hovered, setHovered] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    fetch('/api/signals?history=true')
      .then(r => r.json())
      .then(d => {
        setCurrent(d.vi ?? null)
        const hist = Array.isArray(d.viDaily) ? d.viDaily : []
        setHistory(hist.sort((a, b) => a.date?.localeCompare(b.date)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Draw oscillator canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !history.length) return
    draw(canvas, history, hovered)
    const onResize = () => draw(canvas, history, hovered)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [history, hovered])

  const hoveredEntry = hovered !== null ? history[hovered] : null
  const displayVal = hoveredEntry?.value ?? current?.value ?? null
  const zone = displayVal !== null ? getZone(displayVal) : null

  if (loading) return (
    <div className="text-[10px] text-[#333] tracking-widest py-3">VI LOADING...</div>
  )

  if (!current && !history.length) return (
    <div className="text-[10px] text-[#2a2a2a] tracking-widest py-3">
      VI · AWAITING FIRST WEBHOOK
    </div>
  )

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[#333] tracking-widest font-mono">VALUATION INDEX</span>
        <div className="flex items-center gap-3">
          {displayVal !== null && (
            <>
              <span
                className="text-[13px] font-mono font-bold tabular-nums"
                style={{ color: getColor(displayVal) }}
              >
                {displayVal >= 0 ? '+' : ''}{displayVal.toFixed(3)}
              </span>
              <span
                className="text-[10px] tracking-widest font-mono"
                style={{ color: getColor(displayVal) }}
              >
                {zone?.label}
              </span>
            </>
          )}
          {current?.date && !hoveredEntry && (
            <span className="text-[10px] text-[#333] font-mono">{current.date}</span>
          )}
          {hoveredEntry?.date && (
            <span className="text-[10px] text-[#444] font-mono">{hoveredEntry.date}</span>
          )}
        </div>
      </div>

      {/* Gauge bar — current value position */}
      {displayVal !== null && (
        <div className="relative h-[3px] mb-3 rounded-full overflow-hidden" style={{ background: '#1a1a1a' }}>
          {/* Zone fills */}
          <div className="absolute inset-y-0" style={{ left: '0%',   width: '20%', background: '#16a34a22' }} />
          <div className="absolute inset-y-0" style={{ left: '20%',  width: '20%', background: '#22c55e18' }} />
          <div className="absolute inset-y-0" style={{ left: '40%',  width: '20%', background: '#33333318' }} />
          <div className="absolute inset-y-0" style={{ left: '60%',  width: '20%', background: '#f9731618' }} />
          <div className="absolute inset-y-0" style={{ left: '80%',  width: '20%', background: '#ef444422' }} />
          {/* Cursor */}
          <div
            className="absolute top-0 w-[2px] h-full rounded-full"
            style={{
              left: `${((displayVal + 3) / 6) * 100}%`,
              background: getColor(displayVal),
              boxShadow: `0 0 4px ${getColor(displayVal)}`,
            }}
          />
        </div>
      )}

      {/* Scale labels */}
      <div className="flex justify-between mb-2">
        {[-3, -2, -1, 0, 1, 2, 3].map(v => (
          <span key={v} className="text-[8px] font-mono" style={{ color: getColor(v) }}>
            {v > 0 ? `+${v}` : v}
          </span>
        ))}
      </div>

      {/* History chart */}
      {history.length > 1 && (
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '56px', display: 'block', cursor: 'crosshair' }}
          onMouseMove={e => {
            const canvas = canvasRef.current
            if (!canvas || !history.length) return
            const rect = canvas.getBoundingClientRect()
            const step = canvas.offsetWidth / history.length
            const idx = Math.floor((e.clientX - rect.left) / step)
            setHovered(idx >= 0 && idx < history.length ? idx : null)
          }}
          onMouseLeave={() => setHovered(null)}
        />
      )}

      {/* No history yet */}
      {history.length <= 1 && current && (
        <div className="text-[9px] text-[#2a2a2a] tracking-widest mt-1">
          HISTORY BUILDS FROM NEXT DAILY CLOSE
        </div>
      )}
    </div>
  )
}

function draw(canvas, history, hoveredIdx) {
  if (!canvas || !history.length) return
  const dpr = window.devicePixelRatio || 1
  const W = canvas.offsetWidth, H = canvas.offsetHeight
  canvas.width = W * dpr; canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const PAD = { left: 0, right: 0, top: 4, bottom: 4 }
  const cW = W - PAD.left - PAD.right
  const cH = H - PAD.top - PAD.bottom
  const n = history.length
  const step = cW / n

  // Value → Y: -3=bottom, +3=top
  const vY = v => PAD.top + cH - ((v + 3) / 6) * cH

  // Zero line
  ctx.strokeStyle = '#222'; ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(PAD.left, vY(0)); ctx.lineTo(W - PAD.right, vY(0)); ctx.stroke()

  // Zone band fills (subtle)
  const bands = [
    { min: -3, max: -2, color: '#16a34a0a' },
    { min: -2, max: -1, color: '#22c55e08' },
    { min:  1, max:  2, color: '#f9731608' },
    { min:  2, max:  3, color: '#ef44440a' },
  ]
  for (const b of bands) {
    ctx.fillStyle = b.color
    ctx.fillRect(PAD.left, vY(b.max), cW, vY(b.min) - vY(b.max))
  }

  // Draw filled area under/above zero
  const values = history.map(d => parseFloat(d.value))

  // Positive fill (above zero → red tint)
  ctx.beginPath()
  ctx.moveTo(PAD.left, vY(0))
  history.forEach((d, i) => {
    const x = PAD.left + i * step + step / 2
    const v = Math.max(0, parseFloat(d.value))
    i === 0 ? ctx.lineTo(x, vY(v)) : ctx.lineTo(x, vY(v))
  })
  ctx.lineTo(PAD.left + (n - 1) * step + step / 2, vY(0))
  ctx.closePath()
  ctx.fillStyle = '#ef444415'
  ctx.fill()

  // Negative fill (below zero → green tint)
  ctx.beginPath()
  ctx.moveTo(PAD.left, vY(0))
  history.forEach((d, i) => {
    const x = PAD.left + i * step + step / 2
    const v = Math.min(0, parseFloat(d.value))
    i === 0 ? ctx.lineTo(x, vY(v)) : ctx.lineTo(x, vY(v))
  })
  ctx.lineTo(PAD.left + (n - 1) * step + step / 2, vY(0))
  ctx.closePath()
  ctx.fillStyle = '#22c55e15'
  ctx.fill()

  // Main line — colour-coded per value
  for (let i = 1; i < n; i++) {
    const x0 = PAD.left + (i - 1) * step + step / 2
    const x1 = PAD.left + i * step + step / 2
    const v0 = values[i - 1], v1 = values[i]
    ctx.beginPath()
    ctx.moveTo(x0, vY(v0)); ctx.lineTo(x1, vY(v1))
    ctx.strokeStyle = getColor(v1)
    ctx.lineWidth = 1.2
    ctx.stroke()
  }

  // Hover crosshair + dot
  if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < n) {
    const x = PAD.left + hoveredIdx * step + step / 2
    const v = values[hoveredIdx]
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 0.5; ctx.setLineDash([2, 2])
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath(); ctx.arc(x, vY(v), 2.5, 0, Math.PI * 2)
    ctx.fillStyle = getColor(v); ctx.fill()
  }
}
