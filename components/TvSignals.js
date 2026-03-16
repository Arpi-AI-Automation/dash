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
// Format: [date, state_on_this_day, exact_tv_close_price]
// state = the signal that fired at this bar's close (what you trade going forward)
// Window start: 2025-03-17, T66 SHORT open from Feb 1 @ $100,646
const TV_TRANSITIONS = [
  ['2025-03-17', 'SHORT',  82611.00],   // window start — T66 SHORT open (MTM price)
  ['2025-04-21', 'LONG',   87500.18],   // T66 exit / T67 entry
  ['2025-06-17', 'SHORT', 104639.20],   // T67 exit / T68 entry
  ['2025-06-29', 'LONG',  108381.92],   // T68 exit / T69 entry
  ['2025-07-01', 'SHORT', 105760.21],   // T69 exit / T70 entry
  ['2025-07-02', 'LONG',  108900.07],   // T70 exit / T71 entry
  ['2025-08-18', 'SHORT', 116302.93],   // T71 exit / T72 entry
  ['2025-09-16', 'LONG',  116818.45],   // T72 exit / T73 entry
  ['2025-09-19', 'SHORT', 115724.93],   // T73 exit / T74 entry
  ['2025-10-01', 'LONG',  118639.48],   // T74 exit / T75 entry
  ['2025-10-10', 'SHORT', 113014.09],   // T75 exit / T76 entry
  ['2026-01-05', 'LONG',   93842.25],   // T76 exit / T77 entry
  ['2026-01-09', 'SHORT',  90541.15],   // T77 exit / T78 entry
  ['2026-01-11', 'LONG',   90894.46],   // T78 exit / T79 entry
  ['2026-01-20', 'SHORT',  88341.87],   // T79 exit / T80 entry ← T80 still OPEN
]
// T80 SHORT still open — equity interpolates from $88,341.87 to today's live price

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

    // ── 2. Compute both equity curves — TV-accurate trade-level compounding ──
    //
    // Uses TV_TRANSITIONS: exact 1D close prices from the CSV strategy export.
    // These match what TradingView uses for trade entry/exit — NOT Redis live prices.
    // Redis prices differ from TV closes by 1–8%, which inflates equity significantly.
    //
    // Method: true daily compounding using actual Redis close prices per day.
    //   LONG  day: equity *= (today / yesterday)         — tracks BTC price up/down
    //   SHORT day: equity *= (yesterday / today)         — inverse BTC, 1x no leverage
    //   CASH  day: equity *= 1                           — flat, no exposure
    //
    // State comes from prev day's signal (no repaint).
    // This gives a smooth curve that visually tracks BTC during each position.
    // TV_TRANSITIONS provide exact entry/exit prices to anchor the compounding
    // correctly at each trade boundary — no seed constants needed.
    //
    // Curve A (L/S):   LONG tracks BTC, SHORT tracks inverse BTC
    // Curve B (HODL):  LONG tracks BTC, SHORT/CASH = flat (hold USD)

    // Build a date→state map from TV_TRANSITIONS so each day gets the correct signal
    // TV_TRANSITIONS[i] = [date, state, price] — state is active FROM that date onward
    const dateStateMap = {}
    for (let i = 0; i < TV_TRANSITIONS.length; i++) {
      const [tDate, tState] = TV_TRANSITIONS[i]
      const nextDate = TV_TRANSITIONS[i + 1]?.[0] ?? '9999-12-31'
      // Mark every btcPts day in this range with the active state
      btcPts.forEach(p => {
        const d = new Date(p.ts).toISOString().slice(0, 10)
        if (d >= tDate && d < nextDate) dateStateMap[d] = tState
      })
    }

    // Daily compound: for each consecutive pair of days, apply the state
    const eqLSnorm   = new Array(btcPts.length).fill(null)
    const eqHODLnorm = new Array(btcPts.length).fill(null)
    eqLSnorm[0]   = 1.0
    eqHODLnorm[0] = 1.0

    for (let i = 1; i < btcPts.length; i++) {
      const prev  = btcPts[i - 1]
      const cur   = btcPts[i]
      const pDay  = new Date(prev.ts).toISOString().slice(0, 10)
      const state = dateStateMap[pDay] ?? prev.state  // fallback to Redis state

      const move  = cur.price / prev.price            // raw daily BTC return factor

      // Curve A: L/S
      if      (state === 'LONG')  eqLSnorm[i] = eqLSnorm[i-1] * move
      else if (state === 'SHORT') eqLSnorm[i] = eqLSnorm[i-1] / move
      else                        eqLSnorm[i] = eqLSnorm[i-1]  // CASH/NEUTRAL

      // Curve B: Hold/Sell
      if (state === 'LONG')       eqHODLnorm[i] = eqHODLnorm[i-1] * move
      else                        eqHODLnorm[i] = eqHODLnorm[i-1]  // flat when not LONG
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
