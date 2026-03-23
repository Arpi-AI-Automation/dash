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

// ── Days in current trend ────────────────────────────────────────────────────
function calcDaysInTrend(spark, period1 = 12, period2 = 21) {
  if (!spark || spark.length < period2 + 1) return null
  const k1 = 2 / (period1 + 1), k2 = 2 / (period2 + 1)
  let ema1 = spark.slice(0, period1).reduce((s, v) => s + v, 0) / period1
  let ema2 = spark.slice(0, period2).reduce((s, v) => s + v, 0) / period2
  for (let i = period1; i < period2; i++) ema1 = spark[i] * k1 + ema1 * (1 - k1)
  const states = []
  for (let i = period2; i < spark.length; i++) {
    ema1 = spark[i] * k1 + ema1 * (1 - k1)
    ema2 = spark[i] * k2 + ema2 * (1 - k2)
    states.push(ema1 >= ema2 ? 'POSITIVE' : 'NEGATIVE')
  }
  if (!states.length) return null
  const current = states[states.length - 1]
  let count = 0
  for (let i = states.length - 1; i >= 0; i--) {
    if (states[i] === current) count++
    else break
  }
  return count
}

function calcAroonDaysInTrend(sparkHigh, sparkLow, length = 34) {
  if (!sparkHigh || !sparkLow || sparkHigh.length < length + 2) return null
  const states = []
  for (let end = length; end < sparkHigh.length; end++) {
    const highs = sparkHigh.slice(end - length, end + 1)
    const lows  = sparkLow.slice(end - length, end + 1)
    let maxH = -Infinity, maxIdx = 0, minL = Infinity, minIdx = 0
    for (let i = 0; i < highs.length; i++) {
      if (highs[i] > maxH) { maxH = highs[i]; maxIdx = i }
      if (lows[i]  < minL) { minL = lows[i];  minIdx = i }
    }
    const aroonUp   = 100 * maxIdx / length
    const aroonDown = 100 * minIdx / length
    states.push(aroonUp > aroonDown ? 'POSITIVE' : 'NEGATIVE')
  }
  if (!states.length) return null
  const current = states[states.length - 1]
  let count = 0
  for (let i = states.length - 1; i >= 0; i--) {
    if (states[i] === current) count++
    else break
  }
  return count
}

// ── Per-row Verdict ───────────────────────────────────────────────────────────
// Ripping:        T1+T2 both POSITIVE, RSI > 55, EMA dev > 0, DD > -5%
// Positive Trend: T1+T2 both POSITIVE
// Neutral:        T1/T2 mixed or insufficient data
// Negative Trend: T1+T2 both NEGATIVE
// Cooked:         T1+T2 both NEGATIVE, RSI < 45, EMA dev < -5, DD < -20%
function calcVerdict(t1, t2signal, rsi, drawdown, adx) {
  if (!t1 || !t2signal) return 'NEUTRAL'

  const bothPositive = t1 === 'POSITIVE' && t2signal === 'POSITIVE'
  const bothNegative = t1 === 'NEGATIVE' && t2signal === 'NEGATIVE'

  if (bothPositive) {
    const trendStrong = adx      != null ? adx      > 25 : true
    const rsiUptrend  = rsi      != null ? rsi      > 52 : true
    const notTooDeep  = drawdown != null ? drawdown > -5 : true
    if (trendStrong && rsiUptrend && notTooDeep) return 'RIPPING'
    return 'POSITIVE TREND'
  }

  if (bothNegative) {
    const trendStrong = adx      != null ? adx      > 25  : false
    const rsiDowntrend= rsi      != null ? rsi      < 48  : false
    const deepDD      = drawdown != null ? drawdown < -20 : false
    if (trendStrong && rsiDowntrend && deepDD) return 'COOKED'
    return 'NEGATIVE TREND'
  }

  return 'NEUTRAL'
}

// 30D Pearson correlation vs QQQ
function calcCorrelation(etfSpark, qqqSpark) {
  if (!etfSpark || !qqqSpark) return null
  const len = Math.min(etfSpark.length, qqqSpark.length, 30)
  if (len < 5) return null
  const etf = etfSpark.slice(-len), qqq = qqqSpark.slice(-len)
  const retE = [], retQ = []
  for (let i = 1; i < len; i++) {
    retE.push((etf[i] - etf[i-1]) / etf[i-1])
    retQ.push((qqq[i] - qqq[i-1]) / qqq[i-1])
  }
  const n = retE.length
  const meanE = retE.reduce((s,v) => s+v,0)/n, meanQ = retQ.reduce((s,v) => s+v,0)/n
  let num=0, stdE=0, stdQ=0
  for (let i=0;i<n;i++) { num+=(retE[i]-meanE)*(retQ[i]-meanQ); stdE+=(retE[i]-meanE)**2; stdQ+=(retQ[i]-meanQ)**2 }
  const denom=Math.sqrt(stdE*stdQ)
  return denom===0 ? null : parseFloat((num/denom).toFixed(2))
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

function ADXDisplay({ v }) {
  if (v == null) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
  const color = v >= 40 ? '#059669' : v >= 25 ? '#f59e0b' : '#9ca3af'
  const label = v >= 40 ? 'Strong' : v >= 25 ? 'Trend' : 'Weak'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
      <span style={{ fontSize: 9, fontWeight: 600, color }}>{label}</span>
    </div>
  )
}

function PctFromHighDisplay({ v }) {
  if (v == null) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
  const color = v >= -5 ? '#059669' : v >= -15 ? '#f59e0b' : '#dc2626'
  return <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{v.toFixed(1)}%</span>
}

// ── Column grid ───────────────────────────────────────────────────────────────
// Added Verdict column at the end; removed right-side T1VerdictPanel
const COLS = '0.5fr 1.2fr 0.9fr 0.7fr 0.8fr 0.7fr 0.6fr 0.9fr 0.9fr 0.6fr 0.8fr 0.85fr 1.5fr 0.8fr'

function HeaderRow() {
  const cols = [
    { label: 'Ticker',   align: 'left'   },
    { label: 'Fund',     align: 'left'   },
    { label: 'Price',    align: 'right'  },
    { label: '30D',      align: 'right'  },
    { label: 'vs QQQ 30D', align: 'right', tip: '30D return vs QQQ (outperformance)' },
    { label: '52W DD%',  align: 'right',  tip: '% below 52-week high (Yahoo 1-year high, not true ATH).' },
    { label: 'Vol',      align: 'right'  },
    { label: 'TPI 1',    align: 'center', tip: 'T1: EMA(12) ≥ EMA(21) → Positive. EMA(12) < EMA(21) → Negative.' },
    { label: 'TPI 2',    align: 'center', tip: 'T2: Aroon(34). Up > Down → Positive momentum. Up < Down → Negative.' },
    { label: 'RSI',      align: 'center', tip: 'Smoothed RSI: RSI(7) with EMA(14) applied. >50 = uptrend, <50 = downtrend. 50 is the key threshold.' },
    { label: 'ADX',       align: 'center', tip: 'ADX(14) — trend strength. >40 strong, 25-40 developing, <20 no trend. Direction from TPI 1/2.' },
    { label: 'vs 52W Hi', align: 'center', tip: '% below 52-week high. 0% = at annual peak. Red = >15% below peak.' },
    { label: 'Verdict',  align: 'center', tip: '🚀 Ripping: T1+T2 positive, RSI>55, EMA dev>0, DD>-5% | Positive Trend: T1+T2 both positive | Neutral: mixed | Negative Trend: T1+T2 both negative | 💀 Cooked: T1+T2 negative, RSI<45, EMA dev<-5%, DD<-20%' },
    { label: '30D',      align: 'center', tip: '30-day price sparkline. Green = up, red = down.' },
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
  const { rsi, adx, pctFromHigh, daysT1, daysT2 } = queuedMetrics ?? {}

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <SignalPill signal={t1} label="T1" />
        {daysT1 != null && <span style={{ fontSize: 9, color: '#9ca3af' }}>{daysT1}d</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <SignalPill signal={t2?.signal} label="T2" />
        {daysT2 != null && <span style={{ fontSize: 9, color: '#9ca3af' }}>{daysT2}d</span>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}><RSIBar rsi={rsi} /></div>
      <div style={{ display: 'flex', justifyContent: 'center' }}><ADXDisplay v={adx} /></div>
      <div style={{ textAlign: 'center' }}><PctFromHighDisplay v={pctFromHigh} /></div>

      {/* Verdict */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <VerdictPill verdict={verdict} />
      </div>

      {/* Sparkline — green if 30D up, red if down */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Sparkline
          data={d.spark}
          color={d.change30d == null ? '#9ca3af' : d.change30d > 0 ? '#10b981' : '#ef4444'}
        />
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
          const t1Val  = calcT1(d.spark)
          const t2Val  = calcT2(d.sparkHigh, d.sparkLow, 34)
          const rsiVal = calcRSISmoothed(d.spark)
          const adxVal = calcADX(d.spark, d.sparkHigh, d.sparkLow, 14)
          const pctFromHighVal = calcPctFromHigh(d.price, d.high52w)

          m[sym] = {
            rsi:         rsiVal,
            adx:         adxVal,
            pctFromHigh: pctFromHighVal,
            daysT1:      calcDaysInTrend(d.spark),
            daysT2:      calcAroonDaysInTrend(d.sparkHigh, d.sparkLow, 34),
          }

          t1[sym] = t1Val
          t2[sym] = t2Val
          v[sym]  = calcVerdict(t1Val, t2Val?.signal, rsiVal, d.drawdown, adxVal)
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

      {/* ── Portfolio Regime ── */}
      {!loading && mktData && (() => {
        const posT1    = ETF_ORDER.filter(s => t1Map[s]  === 'POSITIVE').length
        const posT2    = ETF_ORDER.filter(s => t2Map[s]?.signal === 'POSITIVE').length
        const ripping  = ETF_ORDER.filter(s => verdicts[s] === 'RIPPING').length
        const positive = ETF_ORDER.filter(s => verdicts[s] === 'POSITIVE TREND' || verdicts[s] === 'RIPPING').length
        const negative = ETF_ORDER.filter(s => verdicts[s] === 'NEGATIVE TREND' || verdicts[s] === 'COOKED').length
        const rc = positive > negative ? '#059669' : negative > positive ? '#dc2626' : '#f59e0b'
        const rl = positive >= 4 ? 'Risk On' : negative >= 4 ? 'Risk Off' : positive > negative ? 'Leaning Positive' : negative > positive ? 'Leaning Negative' : 'Mixed'
        return (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '2px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Portfolio Regime</span>
              <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, padding: '3px 12px', borderRadius: 20, background: rc + '18', color: rc, border: `1px solid ${rc}35` }}>{rl}</span>
            </div>
            {[
              { label: 'TPI 1 Positive', val: `${posT1}/${ETF_ORDER.length}`, c: posT1 > ETF_ORDER.length/2 ? '#059669' : '#dc2626' },
              { label: 'TPI 2 Positive', val: `${posT2}/${ETF_ORDER.length}`, c: posT2 > ETF_ORDER.length/2 ? '#059669' : '#dc2626' },
              { label: 'Ripping',  val: ripping,  c: '#059669' },
              { label: 'Positive', val: positive, c: '#10b981' },
              { label: 'Negative', val: negative, c: '#dc2626' },
            ].map(({ label, val, c }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontFamily: FONT, fontSize: 11, color: '#9ca3af' }}>{label}</span>
                <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: c }}>{val}</span>
              </div>
            ))}
            <span style={{ marginLeft: 'auto', fontFamily: FONT, fontSize: 10, color: '#d1d5db' }}>
              ≥3/5 positive = regime change signal
            </span>
          </div>
        )
      })()}
    </div>
  )
}
