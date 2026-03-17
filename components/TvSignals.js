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



// TV strategy transition prices — exact 1D close prices from CSV export.
// These are the prices TV uses for trade entry/exit — NOT Redis live prices.
// Redis prices differ from TV closes by 1–8%, causing equity inflation.
// When a new trade exits: update this table and set OPEN_TRADE_ENTRY to the new entry.
//
// FALLBACK ONLY — used if Redis btc:transitions hash is empty (e.g. first boot before backfill)
// The live system reads transitions from the API (data.transitions) automatically.
// No manual updates ever needed — the webhook writes new transitions on every state change.
const TV_TRANSITIONS_FALLBACK = [
  ['2025-03-17', 'SHORT',  82611.00],
  ['2025-04-21', 'LONG',   87500.18],
  ['2025-06-17', 'SHORT', 104639.20],
  ['2025-06-29', 'LONG',  108381.92],
  ['2025-07-01', 'SHORT', 105760.21],
  ['2025-07-02', 'LONG',  108900.07],
  ['2025-08-18', 'SHORT', 116302.93],
  ['2025-09-16', 'LONG',  116818.45],
  ['2025-09-19', 'SHORT', 115724.93],
  ['2025-10-01', 'LONG',  118639.48],
  ['2025-10-10', 'SHORT', 113014.09],
  ['2026-01-05', 'LONG',   93842.25],
  ['2026-01-09', 'SHORT',  90541.15],
  ['2026-01-11', 'LONG',   90894.46],
  ['2026-01-20', 'SHORT',  88341.87],
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
function CombinedChart({ history, transitions }) {
  const TV_TRANSITIONS = transitions?.length > 0 ? transitions : TV_TRANSITIONS_FALLBACK
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

    // ── 2. Compute both equity curves — TV-accurate trade-level compounding ──
    //
    // Uses TV_TRANSITIONS: exact 1D close prices from the CSV strategy export.
    // These match what TradingView uses for trade entry/exit — NOT Redis live prices.
    // Redis prices differ from TV closes by 1–8%, which inflates equity significantly.
    //
    // Method: fixed-quantity model — exactly like holding a position.
    //
    // Within each trade segment, equity tracks the daily Redis price but anchored
    // to the TV entry price. This is equivalent to: "I bought X units at entry_price,
    // today's value is X * current_price" = start_equity * (current_price / entry_price).
    //
    // No daily compounding within a segment — daily path volatility doesn't inflate results.
    // Segment terminal values match TV exactly (same entry/exit prices).
    // Between segments: equity carries forward correctly to the next trade.
    //
    // For SHORT: equivalent to being short X units — value rises when price falls.
    //   equity[day] = start_equity * (entry_price / current_price)  [inverse]
    // For CASH: equity is flat.
    //
    // Curve A (L/S):   LONG = long BTC, SHORT = short BTC (1x no leverage)
    // Curve B (HODL):  LONG = long BTC, SHORT/CASH = flat USD

    const dateToIdx = {}
    btcPts.forEach((p, i) => {
      const d = new Date(p.ts).toISOString().slice(0, 10)
      dateToIdx[d] = i
    })

    const eqLSnorm   = new Array(btcPts.length).fill(null)
    const eqHODLnorm = new Array(btcPts.length).fill(null)
    eqLSnorm[0]   = 1.0
    eqHODLnorm[0] = 1.0

    let cumLS   = 1.0   // equity at start of current segment
    let cumHODL = 1.0

    for (let i = 0; i < TV_TRANSITIONS.length; i++) {
      const [entryDate, state, tvEntryPrice] = TV_TRANSITIONS[i]
      const nextTransition = TV_TRANSITIONS[i + 1]
      const exitDate  = nextTransition?.[0] ?? null
      const tvExitPrice = nextTransition?.[2] ?? null

      const startIdx = dateToIdx[entryDate] ?? 0
      const endIdx   = exitDate ? (dateToIdx[exitDate] ?? btcPts.length - 1) : btcPts.length - 1

      // Fill each day in this segment using fixed-quantity formula
      for (let j = startIdx; j <= endIdx; j++) {
        const currentPrice = btcPts[j].price
        const ratio = currentPrice / tvEntryPrice  // how far price has moved from entry

        if (state === 'LONG') {
          eqLSnorm[j]   = cumLS   * ratio           // long: value rises with price
          eqHODLnorm[j] = cumHODL * ratio
        } else if (state === 'SHORT') {
          eqLSnorm[j]   = cumLS   / ratio           // short: value rises when price falls
          eqHODLnorm[j] = cumHODL                  // hold/sell: flat in USD when short
        } else {
          eqLSnorm[j]   = cumLS                     // cash: flat
          eqHODLnorm[j] = cumHODL
        }
      }

      // Advance cumulative equity to the terminal value of this segment
      // Use TV exit price for exact match with strategy, or last Redis price if open
      const terminalPrice = tvExitPrice ?? btcPts[endIdx].price
      const termRatio     = terminalPrice / tvEntryPrice
      if (state === 'LONG') {
        cumLS   *= termRatio
        cumHODL *= termRatio
      } else if (state === 'SHORT') {
        cumLS   /= termRatio
        // cumHODL stays flat
      }
    }

    // Safety: fill any unfilled slots (shouldn't happen)
    for (let i = 1; i < btcPts.length; i++) {
      if (eqLSnorm[i]   === null) eqLSnorm[i]   = eqLSnorm[i-1]
      if (eqHODLnorm[i] === null) eqHODLnorm[i] = eqHODLnorm[i-1]
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

    // Signal-change dots at each transition date
    TV_TRANSITIONS.slice(1).forEach(([date]) => {
      const idx = btcPts.findIndex(p => new Date(p.ts).toISOString().slice(0, 10) === date)
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
      const res = await fetch('/api/signals?history=true')
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

  // Build TV_TRANSITIONS from Redis (via API) — auto-updated by webhook on every state change
  // Falls back to hardcoded array if Redis transitions not yet populated (e.g. before backfill)
  const rawTransitions = data?.transitions || []
  const TV_TRANSITIONS = rawTransitions.length > 0
    ? rawTransitions
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(t => [t.date, t.state, t.price])
    : TV_TRANSITIONS_FALLBACK
  const stateMeta = STATE_META[btc?.state] || STATE_META['NEUTRAL']

  // ── Top signal banner (for embedding in page.js header area) ──
  // This is exported separately for use in the master overview bar
  return (
    <div className="space-y-4">

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

      {/* ── BTC Signal Card ── */}
      <div>
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

      </div>

      {/* ── BTC Price + ORPI1 Equity Curve (shared x-axis) ── */}
      {btcHistory.length > 1 && (
        <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider">
              BTC Price vs. TPI Strategies
            </div>
            <div className="flex gap-3 text-xs text-gray-600">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-green-400 rounded" /> Long</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-red-400 rounded" /> Short</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-indigo-400 rounded" /> L/S equity</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-amber-400 rounded" /> Hold/Sell</span>
            </div>
          </div>
          <CombinedChart history={btcHistory} transitions={TV_TRANSITIONS} />
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
