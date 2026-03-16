'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Asset config ─────────────────────────────────────────────────────────────
const ASSETS = [
  { key: 'bnb',  label: 'BNB',  color: '#f3ba2f' },
  { key: 'eth',  label: 'ETH',  color: '#627eea' },
  { key: 'sol',  label: 'SOL',  color: '#9945ff' },
  { key: 'xrp',  label: 'XRP',  color: '#00aae4' },
  { key: 'paxg', label: 'PAXG', color: '#d4af37' },
  { key: 'sui',  label: 'SUI',  color: '#4da2ff' },
  { key: 'usd',  label: 'USD',  color: '#6b7280' },
]

const ASSET_COLOR = Object.fromEntries(ASSETS.map(a => [a.key, a.color]))
const ASSET_LABEL = Object.fromEntries(ASSETS.map(a => [a.key, a.label]))

// Match TV ticker → our key
function assetKey(tvAsset) {
  if (!tvAsset) return 'usd'
  const s = tvAsset.toLowerCase()
  if (s.includes('bnb'))  return 'bnb'
  if (s.includes('eth'))  return 'eth'
  if (s.includes('sol'))  return 'sol'
  if (s.includes('xrp'))  return 'xrp'
  if (s.includes('paxg')) return 'paxg'
  if (s.includes('sui'))  return 'sui'
  return 'usd'
}

const fmtMultiple = v => v != null ? v.toFixed(3) + 'x' : '—'

// ─── Equity curve canvas ──────────────────────────────────────────────────────
function EquityCanvas({ history, transitions }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !history?.length || !transitions?.length) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const dpr    = window.devicePixelRatio || 1
    const W      = canvas.clientWidth
    const H      = canvas.clientHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    // Deduplicate: one entry per calendar day (last wins)
    const dayMap = {}
    history.forEach(p => {
      if (!p.date) return
      if (!dayMap[p.date] || p.ts > dayMap[p.date].ts) dayMap[p.date] = p
    })
    const pts = Object.keys(dayMap).sort().map(d => dayMap[d])
    if (pts.length < 2) return

    const dateToIdx = {}
    pts.forEach((p, i) => { dateToIdx[p.date] = i })

    // Build equity curve: hold selected asset, flat when USD
    // Uses prev day's asset (no repaint)
    const eqNorm = new Array(pts.length).fill(null)
    eqNorm[0] = 1.0

    // Build date→asset map from transitions (sorted ascending)
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

    // Equity values are pre-computed server-side (fixed-quantity model, real CoinGecko prices)
    // Each entry has .equity stored directly — just read it
    for (let i = 0; i < pts.length; i++) {
      eqNorm[i] = pts[i].equity ?? eqNorm[i - 1] ?? 1.0
    }

    // Safety fill
    for (let i = 1; i < pts.length; i++) {
      if (eqNorm[i] === null) eqNorm[i] = eqNorm[i - 1]
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

    // Grid lines
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 3; i++) {
      const v = minEq + (rangeEq * i) / 3
      const y = pad.t + ch - (ch * i) / 3
      ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke()
      ctx.fillStyle = '#6b7280'
      ctx.fillText(v.toFixed(2) + 'x', W - 4, y + 3)
    }

    // Baseline 1x
    const baseY = eY(1.0)
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 0.8
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(pad.l, baseY); ctx.lineTo(pad.l + cw, baseY); ctx.stroke()
    ctx.setLineDash([])

    // Colour equity line segments by asset
    let segStart = 0
    const drawSegment = (from, to, color) => {
      if (to <= from) return
      ctx.beginPath()
      ctx.moveTo(eX(from), eY(eqNorm[from]))
      for (let k = from + 1; k <= to; k++) {
        ctx.lineTo(eX(k), eY(eqNorm[k]))
      }
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
    }

    for (let i = 1; i <= pts.length; i++) {
      const prevAsset = dateAssetMap[pts[i - 1]?.date] ?? 'usd'
      const curAsset  = i < pts.length ? (dateAssetMap[pts[i]?.date] ?? 'usd') : null
      if (curAsset !== prevAsset || i === pts.length) {
        drawSegment(segStart, i - 1, ASSET_COLOR[prevAsset] ?? '#818cf8')
        segStart = i - 1
      }
    }

    // Transition dots
    sortedT.slice(1).forEach(t => {
      const idx = dateToIdx[t.date]
      if (idx == null || eqNorm[idx] == null) return
      const color = ASSET_COLOR[assetKey(t.asset)] ?? '#fff'
      ctx.beginPath()
      ctx.arc(eX(idx), eY(eqNorm[idx]), 4, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })

    // Final value label
    const lastEq = eqNorm[eqNorm.length - 1]
    const lastX  = eX(pts.length - 1)
    const lastY  = eY(lastEq)
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#e2e8f0'
    ctx.fillText(fmtMultiple(lastEq), W - 4, lastY - 6)

    // X-axis dates
    ctx.font = '9px monospace'
    ctx.fillStyle = '#4b5563'
    ctx.textAlign = 'center'
    const dateStep = Math.max(1, Math.floor(pts.length / 6))
    for (let i = 0; i < pts.length; i += dateStep) {
      const d = pts[i].date?.slice(0, 7) ?? ''
      ctx.fillText(d, eX(i), H - 6)
    }

  }, [history, transitions])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '180px', display: 'block', borderRadius: '6px' }}
    />
  )
}

// ─── Scores table ─────────────────────────────────────────────────────────────
function ScoresTable({ scores }) {
  if (!scores) return (
    <div className="text-gray-500 text-xs font-mono text-center py-4">
      No score data yet — waiting for first webhook
    </div>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-1 text-gray-500 text-left"></th>
            {ASSETS.filter(a => a.key !== 'usd').map(a => (
              <th key={a.key} className="px-2 py-1 text-center" style={{ color: a.color }}>
                {a.label}
              </th>
            ))}
            <th className="px-2 py-1 text-center text-gray-400">USD</th>
            <th className="px-2 py-1 text-center text-gray-300 border-l border-gray-700">Score</th>
          </tr>
        </thead>
        <tbody>
          {ASSETS.map(asset => (
            <tr key={asset.key} className="border-t border-gray-800">
              <td className="px-2 py-1 font-bold" style={{ color: asset.color }}>
                {asset.label}
              </td>
              {ASSETS.filter(a => a.key !== 'usd').map(col => {
                if (col.key === asset.key) {
                  return <td key={col.key} className="px-2 py-1 text-center bg-gray-800/60">—</td>
                }
                return (
                  <td key={col.key} className="px-2 py-1 text-center text-gray-400">·</td>
                )
              })}
              <td className="px-2 py-1 text-center text-gray-400">·</td>
              <td className="px-2 py-1 text-center font-bold border-l border-gray-700"
                style={{ color: asset.color }}>
                {scores[asset.key] ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RotationChart() {
  const [data, setData] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res  = await fetch('/api/signals?history=true')
        const json = await res.json()
        setData(json)
      } catch {}
    }
    fetchData()
    const iv = setInterval(fetchData, 60_000)
    return () => clearInterval(iv)
  }, [])

  const rotation    = data?.rotation
  const history     = data?.history?.rotation || []
  const transitions = data?.rotationTransitions || []
  const scores      = rotation?.scores

  const currentAsset = assetKey(rotation?.asset)
  const assetColor   = ASSET_COLOR[currentAsset] ?? '#9ca3af'
  const assetLabel   = ASSET_LABEL[currentAsset] ?? rotation?.asset ?? '—'

  // Sort assets by score descending for display
  const sortedAssets = scores
    ? [...ASSETS].sort((a, b) => (scores[b.key] ?? 0) - (scores[a.key] ?? 0))
    : ASSETS

  return (
    <div className="bg-[#0f172a] border border-gray-800 rounded-lg overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-gray-400 font-mono text-sm">ASSET ROTATION</span>
          {rotation && (
            <span
              className="px-2 py-0.5 rounded text-xs font-bold font-mono"
              style={{ background: assetColor + '22', color: assetColor, border: `1px solid ${assetColor}44` }}
            >
              {assetLabel}
            </span>
          )}
        </div>
        {rotation?.updated_at && (
          <span className="text-gray-600 text-xs font-mono">
            {new Date(rotation.updated_at).toUTCString().slice(0, 22)}
          </span>
        )}
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

      {/* Score bars */}
      {scores && (
        <div className="px-4 py-3 border-t border-gray-800">
          <div className="text-gray-600 text-xs font-mono mb-2">RELATIVE STRENGTH SCORES (0–6)</div>
          <div className="space-y-1.5">
            {sortedAssets.map(asset => {
              const score = scores[asset.key] ?? 0
              const isActive = asset.key === currentAsset
              return (
                <div key={asset.key} className="flex items-center gap-2">
                  <span
                    className="w-10 text-xs font-mono font-bold text-right shrink-0"
                    style={{ color: asset.color }}
                  >
                    {asset.label}
                  </span>
                  <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(score / 6) * 100}%`,
                        background: asset.color,
                        opacity: isActive ? 1 : 0.5,
                        boxShadow: isActive ? `0 0 6px ${asset.color}88` : 'none',
                      }}
                    />
                  </div>
                  <span className="w-4 text-xs font-mono text-right shrink-0"
                    style={{ color: isActive ? asset.color : '#4b5563' }}>
                    {score}
                  </span>
                  {isActive && (
                    <span className="text-xs font-mono shrink-0" style={{ color: asset.color }}>←</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!scores && (
        <div className="px-4 py-4 border-t border-gray-800 text-gray-600 text-xs font-mono text-center">
          Scores display after first webhook · set up TV alert to fire daily
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-800">
        <p className="text-gray-700 text-xs font-mono">
          Equity = hold selected asset · flat when USD · dots = rotation events · no repaint (prev close signal)
        </p>
      </div>
    </div>
  )
}
