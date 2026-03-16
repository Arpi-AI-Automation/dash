'use client'

import { useEffect, useRef, useState } from 'react'

// ─── colour helpers ───────────────────────────────────────────────
const STATE_META = {
  'MAX LONG':  { bg: 'bg-green-500',  text: 'text-black', ring: '#22c55e', label: 'MAX LONG'  },
  'LONG':      { bg: 'bg-green-400',  text: 'text-black', ring: '#4ade80', label: 'LONG'      },
  'NEUTRAL':   { bg: 'bg-gray-400',   text: 'text-black', ring: '#9ca3af', label: 'NEUTRAL'   },
  'SHORT':     { bg: 'bg-red-400',    text: 'text-white', ring: '#f87171', label: 'SHORT'      },
  'MAX SHORT': { bg: 'bg-red-600',    text: 'text-white', ring: '#dc2626', label: 'MAX SHORT' },
}

const stateColor = (state) =>
  state?.includes('LONG') ? '#22c55e' : state?.includes('SHORT') ? '#ef4444' : '#9ca3af'

const rocSign = (v) => (v > 0 ? '+' : '')
const fmt2 = (v) => (v == null ? '—' : `${rocSign(v)}${Number(v).toFixed(2)}`)
const fmtPrice = (v) => v ? `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'

// ─── TPI Gauge ────────────────────────────────────────────────────
function TpiGauge({ tpi }) {
  const val = Math.max(-1, Math.min(1, tpi ?? 0))
  const pct = ((val + 1) / 2) * 100
  const col = val > 0.1 ? '#22c55e' : val < -0.1 ? '#ef4444' : '#9ca3af'
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>-1</span><span className="text-white font-mono">{fmt2(val)}</span><span>+1</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: col }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-600 mt-0.5">
        <span>SHORT</span><span>LONG</span>
      </div>
    </div>
  )
}

// ─── BTC Price Chart (coloured by TPI state) ──────────────────────
function BtcPriceChart({ history }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !history?.length) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = canvas.clientWidth
    const H = canvas.clientHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    // history is newest-first → reverse for chart
    const pts = [...history].reverse().filter((d) => d.price > 0)
    if (pts.length < 2) return

    const prices = pts.map((d) => d.price)
    const minP = Math.min(...prices)
    const maxP = Math.max(...prices)
    const range = maxP - minP || 1
    const pad = { t: 12, r: 8, b: 24, l: 60 }
    const cw = W - pad.l - pad.r
    const ch = H - pad.t - pad.b

    ctx.clearRect(0, 0, W, H)

    // y-axis labels
    ctx.fillStyle = '#6b7280'
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const v = minP + (range * i) / 4
      const y = pad.t + ch - (ch * i) / 4
      ctx.fillText(`$${Math.round(v / 1000)}k`, pad.l - 4, y + 3)
      ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(pad.l, y)
      ctx.lineTo(pad.l + cw, y)
      ctx.stroke()
    }

    // draw coloured line segments
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    for (let i = 1; i < pts.length; i++) {
      const x1 = pad.l + (cw * (i - 1)) / (pts.length - 1)
      const y1 = pad.t + ch - (ch * (pts[i - 1].price - minP)) / range
      const x2 = pad.l + (cw * i) / (pts.length - 1)
      const y2 = pad.t + ch - (ch * (pts[i].price - minP)) / range

      const col = stateColor(pts[i].state)
      ctx.strokeStyle = col
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }

    // x-axis: date labels at start / mid / end
    ctx.fillStyle = '#6b7280'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    const labelIdxs = [0, Math.floor((pts.length - 1) / 2), pts.length - 1]
    labelIdxs.forEach((i) => {
      const d = new Date(pts[i].ts)
      const label = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
      const x = pad.l + (cw * i) / (pts.length - 1)
      ctx.fillText(label, x, H - 4)
    })
  }, [history])

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: 160, display: 'block' }}
    />
  )
}

// ─── Trade-accurate equity curve ─────────────────────────────────
// Ground truth from TV strategy CSV. Step-function: flat during trade,
// steps at exit. Final point interpolated live from current BTC price.
//
// Trade 10 open: SHORT entered $88,341.87 on 2026-01-20
// At exit the equity steps to: prevEquity * (entryPrice / currentPrice)
// since shorting profits when price falls.
const TRADE_EQUITY_PTS = [
  { date: '2025-08-07', equity: 1.0000 }, // T1 entry (strategy start)
  { date: '2025-08-18', equity: 0.9896 }, // T1 exit  SHORT entry (-1.04%)
  { date: '2025-09-16', equity: 0.9956 }, // T2 exit  LONG entry  (-0.44%)
  { date: '2025-09-19', equity: 0.9906 }, // T3 exit  SHORT entry (-0.94%)
  { date: '2025-10-01', equity: 0.9748 }, // T4 exit  LONG entry  (-2.52%)
  { date: '2025-10-10', equity: 0.9526 }, // T5 exit  SHORT entry (-4.74%)
  { date: '2026-01-05', equity: 1.1696 }, // T6 exit  LONG entry  (+16.96%)
  { date: '2026-01-09', equity: 0.9648 }, // T7 exit  SHORT entry (-3.52%)
  { date: '2026-01-11', equity: 0.9961 }, // T8 exit  LONG entry  (-0.39%)
  { date: '2026-01-20', equity: 0.9719 }, // T9 exit  SHORT entry (-2.81%)
  // T10: SHORT entered $88,341.87 — open trade, live endpoint added below
]
const T10_ENTRY_PRICE = 88341.87
const T10_ENTRY_EQUITY = 0.9719 // equity at T10 entry

function drawTradeEquityCanvas(canvas, liveBtcPrice) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const W = canvas.clientWidth
  const H = canvas.clientHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.scale(dpr, dpr)

  // Build final pts array: hardcoded + live endpoint
  const pts = [...TRADE_EQUITY_PTS]
  if (liveBtcPrice > 0) {
    // T10 is SHORT: profit = entry/current - 1
    const liveEquity = T10_ENTRY_EQUITY * (T10_ENTRY_PRICE / liveBtcPrice)
    pts.push({ date: new Date().toISOString().slice(0, 10), equity: liveEquity })
  }

  const equityVals = pts.map(p => p.equity)
  const minE = Math.min(...equityVals)
  const maxE = Math.max(...equityVals)
  const range = maxE - minE || 0.01
  const pad = { t: 12, r: 46, b: 24, l: 52 }
  const cw = W - pad.l - pad.r
  const ch = H - pad.t - pad.b

  ctx.clearRect(0, 0, W, H)

  // 1.0 baseline
  const baseY = pad.t + ch - (ch * (1.0 - minE)) / range
  ctx.strokeStyle = '#374151'; ctx.lineWidth = 0.5
  ctx.setLineDash([4, 4])
  ctx.beginPath(); ctx.moveTo(pad.l, baseY); ctx.lineTo(pad.l + cw, baseY); ctx.stroke()
  ctx.setLineDash([])

  // Convert date string to x position
  const startTs = new Date(pts[0].date).getTime()
  const endTs = new Date(pts[pts.length - 1].date).getTime()
  const totalMs = endTs - startTs || 1
  const dateX = (dateStr) => pad.l + (cw * (new Date(dateStr).getTime() - startTs)) / totalMs

  // Grid + y-axis labels
  ctx.font = '10px monospace'; ctx.textAlign = 'right'
  for (let i = 0; i <= 4; i++) {
    const v = minE + (range * i) / 4
    const y = pad.t + ch - (ch * i) / 4
    ctx.fillStyle = '#6b7280'
    ctx.fillText(`${v.toFixed(2)}x`, pad.l - 4, y + 3)
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke()
  }

  // Colour regions: green when equity rising (SHORT profitable), red when falling
  // Draw gradient fill
  const lastPt = pts[pts.length - 1]
  const lastEq = lastPt.equity
  const fillColor = lastEq >= T10_ENTRY_EQUITY ? 'rgba(129,140,248,0.15)' : 'rgba(239,68,68,0.1)'
  const lineColor = lastEq >= 1.0 ? '#818cf8' : '#f87171'

  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch)
  grad.addColorStop(0, lastEq >= 1.0 ? 'rgba(129,140,248,0.25)' : 'rgba(239,68,68,0.15)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')

  ctx.beginPath()
  pts.forEach((p, i) => {
    const x = dateX(p.date)
    const y = pad.t + ch - (ch * (p.equity - minE)) / range
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.lineTo(dateX(lastPt.date), pad.t + ch)
  ctx.lineTo(pad.l, pad.t + ch)
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill()

  // Equity line — colour segment by whether above/below 1.0
  ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
  pts.forEach((p, i) => {
    if (i === 0) return
    const prev = pts[i - 1]
    ctx.strokeStyle = prev.equity >= 1.0 && p.equity >= 1.0 ? '#818cf8'
      : prev.equity < 1.0 && p.equity < 1.0 ? '#f87171'
      : '#818cf8'
    ctx.beginPath()
    ctx.moveTo(dateX(prev.date), pad.t + ch - (ch * (prev.equity - minE)) / range)
    ctx.lineTo(dateX(p.date), pad.t + ch - (ch * (p.equity - minE)) / range)
    ctx.stroke()
  })

  // Trade exit dots
  TRADE_EQUITY_PTS.slice(1).forEach(p => {
    const x = dateX(p.date)
    const y = pad.t + ch - (ch * (p.equity - minE)) / range
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fillStyle = p.equity >= 1.0 ? '#818cf8' : '#f87171'
    ctx.fill()
  })

  // Final value label
  const finalX = dateX(lastPt.date)
  const finalY = pad.t + ch - (ch * (lastEq - minE)) / range
  const finalColor = lastEq >= 1.0 ? '#818cf8' : '#f87171'
  ctx.fillStyle = finalColor; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'
  ctx.fillText(`${lastEq.toFixed(4)}x`, finalX + 4, finalY + 4)

  // X-axis: start, mid, end
  ctx.fillStyle = '#6b7280'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
  ;[pts[0], pts[Math.floor(pts.length / 2)], lastPt].forEach(p => {
    const d = new Date(p.date)
    const label = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
    ctx.fillText(label, dateX(p.date), H - 4)
  })
}

// ─── Long/Short Equity Curve (TV-accurate) ────────────────────────
function EquityCurveLongShort({ btcSignal }) {
  const canvasRef = useRef(null)
  const liveBtcPrice = btcSignal?.price || 0
  useEffect(() => {
    drawTradeEquityCanvas(canvasRef.current, liveBtcPrice)
  }, [liveBtcPrice])
  return <canvas ref={canvasRef} className="w-full" style={{ height: 180, display: 'block' }} />
}

// ─── Rotation Badge ───────────────────────────────────────────────
const ASSET_COLORS = {
  BTCUSD:  '#f59e0b',
  ETHUSD:  '#818cf8',
  SOLUSD:  '#a78bfa',
  XRPUSD:  '#60a5fa',
  BNBUSD:  '#fbbf24',
  DOGEUSD: '#fb923c',
  USD:     '#9ca3af',
}

function RotationCard({ rotation }) {
  if (!rotation) return null
  const asset = rotation.asset?.replace(/^(INDEX:|CRYPTO:)/, '') || 'USD'
  const col = ASSET_COLORS[asset] || '#9ca3af'
  const age = rotation.ts
    ? Math.floor((Date.now() - rotation.ts) / (1000 * 60 * 60))
    : null

  return (
    <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
        Rotation Signal
      </div>
      <div className="flex items-center gap-3">
        <div
          className="text-xl font-bold font-mono"
          style={{ color: col }}
        >
          {asset}
        </div>
        {rotation.prev_asset && (
          <div className="text-xs text-gray-500">
            ← {rotation.prev_asset.replace(/^(INDEX:|CRYPTO:)/, '')}
          </div>
        )}
      </div>
      {age != null && (
        <div className="text-xs text-gray-600 mt-1">
          {age < 1 ? 'Just now' : `${age}h ago`}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────
export default function TvSignals() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSignals = async () => {
    try {
      const res = await fetch('/api/signals')
      if (!res.ok) throw new Error('Failed to fetch signals')
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSignals()
    const interval = setInterval(fetchSignals, 60_000) // refresh every 60s
    return () => clearInterval(interval)
  }, [])

  const btc = data?.btc
  const rotation = data?.rotation
  const btcHistory = data?.history?.btc || []
  const stateMeta = STATE_META[btc?.state] || STATE_META['NEUTRAL']

  // ── Top signal banner (for embedding in page.js header area) ──
  // This is exported separately for use in the master overview bar
  return (
    <div className="space-y-4">

      {/* ── Signal Banner ── */}
      {btc && (
        <div
          className="flex items-center gap-4 bg-[#0f172a] border border-gray-800 rounded-lg px-4 py-3 font-mono text-sm"
          style={{ borderLeftWidth: 3, borderLeftColor: stateColor(btc.state) }}
        >
          <span className="text-gray-400">BTC</span>
          <span
            className={`px-2 py-0.5 rounded text-xs font-bold ${stateMeta.bg} ${stateMeta.text}`}
          >
            {btc.state}
          </span>
          <span className="text-gray-300">
            TPI <span style={{ color: stateColor(btc.state) }}>{fmt2(btc.tpi)}</span>
          </span>
          <span className="text-gray-300">
            RoC{' '}
            <span style={{ color: btc.roc >= 0 ? '#22c55e' : '#ef4444' }}>
              {fmt2(btc.roc)}
            </span>
          </span>
          {btc.price > 0 && (
            <span className="text-gray-400 ml-auto">{fmtPrice(btc.price)}</span>
          )}
          {btc.updated_at && (
            <span className="text-gray-600 text-xs">
              {new Date(btc.updated_at).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {loading && !btc && (
        <div className="bg-[#0f172a] border border-gray-800 rounded-lg px-4 py-3 text-gray-500 text-sm font-mono">
          Waiting for first TradingView signal…
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* ── Detail Cards Row ── */}
      <div className="grid grid-cols-2 gap-4">

        {/* BTC Signal Card */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-4 space-y-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider">BTC / ORPI1</div>

          {btc ? (
            <>
              <div className="flex items-center gap-3">
                <div
                  className={`px-3 py-1.5 rounded-md font-bold text-sm ${stateMeta.bg} ${stateMeta.text}`}
                >
                  {btc.state}
                </div>
                <div className="text-gray-300 text-lg font-mono font-bold">
                  {fmtPrice(btc.price)}
                </div>
              </div>

              <TpiGauge tpi={btc.tpi} />

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-gray-500">TPI (live)</div>
                  <div className="font-mono font-bold" style={{ color: stateColor(btc.state) }}>
                    {fmt2(btc.tpi)}
                  </div>
                </div>
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-gray-500">RoC</div>
                  <div
                    className="font-mono font-bold"
                    style={{ color: (btc.roc ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}
                  >
                    {fmt2(btc.roc)}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-600 text-sm">No signal yet</div>
          )}
        </div>

        {/* Rotation Card */}
        <div className="space-y-4">
          <RotationCard rotation={rotation} />

          {/* Legend */}
          <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">State Legend</div>
            <div className="space-y-1">
              {Object.entries(STATE_META).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${v.bg}`} />
                  <span className="text-xs text-gray-400">{k}</span>
                  <span className="text-xs text-gray-600 ml-auto">
                    {k === 'MAX LONG' ? '> 0.9' : k === 'LONG' ? '0.11 – 0.9' : k === 'NEUTRAL' ? '-0.1 – 0.11' : k === 'SHORT' ? '-0.9 – -0.11' : '< -0.9'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── BTC Price Chart ── */}
      {btcHistory.length > 1 && (
        <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
            BTC Price — coloured by TPI state
          </div>
          <BtcPriceChart history={btcHistory} />
          <div className="flex gap-4 mt-2 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-1 bg-green-400 rounded" /> Long
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-1 bg-gray-400 rounded" /> Neutral
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-1 bg-red-400 rounded" /> Short
            </span>
          </div>
        </div>
      )}

      {/* ── ORPI1 Equity Curve (TV-accurate, trade-by-trade) ── */}
      <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-4">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
          ORPI1 Equity Curve — Long / Short
        </div>
        <div className="text-xs text-gray-600 mb-3">
          Trade-accurate · sourced from TV strategy CSV · live endpoint from current BTC price · starts Aug 7 2025
        </div>
        <EquityCurveLongShort btcSignal={btc} />
        <div className="flex gap-4 mt-2 text-xs text-gray-600">
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-400" /> Above 1.0x
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-red-400" /> Below 1.0x
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-500" /> Exit dots
          </span>
        </div>
      </div>

      {/* Empty state charts */}
      {btcHistory.length <= 1 && !loading && (
        <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-6 text-center">
          <div className="text-gray-600 text-sm">
            Charts will populate after receiving TradingView alerts
          </div>
          <div className="text-gray-700 text-xs mt-1 font-mono">
            POST {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Compact Banner (for page.js top bar) ─────────────────────────
export function TvSignalBanner({ btc }) {
  if (!btc) return null
  const stateMeta = STATE_META[btc.state] || STATE_META['NEUTRAL']
  return (
    <div
      className="inline-flex items-center gap-3 font-mono text-xs"
      style={{ color: stateColor(btc.state) }}
    >
      <span className="text-gray-500">BTC</span>
      <span className={`px-1.5 py-0.5 rounded font-bold ${stateMeta.bg} ${stateMeta.text}`}>
        {btc.state}
      </span>
      <span>TPI {fmt2(btc.tpi)}</span>
      <span>RoC {fmt2(btc.roc)}</span>
    </div>
  )
}
