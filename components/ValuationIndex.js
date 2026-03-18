'use client'
import { useEffect, useRef, useState } from 'react'

const LBL  = { fontFamily: 'monospace', fontSize: 11, fontWeight: 400, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase' }
const BASE = { fontFamily: 'monospace', fontSize: 18, fontWeight: 700 }
const DIM  = { fontFamily: 'monospace', fontSize: 12, color: '#333' }

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

  ctx.strokeStyle = '#222'; ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(PAD.left, vY(0)); ctx.lineTo(W - PAD.right, vY(0)); ctx.stroke()

  const values = history.map(d => parseFloat(d.value))

  ctx.beginPath()
  ctx.moveTo(PAD.left + step / 2, vY(0))
  values.forEach((v, i) => ctx.lineTo(PAD.left + i * step + step / 2, vY(Math.max(0, v))))
  ctx.lineTo(PAD.left + (n - 1) * step + step / 2, vY(0))
  ctx.closePath()
  ctx.fillStyle = '#ef444414'; ctx.fill()

  ctx.beginPath()
  ctx.moveTo(PAD.left + step / 2, vY(0))
  values.forEach((v, i) => ctx.lineTo(PAD.left + i * step + step / 2, vY(Math.min(0, v))))
  ctx.lineTo(PAD.left + (n - 1) * step + step / 2, vY(0))
  ctx.closePath()
  ctx.fillStyle = '#22c55e14'; ctx.fill()

  for (let i = 1; i < n; i++) {
    ctx.beginPath()
    ctx.moveTo(PAD.left + (i - 1) * step + step / 2, vY(values[i - 1]))
    ctx.lineTo(PAD.left + i * step + step / 2, vY(values[i]))
    ctx.strokeStyle = getColor(values[i]); ctx.lineWidth = 1.2; ctx.stroke()
  }

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

  if (loading) return <div style={{ ...DIM, padding: '8px 0' }}>LOADING...</div>

  if (!current && !history.length) return (
    <div>
      <div style={{ ...LBL, marginBottom: 6 }}>{label}</div>
      <div style={{ ...DIM }}>AWAITING FIRST WEBHOOK</div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ ...LBL }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {displayVal !== null && (
            <>
              <span style={{ ...BASE, fontSize: 16, color: getColor(displayVal) }}>
                {displayVal >= 0 ? '+' : ''}{displayVal.toFixed(3)}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', color: getColor(displayVal) }}>
                {getZoneLabel(displayVal)}
              </span>
            </>
          )}
          {displayDate && <span style={{ ...DIM }}>{displayDate}</span>}
        </div>
      </div>

      {displayVal !== null && (
        <div style={{ position: 'relative', height: 3, marginBottom: 8, borderRadius: 9999, overflow: 'hidden', background: '#1a1a1a' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {[['#16a34a20','16.66%'],['#22c55e16','16.66%'],['#33333312','33.33%'],['#f9731616','16.66%'],['#ef444420','16.66%']].map(([bg, w], i) => (
              <div key={i} style={{ width: w, height: '100%', background: bg }} />
            ))}
          </div>
          <div style={{
            position: 'absolute', top: 0, width: 3, height: '100%', borderRadius: 9999,
            left: `${Math.min(100, Math.max(0, ((displayVal + 3) / 6) * 100))}%`,
            background: getColor(displayVal), boxShadow: `0 0 4px ${getColor(displayVal)}`,
          }} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        {[-3, -2, -1, 0, 1, 2, 3].map(v => (
          <span key={v} style={{ fontFamily: 'monospace', fontSize: 10, color: getColor(v) }}>
            {v > 0 ? '+' + v : v}
          </span>
        ))}
      </div>

      {history.length > 1 && (
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 52, display: 'block', cursor: 'crosshair' }}
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
        <div style={{ ...DIM, letterSpacing: '0.08em' }}>HISTORY BUILDS FROM NEXT DAILY CLOSE</div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ValuationPanel label="Short-term BTC valuation" current={vi}  history={viHist}  loading={loading} />
      <div style={{ borderTop: '1px solid #111' }} />
      <ValuationPanel label="Full-cycle BTC valuation"  current={vi2} history={vi2Hist} loading={loading} />
    </div>
  )
}
