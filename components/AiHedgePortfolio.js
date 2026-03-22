'use client'
import { useEffect, useState } from 'react'

const ETF_ORDER = ['SMH', 'NLR', 'DTCR', 'IGV', 'BOTZ']
const ETF_META  = {
  SMH:  { name: 'Semiconductors', color: '#818cf8' },
  NLR:  { name: 'Nuclear Energy',  color: '#34d399' },
  DTCR: { name: 'Data Centers',    color: '#fb923c' },
  IGV:  { name: 'Software',        color: '#60a5fa' },
  BOTZ: { name: 'Robotics & AI',   color: '#f472b6' },
}

// ── Quant helpers ─────────────────────────────────────────────────────────────
function calcRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) return null
  let gains = 0, losses = 0
  for (let i = prices.length - period; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1]
    if (d > 0) gains  += d
    else        losses -= d
  }
  const avgGain = gains  / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1))
}

function calcSharpe(prices, riskFreeDaily = 0.00014) {
  // 30D Sharpe: daily returns over the spark window vs ~5% annual RF rate
  if (!prices || prices.length < 5) return null
  const returns = []
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length
  const std  = Math.sqrt(variance)
  if (std === 0) return null
  const annFactor = Math.sqrt(252)
  return parseFloat(((mean - riskFreeDaily) / std * annFactor).toFixed(2))
}

function calcEMADev(prices, period = 20) {
  // EMA deviation: (price - EMA) / EMA * 100
  if (!prices || prices.length < period) return null
  const k = 2 / (period + 1)
  let ema = prices[prices.length - period]  // seed with oldest
  for (let i = prices.length - period + 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k)
  }
  const last = prices[prices.length - 1]
  return parseFloat(((last - ema) / ema * 100).toFixed(2))
}

// ── Design tokens (matching the PT Dashboard light theme) ────────────────────
const LBL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Pct({ v, size = 13 }) {
  if (v == null) return <span style={{ color: '#9ca3af', fontSize: size, fontWeight: 600 }}>—</span>
  const color = Math.abs(v) < 0.01 ? '#6b7280' : v > 0 ? '#059669' : '#dc2626'
  return (
    <span style={{ color, fontSize: size, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
      {v >= 0 ? '+' : ''}{v.toFixed(2)}%
    </span>
  )
}

function TrendPill({ signal }) {
  if (!signal) return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: '#9ca3af',
      background: '#f3f4f6', border: '1px solid #e5e7eb',
      borderRadius: 20, padding: '2px 8px',
    }}>—</span>
  )
  const isLong = signal.state === 'LONG'
  const color  = isLong ? '#059669' : '#dc2626'
  const bg     = isLong ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)'
  const bdr    = isLong ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.25)'
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, border: `1px solid ${bdr}`, borderRadius: 20, padding: '2px 8px' }}>
      {signal.state}
    </span>
  )
}

function RankBadge({ rank }) {
  if (!rank) return <span style={{ color: '#9ca3af', fontSize: 13, fontWeight: 600 }}>—</span>
  const colors = ['#f59e0b', '#94a3b8', '#b45309', '#6b7280', '#9ca3af']
  return <span style={{ fontSize: 13, fontWeight: 800, color: colors[rank - 1] ?? '#9ca3af' }}>#{rank}</span>
}

function Sparkline({ data, color, width = 80, height = 30 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function RSIBar({ rsi }) {
  if (rsi == null) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
  const color = rsi >= 70 ? '#dc2626' : rsi >= 55 ? '#f59e0b' : rsi <= 30 ? '#059669' : '#6b7280'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{rsi}</span>
      <div style={{ width: 44, height: 3, background: '#e5e7eb', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ width: `${rsi}%`, height: '100%', background: color, borderRadius: 9999 }} />
      </div>
    </div>
  )
}

function SharpeDisplay({ v }) {
  if (v == null) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
  const color = v >= 1.5 ? '#059669' : v >= 0.5 ? '#f59e0b' : v < 0 ? '#dc2626' : '#6b7280'
  return <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{v > 0 ? '+' : ''}{v}</span>
}

function EMADevDisplay({ v }) {
  if (v == null) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
  const color = v > 5 ? '#dc2626' : v > 0 ? '#059669' : v < -5 ? '#059669' : '#f59e0b'
  return <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{v > 0 ? '+' : ''}{v}%</span>
}

// ── Column grid: ticker | fund | price | 30D | vsQQQ | DD | vol | rank | T1/T2 | RSI | Sharpe | EMA | spark
const COLS = '52px 96px 72px 72px 68px 60px 48px 44px 80px 56px 62px 62px 76px'

function HeaderRow() {
  const cols = [
    { label: 'Ticker',  align: 'left' },
    { label: 'Fund',    align: 'left' },
    { label: 'Price',   align: 'right' },
    { label: '30D',     align: 'right' },
    { label: 'vs QQQ',  align: 'right' },
    { label: 'DD %',    align: 'right' },
    { label: 'Vol',     align: 'right' },
    { label: 'Rank',    align: 'center' },
    { label: 'T1 / T2', align: 'center' },
    { label: 'RSI',     align: 'center', tip: 'RSI(14) — >70 overbought, <30 oversold' },
    { label: 'Sharpe',  align: 'center', tip: 'Annualised Sharpe ratio over 30D (risk-adj return)' },
    { label: 'EMA dev', align: 'center', tip: '% above/below 20D EMA' },
    { label: '30D',     align: 'right' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '0 16px 8px', gap: 6, borderBottom: '1px solid #e5e7eb' }}>
      {cols.map((c, i) => (
        <div key={i} title={c.tip ?? ''} style={{ ...LBL, textAlign: c.align, cursor: c.tip ? 'help' : 'default' }}>
          {c.label}
        </div>
      ))}
    </div>
  )
}

function ETFRow({ symbol, d, etfSignals, isLast, queuedMetrics }) {
  const t1   = etfSignals?.t1 ?? null
  const t2   = etfSignals?.t2 ?? null
  const meta = ETF_META[symbol]
  const { rsi, sharpe, emaDev } = queuedMetrics ?? {}

  const rowStyle = {
    display: 'grid', gridTemplateColumns: COLS,
    alignItems: 'center', padding: '10px 16px', gap: 6,
    borderBottom: isLast ? 'none' : '1px solid #f3f4f6',
  }

  if (!d) return (
    <div style={rowStyle}>
      <span style={{ fontSize: 14, fontWeight: 800, color: meta?.color ?? '#9ca3af' }}>{symbol}</span>
      {Array(12).fill(0).map((_, i) => <span key={i} style={{ color: '#d1d5db' }}>—</span>)}
    </div>
  )

  const ddColor   = d.drawdown == null ? '#9ca3af' : d.drawdown > -5 ? '#6b7280' : d.drawdown > -15 ? '#f59e0b' : '#dc2626'
  const volColor  = !d.volRatio ? '#9ca3af' : d.volRatio >= 1.5 ? '#f59e0b' : d.volRatio >= 1.2 ? '#6b7280' : '#9ca3af'

  return (
    <div style={rowStyle}>
      {/* Ticker */}
      <div style={{ fontSize: 14, fontWeight: 800, color: d.color, fontFamily: 'inherit' }}>{symbol}</div>
      {/* Fund */}
      <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {d.name}
      </div>
      {/* Price */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        ${d.price?.toFixed(2)}
      </div>
      {/* 30D */}
      <div style={{ textAlign: 'right' }}><Pct v={d.change30d} /></div>
      {/* vs QQQ */}
      <div style={{ textAlign: 'right' }}><Pct v={d.vsQQQ} /></div>
      {/* DD */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: ddColor, fontVariantNumeric: 'tabular-nums' }}>
          {d.drawdown != null ? `${d.drawdown.toFixed(1)}%` : '—'}
        </span>
      </div>
      {/* Vol */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: volColor }}>
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
      {/* RSI */}
      <div style={{ display: 'flex', justifyContent: 'center' }}><RSIBar rsi={rsi} /></div>
      {/* Sharpe */}
      <div style={{ textAlign: 'center' }}><SharpeDisplay v={sharpe} /></div>
      {/* EMA dev */}
      <div style={{ textAlign: 'center' }}><EMADevDisplay v={emaDev} /></div>
      {/* Sparkline */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Sparkline data={d.spark} color={d.color} />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AiHedgePortfolio() {
  const [mktData,  setMktData]  = useState(null)
  const [signals,  setSignals]  = useState(null)
  const [metrics,  setMetrics]  = useState({})
  const [loading,  setLoading]  = useState(true)

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
          d.vsQQQ = d.change30d != null ? parseFloat((d.change30d - qqqChange30d).toFixed(2)) : null
        })
      }

      // Compute quant metrics from spark data client-side
      const m = {}
      if (data) {
        ETF_ORDER.forEach(sym => {
          const d = data[sym]
          if (!d?.spark) return
          m[sym] = {
            rsi:    calcRSI(d.spark),
            sharpe: calcSharpe(d.spark),
            emaDev: calcEMADev(d.spark),
          }
        })
      }

      setMktData(data)
      setSignals(sig?.etf ?? null)
      setMetrics(m)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <div>
      {/* subtitle only — page.js provides the section label above the card */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12 }}>
        <span style={{ ...LBL }}>
          Rank by 30D · DD from 52W high · Vol vs 20D avg · RSI(14) · 30D Sharpe · EMA(20) dev
        </span>
      </div>

      <HeaderRow />

      <div style={{ marginTop: 4 }}>
        {loading ? (
          <div style={{ padding: '20px 16px', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
        ) : (
          ETF_ORDER.map((sym, i) => (
            <ETFRow
              key={sym}
              symbol={sym}
              d={mktData?.[sym]}
              etfSignals={signals?.[sym]}
              isLast={i === ETF_ORDER.length - 1}
              queuedMetrics={metrics[sym]}
            />
          ))
        )}
      </div>

      {/* Legend row */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f4f6', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {[
          ['RSI', '>70 overbought · <30 oversold'],
          ['Sharpe', '>1.5 strong · >0.5 ok · <0 poor (30D annualised)'],
          ['EMA dev', '% above/below 20D exponential moving average'],
        ].map(([lbl, tip]) => (
          <span key={lbl} style={{ fontSize: 11, color: '#9ca3af' }}>
            <span style={{ fontWeight: 700, color: '#6b7280' }}>{lbl}:</span> {tip}
          </span>
        ))}
      </div>
    </div>
  )
}
