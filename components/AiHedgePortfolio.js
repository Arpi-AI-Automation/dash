'use client'
import { useEffect, useState } from 'react'

const ETF_ORDER = ['SMH', 'NLR', 'DTCR', 'IGV', 'BOTZ']

const ETF_META = {
  SMH:  { name: 'Semiconductors', color: '#818cf8' },
  NLR:  { name: 'Nuclear Energy',  color: '#34d399' },
  DTCR: { name: 'Data Centers',    color: '#fb923c' },
  IGV:  { name: 'Software',        color: '#60a5fa' },
  BOTZ: { name: 'Robotics & AI',   color: '#f472b6' },
}

const UP  = '#22c55e'
const DN  = '#ef4444'
const DIM = '#555'

function pct(v, size = 16) {
  if (v == null) return <span style={{ color: '#333', fontFamily: 'monospace', fontSize: size, fontWeight: 700 }}>—</span>
  const color = Math.abs(v) < 0.01 ? DIM : v > 0 ? UP : DN
  return (
    <span style={{ color, fontFamily: 'monospace', fontSize: size, fontWeight: 700 }}>
      {v >= 0 ? '+' : ''}{v.toFixed(2)}%
    </span>
  )
}

function TrendPill({ signal }) {
  if (!signal) return (
    <span style={{
      fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
      color: '#333', background: '#111', border: '1px solid #222',
      borderRadius: 4, padding: '3px 10px',
    }}>—</span>
  )
  const isLong = signal.state === 'LONG'
  const color  = isLong ? UP : DN
  return (
    <span style={{
      fontFamily: 'monospace', fontSize: 13, fontWeight: 800,
      color, background: color + '18', border: `1px solid ${color}66`,
      borderRadius: 4, padding: '3px 10px', letterSpacing: '0.05em',
    }}>
      {signal.state}
    </span>
  )
}

function RankBadge({ rank }) {
  if (!rank) return <span style={{ color: '#333', fontFamily: 'monospace', fontSize: 16, fontWeight: 700 }}>—</span>
  const colors = ['#f59e0b', '#94a3b8', '#b45309', '#666', '#444']
  return (
    <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: colors[rank - 1] ?? '#444' }}>
      #{rank}
    </span>
  )
}

function Sparkline({ data, color, width = 110, height = 38 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const fillPts = `0,${height} ${pts} ${width},${height}`
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polygon points={fillPts} fill={color + '15'} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

const LABEL = {
  fontFamily: 'monospace', fontSize: 11, fontWeight: 600,
  color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase',
}

// col widths: ticker | name | price | 30D | vsQQQ | DD | vol | rank | T1/T2 | spark
const COLS = '56px 110px 80px 80px 80px 64px 54px 48px 90px 115px'

function HeaderRow() {
  const cols = [
    { label: 'Ticker', align: 'left' },
    { label: 'Fund',   align: 'left' },
    { label: 'Price',  align: 'right' },
    { label: '30D',    align: 'right' },
    { label: 'vs QQQ', align: 'right' },
    { label: 'DD %',   align: 'right' },
    { label: 'Vol',    align: 'right' },
    { label: 'Rank',   align: 'center' },
    { label: 'T1 / T2', align: 'center' },
    { label: '30D Chart', align: 'right' },
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: COLS,
      padding: '0 18px 10px', gap: 8,
      borderBottom: '1px solid #1e1e1e',
    }}>
      {cols.map(c => (
        <div key={c.label} style={{ ...LABEL, textAlign: c.align }}>{c.label}</div>
      ))}
    </div>
  )
}

function ETFRow({ symbol, d, etfSignals, isLast }) {
  const t1 = etfSignals?.t1 ?? null
  const t2 = etfSignals?.t2 ?? null
  const meta = ETF_META[symbol]

  const rowStyle = {
    display: 'grid', gridTemplateColumns: COLS,
    alignItems: 'center',
    padding: '14px 18px',
    gap: 8,
    borderBottom: isLast ? 'none' : '1px solid #141414',
  }

  if (!d) return (
    <div style={rowStyle}>
      <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: meta?.color ?? '#555' }}>{symbol}</span>
      {Array(9).fill(0).map((_, i) => <span key={i} style={{ color: '#222', fontFamily: 'monospace' }}>—</span>)}
    </div>
  )

  const ddColor = d.drawdown == null ? DIM
    : d.drawdown > -5  ? '#94a3b8'
    : d.drawdown > -15 ? '#f59e0b'
    : DN

  const volColor = !d.volRatio ? DIM
    : d.volRatio >= 1.5 ? '#f59e0b'
    : d.volRatio >= 1.2 ? '#94a3b8'
    : '#555'

  return (
    <div style={rowStyle}>
      {/* Ticker */}
      <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: d.color }}>
        {symbol}
      </div>

      {/* Fund name */}
      <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 500, color: '#666',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {d.name}
      </div>

      {/* Price */}
      <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#e8e8e8', textAlign: 'right' }}>
        ${d.price?.toFixed(2)}
      </div>

      {/* 30D % */}
      <div style={{ textAlign: 'right' }}>{pct(d.change30d)}</div>

      {/* vs QQQ */}
      <div style={{ textAlign: 'right' }}>{pct(d.vsQQQ)}</div>

      {/* DD from 52W high */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: ddColor }}>
          {d.drawdown != null ? `${d.drawdown.toFixed(1)}%` : '—'}
        </span>
      </div>

      {/* Volume ratio */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: volColor }}>
          {d.volRatio != null ? `${d.volRatio.toFixed(1)}x` : '—'}
        </span>
      </div>

      {/* Rank */}
      <div style={{ textAlign: 'center' }}><RankBadge rank={d.rank} /></div>

      {/* T1 / T2 stacked */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
        <TrendPill signal={t1} />
        <TrendPill signal={t2} />
      </div>

      {/* Sparkline */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Sparkline data={d.spark} color={d.color} />
      </div>
    </div>
  )
}

export default function AiHedgePortfolio() {
  const [mktData, setMktData] = useState(null)
  const [signals, setSignals] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/etf-portfolio').then(r => r.json()),
      fetch('/api/signals?history=false').then(r => r.json()),
      fetch('/api/markets').then(r => r.json()),
    ]).then(([etf, sig, mkt]) => {
      const qqqChange30d = mkt?.data?.QQQ?.change30d ?? null
      const data = etf?.data ?? null
      if (data && qqqChange30d != null) {
        Object.values(data).forEach(d => {
          d.vsQQQ = d.change30d != null
            ? parseFloat((d.change30d - qqqChange30d).toFixed(2))
            : null
        })
      }
      setMktData(data)
      setSignals(sig?.etf ?? null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <div>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#e8e8e8', letterSpacing: '0.04em' }}>
          AI HEDGE PORTFOLIO
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: '#444',
          letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Rank by 30D · DD from 52W high · Vol vs 20D avg
        </span>
      </div>

      <HeaderRow />

      <div style={{ background: '#0d0d0d', borderRadius: 6, marginTop: 4 }}>
        {loading ? (
          <div style={{ padding: '24px 18px', fontFamily: 'monospace', fontSize: 14, color: '#333' }}>
            Loading…
          </div>
        ) : (
          ETF_ORDER.map((sym, i) => (
            <ETFRow
              key={sym}
              symbol={sym}
              d={mktData?.[sym]}
              etfSignals={signals?.[sym]}
              isLast={i === ETF_ORDER.length - 1}
            />
          ))
        )}
      </div>

      {/* Webhook hint */}
      <div style={{ marginTop: 10, fontFamily: 'monospace', fontSize: 10, color: '#2a2a2a', letterSpacing: '0.04em' }}>
        TV WEBHOOK → script:etf · symbol:SMH · trend:t1 · state:LONG|SHORT
      </div>
    </div>
  )
}
