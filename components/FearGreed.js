'use client'
import { useEffect, useState, useCallback } from 'react'
import SectionHeader from './SectionHeader'

const ZONES = [
  { max: 25,  label: 'Extreme Fear', color: '#ef4444' },
  { max: 45,  label: 'Fear',         color: '#f97316' },
  { max: 55,  label: 'Neutral',      color: '#eab308' },
  { max: 75,  label: 'Greed',        color: '#84cc16' },
  { max: 100, label: 'Extreme Greed',color: '#22c55e' },
]

function getZone(v) {
  return ZONES.find(z => v <= z.max) ?? ZONES[ZONES.length - 1]
}

// SVG line chart — pure, no dependencies
function LineChart({ points }) {
  if (!points?.length) return null

  const W = 600, H = 120, PAD = { top: 10, right: 8, bottom: 24, left: 28 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const minV = 0, maxV = 100
  const xStep = iW / (points.length - 1)

  const toX = i => PAD.left + i * xStep
  const toY = v => PAD.top + iH - ((v - minV) / (maxV - minV)) * iH

  // Build gradient fill path
  const linePts = points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ')
  const fillPath = `M${toX(0)},${toY(points[0].value)} ` +
    points.map((p, i) => `L${toX(i)},${toY(p.value)}`).join(' ') +
    ` L${toX(points.length - 1)},${PAD.top + iH} L${toX(0)},${PAD.top + iH} Z`

  // Y gridlines at 25, 50, 75
  const gridLines = [25, 50, 75]

  // X axis labels — show ~6 evenly spaced dates
  const labelCount = 6
  const labelIdxs = Array.from({ length: labelCount }, (_, i) =>
    Math.round(i * (points.length - 1) / (labelCount - 1))
  )

  const fmtDate = ts => {
    const d = new Date(ts)
    return `${d.getDate()}/${d.getMonth() + 1}`
  }

  // Colour the line segments by zone
  const segmentPaths = points.slice(1).map((p, i) => {
    const prev = points[i]
    const zone = getZone(p.value)
    return { x1: toX(i), y1: toY(prev.value), x2: toX(i + 1), y2: toY(p.value), color: zone.color }
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }}>
      <defs>
        <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7931a" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#f7931a" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {gridLines.map(v => (
        <g key={v}>
          <line
            x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
            stroke="#1e1e1e" strokeWidth="1"
          />
          <text x={PAD.left - 4} y={toY(v) + 4} textAnchor="end"
            fill="#333" fontSize="8" fontFamily="monospace">
            {v}
          </text>
        </g>
      ))}

      {/* Fill */}
      <path d={fillPath} fill="url(#fillGrad)" />

      {/* Coloured line segments */}
      {segmentPaths.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
          stroke={s.color} strokeWidth="1.5" strokeLinecap="round" />
      ))}

      {/* X axis date labels */}
      {labelIdxs.map(i => (
        <text key={i} x={toX(i)} y={H - 4} textAnchor="middle"
          fill="#333" fontSize="8" fontFamily="monospace">
          {fmtDate(points[i].ts)}
        </text>
      ))}

      {/* Today's dot */}
      {(() => {
        const last = points[points.length - 1]
        const zone = getZone(last.value)
        return (
          <circle cx={toX(points.length - 1)} cy={toY(last.value)}
            r="3" fill={zone.color} />
        )
      })()}
    </svg>
  )
}

export default function FearGreed() {
  const [points, setPoints]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const res  = await fetch('/api/feargreed', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setPoints(json.data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60 * 60 * 1000) // hourly — F&G updates once/day
    return () => clearInterval(interval)
  }, [fetchData])

  const today = points[points.length - 1]
  const zone  = today ? getZone(today.value) : null

  // 7d and 30d ago values for quick reference
  const val7d  = points[points.length - 8]
  const val30d = points[points.length - 31]

  return (
    <div className="mt-10">
      <SectionHeader label="Fear & Greed" />

      {loading && (
        <div className="text-[#555] text-xs tracking-widest py-4">
          LOADING<span className="cursor" />
        </div>
      )}

      {error && <div className="text-red-500 text-xs py-2">ERR: {error}</div>}

      {!loading && !error && today && (
        <div className="border border-[#1e1e1e] bg-[#0d0d0d] p-5 rounded-sm">
          {/* Top row: big number + zone label + historical snapshots */}
          <div className="flex items-start gap-8 mb-6">
            {/* Today */}
            <div>
              <div className="text-[10px] text-[#444] tracking-widest mb-1">TODAY</div>
              <div className="flex items-end gap-3">
                <span className="text-5xl font-bold font-mono tabular-nums"
                  style={{ color: zone.color }}>
                  {today.value}
                </span>
                <span className="text-sm mb-1 tracking-wider" style={{ color: zone.color }}>
                  {zone.label.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px self-stretch bg-[#1e1e1e]" />

            {/* 7D ago */}
            {val7d && (() => {
              const z = getZone(val7d.value)
              return (
                <div>
                  <div className="text-[10px] text-[#444] tracking-widest mb-1">7D AGO</div>
                  <div className="text-2xl font-mono tabular-nums" style={{ color: z.color }}>
                    {val7d.value}
                  </div>
                  <div className="text-[10px] tracking-wider mt-0.5" style={{ color: z.color }}>
                    {z.label.toUpperCase()}
                  </div>
                </div>
              )
            })()}

            {/* 30D ago */}
            {val30d && (() => {
              const z = getZone(val30d.value)
              return (
                <div>
                  <div className="text-[10px] text-[#444] tracking-widest mb-1">30D AGO</div>
                  <div className="text-2xl font-mono tabular-nums" style={{ color: z.color }}>
                    {val30d.value}
                  </div>
                  <div className="text-[10px] tracking-wider mt-0.5" style={{ color: z.color }}>
                    {z.label.toUpperCase()}
                  </div>
                </div>
              )
            })()}

            {/* Zone legend */}
            <div className="ml-auto hidden sm:flex flex-col gap-1 justify-center">
              {ZONES.map(z => (
                <div key={z.label} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: z.color }} />
                  <span className="text-[9px] text-[#444] tracking-wider">{z.label.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 90-day chart */}
          <div>
            <div className="text-[10px] text-[#333] tracking-widest mb-2">90D HISTORY</div>
            <LineChart points={points} />
          </div>
        </div>
      )}
    </div>
  )
}
