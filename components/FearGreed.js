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
      const PAD = { top: 16, right: hasBtc ? 60 : 12, bottom: 30, left: 38 }
      const iW  = W - PAD.left - PAD.right
      const iH  = H - PAD.top  - PAD.bottom
      const n   = fgSlice.length

      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#f9fafb'
      ctx.fillRect(PAD.left, PAD.top, iW, iH)

      const toX   = i => PAD.left + (i / Math.max(n - 1, 1)) * iW
      const toYfg = v => PAD.top + iH - (v / 100) * iH

      const validBtc = btcSlice.filter(Boolean)
      const btcMin   = validBtc.length ? Math.min(...validBtc) * 0.97 : 0
      const btcMax   = validBtc.length ? Math.max(...validBtc) * 1.03 : 1
      const toYbtc   = v => PAD.top + iH - ((v - btcMin) / (btcMax - btcMin)) * iH

      // Zone bands
      ;[[0,25,'rgba(239,68,68,.07)'],[25,45,'rgba(249,115,22,.06)'],[45,55,'rgba(245,158,11,.05)'],[55,75,'rgba(132,204,22,.06)'],[75,100,'rgba(34,197,94,.07)']].forEach(([lo, hi, col]) => {
        ctx.fillStyle = col
        ctx.fillRect(PAD.left, toYfg(hi), iW, toYfg(lo) - toYfg(hi))
      })

      // Grid + F&G Y labels
      ctx.font = '10px -apple-system,sans-serif'
      ;[0, 25, 50, 75, 100].forEach(v => {
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5; ctx.setLineDash([2, 4])
        ctx.beginPath(); ctx.moveTo(PAD.left, toYfg(v)); ctx.lineTo(W - PAD.right, toYfg(v)); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'right'
        ctx.fillText(v, PAD.left - 5, toYfg(v) + 3)
      })

      // Zone labels on Y axis
      const zoneLabels = [
        { v: 12, label: 'Ext. Fear', color: '#ef4444' },
        { v: 35, label: 'Fear',      color: '#f97316' },
        { v: 50, label: 'Neutral',   color: '#f59e0b' },
        { v: 65, label: 'Greed',     color: '#84cc16' },
        { v: 87, label: 'Ext. Greed', color: '#22c55e' },
      ]
      ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'left'
      zoneLabels.forEach(z => {
        ctx.fillStyle = z.color + '99'
        ctx.fillText(z.label, PAD.left + 4, toYfg(z.v) + 3)
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

        ctx.fillStyle = 'rgba(247,147,26,.6)'; ctx.textAlign = 'left'; ctx.font = '9px -apple-system,sans-serif'
        const labelVals = [btcMin / 0.97, (btcMin / 0.97 + btcMax / 1.03) / 2, btcMax / 1.03]
        labelVals.forEach(v => ctx.fillText(fmtPrice(v), W - PAD.right + 4, toYbtc(v) + 3))
      }

      // F&G coloured line — slightly thicker at full width
      ctx.lineWidth = 2
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
        ctx.beginPath(); ctx.arc(toX(n - 1), toYfg(last.value), 5, 0, Math.PI * 2)
        ctx.fillStyle = getZone(last.value).color; ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
      }

      // X axis labels
      ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'; ctx.font = '9px -apple-system,sans-serif'
      const lc = Math.min(9, n)
      for (let i = 0; i < lc; i++) {
        const idx = Math.round(i * (n - 1) / (lc - 1))
        ctx.fillText(fmtDateShort(fgSlice[idx].ts), toX(idx), H - PAD.bottom + 16)
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
    <div style={{ position: 'relative', width: '100%', height: 260 }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair', borderRadius: 8 }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div style={{
          pointerEvents: 'none', position: 'absolute', top: 8, zIndex: 10,
          left: Math.min(tooltip.x + 14, (canvasRef.current?.offsetWidth ?? 600) - 190),
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
          padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,.08)',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ ...LBL, marginBottom: 4, textTransform: 'none' }}>{tooltip.date}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: tooltip.color }}>
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
  const val90d = fg[fg.length - 91]
  const btcAligned = useMemo(() => alignBtc(fg, btc), [fg, btc])

  if (loading) return <div style={{ ...LBL, color: '#d1d5db', padding: '1rem 0' }}>Loading…</div>
  if (error)   return <div style={{ fontSize: 12, color: '#dc2626', padding: '8px 0' }}>Error: {error}</div>
  if (!today)  return null

  return (
    <div>
      {/* ── Stats row — more breathing room at full width ─────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>

        {/* Big number */}
        <div>
          <div style={{ ...LBL, marginBottom: 6 }}>Today</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{
              fontSize: 56, fontWeight: 800, lineHeight: 1, color: zone.color,
              fontVariantNumeric: 'tabular-nums',
            }}>{today.value}</span>
            <span style={{
              fontSize: 12, fontWeight: 700, color: zone.color,
              background: zone.color + '18', border: `1px solid ${zone.color}40`,
              borderRadius: 20, padding: '4px 12px', marginBottom: 6,
            }}>{zone.label}</span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 52, background: '#e5e7eb', flexShrink: 0 }} />

        {/* Historical snapshots */}
        {[
          { label: '7D ago',  val: val7d  },
          { label: '30D ago', val: val30d },
          { label: '90D ago', val: val90d },
        ].map(({ label, val }) => {
          if (!val) return null
          const z = getZone(val.value)
          return (
            <div key={label}>
              <div style={{ ...LBL, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: z.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 4 }}>
                {val.value}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: z.color,
                background: z.color + '18', border: `1px solid ${z.color}40`,
                borderRadius: 20, padding: '2px 8px', display: 'inline-block',
              }}>{z.label}</div>
            </div>
          )
        })}

        {/* Gauge bar — right aligned, takes remaining space */}
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 200 }}>
          <div style={{ ...LBL, marginBottom: 8 }}>Scale</div>
          <div style={{ position: 'relative', height: 10, borderRadius: 9999, overflow: 'hidden',
            background: 'linear-gradient(to right, #ef4444, #f97316, #f59e0b, #84cc16, #22c55e)',
          }}>
            <div style={{
              position: 'absolute', top: -3, width: 16, height: 16, borderRadius: '50%',
              background: zone.color, border: '2px solid #fff', boxShadow: `0 0 0 1px ${zone.color}`,
              left: `calc(${today.value}% - 8px)`, transition: 'left .5s',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>0 Fear</span>
            <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>50</span>
            <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>100 Greed</span>
          </div>
          {/* Zone legend */}
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            {ZONES.map(z => (
              <span key={z.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: z.color, display: 'inline-block' }} />
                <span style={{ fontSize: 10, color: '#9ca3af' }}>{z.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Range selector ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {RANGE_OPTS.map(opt => (
          <button key={opt.label} onClick={() => setRange(opt.days)} style={{
            padding: '4px 14px', borderRadius: 20, cursor: 'pointer',
            fontSize: 11, fontWeight: 600,
            border: range === opt.days ? '1px solid #3b82f6' : '1px solid #e5e7eb',
            background: range === opt.days ? '#3b82f6' : 'transparent',
            color: range === opt.days ? '#fff' : '#6b7280',
            transition: 'all .15s',
          }}>{opt.label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#d1d5db', alignSelf: 'center' }}>
          {fg.length} days · BTC overlay: CoinGecko
        </span>
      </div>

      {/* ── Chart ────────────────────────────────────────────────────────────── */}
      <DualChart fg={fg} btcAligned={btcAligned} range={range} />
    </div>
  )
}
