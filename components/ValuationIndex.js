'use client'
import { useEffect, useRef, useState } from 'react'

// Polarity: -3 = oversold (green, great to DCA) · +3 = overbought (red, poor value)
// Shared by both Short-term (VI) and Full-cycle (VI-2)

function getColor(v) {
  if (v >=  2) return '#ef4444'
  if (v >=  1) return '#f97316'
  if (v > -1)  return '#555555'
  if (v > -2)  return '#22c55e'
  return '#16a34a'
}

function getZoneLabel(v) {
  if (v >=  2) return 'OVERBOUGHT'
  if (v >=  1) return 'ELEVATED'
  if (v > -1)  return 'NEUTRAL'
  if (v > -2)  return 'VALUE'
  return 'DEEP VALUE'
}

function drawChart(canvas, history, hoveredIdx) {
  if (!canvas || history.length < 2) return
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
  const vY = v => PAD.top + cH - ((v + 3) / 6) * cH

  // Zone bands
  const bands = [
    { min: -3, max: -2, color: '#16a34a0c' },
    { min: -2, max: -1, color: '#22c55e08' },
    { min:  1, max:  2, color: '#f9731608' },
    { min:  2, max:  3, color: '#ef44440c' },
  ]
  for (const b of bands) {
    ctx.fillStyle = b.color
    ctx.fillRect(PAD.left, vY(b.max), cW, vY(b.min) - vY(b.max))
  }

  // Zero line
  ctx.strokeStyle = '#222'; ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(PAD.left, vY(0)); ctx.lineTo(W - PAD.right, vY(0)); ctx.stroke()

  const values = history.map(d => parseFloat(d.value))

  // Positive fill
  ctx.beginPath()
  ctx.moveTo(PAD.left + step / 2, vY(0))
  values.forEach((v, i) => ctx.lineTo(PAD.left + i * step + step / 2, vY(Math.max(0, v))))
  ctx.lineTo(PAD.left + (n - 1) * step + step / 2, vY(0))
  ctx.closePath()
  ctx.fillStyle = '#ef444414'; ctx.fill()

  // Negative fill
  ctx.beginPath()
  ctx.moveTo(PAD.left + step / 2, vY(0))
  values.forEach((v, i) => ctx.lineTo(PAD.left + i * step + step / 2, vY(Math.min(0, v))))
  ctx.lineTo(PAD.left + (n - 1) * step + step / 2, vY(0))
  ctx.closePath()
  ctx.fillStyle = '#22c55e14'; ctx.fill()

  // Colour-coded line
  for (let i = 1; i < n; i++) {
    ctx.beginPath()
    ctx.moveTo(PAD.left + (i - 1) * step + step / 2, vY(values[i - 1]))
    ctx.lineTo(PAD.left + i * step + step / 2, vY(values[i]))
    ctx.strokeStyle = getColor(values[i]); ctx.lineWidth = 1.2; ctx.stroke()
  }

  // Hover
  if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < n) {
    const x = PAD.left + hoveredIdx * step + step / 2
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 0.5; ctx.setLineDash([2, 2])
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath(); ctx.arc(x, vY(values[hoveredIdx]), 2.5, 0, Math.PI * 2)
    ctx.fillStyle = getColor(values[hoveredIdx]); ctx.fill()
  }
}

function ValuationPanel({ label, current, history, loading }) {
  const [hovered, setHovered] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !history.length) return
    drawChart(canvas, history, hovered)
    const onResize = () => drawChart(canvas, history, hovered)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [history, hovered])

  const hoveredEntry = hovered !== null ? history[hovered] : null
  const displayVal = hoveredEntry?.value != null ? parseFloat(hoveredEntry.value)
    : current?.value != null ? parseFloat(current.value) : null
  const displayDate = hoveredEntry?.date ?? current?.date ?? null

  if (loading) return (
    <div className="text-[9px] text-[#2a2a2a] tracking-widest py-2">LOADING...</div>
  )

  if (!current && !history.length) return (
    <div>
      <div className="text-[9px] text-[#333] tracking-widest mb-1 uppercase">{label}</div>
      <div className="text-[9px] text-[#2a2a2a] tracking-widest">AWAITING FIRST WEBHOOK</div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] text-[#333] tracking-widest font-mono uppercase">{label}</span>
        <div className="flex items-center gap-2.5">
          {displayVal !== null && (
            <>
              <span className="text-[12px] font-mono font-bold tabular-nums"
                style={{ color: getColor(displayVal) }}>
                {displayVal >= 0 ? '+' : ''}{displayVal.toFixed(3)}
              </span>
              <span className="text-[9px] tracking-widest font-mono"
                style={{ color: getColor(displayVal) }}>
                {getZoneLabel(displayVal)}
              </span>
            </>
          )}
          {displayDate && (
            <span className="text-[9px] text-[#2a2a2a] font-mono">{displayDate}</span>
          )}
        </div>
      </div>

      {/* Gauge bar */}
      {displayVal !== null && (
        <div className="relative h-[2px] mb-2 rounded-full overflow-hidden" style={{ background: '#1a1a1a' }}>
          <div className="absolute inset-y-0" style={{ left: '0%',     width: '16.66%', background: '#16a34a20' }} />
          <div className="absolute inset-y-0" style={{ left: '16.66%', width: '16.66%', background: '#22c55e16' }} />
          <div className="absolute inset-y-0" style={{ left: '33.33%', width: '33.33%', background: '#33333312' }} />
          <div className="absolute inset-y-0" style={{ left: '66.66%', width: '16.66%', background: '#f9731616' }} />
          <div className="absolute inset-y-0" style={{ left: '83.33%', width: '16.66%', background: '#ef444420' }} />
          <div className="absolute top-0 w-[2px] h-full rounded-full"
            style={{
              left: `${Math.min(100, Math.max(0, ((displayVal + 3) / 6) * 100))}%`,
              background: getColor(displayVal),
              boxShadow: `0 0 3px ${getColor(displayVal)}`,
            }}
          />
        </div>
      )}

      {/* Scale */}
      <div className="flex justify-between mb-1.5">
        {[-3, -2, -1, 0, 1, 2, 3].map(v => (
          <span key={v} className="text-[8px] font-mono" style={{ color: getColor(v) }}>
            {v > 0 ? '+' + v : v}
          </span>
        ))}
      </div>

      {/* History chart */}
      {history.length > 1 && (
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '52px', display: 'block', cursor: 'crosshair' }}
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

      {history.length <= 1 && current && (
        <div className="text-[8px] text-[#222] tracking-widest">
          HISTORY BUILDS FROM NEXT DAILY CLOSE
        </div>
      )}
    </div>
  )
}

export default function ValuationIndex() {
  const [vi,      setVi]      = useState(null)
  const [vi2,     setVi2]     = useState(null)
  const [viHist,  setViHist]  = useState([])
  const [vi2Hist, setVi2Hist] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/signals?history=true')
      .then(r => r.json())
      .then(d => {
        setVi(d.vi ?? null)
        setVi2(d.vi2 ?? null)
        const sort = arr => (Array.isArray(arr) ? arr : []).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
        setViHist(sort(d.viDaily))
        setVi2Hist(sort(d.vi2Daily))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <ValuationPanel label="Short-term BTC valuation" current={vi}  history={viHist}  loading={loading} />
      <div style={{ borderTop: '1px solid #111' }} />
      <ValuationPanel label="Full-cycle BTC valuation"  current={vi2} history={vi2Hist} loading={loading} />
    </div>
  )
}
