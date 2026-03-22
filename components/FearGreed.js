'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'

const ZONES = [
  { max: 25,  label: 'Extreme Fear',  color: '#ef4444' },
  { max: 45,  label: 'Fear',          color: '#f97316' },
  { max: 55,  label: 'Neutral',       color: '#f59e0b' },
  { max: 75,  label: 'Greed',         color: '#84cc16' },
  { max: 100, label: 'Extreme Greed', color: '#22c55e' },
]

const RANGE_OPTS = [
  { label: '3M', days: 90  },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: '2Y', days: 730 },
  { label: 'ALL', days: Infinity },
]

const LBL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

function getZone(v) { return ZONES.find(z => v <= z.max) ?? ZONES[ZONES.length - 1] }

function fmtDateShort(ts) {
  const d = new Date(ts)
  return `${d.getDate()}/${d.getMonth() + 1}`
}
function fmtDateFull(ts) {
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })
}
function fmtPrice(p) {
  if (!p) return '—'
  return p >= 1000 ? '$' + (p / 1000).toFixed(1) + 'k' : '$' + p.toFixed(0)
}

function alignBtc(fg, btcPrices) {
  if (!btcPrices?.length) return fg.map(() => null)
  const btcMap = new Map(btcPrices.map(b => [Math.round(b.ts / 86400000), b.price]))
  return fg.map(f => {
    const day = Math.round(f.ts / 86400000)
    for (let d = 0; d <= 3; d++) {
      if (btcMap.has(day + d)) return btcMap.get(day + d)
      if (btcMap.has(day - d)) return btcMap.get(day - d)
    }
    return null
  })
}

function DualChart({ fg, btcAligned, range }) {
  const canvasRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const metaRef  = useRef(null)

  const { fgSlice, btcSlice } = useMemo(() => {
    if (range === Infinity) return { fgSlice: fg, btcSlice: btcAligned }
    const cutoff = Date.now() - range * 86400000
    const idx    = fg.findIndex(p => p.ts >= cutoff)
    const start  = Math.max(0, idx === -1 ? 0 : idx)
    return { fgSlice: fg.slice(start), btcSlice: btcAligned.slice(start) }
  }, [fg, btcAligned, range])

  const hasBtc = btcSlice.some(Boolean)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fgSlice.length) return

    const draw = () => {
      const dpr  = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width  = rect.width  * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const W = rect.width, H = rect.height
      const PAD = { top: 16, right: hasBtc ? 56 : 12, bottom: 28, left: 34 }
      const iW  = W - PAD.left - PAD.right
      const iH  = H - PAD.top  - PAD.bottom
      const n   = fgSlice.length

      ctx.clearRect(0, 0, W, H)

      // Light chart bg
      ctx.fillStyle = '#f9fafb'
      ctx.fillRect(PAD.left, PAD.top, iW, iH)

      const toX   = i => PAD.left + (i / Math.max(n - 1, 1)) * iW
      const toYfg = v => PAD.top + iH - (v / 100) * iH

      const validBtc = btcSlice.filter(Boolean)
      const btcMin   = validBtc.length ? Math.min(...validBtc) * 0.97 : 0
      const btcMax   = validBtc.length ? Math.max(...validBtc) * 1.03 : 1
      const toYbtc   = v => PAD.top + iH - ((v - btcMin) / (btcMax - btcMin)) * iH

      // Zone bands (light fills)
      ;[[0,25,'rgba(239,68,68,.07)'],[25,45,'rgba(249,115,22,.06)'],[45,55,'rgba(245,158,11,.05)'],[55,75,'rgba(132,204,22,.06)'],[75,100,'rgba(34,197,94,.07)']].forEach(([lo, hi, col]) => {
        ctx.fillStyle = col
        ctx.fillRect(PAD.left, toYfg(hi), iW, toYfg(lo) - toYfg(hi))
      })

      // Grid lines + F&G left axis labels
      ctx.font = '9px -apple-system,sans-serif'
      ;[0, 25, 50, 75, 100].forEach(v => {
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5; ctx.setLineDash([2, 4])
        ctx.beginPath(); ctx.moveTo(PAD.left, toYfg(v)); ctx.lineTo(W - PAD.right, toYfg(v)); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'right'
        ctx.fillText(v, PAD.left - 4, toYfg(v) + 3)
      })

      // BTC price line
      if (hasBtc && validBtc.length > 1) {
        ctx.beginPath()
        let started = false
        btcSlice.forEach((price, i) => {
          if (!price) return
          const x = toX(i), y = toYbtc(price)
          if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
        })
        ctx.strokeStyle = '#f7931a'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55; ctx.stroke()
        ctx.globalAlpha = 1

        // Right axis labels
        ctx.fillStyle = 'rgba(247,147,26,.6)'; ctx.textAlign = 'left'; ctx.font = '9px -apple-system,sans-serif'
        const labelVals = [btcMin / 0.97, (btcMin / 0.97 + btcMax / 1.03) / 2, btcMax / 1.03]
        labelVals.forEach(v => ctx.fillText(fmtPrice(v), W - PAD.right + 4, toYbtc(v) + 3))
      }

      // F&G coloured line
      ctx.lineWidth = 1.8
      fgSlice.forEach((p, i) => {
        if (i === 0) return
        ctx.strokeStyle = getZone(p.value).color
        ctx.beginPath()
        ctx.moveTo(toX(i - 1), toYfg(fgSlice[i - 1].value))
        ctx.lineTo(toX(i),     toYfg(p.value))
        ctx.stroke()
      })

      // Last dot
      const last = fgSlice[fgSlice.length - 1]
      if (last) {
        ctx.beginPath(); ctx.arc(toX(n - 1), toYfg(last.value), 4, 0, Math.PI * 2)
        ctx.fillStyle = getZone(last.value).color; ctx.fill()
      }

      // X axis labels
      ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'; ctx.font = '9px -apple-system,sans-serif'
      const lc = Math.min(7, n)
      for (let i = 0; i < lc; i++) {
        const idx = Math.round(i * (n - 1) / (lc - 1))
        ctx.fillText(fmtDateShort(fgSlice[idx].ts), toX(idx), H - PAD.bottom + 14)
      }

      metaRef.current = { PAD, iW, n, fgSlice, btcSlice, toX, toYfg, toYbtc, W, H }
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [fgSlice, btcSlice, hasBtc])

  const onMouseMove = useCallback(e => {
    const meta = metaRef.current
    if (!meta) return
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const { PAD, iW, n, fgSlice, btcSlice } = meta
    if (mx < PAD.left || mx > PAD.left + iW) { setTooltip(null); return }
    const i  = Math.max(0, Math.min(n - 1, Math.round(((mx - PAD.left) / iW) * (n - 1))))
    const pt = fgSlice[i]
    if (!pt) return
    const z = getZone(pt.value)
    setTooltip({ x: mx, date: fmtDateFull(pt.ts), fg: pt.value, label: z.label, color: z.color, btc: btcSlice[i] })
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: 220 }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair', borderRadius: 8 }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div style={{
          pointerEvents: 'none', position: 'absolute', top: 8, zIndex: 10,
          left: Math.min(tooltip.x + 12, 220),
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
          padding: '8px 12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ ...LBL, marginBottom: 4, textTransform: 'none' }}>{tooltip.date}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: tooltip.color }}>
            F&G {tooltip.fg} · {tooltip.label}
          </div>
          {tooltip.btc != null && (
            <div style={{ fontSize: 12, color: '#f7931a', marginTop: 3, fontWeight: 600 }}>
              BTC {fmtPrice(tooltip.btc)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function FearGreed() {
  const [fg,         setFg]         = useState([])
  const [btc,        setBtc]        = useState([])
  const [loading,    setLoading]    = useState(true)
  const [btcLoading, setBtcLoading] = useState(true)
  const [error,      setError]      = useState(null)
  const [range,      setRange]      = useState(365)

  const fetchFG = useCallback(async () => {
    try {
      const res  = await fetch('/api/feargreed', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setFg(json.fg); setError(null)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  const fetchBTC = useCallback(async () => {
    setBtcLoading(true)
    try {
      const res  = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily', { cache: 'no-store' })
      if (!res.ok) throw new Error('CG ' + res.status)
      const json = await res.json()
      setBtc(json.prices?.map(([ts, price]) => ({ ts, price })) ?? [])
    } catch { setBtc([]) }
    finally { setBtcLoading(false) }
  }, [])

  useEffect(() => {
    fetchFG(); fetchBTC()
    const fgIv  = setInterval(fetchFG,  60 * 60 * 1000)
    const btcIv = setInterval(fetchBTC, 60 * 60 * 1000)
    return () => { clearInterval(fgIv); clearInterval(btcIv) }
  }, [fetchFG, fetchBTC])

  const today  = fg[fg.length - 1]
  const zone   = today ? getZone(today.value) : null
  const val7d  = fg[fg.length - 8]
  const val30d = fg[fg.length - 31]
  const btcAligned = useMemo(() => alignBtc(fg, btc), [fg, btc])

  if (loading) return <div style={{ ...LBL, color: '#d1d5db', padding: '1rem 0' }}>Loading…</div>
  if (error)   return <div style={{ fontSize: 12, color: '#dc2626', padding: '8px 0' }}>Error: {error}</div>
  if (!today)  return null

  return (
    <div>
      {/* ── Current reading row ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>

        {/* Big number */}
        <div>
          <div style={{ ...LBL, marginBottom: 4 }}>Today</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, color: zone.color,
              fontVariantNumeric: 'tabular-nums' }}>
              {today.value}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: zone.color,
              background: zone.color + '18', border: `1px solid ${zone.color}40`,
              borderRadius: 20, padding: '3px 10px', marginBottom: 4,
            }}>{zone.label.toUpperCase()}</span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 44, background: '#e5e7eb' }} />

        {/* 7D + 30D */}
        {[{ label: '7D ago', val: val7d }, { label: '30D ago', val: val30d }].map(({ label, val }) => {
          if (!val) return null
          const z = getZone(val.value)
          return (
            <div key={label}>
              <div style={{ ...LBL, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: z.color, fontVariantNumeric: 'tabular-nums' }}>
                {val.value}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: z.color, marginTop: 2 }}>
                {z.label.toUpperCase()}
              </div>
            </div>
          )
        })}

        {/* Zone legend — right-aligned */}
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ZONES.map(z => (
            <div key={z.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: z.color }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af' }}>{z.label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <div style={{ width: 12, borderTop: '1px solid rgba(247,147,26,.5)' }} />
            <span style={{ fontSize: 10, color: 'rgba(247,147,26,.7)', fontWeight: 600 }}>BTC price</span>
          </div>
        </div>
      </div>

      {/* ── Range selector ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {RANGE_OPTS.map(opt => (
          <button
            key={opt.label}
            onClick={() => setRange(opt.days)}
            style={{
              padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
              fontSize: 11, fontWeight: 600,
              border: range === opt.days ? `1px solid #3b82f6` : '1px solid #e5e7eb',
              background: range === opt.days ? '#3b82f6' : 'transparent',
              color: range === opt.days ? '#fff' : '#6b7280',
              transition: 'all .15s',
            }}
          >{opt.label}</button>
        ))}
      </div>

      {/* ── Chart ────────────────────────────────────────────────────────── */}
      <DualChart fg={fg} btcAligned={btcAligned} range={range} />

      {/* ── Footer note ──────────────────────────────────────────────────── */}
      <div style={{ marginTop: 8, fontSize: 10, color: '#d1d5db' }}>
        Source: Alternative.me · {fg.length} days · BTC overlay: CoinGecko
      </div>
    </div>
  )
}
