'use client'
import { useEffect, useState } from 'react'

const ETF_ORDER = ['SMH', 'NLR', 'DTCR', 'IGV', 'BOTZ']

const DS = {
  label: { fontFamily: 'monospace', fontSize: 11, fontWeight: 400, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase' },
  card:  { background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8 },
  inner: { background: '#111', borderRadius: 6 },
}

function chgColor(v) {
  if (v == null || Math.abs(v) < 0.01) return '#555'
  return v > 0 ? '#22c55e' : '#ef4444'
}

function Chg({ v, dim }) {
  if (v == null) return <span style={{ color: '#333', fontFamily: 'monospace', fontSize: dim ? 12 : 14, fontWeight: 700 }}>—</span>
  const color = chgColor(v)
  return (
    <span style={{ color, fontFamily: 'monospace', fontSize: dim ? 12 : 14, fontWeight: 700 }}>
      {v >= 0 ? '+' : ''}{v.toFixed(2)}%
    </span>
  )
}

function Sparkline({ data, color, width = 120, height = 36 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  // fill under line
  const first = `0,${height}`
  const last  = `${width},${height}`
  const fillPts = `${first} ${pts} ${last}`
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polygon points={fillPts} fill={color + '18'} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function ETFRow({ symbol, d }) {
  if (!d) return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #111' }}>
      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#333', width: 52 }}>{symbol}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#222' }}>—</span>
    </div>
  )

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '52px 1fr 72px 72px 130px',
      alignItems: 'center',
      padding: '10px 14px',
      borderBottom: '1px solid #0f0f0f',
      gap: 8,
    }}>
      {/* Ticker + name */}
      <div>
        <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: d.color }}>{symbol}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#444', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
      </div>

      {/* Price */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#e8e8e8' }}>
          ${d.price?.toFixed(2)}
        </div>
      </div>

      {/* 10D / 30D */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ marginBottom: 2 }}><Chg v={d.change10d} /></div>
        <div><Chg v={d.change30d} dim /></div>
      </div>

      {/* Sparkline */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Sparkline data={d.spark} color={d.color} width={120} height={34} />
      </div>
    </div>
  )
}

export default function AiHedgePortfolio() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/etf-portfolio')
      .then(r => r.json())
      .then(j => { setData(j.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#e8e8e8' }}>
          AI Hedge Portfolio
        </span>
        <div style={{ display: 'flex', gap: 16 }}>
          <span style={{ ...DS.label, fontSize: 10 }}>10D</span>
          <span style={{ ...DS.label, fontSize: 10 }}>30D</span>
          <span style={{ ...DS.label, fontSize: 10, marginRight: 4 }}>30D chart</span>
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '52px 1fr 72px 72px 130px',
        padding: '0 14px 6px',
        gap: 8,
        borderBottom: '1px solid #1a1a1a',
        marginBottom: 2,
      }}>
        <span style={DS.label}>Ticker</span>
        <span style={DS.label}>Fund</span>
        <span style={{ ...DS.label, textAlign: 'right' }}>Price</span>
        <span style={{ ...DS.label, textAlign: 'right' }}>Chg</span>
        <span style={{ ...DS.label, textAlign: 'right' }}>Trend</span>
      </div>

      {/* Rows */}
      <div style={{ ...DS.inner }}>
        {loading ? (
          <div style={{ padding: '20px 14px', fontFamily: 'monospace', fontSize: 12, color: '#333' }}>Loading…</div>
        ) : (
          ETF_ORDER.map(sym => (
            <ETFRow key={sym} symbol={sym} d={data?.[sym]} />
          ))
        )}
      </div>
    </div>
  )
}
