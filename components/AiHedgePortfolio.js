'use client'
import { useEffect, useState } from 'react'

const ETF_ORDER = ['SMH', 'NLR', 'DTCR', 'IGV', 'BOTZ']

const DS = {
  label: {
    fontFamily: 'monospace', fontSize: 11, fontWeight: 400,
    color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase',
  },
}

const UP   = '#22c55e'
const DOWN = '#ef4444'
const DIM  = '#333'

function chgColor(v) {
  if (v == null || Math.abs(v) < 0.01) return DIM
  return v > 0 ? UP : DOWN
}

function Pct({ v, size = 13 }) {
  if (v == null) return <span style={{ color: DIM, fontFamily: 'monospace', fontSize: size, fontWeight: 700 }}>—</span>
  return (
    <span style={{ color: chgColor(v), fontFamily: 'monospace', fontSize: size, fontWeight: 700 }}>
      {v >= 0 ? '+' : ''}{v.toFixed(2)}%
    </span>
  )
}

function TrendPill({ signal }) {
  if (!signal) return (
    <span style={{
      fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
      color: '#333', background: '#111', border: '1px solid #1a1a1a',
      borderRadius: 4, padding: '2px 7px', letterSpacing: '0.05em',
    }}>—</span>
  )
  const isLong = signal.state === 'LONG'
  const color  = isLong ? UP : DOWN
  return (
    <span style={{
      fontFamily: 'monospace', fontSize: 10, fontWeight: 800,
      color, background: color + '18', border: `1px solid ${color}55`,
      borderRadius: 4, padding: '2px 7px', letterSpacing: '0.06em',
    }}>
      {signal.state}
    </span>
  )
}

function RankBadge({ rank }) {
  if (!rank) return <span style={{ color: DIM, fontFamily: 'monospace', fontSize: 12 }}>—</span>
  const colors = ['#f59e0b', '#94a3b8', '#b45309', '#555', '#333']
  return (
    <span style={{
      fontFamily: 'monospace', fontSize: 12, fontWeight: 800,
      color: colors[(rank - 1)] ?? '#333',
    }}>#{rank}</span>
  )
}

function Sparkline({ data, color, width = 100, height = 32 }) {
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
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function ETFRow({ symbol, d, etfSignals, isLast }) {
  const t1 = etfSignals?.t1 ?? null
  const t2 = etfSignals?.t2 ?? null

  const rowStyle = {
    display: 'grid',
    gridTemplateColumns: '44px 90px 62px 64px 68px 52px 42px 44px 44px 100px',
    alignItems: 'center',
    padding: '9px 14px',
    gap: 6,
    borderBottom: isLast ? 'none' : '1px solid #0f0f0f',
  }

  if (!d) return (
    <div style={rowStyle}>
      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#2a2a2a' }}>{symbol}</span>
      {Array(9).fill(0).map((_, i) => <span key={i} style={{ color: '#1a1a1a' }}>—</span>)}
    </div>
  )

  const ddColor = d.drawdown > -5 ? '#94a3b8' : d.drawdown > -15 ? '#f59e0b' : DOWN
  const volColor = !d.volRatio ? DIM : d.volRatio >= 1.5 ? '#f59e0b' : d.volRatio >= 1.2 ? '#94a3b8' : '#444'

  return (
    <div style={rowStyle}>
      {/* Ticker */}
      <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: d.color }}>{symbol}</div>

      {/* Name */}
      <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#3a3a3a', letterSpacing: '0.03em',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {d.name}
      </div>

      {/* Price */}
      <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#e0e0e0', textAlign: 'right' }}>
        ${d.price?.toFixed(2)}
      </div>

      {/* 30D % */}
      <div style={{ textAlign: 'right' }}><Pct v={d.change30d} /></div>

      {/* vs QQQ — injected from parent */}
      <div style={{ textAlign: 'right' }}><Pct v={d.vsQQQ} /></div>

      {/* Drawdown from 52W high */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: ddColor }}>
          {d.drawdown != null ? `${d.drawdown.toFixed(1)}%` : '—'}
        </span>
      </div>

      {/* Volume ratio */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: volColor }}>
          {d.volRatio != null ? `${d.volRatio.toFixed(1)}x` : '—'}
        </span>
      </div>

      {/* Rank */}
      <div style={{ textAlign: 'center' }}><RankBadge rank={d.rank} /></div>

      {/* T1 / T2 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
        <TrendPill signal={t1} />
        <TrendPill signal={t2} />
      </div>

      {/* Sparkline */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Sparkline data={d.spark} color={d.color} width={100} height={32} />
      </div>
    </div>
  )
}

export default function AiHedgePortfolio() {
  const [mktData, setMktData]   = useState(null)
  const [signals, setSignals]   = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/etf-portfolio').then(r => r.json()),
      fetch('/api/signals?history=false').then(r => r.json()),
    ]).then(([etf, sig]) => {
      // Compute vs QQQ for each ETF
      // QQQ 30D change is in the signals response? No — it's in /api/markets
      // Fetch markets too for QQQ
      fetch('/api/markets').then(r => r.json()).then(mkt => {
        const qqqChange30d = mkt?.data?.QQQ?.change30d ?? null
        // etf-portfolio doesn't return QQQ — we'll compute it from markets
        // For now inject vsQQQ into each ETF entry
        if (etf?.data && qqqChange30d != null) {
          Object.values(etf.data).forEach(d => {
            d.vsQQQ = d.change30d != null ? parseFloat((d.change30d - qqqChange30d).toFixed(2)) : null
          })
        }
        setMktData(etf?.data ?? null)
        setSignals(sig?.etf ?? null)
        setLoading(false)
      }).catch(() => {
        setMktData(etf?.data ?? null)
        setSignals(sig?.etf ?? null)
        setLoading(false)
      })
    }).catch(() => setLoading(false))
  }, [])

  const COL_HEADERS = [
    { label: 'Ticker', align: 'left' },
    { label: 'Fund',   align: 'left' },
    { label: 'Price',  align: 'right' },
    { label: '30D',    align: 'right' },
    { label: 'vs QQQ', align: 'right' },
    { label: 'DD%',    align: 'right' },
    { label: 'Vol',    align: 'right' },
    { label: 'Rank',   align: 'center' },
    { label: 'T1 / T2', align: 'center' },
    { label: '30D Chart', align: 'right' },
  ]

  return (
    <div>
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#e8e8e8' }}>
          AI Hedge Portfolio
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#333', letterSpacing: '0.06em' }}>
          RANK BY 30D · DD FROM 52W HIGH · VOL VS 20D AVG
        </span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '44px 90px 62px 64px 68px 52px 42px 44px 44px 100px',
        padding: '0 14px 8px',
        gap: 6,
        borderBottom: '1px solid #1a1a1a',
        marginBottom: 2,
      }}>
        {COL_HEADERS.map(h => (
          <div key={h.label} style={{ ...DS.label, textAlign: h.align }}>{h.label}</div>
        ))}
      </div>

      {/* Rows */}
      <div style={{ background: '#111', borderRadius: 6 }}>
        {loading ? (
          <div style={{ padding: '20px 14px', fontFamily: 'monospace', fontSize: 12, color: '#333' }}>
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

      {/* Webhook reference */}
      <div style={{ marginTop: 10, padding: '6px 14px', background: '#0a0a0a', borderRadius: 4,
        border: '1px solid #111', fontFamily: 'monospace', fontSize: 10, color: '#2a2a2a',
        letterSpacing: '0.04em' }}>
        TV WEBHOOK → script:etf · symbol:SMH · trend:t1 · state:LONG|SHORT
      </div>
    </div>
  )
}
