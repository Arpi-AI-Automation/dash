'use client'
import { useEffect, useRef, useState } from 'react'

const ASSETS = [
  { key: 'bnb',  label: 'BNB',  color: '#f3ba2f' },
  { key: 'eth',  label: 'ETH',  color: '#627eea' },
  { key: 'sol',  label: 'SOL',  color: '#9945ff' },
  { key: 'xrp',  label: 'XRP',  color: '#00aae4' },
  { key: 'paxg', label: 'PAXG', color: '#d4af37' },
  { key: 'sui',  label: 'SUI',  color: '#4da2ff' },
  { key: 'btc',  label: 'BTC',  color: '#f7931a' },
  { key: 'usd',  label: 'USD',  color: '#6b7280' },
]
const ASSET_COLOR = Object.fromEntries(ASSETS.map(a => [a.key, a.color]))
const ASSET_LABEL = Object.fromEntries(ASSETS.map(a => [a.key, a.label]))

function assetKey(tvAsset) {
  if (!tvAsset) return 'usd'
  const s = tvAsset.toLowerCase()
  if (s.includes('bnb'))  return 'bnb'
  if (s.includes('eth'))  return 'eth'
  if (s.includes('sol'))  return 'sol'
  if (s.includes('xrp'))  return 'xrp'
  if (s.includes('paxg')) return 'paxg'
  if (s.includes('sui'))  return 'sui'
  if (s.includes('btc'))  return 'btc'
  return 'usd'
}

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toUTCString().slice(0, 16)
}

const LBL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

function EquityCanvas({ history, transitions }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !history?.length) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const dpr    = window.devicePixelRatio || 1
    const W = canvas.clientWidth, H = canvas.clientHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const dayMap = {}
    history.forEach(p => {
      if (!p.date) return
      if (!dayMap[p.date] || p.ts > dayMap[p.date].ts) dayMap[p.date] = p
    })
    const pts = Object.keys(dayMap).sort().map(d => dayMap[d])
    if (pts.length < 2) return

    const sortedT = [...(transitions || [])].sort((a, b) => a.date.localeCompare(b.date))
    const dateAssetMap = {}
    for (let i = 0; i < sortedT.length; i++) {
      const tDate  = sortedT[i].date
      const tAsset = assetKey(sortedT[i].asset)
      const nextDate = sortedT[i + 1]?.date ?? '9999-12-31'
      pts.forEach(p => { if (p.date >= tDate && p.date < nextDate) dateAssetMap[p.date] = tAsset })
    }
    const dateToIdx = {}
    pts.forEach((p, i) => { dateToIdx[p.date] = i })

    const eqNorm = pts.map(p => p.equity ?? null)
    if (eqNorm.every(v => v === null)) eqNorm.fill(1.0)
    else for (let i = 1; i < eqNorm.length; i++) { if (eqNorm[i] === null) eqNorm[i] = eqNorm[i - 1] ?? 1.0 }

    const pad = { t: 12, r: 56, b: 26, l: 46 }
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#f9fafb'; ctx.fillRect(pad.l, pad.t, cw, ch)

    const eqValid = eqNorm.filter(Boolean)
    const minEq = Math.min(...eqValid) * 0.97, maxEq = Math.max(...eqValid) * 1.03
    const rangeEq = maxEq - minEq || 1
    const eX = i => pad.l + (cw * i) / (pts.length - 1)
    const eY = v => pad.t + ch - (ch * (v - minEq)) / rangeEq

    ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'right'
    for (let i = 0; i <= 3; i++) {
      const v = minEq + (rangeEq * i) / 3
      const y = pad.t + ch - (ch * i) / 3
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke()
      ctx.fillStyle = '#9ca3af'; ctx.fillText(v.toFixed(2) + 'x', pad.l - 4, y + 3)
    }

    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 0.8; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(pad.l, eY(1.0)); ctx.lineTo(pad.l + cw, eY(1.0)); ctx.stroke()
    ctx.setLineDash([])

    let segStart = 0
    const drawSeg = (from, to, color) => {
      if (to <= from) return
      ctx.beginPath()
      ctx.moveTo(eX(from), eY(eqNorm[from]))
      for (let k = from + 1; k <= to; k++) ctx.lineTo(eX(k), eY(eqNorm[k]))
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()
    }
    for (let i = 1; i <= pts.length; i++) {
      const prev = dateAssetMap[pts[i - 1]?.date] ?? 'usd'
      const cur  = i < pts.length ? (dateAssetMap[pts[i]?.date] ?? 'usd') : null
      if (cur !== prev || i === pts.length) { drawSeg(segStart, i - 1, ASSET_COLOR[prev] ?? '#8b5cf6'); segStart = i - 1 }
    }

    sortedT.slice(1).forEach(t => {
      const idx = dateToIdx[t.date]
      if (idx == null || eqNorm[idx] == null) return
      const color = ASSET_COLOR[assetKey(t.asset)] ?? '#fff'
      ctx.beginPath(); ctx.arc(eX(idx), eY(eqNorm[idx]), 4, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
      ctx.strokeStyle = '#f9fafb'; ctx.lineWidth = 1.5; ctx.stroke()
    })

    const lastEq = eqNorm[eqNorm.length - 1]
    ctx.font = 'bold 10px -apple-system,sans-serif'; ctx.textAlign = 'left'
    ctx.fillStyle = '#374151'
    ctx.fillText((lastEq ?? 0).toFixed(3) + 'x', pad.l + cw + 4, eY(lastEq) - 4)

    ctx.font = '9px -apple-system,sans-serif'; ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'
    const step = Math.max(1, Math.floor(pts.length / 6))
    for (let i = 0; i < pts.length; i += step) {
      ctx.fillText(pts[i].date?.slice(0, 7) ?? '', eX(i), H - 6)
    }
  }, [history, transitions])

  return <canvas ref={canvasRef} style={{ width: '100%', height: 180, display: 'block', borderRadius: 6 }} />
}

export default function RotationChart2() {
  const [data, setData] = useState(null)

  useEffect(() => {
    const load = async () => {
      try { setData(await (await fetch('/api/signals?history=true')).json()) } catch {}
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => clearInterval(iv)
  }, [])

  const s2          = data?.s2
  const history     = data?.history?.s2 || []
  const transitions = data?.s2Transitions || []
  const scores      = s2?.scores
  const alloc       = s2?.alloc
  const currentKey  = assetKey(s2?.asset)

  // Active keys: those with alloc > 0, or the single currentKey if no alloc
  const activeKeys = alloc
    ? new Set(Object.entries(alloc).filter(([, v]) => v > 0).map(([k]) => k))
    : new Set([currentKey])

  const sortedAssets = (scores || alloc)
    ? [...ASSETS].sort((a, b) => {
        const aV = scores ? (scores[a.key] ?? 0) : (alloc?.[a.key] ?? 0)
        const bV = scores ? (scores[b.key] ?? 0) : (alloc?.[b.key] ?? 0)
        return bV - aV
      })
    : ASSETS

  return (
    <div style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ── */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f3f4f6' }}>

        {/* Row 1: title + date */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
            Asset Rotation <span style={{ color: '#8b5cf6' }}>System 2</span>
          </div>
          <span style={{ ...LBL, textTransform: 'none', letterSpacing: 0 }}>
            {s2?.updated_at ? fmtDate(s2.updated_at) : '—'}
          </span>
        </div>

        {/* Row 2: label + current signal pills — SAME LINE (mirrors S1) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={LBL}>Current signal</span>
          {!s2 ? (
            <span style={{ ...LBL, color: '#d1d5db', textTransform: 'none', fontWeight: 400 }}>awaiting webhook</span>
          ) : alloc ? (
            ASSETS.filter(a => (alloc[a.key] ?? 0) > 0).map(a => (
              <span key={a.key} style={{
                fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
                background: a.color + '18', color: a.color, border: `1px solid ${a.color}40`,
              }}>
                {a.label} <span style={{ fontSize: 11, opacity: .75 }}>{alloc[a.key]}%</span>
              </span>
            ))
          ) : (
            <span style={{
              fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
              background: (ASSET_COLOR[currentKey] ?? '#9ca3af') + '18',
              color: ASSET_COLOR[currentKey] ?? '#9ca3af',
              border: `1px solid ${(ASSET_COLOR[currentKey] ?? '#9ca3af')}40`,
            }}>
              {ASSET_LABEL[currentKey] ?? s2?.asset ?? '—'}
            </span>
          )}
        </div>

        {/* Row 3: asset legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px' }}>
          {ASSETS.map(a => {
            const isActive = activeKeys.has(a.key)
            return (
              <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, display: 'inline-block', opacity: isActive ? 1 : 0.35 }} />
                <span style={{ fontSize: 11, color: isActive ? a.color : '#9ca3af', fontWeight: isActive ? 700 : 400 }}>{a.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Equity curve ── */}
      <div style={{ padding: '1rem 1.25rem .75rem' }}>
        <div style={{ ...LBL, marginBottom: 8 }}>Rotation equity · dots = asset changes</div>
        {history.length > 1 && transitions.length > 0 ? (
          <EquityCanvas history={history} transitions={transitions} />
        ) : (
          <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
            <span style={{ ...LBL, color: '#d1d5db' }}>Equity curve builds as daily data accumulates</span>
          </div>
        )}
      </div>

      {/* ── Score bars ── */}
      {scores && (
        <div style={{ padding: '.75rem 1.25rem 1rem', borderTop: '1px solid #f3f4f6' }}>
          <div style={{ ...LBL, marginBottom: 10 }}>Relative strength scores</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedAssets.map(asset => {
              const score    = scores[asset.key] ?? 0
              const maxAbs   = Math.max(...Object.values(scores).map(Math.abs), 1)
              const isActive = activeKeys.has(asset.key)
              const barColor = score < 0 ? '#ef4444' : asset.color
              return (
                <div key={asset.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, width: 34, textAlign: 'right', flexShrink: 0, color: isActive ? asset.color : '#9ca3af' }}>{asset.label}</span>
                  <div style={{ flex: 1, height: 4, background: '#e5e7eb', borderRadius: 9999, overflow: 'hidden' }}>
                    <div style={{ width: `${(Math.abs(score) / maxAbs) * 100}%`, height: '100%', background: barColor, opacity: isActive ? 1 : 0.35, borderRadius: 9999, transition: 'width .5s' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, width: 28, textAlign: 'right', flexShrink: 0, color: isActive ? asset.color : '#d1d5db' }}>
                    {score > 0 ? '+' : ''}{score}
                  </span>
                  {alloc && (
                    <span style={{ fontSize: 11, fontWeight: 700, width: 32, textAlign: 'right', flexShrink: 0, color: (alloc[asset.key] ?? 0) > 0 ? asset.color : '#d1d5db' }}>
                      {alloc[asset.key] ?? 0}%
                    </span>
                  )}
                  {isActive && <span style={{ fontSize: 11, color: asset.color, flexShrink: 0 }}>←</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Alloc only, no scores */}
      {!scores && alloc && (
        <div style={{ padding: '.75rem 1.25rem 1rem', borderTop: '1px solid #f3f4f6' }}>
          <div style={{ ...LBL, marginBottom: 10 }}>Allocation</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedAssets.filter(a => (alloc[a.key] ?? 0) > 0).map(asset => (
              <div key={asset.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, width: 34, textAlign: 'right', flexShrink: 0, color: asset.color }}>{asset.label}</span>
                <div style={{ flex: 1, height: 4, background: '#e5e7eb', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ width: `${alloc[asset.key]}%`, height: '100%', background: asset.color, borderRadius: 9999 }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, width: 32, textAlign: 'right', flexShrink: 0, color: asset.color }}>{alloc[asset.key]}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
