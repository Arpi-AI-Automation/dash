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

// ─── Equity Curve ─────────────────────────────────────────────────
function EquityCurve({ history }) {
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

    // Build equity curve from TPI history (newest-first → reverse)
    const pts = [...history].reverse().filter((d) => d.price > 0)
    if (pts.length < 2) return

    // Simple equity: long when tpi >= 0, flat otherwise
    // Track cumulative return using price changes
    const equity = [1]
    for (let i = 1; i < pts.length; i++) {
      const prevPrice = pts[i - 1].price
      const curPrice = pts[i].price
      const pctChange = prevPrice > 0 ? (curPrice - prevPrice) / prevPrice : 0
      const prevTpi = pts[i - 1].tpi ?? 0
      const ret = prevTpi >= 0 ? pctChange : 0  // only capture return when long
      equity.push(equity[equity.length - 1] * (1 + ret))
    }

    const minE = Math.min(...equity)
    const maxE = Math.max(...equity)
    const range = maxE - minE || 0.01
    const pad = { t: 12, r: 8, b: 24, l: 52 }
    const cw = W - pad.l - pad.r
    const ch = H - pad.t - pad.b

    ctx.clearRect(0, 0, W, H)

    // baseline at 1x
    const baseY = pad.t + ch - (ch * (1 - minE)) / range
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 0.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(pad.l, baseY)
    ctx.lineTo(pad.l + cw, baseY)
    ctx.stroke()
    ctx.setLineDash([])

    // y-axis
    ctx.fillStyle = '#6b7280'
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const v = minE + (range * i) / 4
      const y = pad.t + ch - (ch * i) / 4
      ctx.fillText(`${v.toFixed(2)}x`, pad.l - 4, y + 3)
      ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(pad.l, y)
      ctx.lineTo(pad.l + cw, y)
      ctx.stroke()
    }

    // gradient fill under curve
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch)
    grad.addColorStop(0, 'rgba(34,197,94,0.25)')
    grad.addColorStop(1, 'rgba(34,197,94,0)')

    ctx.beginPath()
    equity.forEach((v, i) => {
      const x = pad.l + (cw * i) / (equity.length - 1)
      const y = pad.t + ch - (ch * (v - minE)) / range
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    const lastX = pad.l + cw
    const bottomY = pad.t + ch
    ctx.lineTo(lastX, bottomY)
    ctx.lineTo(pad.l, bottomY)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // equity line
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    equity.forEach((v, i) => {
      const x = pad.l + (cw * i) / (equity.length - 1)
      const y = pad.t + ch - (ch * (v - minE)) / range
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()

    // final value label
    const lastVal = equity[equity.length - 1]
    const lastY = pad.t + ch - (ch * (lastVal - minE)) / range
    ctx.fillStyle = '#22c55e'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`${lastVal.toFixed(2)}x`, pad.l + cw + 2, lastY + 4)

    // x-axis dates
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

      {/* ── Equity Curve ── */}
      {btcHistory.length > 1 && (
        <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
            ORPI1 Equity Curve — long-only (TPI ≥ 0)
          </div>
          <EquityCurve history={btcHistory} />
          <div className="text-xs text-gray-600 mt-2">
            Captures price return only when TPI ≥ 0. Builds from first webhook received.
          </div>
        </div>
      )}

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
