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

// ── Quant helpers ─────────────────────────────────────────────────────────────

function calcEMA(prices, period) {
  if (!prices || prices.length < period) return null
  const k = 2 / (period + 1)
  let ema = prices.slice(0, period).reduce((s, v) => s + v, 0) / period
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k)
  return ema
}

// T1: 12/21 EMA crossover — POSITIVE = EMA12 ≥ EMA21
function calcT1(spark) {
  if (!spark || spark.length < 22) return null
  const ema12 = calcEMA(spark, 12)
  const ema21 = calcEMA(spark, 21)
  if (ema12 === null || ema21 === null) return null
  return ema12 >= ema21 ? 'POSITIVE' : 'NEGATIVE'
}

// T2: Aroon(34) — Pine script logic
// upper = 100 * (highestbars(high, length+1) + length) / length
// lower = 100 * (lowestbars(low, length+1) + length) / length
// POSITIVE = Aroon Up > Aroon Down (bullish momentum)
// NEGATIVE = Aroon Up < Aroon Down (bearish momentum)
function calcT2(sparkHigh, sparkLow, length = 34) {
  if (!sparkHigh || !sparkLow) return null
  if (sparkHigh.length < length + 1 || sparkLow.length < length + 1) return null

  // Use the last (length+1) bars
  const highs = sparkHigh.slice(-(length + 1))
  const lows  = sparkLow.slice(-(length + 1))

  // highestbars returns bars ago of the highest high in the last length+1 bars
  // = 0 means the current bar is the highest → best case (Aroon Up = 100)
  let maxH = -Infinity, maxIdx = 0
  let minL = Infinity,  minIdx = 0
  for (let i = 0; i < highs.length; i++) {
    if (highs[i] > maxH) { maxH = highs[i]; maxIdx = i }
    if (lows[i]  < minL) { minL = lows[i];  minIdx = i }
  }
  // highestbars = distance from current bar (last index) to the highest bar
  const highestBarsAgo = (highs.length - 1) - maxIdx
  const lowestBarsAgo  = (lows.length  - 1) - minIdx

  const aroonUp   = 100 * (length - highestBarsAgo) / length
  const aroonDown = 100 * (length - lowestBarsAgo)  / length

  return {
    up:       parseFloat(aroonUp.toFixed(1)),
    down:     parseFloat(aroonDown.toFixed(1)),
    signal:   aroonUp > aroonDown ? 'POSITIVE' : aroonUp < aroonDown ? 'NEGATIVE' : 'NEUTRAL',
  }
}

// RSI(7) smoothed with EMA(14) — as specified
// Step 1: compute RSI(7) for each bar from index 7 onwards
// Step 2: apply EMA(14) to that RSI series → return final EMA value
function calcRSISmoothed(prices, rsiPeriod = 7, emaPeriod = 14) {
  if (!prices || prices.length < rsiPeriod + emaPeriod + 1) return null

  // Build RSI series for all valid bars
  const rsiSeries = []
  for (let i = rsiPeriod; i < prices.length; i++) {
    let gains = 0, losses = 0
    for (let j = i - rsiPeriod + 1; j <= i; j++) {
      const d = prices[j] - prices[j - 1]
      if (d > 0) gains += d; else losses -= d
    }
    const avgGain = gains / rsiPeriod
    const avgLoss = losses / rsiPeriod
    if (avgLoss === 0) { rsiSeries.push(100); continue }
    rsiSeries.push(100 - 100 / (1 + avgGain / avgLoss))
  }

  if (rsiSeries.length < emaPeriod) return null

  // EMA(14) of the RSI series
  const k = 2 / (emaPeriod + 1)
  let ema = rsiSeries.slice(0, emaPeriod).reduce((s, v) => s + v, 0) / emaPeriod
  for (let i = emaPeriod; i < rsiSeries.length; i++) ema = rsiSeries[i] * k + ema * (1 - k)

  return parseFloat(ema.toFixed(1))
}

function calcSharpe(prices, riskFreeDaily = 0.00014) {
  if (!prices || prices.length < 5) return null
  const returns = []
  for (let i = 1; i < prices.length; i++) returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const std  = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length)
  if (std === 0) return null
  return parseFloat(((mean - riskFreeDaily) / std * Math.sqrt(252)).toFixed(2))
}

function calcEMADev(prices, period = 20) {
  if (!prices || prices.length < period) return null
  const ema = calcEMA(prices, period)
  if (ema === null) return null
  return parseFloat(((prices[prices.length - 1] - ema) / ema * 100).toFixed(2))
}

// ── Per-row Verdict ───────────────────────────────────────────────────────────
// Ripping:        T1+T2 both POSITIVE, RSI > 55, EMA dev > 0, DD > -5%
// Positive Trend: T1+T2 both POSITIVE
// Neutral:        T1/T2 mixed or insufficient data
// Negative Trend: T1+T2 both NEGATIVE
// Cooked:         T1+T2 both NEGATIVE, RSI < 45, EMA dev < -5, DD < -20%
function calcVerdict(t1, t2signal, rsi, drawdown, emaDev) {
  if (!t1 || !t2signal) return 'NEUTRAL'

  const bothPositive = t1 === 'POSITIVE' && t2signal === 'POSITIVE'
  const bothNegative = t1 === 'NEGATIVE' && t2signal === 'NEGATIVE'

  if (bothPositive) {
    // Ripping: strong momentum on top of positive trend
    const rsiStrong    = rsi != null   ? rsi    > 55  : true
    const emaExtended  = emaDev != null ? emaDev > 0   : true
    const notTooDeep   = drawdown != null ? drawdown > -5 : true
    if (rsiStrong && emaExtended && notTooDeep) return 'RIPPING'
    return 'POSITIVE TREND'
  }

  if (bothNegative) {
    // Cooked: deeply negative across all signals
    const rsiWeak     = rsi != null    ? rsi    < 45   : false
    const emaBelowAvg = emaDev != null ? emaDev < -5   : false
    const deepDD      = drawdown != null ? drawdown < -20 : false
    if (rsiWeak && emaBelowAvg && deepDD) return 'COOKED'
    return 'NEGATIVE TREND'
  }

  return 'NEUTRAL'
}

const VERDICT_META = {
  'RIPPING':        { color: '#059669', bg: 'rgba(5,150,105,.12)',   border: 'rgba(5,150,105,.3)',   emoji: '🚀' },
  'POSITIVE TREND': { color: '#10b981', bg: 'rgba(16,185,129,.1)',   border: 'rgba(16,185,129,.25)', emoji: '↑'  },
  'NEUTRAL':        { color: '#f59e0b', bg: 'rgba(245,158,11,.1)',   border: 'rgba(245,158,11,.25)', emoji: '→'  },
  'NEGATIVE TREND': { color: '#ef4444', bg: 'rgba(239,68,68,.1)',    border: 'rgba(239,68,68,.25)',  emoji: '↓'  },
  'COOKED':         { color: '#991b1b', bg: 'rgba(153,27,27,.12)',   border: 'rgba(153,27,27,.3)',   emoji: '💀' },
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'
const LBL  = { fontFamily: FONT, fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }

// ── Sub-components ────────────────────────────────────────────────────────────

function Pct({ v, size = 13 }) {
  if (v == null) return <span style={{ color: '#9ca3af', fontSize: size, fontWeight: 600 }}>—</span>
  const color = Math.abs(v) < 0.01 ? '#6b7280' : v > 0 ? '#059669' : '#dc2626'
  return <span style={{ color, fontSize: size, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</span>
}

function SignalPill({ signal, label }) {
  if (!signal) return <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af' }}>—</span>
  const isPos = signal === 'POSITIVE'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
      color:   isPos ? '#059669' : '#dc2626',
      background: isPos ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)',
      border: `1px solid ${isPos ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.25)'}`,
      borderRadius: 20, padding: '2px 7px',
    }}>{isPos ? 'Positive' : 'Negative'}</span>
  )
}

function VerdictPill({ verdict }) {
  if (!verdict) return null
  const m = VERDICT_META[verdict] ?? VERDICT_META['NEUTRAL']
  return (
    <span style={{
      fontFamily: FONT, fontSize: 10, fontWeight: 700,
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
      borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <span>{m.emoji}</span>
      {verdict}
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
  // Show only last 30 for sparkline display
  const display = data.slice(-30)
  const min = Math.min(...display), max = Math.max(...display), range = max - min || 1
  const pts = display.map((v, i) => {
    const x = (i / (display.length - 1)) * width
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
  // Threshold: >50 = uptrend (green), <50 = downtrend (red), 48-52 = neutral (grey)
  const color = rsi > 52 ? '#059669' : rsi < 48 ? '#dc2626' : '#6b7280'
  const label = rsi > 52 ? 'Up' : rsi < 48 ? 'Dn' : '—'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{rsi}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <div style={{ width: 36, height: 3, background: '#e5e7eb', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(rsi, 100)}%`, height: '100%', background: color, borderRadius: 9999 }} />
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, color }}>{label}</span>
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

// ── Column grid ───────────────────────────────────────────────────────────────
// Added Verdict column at the end; removed right-side T1VerdictPanel
const COLS = '0.5fr 1.2fr 0.9fr 0.7fr 0.8fr 0.7fr 0.6fr 0.6fr 0.9fr 0.9fr 0.6fr 0.8fr 0.85fr 1.4fr'

function HeaderRow() {
  const cols = [
    { label: 'Ticker',   align: 'left'   },
    { label: 'Fund',     align: 'left'   },
    { label: 'Price',    align: 'right'  },
    { label: '30D',      align: 'right'  },
    { label: 'vs QQQ 30D', align: 'right', tip: '30D return vs QQQ (outperformance)' },
    { label: 'ATH DD%',  align: 'right',  tip: 'Drawdown from all-time / 52-week high' },
    { label: 'Vol',      align: 'right'  },
    { label: 'Rank',     align: 'center' },
    { label: 'TPI 1',    align: 'center', tip: 'T1: EMA(12) ≥ EMA(21) → Positive. EMA(12) < EMA(21) → Negative.' },
    { label: 'TPI 2',    align: 'center', tip: 'T2: Aroon(34). Up > Down → Positive momentum. Up < Down → Negative.' },
    { label: 'RSI',      align: 'center', tip: 'Smoothed RSI: RSI(7) with EMA(14) applied. >50 = uptrend, <50 = downtrend. 50 is the key threshold.' },
    { label: '30D Sharpe', align: 'center', tip: '30D annualised Sharpe ratio. >1.5 strong · >0.5 ok · <0 poor.' },
    { label: 'EMA(20) dev', align: 'center', tip: '% above/below the 20-day exponential moving average. Positive = extended above, risk of mean reversion.' },
    { label: 'Verdict',  align: 'center', tip: '🚀 Ripping: T1+T2 positive, RSI>55, EMA dev>0, DD>-5% | Positive Trend: T1+T2 both positive | Neutral: mixed | Negative Trend: T1+T2 both negative | 💀 Cooked: T1+T2 negative, RSI<45, EMA dev<-5%, DD<-20%' },
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

function ETFRow({ symbol, d, t1, t2, verdict, isLast, queuedMetrics }) {
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
      {Array(13).fill(0).map((_, i) => <span key={i} style={{ color: '#d1d5db' }}>—</span>)}
    </div>
  )

  const ddColor  = d.drawdown == null ? '#9ca3af' : d.drawdown > -5 ? '#6b7280' : d.drawdown > -15 ? '#f59e0b' : '#dc2626'
  const volColor = !d.volRatio ? '#9ca3af' : d.volRatio >= 1.5 ? '#f59e0b' : d.volRatio >= 1.2 ? '#6b7280' : '#9ca3af'

  return (
    <div style={rowStyle}>
      <div style={{ fontSize: 14, fontWeight: 800, color: d.color }}>{symbol}</div>
      <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>US${d.price?.toFixed(2)}</div>
      <div style={{ textAlign: 'right' }}><Pct v={d.change30d} /></div>
      <div style={{ textAlign: 'right' }}><Pct v={d.vsQQQ} /></div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: ddColor, fontVariantNumeric: 'tabular-nums' }}>
          {d.drawdown != null ? `${d.drawdown.toFixed(1)}%` : '—'}
        </span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: volColor }}>{d.volRatio != null ? `${d.volRatio.toFixed(1)}x` : '—'}</span>
      </div>
      <div style={{ textAlign: 'center' }}><RankBadge rank={d.rank} /></div>

      {/* T1 — EMA 12/21 */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <SignalPill signal={t1} label="T1" />
      </div>

      {/* T2 — Aroon(34) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <SignalPill signal={t2?.signal} label="T2" />
        {t2 && (
          <span style={{ fontSize: 9, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
            {t2.up}↑ {t2.down}↓
          </span>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}><RSIBar rsi={rsi} /></div>
      <div style={{ textAlign: 'center' }}><SharpeDisplay v={sharpe} /></div>
      <div style={{ textAlign: 'center' }}><EMADevDisplay v={emaDev} /></div>

      {/* Verdict */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <VerdictPill verdict={verdict} />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AiHedgePortfolio() {
  const [mktData,  setMktData]  = useState(null)
  const [metrics,  setMetrics]  = useState({})
  const [t1Map,    setT1Map]    = useState({})
  const [t2Map,    setT2Map]    = useState({})
  const [verdicts, setVerdicts] = useState({})
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/etf-portfolio').then(r => r.json()),
      fetch('/api/markets').then(r => r.json()),
    ]).then(([etf, mkt]) => {
      const qqqChange30d = mkt?.data?.QQQ?.change30d ?? null
      const data = etf?.data ?? null

      if (data && qqqChange30d != null) {
        Object.values(data).forEach(d => {
          d.vsQQQ = d.change30d != null ? parseFloat((d.change30d - qqqChange30d).toFixed(2)) : null
        })
      }

      const m = {}, t1 = {}, t2 = {}, v = {}
      if (data) {
        ETF_ORDER.forEach(sym => {
          const d = data[sym]
          if (!d?.spark) return

          // Quant metrics (use full 60-pt spark)
          m[sym] = {
            rsi:    calcRSISmoothed(d.spark),
            sharpe: calcSharpe(d.spark),
            emaDev: calcEMADev(d.spark),
          }

          // T1: 12/21 EMA from closes
          t1[sym] = calcT1(d.spark)

          // T2: Aroon(34) from high/low arrays
          t2[sym] = calcT2(d.sparkHigh, d.sparkLow, 34)

          // Per-row verdict
          v[sym] = calcVerdict(t1[sym], t2[sym]?.signal, m[sym].rsi, d.drawdown, m[sym].emaDev)
        })
      }

      setMktData(data)
      setMetrics(m)
      setT1Map(t1)
      setT2Map(t2)
      setVerdicts(v)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <div>
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
              t1={t1Map[sym] ?? null}
              t2={t2Map[sym] ?? null}
              verdict={verdicts[sym] ?? 'NEUTRAL'}
              isLast={i === ETF_ORDER.length - 1}
              queuedMetrics={metrics[sym]}
            />
          ))
        )}
      </div>


    </div>
  )
}
