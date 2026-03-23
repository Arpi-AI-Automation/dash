'use client'
import { useEffect, useRef, useState } from 'react'
// ─── Helpers ─────────────────────────────────────────────────────────────────
const stateColor = s => s?.includes('LONG') ? '#059669' : s?.includes('SHORT') ? '#dc2626' : '#6b7280'
const stateBg    = s => s?.includes('LONG') ? 'rgba(16,185,129,.1)' : s?.includes('SHORT') ? 'rgba(239,68,68,.1)' : 'rgba(107,114,128,.1)'
const stateBorder = s => s?.includes('LONG') ? 'rgba(16,185,129,.25)' : s?.includes('SHORT') ? 'rgba(239,68,68,.25)' : 'rgba(107,114,128,.25)'
const tpiDisplayLabel = s =>
  !s                        ? '—'
  : s.includes('MAX LONG')  ? 'TPI Positive · Risk On'
  : s.includes('LONG')      ? 'TPI Positive · Risk On'
  : s.includes('MAX SHORT') ? 'TPI Negative · Risk Off'
  : s.includes('SHORT')     ? 'TPI Negative · Risk Off'
  : s
const fmt2 = v => v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}`
const fmtPrice = v => v ? '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'
const LABEL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
const TV_TRANSITIONS_FALLBACK = [
  ['2025-03-17','SHORT',82611.00], ['2025-04-21','LONG',87500.18],
  ['2025-06-17','SHORT',104639.20], ['2025-06-29','LONG',108381.92],
  ['2025-07-01','SHORT',105760.21], ['2025-07-02','LONG',108900.07],
  ['2025-08-18','SHORT',116302.93], ['2025-09-16','LONG',116818.45],
  ['2025-09-19','SHORT',115724.93], ['2025-10-01','LONG',118639.48],
  ['2025-10-10','SHORT',113014.09], ['2026-01-05','LONG',93842.25],
  ['2026-01-09','SHORT',90541.15], ['2026-01-11','LONG',90894.46],
  ['2026-01-20','SHORT',88341.87],
]
// ─── Canvas chart (same drawing logic, new wrapper/colours) ──────────────────
function CombinedChart({ history, transitions }) {
  const canvasRef = useRef(null)
  const TV = transitions?.length > 0
    ? transitions.sort((a, b) => a.date.localeCompare(b.date)).map(t => [t.date, t.state, t.price])
    : TV_TRANSITIONS_FALLBACK
  useEffect(() => {
    if (!canvasRef.current || !history?.length) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = canvas.clientWidth, H = canvas.clientHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    const dayMap = {}
    history.forEach(p => {
      if (p.price <= 0) return
      const day = new Date(p.ts).toISOString().slice(0, 10)
      if (!dayMap[day] || p.ts > dayMap[day].ts) dayMap[day] = p
    })
    const btcPts = Object.keys(dayMap).sort().map(d => dayMap[d])
    if (btcPts.length < 2) return
    const dateToIdx = {}
    btcPts.forEach((p, i) => { dateToIdx[new Date(p.ts).toISOString().slice(0, 10)] = i })
    const eqLS = new Array(btcPts.length).fill(null)
    const eqHODL = new Array(btcPts.length).fill(null)
    eqLS[0] = 1; eqHODL[0] = 1
    let cumLS = 1, cumHODL = 1
    for (let i = 0; i < TV.length; i++) {
      const [entryDate, state, entryPrice] = TV[i]
      const exitDate = TV[i + 1]?.[0] ?? null
      const exitPrice = TV[i + 1]?.[2] ?? null
      const si = dateToIdx[entryDate] ?? 0
      const ei = exitDate ? (dateToIdx[exitDate] ?? btcPts.length - 1) : btcPts.length - 1
      for (let j = si; j <= ei; j++) {
        const r = btcPts[j].price / entryPrice
        if (state === 'LONG')  { eqLS[j] = cumLS * r; eqHODL[j] = cumHODL * r }
        else if (state === 'SHORT') { eqLS[j] = cumLS / r; eqHODL[j] = cumHODL }
        else { eqLS[j] = cumLS; eqHODL[j] = cumHODL }
      }
      const termR = (exitPrice ?? btcPts[ei].price) / entryPrice
      if (state === 'LONG')  { cumLS *= termR; cumHODL *= termR }
      else if (state === 'SHORT') { cumLS /= termR }
    }
    for (let i = 1; i < btcPts.length; i++) {
      if (eqLS[i] === null)   eqLS[i]   = eqLS[i-1]
      if (eqHODL[i] === null) eqHODL[i] = eqHODL[i-1]
    }
    const pad = { t: 10, r: 58, b: 24, l: 52 }
    const splitY = Math.floor(H * 0.57)
    const cw = W - pad.l - pad.r
    const priceCh = splitY - pad.t - 4
    const equityCh = H - splitY - pad.b
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#f9fafb'
    ctx.fillRect(pad.l, pad.t, cw, priceCh)
    ctx.fillStyle = '#f9fafb'
    ctx.fillRect(pad.l, splitY + 4, cw, equityCh)
    const prices = btcPts.map(d => d.price)
    const minP = Math.min(...prices), maxP = Math.max(...prices)
    const rangeP = maxP - minP || 1
    const pX = i => pad.l + (cw * i) / (btcPts.length - 1)
    const pY = p => pad.t + priceCh - (priceCh * (p - minP)) / rangeP
    ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'right'
    for (let i = 0; i <= 3; i++) {
      const v = minP + (rangeP * i) / 3
      const y = pad.t + priceCh - (priceCh * i) / 3
      ctx.fillStyle = '#9ca3af'
      ctx.fillText(`$${Math.round(v / 1000)}k`, pad.l - 4, y + 3)
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke()
    }
    ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
    for (let i = 1; i < btcPts.length; i++) {
      const col = btcPts[i].state?.includes('LONG') ? '#10b981' : btcPts[i].state?.includes('SHORT') ? '#ef4444' : '#9ca3af'
      ctx.strokeStyle = col
      ctx.beginPath()
      ctx.moveTo(pX(i - 1), pY(btcPts[i - 1].price))
      ctx.lineTo(pX(i), pY(btcPts[i].price))
      ctx.stroke()
    }
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(pad.l, splitY); ctx.lineTo(pad.l + cw, splitY); ctx.stroke()
    ctx.setLineDash([])
    const allEq = [...eqLS, ...eqHODL]
    const minE = Math.min(...allEq), maxE = Math.max(...allEq)
    const rangeE = maxE - minE || 0.01
    const eX = i => pad.l + (cw * i) / (btcPts.length - 1)
    const eY = v => splitY + 4 + equityCh - (equityCh * (v - minE)) / rangeE
    ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'left'
    for (let i = 0; i <= 3; i++) {
      const v = minE + (rangeE * i) / 3
      const y = splitY + 4 + equityCh - (equityCh * i) / 3
      ctx.fillStyle = '#9ca3af'
      ctx.fillText(`${v.toFixed(2)}x`, pad.l + cw + 4, y + 3)
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke()
    }
    const byY = eY(Math.max(minE, Math.min(maxE, 1.0)))
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(pad.l, byY); ctx.lineTo(pad.l + cw, byY); ctx.stroke()
    ctx.setLineDash([])
    const drawCurve = (pts, lineColor, fillColor) => {
      ctx.beginPath()
      pts.forEach((v, i) => i === 0 ? ctx.moveTo(eX(i), eY(v)) : ctx.lineTo(eX(i), eY(v)))
      ctx.lineTo(eX(pts.length - 1), splitY + 4 + equityCh)
      ctx.lineTo(pad.l, splitY + 4 + equityCh)
      ctx.closePath()
      ctx.fillStyle = fillColor; ctx.fill()
      ctx.strokeStyle = lineColor; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
      ctx.beginPath()
      pts.forEach((v, i) => i === 0 ? ctx.moveTo(eX(i), eY(v)) : ctx.lineTo(eX(i), eY(v)))
      ctx.stroke()
    }
    drawCurve(eqHODL, '#f59e0b', 'rgba(245,158,11,0.08)')
    drawCurve(eqLS,   '#8b5cf6', 'rgba(139,92,246,0.10)')
    TV.slice(1).forEach(([date]) => {
      const idx = btcPts.findIndex(p => new Date(p.ts).toISOString().slice(0, 10) === date)
      if (idx < 0) return
      ;[[eqLS, '#8b5cf6'], [eqHODL, '#f59e0b']].forEach(([pts, col]) => {
        ctx.beginPath(); ctx.arc(eX(idx), eY(pts[idx] ?? 1), 2.5, 0, Math.PI * 2)
        ctx.fillStyle = col; ctx.fill()
      })
    })
    const lastLS   = eqLS[eqLS.length - 1]
    const lastHODL = eqHODL[eqHODL.length - 1]
    ctx.font = 'bold 10px -apple-system,sans-serif'; ctx.textAlign = 'left'
    ctx.fillStyle = '#8b5cf6'
    ctx.fillText(`${lastLS.toFixed(3)}x`, pad.l + cw + 4, eY(lastLS) + 4)
    ctx.fillStyle = '#f59e0b'
    const lsDiff = Math.abs(eY(lastLS) - eY(lastHODL))
    ctx.fillText(`${lastHODL.toFixed(3)}x`, pad.l + cw + 4, eY(lastHODL) + 4 + (lsDiff < 12 ? 12 : 0))
    ctx.fillStyle = '#9ca3af'; ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'center'
    ;[0, Math.floor((btcPts.length - 1) / 2), btcPts.length - 1].forEach(i => {
      const d = new Date(btcPts[i].ts)
      ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`, pX(i), H - 4)
    })
  }, [history, transitions])
  return <canvas ref={canvasRef} style={{ width: '100%', height: 420, display: 'block', borderRadius: 6 }} />
}
// ─── Shared data hook ─────────────────────────────────────────────────────────
function useSignalData() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [livePrice, setLivePrice] = useState(null)
  useEffect(() => {
    const fetch_ = async () => {
      try { setData(await (await fetch('/api/signals?history=true')).json()) } catch {}
      setLoading(false)
    }
    fetch_()
    const iv = setInterval(fetch_, 60_000)
    return () => clearInterval(iv)
  }, [])
  useEffect(() => {
    const fetchLive = async () => {
      try {
        const j = await (await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot')).json()
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
// ─── TPI Gauge (for gauge-only usage elsewhere) ───────────────────────────────
export function TvSignalGauge() {
  const { data, loading, livePrice } = useSignalData()
  const btc = data?.btc
  const col = stateColor(btc?.state)
  const bg  = stateBg(btc?.state)
  const bdr = stateBorder(btc?.state)
  const pct = btc?.tpi != null ? ((Math.max(-1, Math.min(1, btc.tpi)) + 1) / 2) * 100 : 50
  return (
    <div style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 12, padding: '1.25rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)', borderLeft: '4px solid #3b82f6' }}>
      <div style={{ ...LABEL, marginBottom: 12 }}>BTC TPI Strategy</div>
      {loading && !btc ? (
        <div style={{ ...LABEL, color: '#d1d5db' }}>Loading…</div>
      ) : btc ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <span style={{ padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, background: bg, color: col, border: `1px solid ${bdr}` }}>
              {tpiDisplayLabel(btc.state)}
            </span>
            <div style={{ textAlign: 'right' }}>
              {livePrice ? (
                <>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{fmtPrice(livePrice)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{fmtPrice(btc.price)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: livePrice >= btc.price ? '#059669' : '#dc2626' }}>
                      {livePrice >= btc.price ? '+' : ''}{(((livePrice - btc.price) / btc.price) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ ...LABEL, marginTop: 2 }}>live / UTC close</div>
                </>
              ) : (
                <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{fmtPrice(btc.price)}</div>
              )}
            </div>
          </div>
          <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ ...LABEL }}>Risk Off</span><span style={{ ...LABEL }}>Risk On</span>
          </div>
          <div style={{ height: 6, background: '#e5e7eb', borderRadius: 9999, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 9999, transition: 'width .7s' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[['TPI', fmt2(btc.tpi)], ['RoC', fmt2(btc.roc)]].map(([lbl, val]) => (
              <div key={lbl} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ ...LABEL, marginBottom: 3 }}>{lbl}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: col }}>{val}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ ...LABEL, color: '#d1d5db' }}>No signal yet</div>
      )}
    </div>
  )
}
// ─── Main chart export ────────────────────────────────────────────────────────
export function TvSignalChart() {
  const { data, loading } = useSignalData()
  const btcHistory   = data?.history?.btc || []
  const rawTransitions = data?.transitions || []
  if (loading && !btcHistory.length) return (
    <div style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 12, padding: '3rem', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)' }}>
      <div style={{ ...LABEL, color: '#d1d5db' }}>Loading chart…</div>
    </div>
  )
  const LEGEND = [['#10b981','Risk On'],['#ef4444','Risk Off'],['#8b5cf6','L/S equity'],['#f59e0b','Hold/Sell']]
  return (
    <div style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 12, padding: '1.25rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ ...LABEL }}>BTC Price vs. TPI Strategies</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {LEGEND.map(([col, lbl]) => (
            <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b7280' }}>
              <span style={{ display: 'inline-block', width: 16, height: 2, background: col, borderRadius: 2 }} />
              {lbl}
            </span>
          ))}
        </div>
      </div>
      {btcHistory.length > 1 ? (
        <CombinedChart history={btcHistory} transitions={rawTransitions} />
      ) : (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
          <span style={{ ...LABEL, color: '#d1d5db' }}>Chart populates after first TradingView alert</span>
        </div>
      )}
      <div style={{ ...LABEL, marginTop: 10, textTransform: 'none', letterSpacing: 0, color: '#9ca3af', fontWeight: 400 }}>
        Purple = Risk On/Risk Off (captures both directions) · Amber = Hold/Sell (BTC when Risk On, USD when Risk Off) · dots = signal changes · no repaint
      </div>
    </div>
  )
}
export default function TvSignals() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <TvSignalGauge />
      <TvSignalChart />
    </div>
  )
}
export function TvSignalBanner({ btc }) {
  if (!btc) return null
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: stateBg(btc.state), color: stateColor(btc.state), border: `1px solid ${stateBorder(btc.state)}` }}>
        {tpiDisplayLabel(btc.state)}
      </span>
      <span style={{ fontSize: 12, color: '#6b7280' }}>TPI {fmt2(btc.tpi)} · RoC {fmt2(btc.roc)}</span>
    </div>
  )
}
