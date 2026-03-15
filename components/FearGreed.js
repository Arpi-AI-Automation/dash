'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import SectionHeader from './SectionHeader'

const ZONES = [
  { max: 25,  label: 'Extreme Fear',  color: '#ef4444' },
  { max: 45,  label: 'Fear',          color: '#f97316' },
  { max: 55,  label: 'Neutral',       color: '#eab308' },
  { max: 75,  label: 'Greed',         color: '#84cc16' },
  { max: 100, label: 'Extreme Greed', color: '#22c55e' },
]

const RANGE_OPTS = [
  { label: '3M',  days: 90 },
  { label: '6M',  days: 180 },
  { label: '1Y',  days: 365 },
  { label: '2Y',  days: 730 },
  { label: 'ALL', days: Infinity },
]

function getZone(v) {
  return ZONES.find(z => v <= z.max) ?? ZONES[ZONES.length - 1]
}

function fmtDateShort(ts) {
  const d = new Date(ts)
  return `${d.getDate()}/${d.getMonth() + 1}`
}
function fmtDateFull(ts) {
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })
}
function fmtPrice(p) {
  if (!p) return '—'
  if (p >= 1000) return '$' + (p / 1000).toFixed(1) + 'k'
  return '$' + p.toFixed(0)
}

// Align BTC price array to F&G timestamps
function alignBtc(fg, btcPrices) {
  if (!btcPrices?.length) return fg.map(() => null)
  // btcPrices: [{ts, price}] sorted oldest-first
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
  const metaRef = useRef(null)

  const { fgSlice, btcSlice } = useMemo(() => {
    if (range === Infinity) return { fgSlice: fg, btcSlice: btcAligned }
    const cutoff = Date.now() - range * 86400000
    const idx = fg.findIndex(p => p.ts >= cutoff)
    const start = Math.max(0, idx === -1 ? 0 : idx)
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
      const PAD = { top: 16, right: hasBtc ? 60 : 16, bottom: 32, left: 36 }
      const iW = W - PAD.left - PAD.right
      const iH = H - PAD.top  - PAD.bottom
      const n  = fgSlice.length

      ctx.clearRect(0, 0, W, H)

      const toX   = i => PAD.left + (i / Math.max(n - 1, 1)) * iW
      const toYfg = v => PAD.top + iH - (v / 100) * iH

      // Valid BTC prices
      const validBtc = btcSlice.filter(Boolean)
      const btcMin = validBtc.length ? Math.min(...validBtc) * 0.97 : 0
      const btcMax = validBtc.length ? Math.max(...validBtc) * 1.03 : 1
      const toYbtc = v => PAD.top + iH - ((v - btcMin) / (btcMax - btcMin)) * iH

      // Zone bands
      ;[[0,25,'#ef444410'],[25,45,'#f9731610'],[45,55,'#eab30810'],[55,75,'#84cc1610'],[75,100,'#22c55e10']].forEach(([lo,hi,col]) => {
        ctx.fillStyle = col
        ctx.fillRect(PAD.left, toYfg(hi), iW, toYfg(lo) - toYfg(hi))
      })

      // Grid lines + F&G left axis labels
      ctx.font = '9px monospace'
      ;[0,25,50,75,100].forEach(v => {
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1; ctx.setLineDash([2,4])
        ctx.beginPath(); ctx.moveTo(PAD.left, toYfg(v)); ctx.lineTo(W - PAD.right, toYfg(v)); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#444'; ctx.textAlign = 'right'
        ctx.fillText(v, PAD.left - 4, toYfg(v) + 3)
      })

      // BTC price line
      if (hasBtc && validBtc.length > 1) {
        ctx.beginPath()
        let started = false
        btcSlice.forEach((price, i) => {
          if (!price) return
          const x = toX(i), y = toYbtc(price)
          if (!started) { ctx.moveTo(x, y); started = true }
          else ctx.lineTo(x, y)
        })
        ctx.strokeStyle = '#f7931a'
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.6
        ctx.stroke()
        ctx.globalAlpha = 1

        // Right axis labels
        ctx.fillStyle = '#f7931a99'; ctx.textAlign = 'left'; ctx.font = '9px monospace'
        const labelVals = [btcMin / 0.97, (btcMin / 0.97 + btcMax / 1.03) / 2, btcMax / 1.03]
        labelVals.forEach(v => ctx.fillText(fmtPrice(v), W - PAD.right + 4, toYbtc(v) + 3))
      }

      // F&G coloured line
      ctx.lineWidth = 1.8
      fgSlice.forEach((p, i) => {
        if (i === 0) return
        ctx.strokeStyle = getZone(p.value).color
        ctx.beginPath()
        ctx.moveTo(toX(i-1), toYfg(fgSlice[i-1].value))
        ctx.lineTo(toX(i), toYfg(p.value))
        ctx.stroke()
      })

      // Last dot
      const last = fgSlice[fgSlice.length - 1]
      if (last) {
        ctx.beginPath()
        ctx.arc(toX(n-1), toYfg(last.value), 4, 0, Math.PI*2)
        ctx.fillStyle = getZone(last.value).color; ctx.fill()
      }

      // X axis labels
      ctx.fillStyle = '#444'; ctx.textAlign = 'center'; ctx.font = '9px monospace'
      const lc = Math.min(8, n)
      for (let i = 0; i < lc; i++) {
        const idx = Math.round(i * (n-1) / (lc-1))
        ctx.fillText(fmtDateShort(fgSlice[idx].ts), toX(idx), H - PAD.bottom + 14)
      }

      // Store meta for tooltip
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
    const idx = Math.round(((mx - PAD.left) / iW) * (n-1))
    const i = Math.max(0, Math.min(n-1, idx))
    const pt = fgSlice[i]
    if (!pt) return
    const z = getZone(pt.value)
    setTooltip({ x: mx, date: fmtDateFull(pt.ts), fg: pt.value, label: z.label, color: z.color, btc: btcSlice[i] })
  }, [])

  return (
    <div className="relative w-full" style={{ height: 260 }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div
          className="pointer-events-none absolute top-2 bg-[#111] border border-[#222] rounded px-3 py-2 text-xs z-10 whitespace-nowrap"
          style={{ left: Math.min(tooltip.x + 12, 260) }}
        >
          <div className="text-[#555] mb-1">{tooltip.date}</div>
          <div className="font-mono font-bold" style={{ color: tooltip.color }}>
            F&G {tooltip.fg} · {tooltip.label}
          </div>
          {tooltip.btc != null && (
            <div className="text-[#f7931a] font-mono mt-0.5">BTC {fmtPrice(tooltip.btc)}</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function FearGreed() {
  const [fg, setFg]           = useState([])
  const [btc, setBtc]         = useState([])
  const [loading, setLoading] = useState(true)
  const [btcLoading, setBtcLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [range, setRange]     = useState(365)

  // Fetch F&G from our API (server-side, Alternative.me)
  const fetchFG = useCallback(async () => {
    try {
      const res  = await fetch('/api/feargreed', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setFg(json.fg)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch BTC client-side directly — browser IPs aren't blocked by CoinGecko
  const fetchBTC = useCallback(async () => {
    setBtcLoading(true)
    try {
      const res  = await fetch(
        'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max&interval=daily',
        { cache: 'no-store' }
      )
      if (!res.ok) throw new Error('CG ' + res.status)
      const json = await res.json()
      setBtc(json.prices?.map(([ts, price]) => ({ ts, price })) ?? [])
    } catch {
      setBtc([]) // silently fail — chart still works without BTC
    } finally {
      setBtcLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFG()
    fetchBTC()
    const fgInterval  = setInterval(fetchFG,  60 * 60 * 1000)
    const btcInterval = setInterval(fetchBTC, 60 * 60 * 1000)
    return () => { clearInterval(fgInterval); clearInterval(btcInterval) }
  }, [fetchFG, fetchBTC])

  const today  = fg[fg.length - 1]
  const zone   = today ? getZone(today.value) : null
  const val7d  = fg[fg.length - 8]
  const val30d = fg[fg.length - 31]
  const btcAligned = useMemo(() => alignBtc(fg, btc), [fg, btc])
  const hasBtc = btc.length > 0

  return (
    <div className="mt-10">
      <SectionHeader label="Fear & Greed" />

      {loading && <div className="text-[#555] text-xs tracking-widest py-4">LOADING<span className="cursor"/></div>}
      {error   && <div className="text-red-500 text-xs py-2">ERR: {error}</div>}

      {!loading && !error && today && (
        <div className="border border-[#1e1e1e] bg-[#0d0d0d] p-5 rounded-sm">

          {/* Stats row */}
          <div className="flex items-start gap-8 mb-5 flex-wrap">
            <div>
              <div className="text-[10px] text-[#444] tracking-widest mb-1">TODAY</div>
              <div className="flex items-end gap-3">
                <span className="text-5xl font-bold font-mono" style={{ color: zone.color }}>{today.value}</span>
                <span className="text-sm mb-1 tracking-wider" style={{ color: zone.color }}>{zone.label.toUpperCase()}</span>
              </div>
            </div>
            <div className="w-px self-stretch bg-[#1e1e1e]" />
            {[{label:'7D AGO',val:val7d},{label:'30D AGO',val:val30d}].map(({label,val}) => {
              if (!val) return null
              const z = getZone(val.value)
              return (
                <div key={label}>
                  <div className="text-[10px] text-[#444] tracking-widest mb-1">{label}</div>
                  <div className="text-2xl font-mono" style={{ color: z.color }}>{val.value}</div>
                  <div className="text-[10px] tracking-wider mt-0.5" style={{ color: z.color }}>{z.label.toUpperCase()}</div>
                </div>
              )
            })}
            <div className="ml-auto hidden sm:flex flex-col gap-1 justify-center">
              {ZONES.map(z => (
                <div key={z.label} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: z.color }} />
                  <span className="text-[9px] text-[#444] tracking-wider">{z.label.toUpperCase()}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 mt-1">
                <div className="w-4 border-t border-[#f7931a99]" />
                <span className="text-[9px] tracking-wider" style={{color:'#f7931a99'}}>
                  BTC PRICE {btcLoading ? '(LOADING…)' : !hasBtc ? '(N/A)' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Range selector */}
          <div className="flex gap-1 mb-3">
            {RANGE_OPTS.map(opt => (
              <button
                key={opt.label}
                onClick={() => setRange(opt.days)}
                className={`px-3 py-1 text-[10px] tracking-widest rounded-sm transition-colors ${
                  range === opt.days ? 'bg-[#1e1e1e] text-[#ccc]' : 'text-[#444] hover:text-[#888]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="-mx-5">
            <DualChart fg={fg} btcAligned={btcAligned} range={range} />
          </div>

          <div className="mt-2 text-[10px] text-[#2a2a2a] tracking-widest">
            SOURCE: ALTERNATIVE.ME · {fg.length} DAYS · {hasBtc ? `BTC: COINGECKO ${btc.length}D` : 'BTC: UNAVAILABLE'}
          </div>
        </div>
      )}
    </div>
  )
}
