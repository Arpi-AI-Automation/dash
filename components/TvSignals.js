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



// Trade exit markers for dots on the curve
const TRADE_EXITS = [
  // T66 SHORT exit → LONG entry
  { date: '2025-04-21', equity: null },
  // T67 LONG exit → SHORT entry
  { date: '2025-06-17', equity: null },
  // T68 SHORT exit → LONG entry
  { date: '2025-06-29', equity: null },
  // T69 LONG exit → SHORT entry
  { date: '2025-07-01', equity: null },
  // T70 SHORT exit → LONG entry
  { date: '2025-07-02', equity: null },
  // T71 LONG exit → SHORT entry
  { date: '2025-08-18', equity: null },
  // T72 SHORT exit → LONG entry
  { date: '2025-09-16', equity: null },
  // T73 LONG exit → SHORT entry
  { date: '2025-09-19', equity: null },
  // T74 SHORT exit → LONG entry
  { date: '2025-10-01', equity: null },
  // T75 LONG exit → SHORT entry
  { date: '2025-10-10', equity: null },
  // T76 SHORT exit → LONG entry
  { date: '2026-01-05', equity: null },
  // T77 LONG exit → SHORT entry
  { date: '2026-01-09', equity: null },
  // T78 SHORT exit → LONG entry
  { date: '2026-01-11', equity: null },
  // T79 LONG exit → SHORT entry (T80 open)
  { date: '2026-01-20', equity: null },
]

// ─── Combined BTC Price + Equity Curve (shared x-axis) ────────────
// Two equity strategies drawn on the same panel:
//   Curve A (purple) — Long/Short: LONG day gains, SHORT day gains both captured
//   Curve B (amber)  — Hold/Sell:  LONG = hold BTC (capture move), SHORT = hold USD (flat)
//
// No-repaint rule: signal applied is prev.state (yesterday's confirmed close),
// never cur.state (today's still-forming bar).
//
// Dedup: Redis stores intraday updates — keep only the LAST entry per calendar day
// (most recent price). This prevents compounding the same day's move multiple times.
function CombinedChart({ history }) {
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

    // ── 1. Deduplicate: one entry per calendar day (last = most recent intraday price) ──
    const dayMap = {}
    ;[...history].forEach(p => {
      if (p.price <= 0) return
      const day = new Date(p.ts).toISOString().slice(0, 10)
      if (!dayMap[day] || p.ts > dayMap[day].ts) dayMap[day] = p
    })
    const btcPts = Object.keys(dayMap).sort().map(d => dayMap[d])
    if (btcPts.length < 2) return

    // ── 2. Compute both equity curves — TRADE-LEVEL compounding ──
    //
    // Method: compound only at state transitions using the transition prices.
    // Within a segment (no state change), equity is interpolated linearly for display
    // but the ONLY prices that affect the compounded return are the entry and exit
    // of each trade segment. This matches how you actually trade: enter at signal,
    // hold until next signal, exit at that price. No daily rebalancing.
    //
    // Curve A (L/S):   LONG = gain when price rises, SHORT = gain when price falls
    // Curve B (HODL):  LONG = hold BTC (price return), SHORT = flat in USD
    //
    // Both start at 1.0x on the first day of the window (no seeds needed).
    // No repaint: signal on day[i] (prev) is applied to the move from day[i]→day[j]
    // where day[j] is the NEXT transition day.

    // Build trade segments: [{entryIdx, exitIdx, entryPrice, exitPrice, state}]
    // Rule: a segment runs from day[segStart] to day[i-1] when state changes on day[i].
    // The final segment always runs to the last day.
    // entryPrice = price of first day in segment (signal fired at that close, we enter)
    // exitPrice  = price of first day of NEXT segment (that's when we exit and re-enter)
    const segments = []
    let segStart = 0
    for (let i = 1; i < btcPts.length; i++) {
      if (btcPts[i].state !== btcPts[segStart].state) {
        // Segment ends at i-1, but we exit at day[i]'s price (first day of new state)
        segments.push({
          entryIdx:   segStart,
          exitIdx:    i,                        // display interpolates up to this index
          entryPrice: btcPts[segStart].price,
          exitPrice:  btcPts[i].price,          // exit = entry price of next segment
          state:      btcPts[segStart].state,
        })
        segStart = i
      }
    }
    // Final open segment: entry at last transition, exit at today's price
    segments.push({
      entryIdx:   segStart,
      exitIdx:    btcPts.length - 1,
      entryPrice: btcPts[segStart].price,
      exitPrice:  btcPts[btcPts.length - 1].price,
      state:      btcPts[segStart].state,
    })

    // Build per-point arrays by interpolating equity within each segment
    const eqLSnorm   = new Array(btcPts.length)
    const eqHODLnorm = new Array(btcPts.length)
    eqLSnorm[0]   = 1.0
    eqHODLnorm[0] = 1.0

    let cumLS   = 1.0
    let cumHODL = 1.0

    for (const seg of segments) {
      const { entryIdx, exitIdx, entryPrice, exitPrice, state } = seg
      const rawPct   = (exitPrice - entryPrice) / entryPrice
      const lsPct    = state === 'LONG' ? rawPct : -rawPct
      const hodlPct  = state === 'LONG' ? rawPct : 0

      const segLS_end   = cumLS   * (1 + lsPct)
      const segHODL_end = cumHODL * (1 + hodlPct)

      // Interpolate display points linearly within the segment
      const steps = exitIdx - entryIdx
      for (let k = 1; k <= steps; k++) {
        const t = k / steps
        eqLSnorm[entryIdx + k]   = cumLS   + (segLS_end   - cumLS)   * t
        eqHODLnorm[entryIdx + k] = cumHODL + (segHODL_end - cumHODL) * t
      }

      cumLS   = segLS_end
      cumHODL = segHODL_end
    }

    // ── 3. Layout ──
    const pad = { t: 8, r: 56, b: 20, l: 60 }
    const splitY = Math.floor(H * 0.58)
    const cw     = W - pad.l - pad.r
    const priceCh  = splitY - pad.t - 4
    const equityCh = H - splitY - pad.b

    ctx.clearRect(0, 0, W, H)

    // ── 4. BTC Price chart (top) ──
    const prices = btcPts.map(d => d.price)
    const minP = Math.min(...prices), maxP = Math.max(...prices)
    const rangeP = maxP - minP || 1

    const pX = i => pad.l + (cw * i) / (btcPts.length - 1)
    const pY = p => pad.t + priceCh - (priceCh * (p - minP)) / rangeP

    // Grid
    ctx.font = '9px monospace'; ctx.textAlign = 'right'
    for (let i = 0; i <= 3; i++) {
      const v = minP + (rangeP * i) / 3
      const y = pad.t + priceCh - (priceCh * i) / 3
      ctx.fillStyle = '#4b5563'
      ctx.fillText(`$${Math.round(v / 1000)}k`, pad.l - 4, y + 3)
      ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke()
    }

    // Coloured price line
    ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
    for (let i = 1; i < btcPts.length; i++) {
      ctx.strokeStyle = stateColor(btcPts[i].state)
      ctx.beginPath()
      ctx.moveTo(pX(i - 1), pY(btcPts[i - 1].price))
      ctx.lineTo(pX(i),     pY(btcPts[i].price))
      ctx.stroke()
    }

    // Divider
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(pad.l, splitY); ctx.lineTo(pad.l + cw, splitY); ctx.stroke()
    ctx.setLineDash([])

    // ── 5. Equity panel (bottom) — shared scale across both curves ──
    const allEq  = [...eqLSnorm, ...eqHODLnorm]
    const minE   = Math.min(...allEq), maxE = Math.max(...allEq)
    const rangeE = maxE - minE || 0.01

    const eX = i  => pad.l + (cw * i) / (btcPts.length - 1)
    const eY = v  => splitY + 4 + equityCh - (equityCh * (v - minE)) / rangeE

    // Baseline 1.0
    const byY = eY(Math.max(minE, Math.min(maxE, 1.0)))
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(pad.l, byY); ctx.lineTo(pad.l + cw, byY); ctx.stroke()
    ctx.setLineDash([])

    // Y-axis labels (right side)
    ctx.font = '9px monospace'; ctx.textAlign = 'left'
    for (let i = 0; i <= 3; i++) {
      const v = minE + (rangeE * i) / 3
      const y = splitY + 4 + equityCh - (equityCh * i) / 3
      ctx.fillStyle = '#4b5563'
      ctx.fillText(`${v.toFixed(2)}x`, pad.l + cw + 4, y + 3)
    }

    // Draw helper: filled area + line for a curve
    const drawCurve = (pts, lineColor, fillColor) => {
      // Fill
      ctx.beginPath()
      pts.forEach((v, i) => { i === 0 ? ctx.moveTo(eX(i), eY(v)) : ctx.lineTo(eX(i), eY(v)) })
      ctx.lineTo(eX(pts.length - 1), splitY + 4 + equityCh)
      ctx.lineTo(pad.l, splitY + 4 + equityCh)
      ctx.closePath()
      ctx.fillStyle = fillColor
      ctx.fill()
      // Line
      ctx.strokeStyle = lineColor; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
      ctx.beginPath()
      pts.forEach((v, i) => { i === 0 ? ctx.moveTo(eX(i), eY(v)) : ctx.lineTo(eX(i), eY(v)) })
      ctx.stroke()
    }

    // Curve B (amber, Hold/Sell) — draw first so purple sits on top
    drawCurve(eqHODLnorm, '#f59e0b', 'rgba(245,158,11,0.08)')
    // Curve A (purple, Long/Short)
    drawCurve(eqLSnorm,   '#818cf8', 'rgba(129,140,248,0.12)')

    // Signal-change dots on both curves
    TRADE_EXITS.forEach(exit => {
      const idx = btcPts.findIndex(p => new Date(p.ts).toISOString().slice(0, 10) === exit.date)
      if (idx < 0) return
      ;[[eqLSnorm, '#818cf8'], [eqHODLnorm, '#f59e0b']].forEach(([pts, col]) => {
        ctx.beginPath(); ctx.arc(eX(idx), eY(pts[idx] ?? 1), 2.5, 0, Math.PI * 2)
        ctx.fillStyle = col; ctx.fill()
      })
    })

    // End-of-curve labels — right side, outside plot area
    const lastLS   = eqLSnorm[eqLSnorm.length - 1]
    const lastHODL = eqHODLnorm[eqHODLnorm.length - 1]
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'
    ctx.fillStyle = '#818cf8'
    ctx.fillText(`${lastLS.toFixed(3)}x`, pad.l + cw + 4, eY(lastLS) + 4)
    ctx.fillStyle = '#f59e0b'
    const lsDiff = Math.abs(eY(lastLS) - eY(lastHODL))
    const hodlOffset = lsDiff < 12 ? 12 : 0
    ctx.fillText(`${lastHODL.toFixed(3)}x`, pad.l + cw + 4, eY(lastHODL) + 4 + hodlOffset)

    // ── 6. Shared x-axis labels ──
    ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ;[0, Math.floor((btcPts.length - 1) / 2), btcPts.length - 1].forEach(i => {
      const d = new Date(btcPts[i].ts)
      ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`, pX(i), H - 4)
    })

  }, [history])

  return (
    <canvas ref={canvasRef} className="w-full" style={{ height: 320, display: 'block' }} />
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

  // Live BTC price — fetched every 30s, separate from signal price (UTC close)
  const [livePrice, setLivePrice] = useState(null)
  useEffect(() => {
    const fetchLive = async () => {
      try {
        const r = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot')
        const j = await r.json()
        const p = parseFloat(j?.data?.amount)
        if (p > 0) setLivePrice(p)
      } catch {}
    }
    fetchLive()
    const iv = setInterval(fetchLive, 30_000)
    return () => clearInterval(iv)
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
          <span className="ml-auto flex items-center gap-2 font-mono">
            {livePrice && livePrice !== btc.price ? (
              <>
                <span className="text-gray-200">{fmtPrice(livePrice)}</span>
                <span className="text-gray-600">/</span>
                <span className="text-gray-500 text-xs">{fmtPrice(btc.price)}</span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: livePrice >= btc.price ? '#22c55e' : '#ef4444' }}
                >
                  {livePrice >= btc.price ? '+' : ''}{(((livePrice - btc.price) / btc.price) * 100).toFixed(2)}%
                </span>
              </>
            ) : btc.price > 0 ? (
              <span className="text-gray-400">{fmtPrice(btc.price)}</span>
            ) : null}
          </span>
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
        <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-5 space-y-5">
          <div className="text-xs text-gray-500 uppercase tracking-wider">BTC TPI STRAT v.2026</div>

          {btc ? (
            <>
              {/* State badge + price block */}
              <div className="flex items-start justify-between gap-4">
                <div
                  className={`px-4 py-2 rounded-md font-bold text-base ${stateMeta.bg} ${stateMeta.text}`}
                >
                  {btc.state}
                </div>

                {/* Dual price: live / UTC close */}
                <div className="text-right">
                  {livePrice ? (
                    <>
                      <div className="font-mono font-bold text-xl text-gray-100">
                        {fmtPrice(livePrice)}
                      </div>
                      <div className="flex items-center justify-end gap-2 mt-0.5">
                        <span className="text-gray-500 text-xs font-mono">{fmtPrice(btc.price)}</span>
                        <span
                          className="text-xs font-mono font-semibold"
                          style={{ color: livePrice >= btc.price ? '#22c55e' : '#ef4444' }}
                        >
                          {livePrice >= btc.price ? '+' : ''}
                          {(((livePrice - btc.price) / btc.price) * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="text-gray-600 text-xs mt-0.5">live / UTC close</div>
                    </>
                  ) : (
                    <div className="font-mono font-bold text-xl text-gray-100">
                      {fmtPrice(btc.price)}
                    </div>
                  )}
                </div>
              </div>

              <TpiGauge tpi={btc.tpi} />

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">TPI</div>
                  <div className="font-mono font-bold text-lg" style={{ color: stateColor(btc.state) }}>
                    {fmt2(btc.tpi)}
                  </div>
                </div>
                <div className="bg-gray-900 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">RoC</div>
                  <div
                    className="font-mono font-bold text-lg"
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

      {/* ── BTC Price + ORPI1 Equity Curve (shared x-axis) ── */}
      {btcHistory.length > 1 && (
        <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider">
              BTC Price + ORPI1 Equity Curve
            </div>
            <div className="flex gap-3 text-xs text-gray-600">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-green-400 rounded" /> Long</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-red-400 rounded" /> Short</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-indigo-400 rounded" /> L/S equity</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-amber-400 rounded" /> Hold/Sell</span>
            </div>
          </div>
          <CombinedChart history={btcHistory} />
          <div className="text-xs text-gray-700 mt-2">
            Purple = Long/Short (captures both directions) · Amber = Hold/Sell (BTC when LONG, USD when SHORT) · dots = signal changes · no repaint (uses prev close signal)
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
