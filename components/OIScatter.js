'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

// Funding rate → dot color
function fundingColor(fr) {
  if (fr === null || fr === undefined) return { fill: '#334155', label: 'No data' }
  if (fr >  0.05) return { fill: '#ef4444', label: `FR +${fr.toFixed(4)}% — longs overheated` }
  if (fr >  0.01) return { fill: '#f97316', label: `FR +${fr.toFixed(4)}% — positive` }
  if (fr > -0.01) return { fill: '#94a3b8', label: `FR ${fr.toFixed(4)}% — neutral` }
  if (fr > -0.05) return { fill: '#818cf8', label: `FR ${fr.toFixed(4)}% — negative` }
  return               { fill: '#22c55e', label: `FR ${fr.toFixed(4)}% — shorts overheated` }
}

function getRegime(priceChg, oiChg) {
  if (priceChg >= 0 && oiChg >= 0) return { label: 'LEVERAGE BUILDING', sub: 'OI↑ Price↑ · Bullish momentum · Check funding', color: '#f59e0b' }
  if (priceChg <  0 && oiChg >= 0) return { label: 'SHORTS PRESSING',   sub: 'OI↑ Price↓ · Bearish pressure · Longs at risk', color: '#ef4444' }
  if (priceChg >= 0 && oiChg <  0) return { label: 'SHORT COVERING',    sub: 'OI↓ Price↑ · Spot-driven rally · Healthy',      color: '#22c55e' }
  return                                   { label: 'LONG FLUSH',        sub: 'OI↓ Price↓ · Longs capitulating · Exhaustion',  color: '#94a3b8' }
}

const QUAD_CORNERS = [
  { px: 'right', py: 'top',    label: 'LEVERAGE BUILDING', sub: 'OI↑ Price↑', color: '#f59e0b' },
  { px: 'left',  py: 'top',    label: 'SHORTS PRESSING',   sub: 'OI↑ Price↓', color: '#ef4444' },
  { px: 'right', py: 'bottom', label: 'SHORT COVERING',    sub: 'OI↓ Price↑', color: '#22c55e' },
  { px: 'left',  py: 'bottom', label: 'LONG FLUSH',        sub: 'OI↓ Price↓', color: '#94a3b8' },
]

const FR_LEGEND = [
  { color: '#ef4444', label: 'FR > +0.05%',    sub: 'Longs overheated' },
  { color: '#f97316', label: 'FR +0.01–0.05%', sub: 'Positive' },
  { color: '#94a3b8', label: 'FR ±0.01%',      sub: 'Neutral' },
  { color: '#818cf8', label: 'FR −0.01–0.05%', sub: 'Negative' },
  { color: '#22c55e', label: 'FR < −0.05%',    sub: 'Shorts overheated' },
]

async function fetchBybitData(days = 90) {
  const limit = days + 5
  const [oiRes, klRes, frRes] = await Promise.all([
    fetch(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=${limit}`),
    fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=D&limit=${limit}`),
    fetch(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=${limit * 3}`),
  ])
  const [oiData, klData, frData] = await Promise.all([oiRes.json(), klRes.json(), frRes.json()])

  const oiList = oiData?.result?.list ?? []
  const klList = klData?.result?.list ?? []
  const frList = frData?.result?.list ?? []

  if (oiList.length < 2 || klList.length < 2) return []

  // OI map: date → value
  const oiMap = {}
  for (const item of oiList) {
    const d = new Date(parseInt(item.timestamp)).toISOString().slice(0, 10)
    oiMap[d] = parseFloat(item.openInterest)
  }

  // Price map: date → { open, close }
  const priceMap = {}
  for (const k of klList) {
    const d = new Date(parseInt(k[0])).toISOString().slice(0, 10)
    priceMap[d] = { open: parseFloat(k[1]), close: parseFloat(k[4]) }
  }

  // Funding map: date → avg rate (multiple per day, 8h intervals)
  const frByDate = {}
  for (const f of frList) {
    const d = new Date(parseInt(f.fundingRateTimestamp)).toISOString().slice(0, 10)
    if (!frByDate[d]) frByDate[d] = []
    frByDate[d].push(parseFloat(f.fundingRate))
  }
  const frMap = {}
  for (const [d, rates] of Object.entries(frByDate)) {
    frMap[d] = rates.reduce((a, b) => a + b, 0) / rates.length
  }

  const dates = Object.keys(oiMap).filter(d => priceMap[d]).sort()
  const points = []
  for (let i = 1; i < dates.length; i++) {
    const d = dates[i], prev = dates[i - 1]
    const oiNow = oiMap[d], oiPrev = oiMap[prev], price = priceMap[d]
    if (!oiNow || !oiPrev || !price) continue
    const oiChg    = ((oiNow - oiPrev) / oiPrev) * 100
    const priceChg = ((price.close - price.open) / price.open) * 100
    const funding  = frMap[d] ?? frMap[prev] ?? null
    points.push({
      date:     d,
      priceChg: parseFloat(priceChg.toFixed(2)),
      oiChg:    parseFloat(oiChg.toFixed(2)),
      price:    parseFloat(price.close.toFixed(0)),
      funding:  funding !== null ? parseFloat((funding * 100).toFixed(4)) : null,
    })
  }
  return points.slice(-days)
}

export default function OIScatter() {
  const canvasRef             = useRef(null)
  const [points, setPoints]   = useState([])
  const [hovered, setHovered] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const layoutRef             = useRef(null)

  useEffect(() => {
    fetchBybitData(90)
      .then(pts => { setPoints(pts); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [])

  const getLayout = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !points.length) return null
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    const PAD = { left: 52, right: 20, top: 28, bottom: 40 }
    const cW = W - PAD.left - PAD.right
    const cH = H - PAD.top  - PAD.bottom
    const maxP = Math.max(...points.map(p => Math.abs(p.priceChg))) * 1.25 || 5
    const maxO = Math.max(...points.map(p => Math.abs(p.oiChg)))    * 1.25 || 5
    const toX  = v => PAD.left + ((v + maxP) / (maxP * 2)) * cW
    const toY  = v => PAD.top  + ((maxO - v) / (maxO * 2)) * cH
    return { W, H, PAD, cW, cH, maxP, maxO, toX, toY }
  }, [points])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || points.length < 2) return
    const layout = getLayout()
    if (!layout) return
    const { W, H, PAD, cW, cH, maxP, maxO, toX, toY } = layout
    layoutRef.current = layout

    const dpr = window.devicePixelRatio || 1
    canvas.width  = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const midX = toX(0), midY = toY(0)

    // Quadrant fills
    const fills = [
      { x: midX,     y: PAD.top, w: PAD.left + cW - midX, h: midY - PAD.top,      c: '#f59e0b09' },
      { x: PAD.left, y: PAD.top, w: midX - PAD.left,       h: midY - PAD.top,      c: '#ef444409' },
      { x: midX,     y: midY,    w: PAD.left + cW - midX,  h: PAD.top + cH - midY, c: '#22c55e09' },
      { x: PAD.left, y: midY,    w: midX - PAD.left,        h: PAD.top + cH - midY, c: '#94a3b809' },
    ]
    for (const f of fills) { ctx.fillStyle = f.c; ctx.fillRect(f.x, f.y, f.w, f.h) }

    // Grid
    ctx.lineWidth = 0.5
    const gridStep = maxP > 8 ? 4 : 2
    for (let v = -Math.ceil(maxP); v <= Math.ceil(maxP); v += gridStep) {
      ctx.strokeStyle = v === 0 ? '#2a2a2a' : '#141414'
      ctx.beginPath(); ctx.moveTo(toX(v), PAD.top); ctx.lineTo(toX(v), PAD.top + cH); ctx.stroke()
    }
    for (let v = -Math.ceil(maxO); v <= Math.ceil(maxO); v += gridStep) {
      ctx.strokeStyle = v === 0 ? '#2a2a2a' : '#141414'
      ctx.beginPath(); ctx.moveTo(PAD.left, toY(v)); ctx.lineTo(PAD.left + cW, toY(v)); ctx.stroke()
    }

    // Zero axes
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(midX, PAD.top);  ctx.lineTo(midX, PAD.top + cH); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(PAD.left, midY); ctx.lineTo(PAD.left + cW, midY); ctx.stroke()

    // Tick labels
    ctx.fillStyle = '#444'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
    for (let v = -Math.ceil(maxP); v <= Math.ceil(maxP); v += gridStep) {
      if (v === 0) continue
      ctx.fillText(`${v > 0 ? '+' : ''}${v}%`, toX(v), PAD.top + cH + 14)
    }
    ctx.textAlign = 'right'
    for (let v = -Math.ceil(maxO); v <= Math.ceil(maxO); v += gridStep) {
      if (v === 0) continue
      ctx.fillText(`${v > 0 ? '+' : ''}${v}%`, PAD.left - 5, toY(v) + 4)
    }

    // Axis titles
    ctx.fillStyle = '#2a2a2a'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
    ctx.fillText('BTC PRICE CHG %', PAD.left + cW / 2, H - 6)
    ctx.save(); ctx.translate(11, PAD.top + cH / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('FUTURES OI CHG %', 0, 0); ctx.restore()

    // Quadrant corner labels
    const qPad = 6; ctx.font = '9px monospace'
    for (const q of QUAD_CORNERS) {
      const x = q.px === 'right' ? PAD.left + cW - qPad : PAD.left + qPad
      const y = q.py === 'top'   ? PAD.top + 14          : PAD.top + cH - 6
      ctx.textAlign = q.px === 'right' ? 'right' : 'left'
      ctx.fillStyle = q.color + '99'; ctx.font = '9px monospace'
      ctx.fillText(q.label, x, y)
      ctx.fillStyle = q.color + '44'; ctx.font = '8px monospace'
      ctx.fillText(q.sub, x, y + 11)
    }

    // Dots — oldest first
    for (let i = 0; i < points.length; i++) {
      const p       = points[i]
      const x       = toX(p.priceChg)
      const y       = toY(p.oiChg)
      const isToday = i === points.length - 1
      const isHov   = hovered === i
      const fColor  = fundingColor(p.funding)
      const age     = i / (points.length - 1)
      const alpha   = isToday ? 1 : 0.2 + age * 0.7
      const radius  = isToday ? 6 : isHov ? 5 : 3.5

      if (isHov || isToday) {
        ctx.beginPath(); ctx.arc(x, y, radius + 4, 0, Math.PI * 2)
        ctx.fillStyle = (isToday ? '#ffffff' : fColor.fill) + '18'; ctx.fill()
      }

      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.globalAlpha = alpha
      ctx.fillStyle   = isToday ? '#ffffff' : fColor.fill
      ctx.fill()

      if (isToday) {
        ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 1.5; ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // TODAY label
    if (points.length) {
      const last = points[points.length - 1]
      const x = toX(last.priceChg), y = toY(last.oiChg)
      ctx.fillStyle = '#ffffff88'; ctx.font = '9px monospace'
      ctx.textAlign = x > W / 2 ? 'right' : 'left'
      ctx.fillText('TODAY', x + (x > W / 2 ? -9 : 9), y - 8)
    }
  }, [points, hovered, getLayout])

  useEffect(() => {
    draw()
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas || !points.length) return
    const layout = layoutRef.current
    if (!layout) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { toX, toY } = layout
    let closest = null, closestDist = 18
    for (let i = 0; i < points.length; i++) {
      const dx = toX(points[i].priceChg) - mx
      const dy = toY(points[i].oiChg)    - my
      const d  = Math.sqrt(dx * dx + dy * dy)
      if (d < closestDist) { closestDist = d; closest = i }
    }
    if (closest !== hovered) setHovered(closest)
  }, [points, hovered])

  const display = hovered !== null ? points[hovered] : points[points.length - 1] ?? null
  const regime  = display ? getRegime(display.priceChg, display.oiChg) : null
  const frInfo  = display ? fundingColor(display.funding) : null

  return (
    <div>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#e8e8e8' }}>FUTURES OI vs PRICE</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#444', letterSpacing: '0.08em', marginTop: 3 }}>
            DAILY % CHANGE · 90D · BYBIT BTCUSDT PERP · DOTS COLOURED BY FUNDING RATE
          </div>
        </div>

        {display && regime && (
          <div style={{ textAlign: 'right', minWidth: 220 }}>
            <div style={{
              fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: regime.color,
              background: regime.color + '18', border: `1px solid ${regime.color}55`,
              borderRadius: 6, padding: '4px 12px', marginBottom: 5, letterSpacing: '0.05em',
            }}>{regime.label}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#555', marginBottom: 4 }}>{regime.sub}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#888' }}>{display.date} · ${display.price?.toLocaleString()}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 3 }}>
              <span style={{ color: display.priceChg >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                Price {display.priceChg >= 0 ? '+' : ''}{display.priceChg}%
              </span>
              {'  '}
              <span style={{ color: display.oiChg >= 0 ? '#f59e0b' : '#94a3b8', fontWeight: 700 }}>
                OI {display.oiChg >= 0 ? '+' : ''}{display.oiChg}%
              </span>
            </div>
            {frInfo && (
              <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 11, color: frInfo.fill, fontWeight: 700 }}>
                {frInfo.label}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chart */}
      {loading ? (
        <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#333', padding: '60px 0', textAlign: 'center' }}>Loading…</div>
      ) : error ? (
        <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#ef4444', padding: '60px 0', textAlign: 'center' }}>{error}</div>
      ) : points.length < 2 ? (
        <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#333', padding: '60px 0', textAlign: 'center' }}>Insufficient data</div>
      ) : (
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 400, display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHovered(null)}
        />
      )}

      {/* Funding legend */}
      <div style={{ marginTop: 12, padding: '10px 14px', background: '#0a0a0a', borderRadius: 6, border: '1px solid #111' }}>
        <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#333', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          Dot colour = daily avg funding rate
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {FR_LEGEND.map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: l.color, fontWeight: 700, lineHeight: 1.2 }}>{l.label}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#444', lineHeight: 1.2 }}>{l.sub}</div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ffffff', flexShrink: 0 }} />
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#ffffff', fontWeight: 700 }}>Today</div>
          </div>
        </div>
      </div>
    </div>
  )
}
