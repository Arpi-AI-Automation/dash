'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Design System ────────────────────────────────────────────────
const DS = {
  base:  { fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#ffffff' },
  label: { fontFamily: 'monospace', fontSize: 11, fontWeight: 400, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase' },
  dim:   { fontFamily: 'monospace', fontSize: 13, fontWeight: 400, color: '#444' },
  card:  { background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8 },
  inner: { background: '#111', borderRadius: 6 },
}

// ─── colour helpers ───────────────────────────────────────────────
const STATE_META = {
  'MAX LONG':  { bg: '#16a34a', text: '#000', label: 'MAX LONG'  },
  'LONG':      { bg: '#22c55e', text: '#000', label: 'LONG'      },
  'NEUTRAL':   { bg: '#6b7280', text: '#fff', label: 'NEUTRAL'   },
  'SHORT':     { bg: '#ef4444', text: '#fff', label: 'SHORT'      },
  'MAX SHORT': { bg: '#dc2626', text: '#fff', label: 'MAX SHORT' },
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
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ ...DS.dim }}>-1</span>
        <span style={{ ...DS.base, fontSize: 16 }}>{fmt2(val)}</span>
        <span style={{ ...DS.dim }}>+1</span>
      </div>
      <div style={{ height: 4, background: '#1f2937', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 9999, transition: 'width 0.7s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ ...DS.label }}>SHORT</span>
        <span style={{ ...DS.label }}>LONG</span>
      </div>
    </div>
  )
}

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

// ─── Combined BTC Price + Equity Curve ────────────────────────────
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

    const dayMap = {}
    ;[...history].forEach(p => {
      if (p.price <= 0) return
      const day = new Date(p.ts).toISOString().slice(0, 10)
      if (!dayMap[day] || p.ts > dayMap[day].ts) dayMap[day] = p
    })
    const btcPts = Object.keys(dayMap).sort().map(d => dayMap[d])
    if (btcPts.length < 2) return

    const dateToIdx = {}
    btcPts.forEach((p, i) => {
      const d = new Date(p.ts).toISOString().slice(0, 10)
      dateToIdx[d] = i
    })

    const eqLSnorm   = new Array(btcPts.length).fill(null)
    const eqHODLnorm = new Array(btcPts.length).fill(null)
    eqLSnorm[0]   = 1.0
    eqHODLnorm[0] = 1.0

    let cumLS   = 1.0
    let cumHODL = 1.0

    for (let i = 0; i < TV_TRANSITIONS.length; i++) {
      const [entryDate, state, tvEntryPrice] = TV_TRANSITIONS[i]
      const nextTransition = TV_TRANSITIONS[i + 1]
      const exitDate  = nextTransition?.[0] ?? null
      const tvExitPrice = nextTransition?.[2] ?? null
      const startIdx = dateToIdx[entryDate] ?? 0
      const endIdx   = exitDate ? (dateToIdx[exitDate] ?? btcPts.length - 1) : btcPts.length - 1

      for (let j = startIdx; j <= endIdx; j++) {
        const currentPrice = btcPts[j].price
        const ratio = currentPrice / tvEntryPrice
        if (state === 'LONG') {
          eqLSnorm[j]   = cumLS   * ratio
          eqHODLnorm[j] = cumHODL * ratio
        } else if (state === 'SHORT') {
          eqLSnorm[j]   = cumLS   / ratio
          eqHODLnorm[j] = cumHODL
        } else {
          eqLSnorm[j]   = cumLS
          eqHODLnorm[j] = cumHODL
        }
      }

      const terminalPrice = tvExitPrice ?? btcPts[endIdx].price
      const termRatio     = terminalPrice / tvEntryPrice
      if (state === 'LONG') {
        cumLS   *= termRatio
        cumHODL *= termRatio
      } else if (state === 'SHORT') {
        cumLS   /= termRatio
      }
    }

    for (let i = 1; i < btcPts.length; i++) {
      if (eqLSnorm[i]   === null) eqLSnorm[i]   = eqLSnorm[i-1]
      if (eqHODLnorm[i] === null) eqHODLnorm[i] = eqHODLnorm[i-1]
    }

    const pad = { t: 8, r: 56, b: 20, l: 60 }
    const splitY = Math.floor(H * 0.58)
    const cw     = W - pad.l - pad.r
    const priceCh  = splitY - pad.t - 4
    const equityCh = H - splitY - pad.b

    ctx.clearRect(0, 0, W, H)

    const prices = btcPts.map(d => d.price)
    const minP = Math.min(...prices), maxP = Math.max(...prices)
    const rangeP = maxP - minP || 1

    const pX = i => pad.l + (cw * i) / (btcPts.length - 1)
    const pY = p => pad.t + priceCh - (priceCh * (p - minP)) / rangeP

    ctx.font = '9px monospace'; ctx.textAlign = 'right'
    for (let i = 0; i <= 3; i++) {
      const v = minP + (rangeP * i) / 3
      const y = pad.t + priceCh - (priceCh * i) / 3
      ctx.fillStyle = '#4b5563'
      ctx.fillText(`$${Math.round(v / 1000)}k`, pad.l - 4, y + 3)
      ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke()
    }

    ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
    for (let i = 1; i < btcPts.length; i++) {
      ctx.strokeStyle = stateColor(btcPts[i].state)
      ctx.beginPath()
      ctx.moveTo(pX(i - 1), pY(btcPts[i - 1].price))
      ctx.lineTo(pX(i),     pY(btcPts[i].price))
      ctx.stroke()
    }

    ctx.strokeStyle = '#374151'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(pad.l, splitY); ctx.lineTo(pad.l + cw, splitY); ctx.stroke()
    ctx.setLineDash([])

    const allEq  = [...eqLSnorm, ...eqHODLnorm]
    const minE   = Math.min(...allEq), maxE = Math.max(...allEq)
    const rangeE = maxE - minE || 0.01

    const eX = i  => pad.l + (cw * i) / (btcPts.length - 1)
    const eY = v  => splitY + 4 + equityCh - (equityCh * (v - minE)) / rangeE

    const byY = eY(Math.max(minE, Math.min(maxE, 1.0)))
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(pad.l, byY); ctx.lineTo(pad.l + cw, byY); ctx.stroke()
    ctx.setLineDash([])

    ctx.font = '9px monospace'; ctx.textAlign = 'left'
    for (let i = 0; i <= 3; i++) {
      const v = minE + (rangeE * i) / 3
      const y = splitY + 4 + equityCh - (equityCh * i) / 3
      ctx.fillStyle = '#4b5563'
      ctx.fillText(`${v.toFixed(2)}x`, pad.l + cw + 4, y + 3)
    }

    const drawCurve = (pts, lineColor, fillColor) => {
      ctx.beginPath()
      pts.forEach((v, i) => { i === 0 ? ctx.moveTo(eX(i), eY(v)) : ctx.lineTo(eX(i), eY(v)) })
      ctx.lineTo(eX(pts.length - 1), splitY + 4 + equityCh)
      ctx.lineTo(pad.l, splitY + 4 + equityCh)
      ctx.closePath()
      ctx.fillStyle = fillColor; ctx.fill()
      ctx.strokeStyle = lineColor; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
      ctx.beginPath()
      pts.forEach((v, i) => { i === 0 ? ctx.moveTo(eX(i), eY(v)) : ctx.lineTo(eX(i), eY(v)) })
      ctx.stroke()
    }

    drawCurve(eqHODLnorm, '#f59e0b', 'rgba(245,158,11,0.08)')
    drawCurve(eqLSnorm,   '#818cf8', 'rgba(129,140,248,0.12)')

    TV_TRANSITIONS.slice(1).forEach(([date]) => {
      const idx = btcPts.findIndex(p => new Date(p.ts).toISOString().slice(0, 10) === date)
      if (idx < 0) return
      ;[[eqLSnorm, '#818cf8'], [eqHODLnorm, '#f59e0b']].forEach(([pts, col]) => {
        ctx.beginPath(); ctx.arc(eX(idx), eY(pts[idx] ?? 1), 2.5, 0, Math.PI * 2)
        ctx.fillStyle = col; ctx.fill()
      })
    })

    const lastLS   = eqLSnorm[eqLSnorm.length - 1]
    const lastHODL = eqHODLnorm[eqHODLnorm.length - 1]
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'
    ctx.fillStyle = '#818cf8'
    ctx.fillText(`${lastLS.toFixed(3)}x`, pad.l + cw + 4, eY(lastLS) + 4)
    ctx.fillStyle = '#f59e0b'
    const lsDiff = Math.abs(eY(lastLS) - eY(lastHODL))
    const hodlOffset = lsDiff < 12 ? 12 : 0
    ctx.fillText(`${lastHODL.toFixed(3)}x`, pad.l + cw + 4, eY(lastHODL) + 4 + hodlOffset)

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

// ─── Shared data hook ─────────────────────────────────────────────
function useSignalData() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [livePrice, setLivePrice] = useState(null)

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const res = await fetch('/api/signals?history=true')
        if (!res.ok) throw new Error('Failed to fetch signals')
        setData(await res.json())
      } catch {}
      setLoading(false)
    }
    fetchSignals()
    const iv = setInterval(fetchSignals, 60_000)
    return () => clearInterval(iv)
  }, [])

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

  return { data, loading, livePrice }
}

// ─── EXPORT 1: BTC TPI Gauge card only ───────────────────────────
export function TvSignalGauge() {
  const { data, loading, livePrice } = useSignalData()
  const btc = data?.btc
  const stateMeta = STATE_META[btc?.state] || STATE_META['NEUTRAL']

  return (
    <div style={{ ...DS.card, padding: '20px 20px 16px' }}>
      <div style={{ ...DS.label, marginBottom: 14 }}>BTC TPI STRAT v.2026</div>

      {loading && !btc && (
        <div style={{ ...DS.dim }}>Waiting for first signal…</div>
      )}

      {btc ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div style={{
              padding: '6px 16px', borderRadius: 6, fontFamily: 'monospace',
              fontSize: 18, fontWeight: 700, background: stateMeta.bg, color: stateMeta.text
            }}>
              {btc.state}
            </div>
            <div style={{ textAlign: 'right' }}>
              {livePrice ? (
                <>
                  <div style={{ ...DS.base, fontSize: 22 }}>{fmtPrice(livePrice)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
                    <span style={{ ...DS.dim }}>{fmtPrice(btc.price)}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
                      color: livePrice >= btc.price ? '#22c55e' : '#ef4444' }}>
                      {livePrice >= btc.price ? '+' : ''}
                      {(((livePrice - btc.price) / btc.price) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ ...DS.label, marginTop: 2 }}>live / UTC close</div>
                </>
              ) : (
                <div style={{ ...DS.base, fontSize: 22 }}>{fmtPrice(btc.price)}</div>
              )}
            </div>
          </div>

          <TpiGauge tpi={btc.tpi} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <div style={{ ...DS.inner, padding: '10px 14px' }}>
              <div style={{ ...DS.label, marginBottom: 4 }}>TPI</div>
              <div style={{ ...DS.base, fontSize: 20, color: stateColor(btc.state) }}>{fmt2(btc.tpi)}</div>
            </div>
            <div style={{ ...DS.inner, padding: '10px 14px' }}>
              <div style={{ ...DS.label, marginBottom: 4 }}>RoC</div>
              <div style={{ ...DS.base, fontSize: 20, color: (btc.roc ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                {fmt2(btc.roc)}
              </div>
            </div>
          </div>
        </>
      ) : (
        !loading && <div style={{ ...DS.dim }}>No signal yet</div>
      )}
    </div>
  )
}

// ─── EXPORT 2: BTC Price vs TPI chart only ───────────────────────
export function TvSignalChart() {
  const { data, loading } = useSignalData()
  const btcHistory = data?.history?.btc || []
  const rawTransitions = data?.transitions || []
  const TV_TRANSITIONS = rawTransitions.length > 0
    ? rawTransitions.sort((a, b) => a.date.localeCompare(b.date)).map(t => [t.date, t.state, t.price])
    : TV_TRANSITIONS_FALLBACK

  if (loading && !btcHistory.length) return (
    <div style={{ ...DS.card, padding: 24, textAlign: 'center' }}>
      <span style={{ ...DS.dim }}>Loading chart…</span>
    </div>
  )

  if (btcHistory.length <= 1) return (
    <div style={{ ...DS.card, padding: 24, textAlign: 'center' }}>
      <span style={{ ...DS.dim }}>Chart populates after first TradingView alert</span>
    </div>
  )

  return (
    <div style={{ ...DS.card, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ ...DS.label }}>BTC PRICE VS. TPI STRATEGIES</div>
        <div style={{ display: 'flex', gap: 16 }}>
          {[['#22c55e','Long'],['#ef4444','Short'],['#818cf8','L/S equity'],['#f59e0b','Hold/Sell']].map(([col, lbl]) => (
            <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 12, height: 2, background: col, borderRadius: 2 }} />
              <span style={{ ...DS.label, textTransform: 'none', letterSpacing: 0 }}>{lbl}</span>
            </span>
          ))}
        </div>
      </div>
      <CombinedChart history={btcHistory} transitions={TV_TRANSITIONS} />
      <div style={{ ...DS.label, marginTop: 8, textTransform: 'none', letterSpacing: 0, color: '#333' }}>
        Purple = Long/Short (captures both directions) · Amber = Hold/Sell (BTC when LONG, USD when SHORT) · dots = signal changes · no repaint (uses prev close signal)
      </div>
    </div>
  )
}

// ─── Default export ───────────────────────────────────────────────
export default function TvSignals() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TvSignalGauge />
      <TvSignalChart />
    </div>
  )
}

// ─── Compact Banner ───────────────────────────────────────────────
export function TvSignalBanner({ btc }) {
  if (!btc) return null
  const stateMeta = STATE_META[btc.state] || STATE_META['NEUTRAL']
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: 'monospace', color: stateColor(btc.state) }}>
      <span style={{ ...DS.label }}>BTC</span>
      <span style={{ padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 13, background: stateMeta.bg, color: stateMeta.text }}>{btc.state}</span>
      <span style={{ ...DS.base, fontSize: 14 }}>TPI {fmt2(btc.tpi)}</span>
      <span style={{ ...DS.base, fontSize: 14 }}>RoC {fmt2(btc.roc)}</span>
    </div>
  )
}
