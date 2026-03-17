'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Asset config (same as System 1) ──────────────────────────────────────────
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

const fmtMultiple = v => v != null ? v.toFixed(3) + 'x' : '—'

// ─── Equity canvas ────────────────────────────────────────────────────────────
// Simulates holding the signalled asset each day vs buy & hold BTC.
// Uses CoinGecko daily prices stored in s2:daily entries (injected server-side).
// If no .equity on entries yet, falls back to flat 1.0 line until prices arrive.
function EquityCanvas({ history, transitions }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !history?.length) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const dpr    = window.devicePixelRatio || 1
    const W      = canvas.clientWidth
    const H      = canvas.clientHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    // Deduplicate: one entry per calendar day
    const dayMap = {}
    history.forEach(p => {
      if (!p.date) return
      if (!dayMap[p.date] || p.ts > dayMap[p.date].ts) dayMap[p.date] = p
    })
    const pts = Object.keys(dayMap).sort().map(d => dayMap[d])
    if (pts.length < 2) return

    // Build dateAssetMap from transitions
    const sortedT = [...transitions].sort((a, b) => a.date.localeCompare(b.date))
    const dateAssetMap = {}
    for (let i = 0; i < sortedT.length; i++) {
      const tDate    = sortedT[i].date
      const tAsset   = assetKey(sortedT[i].asset)
      const nextDate = sortedT[i + 1]?.date ?? '9999-12-31'
      pts.forEach(p => {
        if (p.date >= tDate && p.date < nextDate) dateAssetMap[p.date] = tAsset
      })
    }

    const dateToIdx = {}
    pts.forEach((p, i) => { dateToIdx[p.date] = i })

    // Equity curve — use .equity if pre-computed, else flat
    const eqNorm = pts.map(p => p.equity ?? null)
    if (eqNorm.every(v => v === null)) {
      // No pre-computed equity yet — just show flat line at 1.0
      eqNorm.fill(1.0)
    } else {
      // Forward-fill any gaps
      for (let i = 1; i < eqNorm.length; i++) {
        if (eqNorm[i] === null) eqNorm[i] = eqNorm[i - 1] ?? 1.0
      }
    }

    // ── Layout ────────────────────────────────────────────────────────────────
    const pad = { t: 12, r: 56, b: 28, l: 16 }
    const cw  = W - pad.l - pad.r
    const ch  = H - pad.t - pad.b

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, W, H)

    const eqValid = eqNorm.filter(Boolean)
    const minEq   = Math.min(...eqValid) * 0.97
    const maxEq   = Math.max(...eqValid) * 1.03
    const rangeEq = maxEq - minEq || 1

    const eX = i => pad.l + (cw * i) / (pts.length - 1)
    const eY = v => pad.t + ch - (ch * (v - minEq)) / rangeEq

    // Grid
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 3; i++) {
      const v = minEq + (rangeEq * i) / 3
      const y = pad.t + ch - (ch * i) / 3
      ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke()
      ctx.fillStyle = '#6b7280'
      ctx.fillText(v.toFixed(2) + 'x', W - 4, y + 3)
    }

    // Baseline
    const baseY = eY(1.0)
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 0.8; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(pad.l, baseY); ctx.lineTo(pad.l + cw, baseY); ctx.stroke()
    ctx.setLineDash([])

    // Coloured segments by asset
    let segStart = 0
    const drawSeg = (from, to, color) => {
      if (to <= from) return
      ctx.beginPath()
      ctx.moveTo(eX(from), eY(eqNorm[from]))
      for (let k = from + 1; k <= to; k++) ctx.lineTo(eX(k), eY(eqNorm[k]))
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()
    }
    for (let i = 1; i <= pts.length; i++) {
      const prevAsset = dateAssetMap[pts[i - 1]?.date] ?? 'usd'
      const curAsset  = i < pts.length ? (dateAssetMap[pts[i]?.date] ?? 'usd') : null
      if (curAsset !== prevAsset || i === pts.length) {
        drawSeg(segStart, i - 1, ASSET_COLOR[prevAsset] ?? '#818cf8')
        segStart = i - 1
      }
    }

    // Transition dots
    sortedT.slice(1).forEach(t => {
      const idx = dateToIdx[t.date]
      if (idx == null || eqNorm[idx] == null) return
      const color = ASSET_COLOR[assetKey(t.asset)] ?? '#fff'
      ctx.beginPath(); ctx.arc(eX(idx), eY(eqNorm[idx]), 4, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5; ctx.stroke()
    })

    // Final value label
    const lastEq = eqNorm[eqNorm.length - 1]
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'right'
    ctx.fillStyle = '#e2e8f0'
    ctx.fillText(fmtMultiple(lastEq), W - 4, eY(lastEq) - 6)

    // X-axis dates
    ctx.font = '9px monospace'; ctx.fillStyle = '#4b5563'; ctx.textAlign = 'center'
    const step = Math.max(1, Math.floor(pts.length / 6))
    for (let i = 0; i < pts.length; i += step) {
      ctx.fillText(pts[i].date?.slice(0, 7) ?? '', eX(i), H - 6)
    }

  }, [history, transitions])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '180px', display: 'block', borderRadius: '6px' }}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RotationChart2() {
  const [data, setData] = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res  = await fetch('/api/signals?history=true')
        const json = await res.json()
        setData(json)
      } catch {}
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

  const currentAsset = assetKey(s2?.asset)
  const assetColor   = ASSET_COLOR[currentAsset] ?? '#9ca3af'
  const assetLabel   = ASSET_LABEL[currentAsset] ?? s2?.asset ?? '—'

  // Sort by score desc if available, else by alloc desc
  const sortedAssets = (scores || alloc)
    ? [...ASSETS].sort((a, b) => {
        const aVal = scores ? (scores[a.key] ?? 0) : (alloc?.[a.key] ?? 0)
        const bVal = scores ? (scores[b.key] ?? 0) : (alloc?.[b.key] ?? 0)
        return bVal - aVal
      })
    : ASSETS

  return (
    <div style={{ borderTop: '1px solid #1a1a1a' }}>

      {/* Header */}
      <div className="px-4 pt-3 pb-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e0e0', letterSpacing: '0.05em', fontFamily: 'monospace' }}>
            ASSET ROTATION <span style={{ color: '#818cf8' }}>SYSTEM 2</span>
          </span>
          {s2?.updated_at && (
            <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>
              {new Date(s2.updated_at).toUTCString().slice(0, 16)}
            </span>
          )}
        </div>

        {/* Dominant asset */}
        <div className="flex items-center gap-2 mb-3">
          <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace', letterSpacing: '0.1em' }}>DOMINANT ASSET</span>
          {s2 ? (
            <span style={{
              fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
              padding: '2px 10px', borderRadius: 2,
              background: assetColor + '22', color: assetColor, border: `1px solid ${assetColor}55`
            }}>
              {assetLabel}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: '#555', fontFamily: 'monospace' }}>
              awaiting first webhook
            </span>
          )}
        </div>

        {/* Asset legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px' }}>
          {ASSETS.map(a => (
            <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: a.color, display: 'inline-block',
                boxShadow: a.key === currentAsset ? `0 0 6px ${a.color}` : 'none',
                opacity: a.key === currentAsset ? 1 : 0.4,
              }} />
              <span style={{
                fontFamily: 'monospace', fontSize: 11,
                color: a.key === currentAsset ? a.color : '#555',
                fontWeight: a.key === currentAsset ? 700 : 400,
              }}>
                {a.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Equity curve */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-gray-600 text-xs font-mono mb-1">
          ROTATION EQUITY · dots = asset changes
        </div>
        {history.length > 1 && transitions.length > 0 ? (
          <EquityCanvas history={history} transitions={transitions} />
        ) : (
          <div className="h-[180px] flex items-center justify-center text-gray-600 text-xs font-mono border border-gray-800 rounded">
            Equity curve builds after first webhook fires
          </div>
        )}
      </div>

      {/* Score bars — shown when indicator sends scores */}
      {scores && (
        <div className="px-4 py-3 border-t border-gray-800">
          <div className="text-gray-600 text-xs font-mono mb-2">RELATIVE STRENGTH SCORES</div>
          <div className="space-y-1.5">
            {sortedAssets.map(asset => {
              const score = scores[asset.key] ?? 0
              const maxAbs = Math.max(...Object.values(scores).map(Math.abs), 1)
              const isActive = asset.key === currentAsset
              // Scores can be negative — normalise to bar width
              const barPct = Math.abs(score) / maxAbs * 100
              return (
                <div key={asset.key} className="flex items-center gap-2">
                  <span className="w-10 text-xs font-mono font-bold text-right shrink-0"
                    style={{ color: asset.color }}>{asset.label}</span>
                  <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${barPct}%`,
                        background: score < 0 ? '#ef4444' : asset.color,
                        opacity: isActive ? 1 : 0.5,
                        boxShadow: isActive ? `0 0 6px ${asset.color}88` : 'none',
                      }} />
                  </div>
                  <span className="w-6 text-xs font-mono text-right shrink-0"
                    style={{ color: isActive ? asset.color : '#4b5563' }}>
                    {score > 0 ? '+' : ''}{score}
                  </span>
                  {/* Allocation % if sent */}
                  {alloc && (
                    <span className="w-9 text-xs font-mono text-right shrink-0"
                      style={{ color: (alloc[asset.key] ?? 0) > 0 ? asset.color : '#333' }}>
                      {alloc[asset.key] ?? 0}%
                    </span>
                  )}
                  {isActive && <span className="text-xs font-mono shrink-0" style={{ color: asset.color }}>←</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Allocation only (no scores) */}
      {!scores && alloc && (
        <div className="px-4 py-3 border-t border-gray-800">
          <div className="text-gray-600 text-xs font-mono mb-2">ALLOCATION</div>
          <div className="space-y-1.5">
            {sortedAssets.filter(a => (alloc[a.key] ?? 0) > 0).map(asset => (
              <div key={asset.key} className="flex items-center gap-2">
                <span className="w-10 text-xs font-mono font-bold text-right shrink-0"
                  style={{ color: asset.color }}>{asset.label}</span>
                <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${alloc[asset.key]}%`, background: asset.color }} />
                </div>
                <span className="w-9 text-xs font-mono text-right shrink-0"
                  style={{ color: asset.color }}>{alloc[asset.key]}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
