'use client'
import { useEffect, useRef, useState } from 'react'
import SectionHeader from './SectionHeader'

// TPI transitions — enter dates where your TPI changed state.
// Sorted ascending. State persists until next entry.
// UPDATE THIS ARRAY with your actual TPI history.
const TPI_TRANSITIONS = [
  {"date":"2024-12-07","state":"LONG"},
  {"date":"2024-12-21","state":"SHORT"},
  {"date":"2025-01-16","state":"LONG"},
  {"date":"2025-02-01","state":"SHORT"},
  {"date":"2025-04-21","state":"LONG"},
  {"date":"2025-06-17","state":"SHORT"},
  {"date":"2025-06-29","state":"LONG"},
  {"date":"2025-07-01","state":"SHORT"},
  {"date":"2025-07-02","state":"LONG"},
  {"date":"2025-08-18","state":"SHORT"},
  {"date":"2025-09-16","state":"LONG"},
  {"date":"2025-09-19","state":"SHORT"},
  {"date":"2025-10-01","state":"LONG"},
  {"date":"2025-10-10","state":"SHORT"},
  {"date":"2026-01-05","state":"LONG"},
  {"date":"2026-01-09","state":"SHORT"},
  {"date":"2026-01-11","state":"LONG"},
  {"date":"2026-01-20","state":"SHORT"},
]

async function fetchAllData() {
  const [priceRes, fgRes, fundingRes] = await Promise.all([
    fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=101&interval=daily'),
    fetch('https://api.alternative.me/fng/?limit=101&format=json'),
    fetch('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200'),
  ])
  const [priceData, fgData, fundingData] = await Promise.all([priceRes.json(), fgRes.json(), fundingRes.json()])

  const prices = priceData.prices.map(([ts, price]) => ({
    date: new Date(ts).toISOString().slice(0, 10), price,
  }))
  const fgMap = {}
  for (const item of fgData.data) {
    fgMap[new Date(parseInt(item.timestamp) * 1000).toISOString().slice(0, 10)] = parseInt(item.value)
  }
  const fundingMap = {}
  for (const item of (fundingData.result?.list ?? [])) {
    const date = new Date(parseInt(item.fundingRateTimestamp)).toISOString().slice(0, 10)
    if (!fundingMap[date]) fundingMap[date] = parseFloat(item.fundingRate)
  }
  return { prices, fgMap, fundingMap }
}

const COLORS = { grid:'#1a1a1a', zero:'#333', price:'#f7931a', long:'#22c55e', short:'#ef4444', dim:'#2a2a2a', text:'#555', tpiL:'#22c55e22', tpiS:'#ef444422' }

function drawChart(canvas, days, hoveredIdx) {
  if (!canvas || !days.length) return
  const dpr = window.devicePixelRatio || 1
  const W = canvas.offsetWidth, H = canvas.offsetHeight
  canvas.width = W * dpr; canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const PAD = { top: 16, right: 56, bottom: 32, left: 12 }
  const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom
  const priceH = Math.floor(cH * 0.55)
  const histH  = cH - priceH - 10
  const histY0 = PAD.top + priceH + 10
  const zeroY  = histY0 + histH / 2

  ctx.clearRect(0, 0, W, H)
  const n = days.length, step = cW / n, barW = Math.max(2, step - 1)

  // Price bounds
  const prices = days.map(d => d.price)
  const minP = Math.min(...prices) * 0.994, maxP = Math.max(...prices) * 1.006
  const pY = p => PAD.top + priceH - ((p - minP) / (maxP - minP)) * priceH

  // Grid
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 0.5
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (priceH / 4) * i
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke()
  }

  // TPI background shading
  let tpiStart = null, tpiState = null
  const shadeTpi = (endX, state) => {
    if (tpiStart === null) return
    ctx.fillStyle = state === 'LONG' ? COLORS.tpiL : COLORS.tpiS
    ctx.fillRect(tpiStart, PAD.top, endX - tpiStart, priceH + histH + 10)
  }
  days.forEach((d, i) => {
    const x = PAD.left + i * step
    if (d.tpiState !== tpiState) {
      shadeTpi(x, tpiState)
      tpiStart = x; tpiState = d.tpiState
    }
    if (i === n - 1) shadeTpi(x + step, tpiState)
  })

  // Price axis
  for (let i = 0; i <= 4; i++) {
    const val = minP + ((maxP - minP) / 4) * i
    ctx.fillStyle = COLORS.text; ctx.font = '10px monospace'; ctx.textAlign = 'left'
    ctx.fillText(`$${Math.round(val / 1000)}k`, W - PAD.right + 4, pY(val) + 3)
  }

  // FR N/A shade
  const firstFR = days.findIndex(d => d.fundingAvail)
  if (firstFR > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.012)'
    ctx.fillRect(PAD.left, PAD.top, firstFR * step, priceH)
    ctx.fillStyle = COLORS.text; ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ctx.fillText('FR N/A', PAD.left + (firstFR * step) / 2, PAD.top + priceH - 4)
  }

  // Price line
  ctx.beginPath(); ctx.strokeStyle = COLORS.price; ctx.lineWidth = 1.5
  days.forEach((d, i) => {
    const x = PAD.left + i * step + step / 2, y = pY(d.price)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()

  // Zero line
  ctx.strokeStyle = COLORS.zero; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD.left, zeroY); ctx.lineTo(W - PAD.right, zeroY); ctx.stroke()

  // Score labels
  ctx.fillStyle = COLORS.text; ctx.font = '9px monospace'; ctx.textAlign = 'left'
  ctx.fillText('+6', W - PAD.right + 4, histY0 + 8)
  ctx.fillText(' 0', W - PAD.right + 4, zeroY + 3)
  ctx.fillText('−6', W - PAD.right + 4, histY0 + histH - 2)

  const bScale = (histH / 2) / 6
  days.forEach((d, i) => {
    const x = PAD.left + i * step
    const alpha = i === hoveredIdx ? 'ff' : 'dd'
    if (d.longScore  > 0) { ctx.fillStyle = COLORS.long  + alpha; ctx.fillRect(x + 0.5, zeroY - d.longScore  * bScale, barW, d.longScore  * bScale) }
    if (d.shortScore > 0) { ctx.fillStyle = COLORS.short + alpha; ctx.fillRect(x + 0.5, zeroY,                          barW, d.shortScore * bScale) }
    if (d.longScore === 0 && d.shortScore === 0) { ctx.fillStyle = COLORS.dim; ctx.fillRect(x + 0.5, zeroY - 1, barW, 2) }
  })

  // X labels
  ctx.fillStyle = COLORS.text; ctx.font = '9px monospace'; ctx.textAlign = 'center'
  const every = Math.ceil(n / 10)
  days.forEach((d, i) => {
    if (i % every === 0 || i === n - 1)
      ctx.fillText(d.date.slice(5), PAD.left + i * step + step / 2, H - PAD.bottom + 13)
  })

  // Hover crosshair
  if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < n) {
    const x = PAD.left + hoveredIdx * step + step / 2
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath(); ctx.arc(x, pY(days[hoveredIdx].price), 3, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.price; ctx.fill()
  }
}

export default function ChecklistBacktest() {
  const canvasRef  = useRef(null)
  const [days,     setDays]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [hovered,  setHovered]  = useState(null)
  const [tpiInput, setTpiInput] = useState('')  // raw JSON input from user
  const [tpiParsed,setTpiParsed]= useState(TPI_TRANSITIONS)
  const [tpiError, setTpiError] = useState(null)

  const hoveredDay = hovered !== null ? days[hovered] : null

  const runBacktest = async (transitions) => {
    setLoading(true); setError(null)
    try {
      const { prices, fgMap, fundingMap } = await fetchAllData()
      const res = await fetch('/api/checklist-backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices, fgMap, fundingMap, tpiTransitions: transitions }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setDays(d.days)
    } catch(e) { setError(e.message) }
    finally    { setLoading(false) }
  }

  useEffect(() => { runBacktest(tpiParsed) }, [])

  useEffect(() => {
    if (!days.length) return
    const canvas = canvasRef.current; if (!canvas) return
    drawChart(canvas, days, hovered)
    const onResize = () => drawChart(canvas, days, hovered)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [days, hovered])

  const handleTpiSubmit = () => {
    try {
      const parsed = JSON.parse(tpiInput)
      if (!Array.isArray(parsed)) throw new Error('Must be an array')
      const sorted = parsed.sort((a, b) => a.date.localeCompare(b.date))
      setTpiParsed(sorted); setTpiError(null)
      runBacktest(sorted)
    } catch(e) { setTpiError(e.message) }
  }

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current; if (!canvas || !days.length) return
    const rect = canvas.getBoundingClientRect()
    const step = (canvas.offsetWidth - 12 - 56) / days.length
    const idx  = Math.floor((e.clientX - rect.left - 12) / step)
    setHovered(idx >= 0 && idx < days.length ? idx : null)
  }

  const tpiHasDates = tpiParsed.length > 0
  const hasTpiInData = days.some(d => d.tpiAvail)
  const bias = hoveredDay
    ? hoveredDay.longScore > hoveredDay.shortScore ? { text: `LONG ${hoveredDay.longScore}/6`,  color: '#22c55e' }
    : hoveredDay.shortScore > hoveredDay.longScore ? { text: `SHORT ${hoveredDay.shortScore}/6`, color: '#ef4444' }
    : { text: 'NEUTRAL', color: '#eab308' }
    : null

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-1">
        <SectionHeader label="Checklist Backtest — 100 Days" />
        <span className="text-[10px] text-[#333] tracking-widest mb-4">
          {hasTpiInData ? '6/6 SIGNALS' : '5/6 SIGNALS · TPI PENDING'}
        </span>
      </div>
      <div className="text-[10px] text-[#444] tracking-wider mb-4">
        FUNDING · F&G · TPI · OI+PRICE · LIQ IMBALANCE · CVD TAKER · Green = long · Red = short
      </div>

      {/* TPI Input Panel */}
      <div className="mb-4 border border-[#1a1a1a] rounded-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-[#444] tracking-widest">TPI HISTORY INPUT</span>
          {tpiHasDates && (
            <span className="text-[10px] text-green-500">{tpiParsed.length} transitions loaded</span>
          )}
        </div>
        <div className="text-[10px] text-[#333] mb-2">
          Paste your TPI transition dates as JSON. Format: {`[{"date":"2024-12-07","state":"LONG"},{"date":"2025-01-20","state":"SHORT"}]`}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tpiInput}
            onChange={e => setTpiInput(e.target.value)}
            placeholder='[{"date":"YYYY-MM-DD","state":"LONG"}]'
            className="flex-1 bg-[#111] border border-[#222] rounded-sm px-3 py-1.5 text-[11px] font-mono text-[#888] focus:outline-none focus:border-[#444] placeholder-[#333]"
          />
          <button
            onClick={handleTpiSubmit}
            className="px-4 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-sm text-[11px] text-[#888] hover:border-[#555] hover:text-[#aaa] tracking-widest"
          >
            RUN
          </button>
        </div>
        {tpiError && <div className="text-red-500 text-[10px] mt-1">{tpiError}</div>}
      </div>

      {loading && <div className="text-[#555] text-xs tracking-widest py-8 text-center">LOADING 100 DAYS...</div>}
      {error   && <div className="text-red-500 text-xs py-2">ERR: {error}</div>}

      {!loading && !error && days.length > 0 && (
        <div className="border border-[#1a1a1a] rounded-sm overflow-hidden bg-[#0a0a0a]">
          <div className="flex items-center gap-5 px-5 py-2.5 border-b border-[#111] min-h-[40px]">
            {hoveredDay ? (
              <>
                <span className="text-[10px] font-mono text-[#555]">{hoveredDay.date}</span>
                <span className="text-[10px] font-mono text-[#f7931a]">${hoveredDay.price.toLocaleString()}</span>
                <span className="text-[10px] font-mono" style={{ color: hoveredDay.change24h >= 0 ? '#22c55e' : '#ef4444' }}>
                  {hoveredDay.change24h >= 0 ? '+' : ''}{hoveredDay.change24h}%
                </span>
                {hoveredDay.fg    !== null && <span className="text-[10px] font-mono text-[#555]">F&G {hoveredDay.fg}</span>}
                {hoveredDay.frPct !== null && <span className="text-[10px] font-mono text-[#555]">FR {hoveredDay.frPct >= 0 ? '+' : ''}{hoveredDay.frPct.toFixed(4)}%</span>}
                {hoveredDay.tpiState && <span className="text-[10px] font-mono" style={{ color: hoveredDay.tpiState === 'LONG' ? '#22c55e' : '#ef4444' }}>TPI {hoveredDay.tpiState}</span>}
                {bias && <span className="text-[10px] font-mono font-bold ml-auto" style={{ color: bias.color }}>{bias.text}</span>}
              </>
            ) : (
              <span className="text-[10px] text-[#2a2a2a] tracking-widest">HOVER TO INSPECT DAY</span>
            )}
          </div>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '320px', display: 'block', cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHovered(null)}
          />
          <div className="flex items-center gap-5 px-5 py-2.5 border-t border-[#111] flex-wrap">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#f7931a]" /><span className="text-[10px] text-[#444]">BTC price</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#22c55e]" /><span className="text-[10px] text-[#444]">Long score (above 0)</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#ef4444]" /><span className="text-[10px] text-[#444]">Short score (below 0)</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#22c55e33]" /><span className="text-[10px] text-[#444]">TPI LONG</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#ef444433]" /><span className="text-[10px] text-[#444]">TPI SHORT</span></div>
            <span className="text-[10px] text-[#2a2a2a] ml-auto">Shaded = FR unavailable</span>
          </div>
        </div>
      )}
    </div>
  )
}
