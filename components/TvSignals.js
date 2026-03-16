'use client'

import { useEffect, useRef, useState } from 'react'

// ─── colour helpers ───────────────────────────────────────────────
const STATE_META = {
  'MAX LONG':  { bg: 'bg-green-500',  text: 'text-black', ring: '#22c55e', label: 'MAX LONG'  },
  'LONG':      { bg: 'bg-green-400',  text: 'text-black', ring: '#4ade80', label: 'LONG'      },
  'NEUTRAL':   { bg: 'bg-gray-400',   text: 'text-black', ring: '#9ca3af', label: 'NEUTRAL'   },
  'SHORT':     { bg: 'bg-red-400',    text: 'text-white', ring: '#f87171', label: 'SHORT'      },
  'MAX SHORT': { bg: 'bg-red-600',    text: 'text-white', ring: '#dc2626', label: 'MAX SHORT' },
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
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>-1</span><span className="text-white font-mono">{fmt2(val)}</span><span>+1</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: col }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-600 mt-0.5">
        <span>SHORT</span><span>LONG</span>
      </div>
    </div>
  )
}

// ─── Hardcoded daily equity (2025-03-17 onward, normalized to 1.0) ─
// Sourced from full TV strategy CSV (80 trades, 2018-01-01 to present)
// Linear interpolation between trade entry/exit prices per day
// T80 (SHORT from $88,341.87 on 2026-01-20) live endpoint appended dynamically
const EQUITY_DAILY = [["2025-03-17", 1.0], ["2025-03-18", 1.00154], ["2025-03-19", 1.00308], ["2025-03-20", 1.00462], ["2025-03-21", 1.00616], ["2025-03-22", 1.00771], ["2025-03-23", 1.00925], ["2025-03-24", 1.01079], ["2025-03-25", 1.01233], ["2025-03-26", 1.01387], ["2025-03-27", 1.01541], ["2025-03-28", 1.01695], ["2025-03-29", 1.01849], ["2025-03-30", 1.02003], ["2025-03-31", 1.02157], ["2025-04-01", 1.02312], ["2025-04-02", 1.02466], ["2025-04-03", 1.0262], ["2025-04-04", 1.02774], ["2025-04-05", 1.02928], ["2025-04-06", 1.03082], ["2025-04-07", 1.03236], ["2025-04-08", 1.0339], ["2025-04-09", 1.03544], ["2025-04-10", 1.03699], ["2025-04-11", 1.03853], ["2025-04-12", 1.04007], ["2025-04-13", 1.04161], ["2025-04-14", 1.04315], ["2025-04-15", 1.04469], ["2025-04-16", 1.04623], ["2025-04-17", 1.04777], ["2025-04-18", 1.04931], ["2025-04-19", 1.05086], ["2025-04-20", 1.0524], ["2025-04-21", 1.05394], ["2025-04-22", 1.05756], ["2025-04-23", 1.06118], ["2025-04-24", 1.0648], ["2025-04-25", 1.06843], ["2025-04-26", 1.07205], ["2025-04-27", 1.07567], ["2025-04-28", 1.07929], ["2025-04-29", 1.08292], ["2025-04-30", 1.08654], ["2025-05-01", 1.09016], ["2025-05-02", 1.09378], ["2025-05-03", 1.0974], ["2025-05-04", 1.10103], ["2025-05-05", 1.10465], ["2025-05-06", 1.10827], ["2025-05-07", 1.11189], ["2025-05-08", 1.11552], ["2025-05-09", 1.11914], ["2025-05-10", 1.12276], ["2025-05-11", 1.12638], ["2025-05-12", 1.13], ["2025-05-13", 1.13363], ["2025-05-14", 1.13725], ["2025-05-15", 1.14087], ["2025-05-16", 1.14449], ["2025-05-17", 1.14812], ["2025-05-18", 1.15174], ["2025-05-19", 1.15536], ["2025-05-20", 1.15898], ["2025-05-21", 1.1626], ["2025-05-22", 1.16623], ["2025-05-23", 1.16985], ["2025-05-24", 1.17347], ["2025-05-25", 1.17709], ["2025-05-26", 1.18071], ["2025-05-27", 1.18434], ["2025-05-28", 1.18796], ["2025-05-29", 1.19158], ["2025-05-30", 1.1952], ["2025-05-31", 1.19883], ["2025-06-01", 1.20245], ["2025-06-02", 1.20607], ["2025-06-03", 1.20969], ["2025-06-04", 1.21331], ["2025-06-05", 1.21694], ["2025-06-06", 1.22056], ["2025-06-07", 1.22418], ["2025-06-08", 1.2278], ["2025-06-09", 1.23143], ["2025-06-10", 1.23505], ["2025-06-11", 1.23867], ["2025-06-12", 1.24229], ["2025-06-13", 1.24591], ["2025-06-14", 1.24954], ["2025-06-15", 1.25316], ["2025-06-16", 1.25678], ["2025-06-17", 1.2604], ["2025-06-18", 1.25664], ["2025-06-19", 1.25288], ["2025-06-20", 1.24912], ["2025-06-21", 1.24536], ["2025-06-22", 1.2416], ["2025-06-23", 1.23784], ["2025-06-24", 1.23408], ["2025-06-25", 1.23032], ["2025-06-26", 1.22656], ["2025-06-27", 1.2228], ["2025-06-28", 1.21904], ["2025-06-29", 1.21528], ["2025-06-30", 1.20058], ["2025-07-01", 1.18587], ["2025-07-02", 1.15065], ["2025-07-03", 1.15232], ["2025-07-04", 1.15398], ["2025-07-05", 1.15565], ["2025-07-06", 1.15731], ["2025-07-07", 1.15897], ["2025-07-08", 1.16064], ["2025-07-09", 1.1623], ["2025-07-10", 1.16397], ["2025-07-11", 1.16563], ["2025-07-12", 1.1673], ["2025-07-13", 1.16896], ["2025-07-14", 1.17063], ["2025-07-15", 1.17229], ["2025-07-16", 1.17396], ["2025-07-17", 1.17562], ["2025-07-18", 1.17729], ["2025-07-19", 1.17895], ["2025-07-20", 1.18062], ["2025-07-21", 1.18228], ["2025-07-22", 1.18395], ["2025-07-23", 1.18561], ["2025-07-24", 1.18728], ["2025-07-25", 1.18894], ["2025-07-26", 1.19061], ["2025-07-27", 1.19227], ["2025-07-28", 1.19394], ["2025-07-29", 1.1956], ["2025-07-30", 1.19726], ["2025-07-31", 1.19893], ["2025-08-01", 1.20059], ["2025-08-02", 1.20226], ["2025-08-03", 1.20392], ["2025-08-04", 1.20559], ["2025-08-05", 1.20725], ["2025-08-06", 1.20892], ["2025-08-07", 1.21058], ["2025-08-08", 1.21225], ["2025-08-09", 1.21391], ["2025-08-10", 1.21558], ["2025-08-11", 1.21724], ["2025-08-12", 1.21891], ["2025-08-13", 1.22057], ["2025-08-14", 1.22224], ["2025-08-15", 1.2239], ["2025-08-16", 1.22557], ["2025-08-17", 1.22723], ["2025-08-18", 1.2289], ["2025-08-19", 1.22871], ["2025-08-20", 1.22852], ["2025-08-21", 1.22834], ["2025-08-22", 1.22815], ["2025-08-23", 1.22796], ["2025-08-24", 1.22778], ["2025-08-25", 1.22759], ["2025-08-26", 1.2274], ["2025-08-27", 1.22722], ["2025-08-28", 1.22703], ["2025-08-29", 1.22684], ["2025-08-30", 1.22666], ["2025-08-31", 1.22647], ["2025-09-01", 1.22629], ["2025-09-02", 1.2261], ["2025-09-03", 1.22591], ["2025-09-04", 1.22573], ["2025-09-05", 1.22554], ["2025-09-06", 1.22535], ["2025-09-07", 1.22517], ["2025-09-08", 1.22498], ["2025-09-09", 1.22479], ["2025-09-10", 1.22461], ["2025-09-11", 1.22442], ["2025-09-12", 1.22423], ["2025-09-13", 1.22405], ["2025-09-14", 1.22386], ["2025-09-15", 1.22367], ["2025-09-16", 1.22349], ["2025-09-17", 1.21965], ["2025-09-18", 1.21582], ["2025-09-19", 1.21199], ["2025-09-20", 1.20944], ["2025-09-21", 1.2069], ["2025-09-22", 1.20435], ["2025-09-23", 1.20181], ["2025-09-24", 1.19926], ["2025-09-25", 1.19672], ["2025-09-26", 1.19417], ["2025-09-27", 1.19163], ["2025-09-28", 1.18908], ["2025-09-29", 1.18654], ["2025-09-30", 1.18399], ["2025-10-01", 1.18145], ["2025-10-02", 1.17522], ["2025-10-03", 1.169], ["2025-10-04", 1.16278], ["2025-10-05", 1.15656], ["2025-10-06", 1.15033], ["2025-10-07", 1.14411], ["2025-10-08", 1.13789], ["2025-10-09", 1.13167], ["2025-10-10", 1.12544], ["2025-10-11", 1.12764], ["2025-10-12", 1.12983], ["2025-10-13", 1.13203], ["2025-10-14", 1.13422], ["2025-10-15", 1.13641], ["2025-10-16", 1.13861], ["2025-10-17", 1.1408], ["2025-10-18", 1.143], ["2025-10-19", 1.14519], ["2025-10-20", 1.14738], ["2025-10-21", 1.14958], ["2025-10-22", 1.15177], ["2025-10-23", 1.15397], ["2025-10-24", 1.15616], ["2025-10-25", 1.15835], ["2025-10-26", 1.16055], ["2025-10-27", 1.16274], ["2025-10-28", 1.16494], ["2025-10-29", 1.16713], ["2025-10-30", 1.16932], ["2025-10-31", 1.17152], ["2025-11-01", 1.17371], ["2025-11-02", 1.17591], ["2025-11-03", 1.1781], ["2025-11-04", 1.18029], ["2025-11-05", 1.18249], ["2025-11-06", 1.18468], ["2025-11-07", 1.18688], ["2025-11-08", 1.18907], ["2025-11-09", 1.19126], ["2025-11-10", 1.19346], ["2025-11-11", 1.19565], ["2025-11-12", 1.19785], ["2025-11-13", 1.20004], ["2025-11-14", 1.20223], ["2025-11-15", 1.20443], ["2025-11-16", 1.20662], ["2025-11-17", 1.20882], ["2025-11-18", 1.21101], ["2025-11-19", 1.2132], ["2025-11-20", 1.2154], ["2025-11-21", 1.21759], ["2025-11-22", 1.21979], ["2025-11-23", 1.22198], ["2025-11-24", 1.22417], ["2025-11-25", 1.22637], ["2025-11-26", 1.22856], ["2025-11-27", 1.23076], ["2025-11-28", 1.23295], ["2025-11-29", 1.23514], ["2025-11-30", 1.23734], ["2025-12-01", 1.23953], ["2025-12-02", 1.24173], ["2025-12-03", 1.24392], ["2025-12-04", 1.24611], ["2025-12-05", 1.24831], ["2025-12-06", 1.2505], ["2025-12-07", 1.2527], ["2025-12-08", 1.25489], ["2025-12-09", 1.25708], ["2025-12-10", 1.25928], ["2025-12-11", 1.26147], ["2025-12-12", 1.26366], ["2025-12-13", 1.26586], ["2025-12-14", 1.26805], ["2025-12-15", 1.27025], ["2025-12-16", 1.27244], ["2025-12-17", 1.27463], ["2025-12-18", 1.27683], ["2025-12-19", 1.27902], ["2025-12-20", 1.28122], ["2025-12-21", 1.28341], ["2025-12-22", 1.2856], ["2025-12-23", 1.2878], ["2025-12-24", 1.28999], ["2025-12-25", 1.29219], ["2025-12-26", 1.29438], ["2025-12-27", 1.29657], ["2025-12-28", 1.29877], ["2025-12-29", 1.30096], ["2025-12-30", 1.30316], ["2025-12-31", 1.30535], ["2026-01-01", 1.30754], ["2026-01-02", 1.30974], ["2026-01-03", 1.31193], ["2026-01-04", 1.31413], ["2026-01-05", 1.31632], ["2026-01-06", 1.30474], ["2026-01-07", 1.29315], ["2026-01-08", 1.28157], ["2026-01-09", 1.26999], ["2026-01-10", 1.26751], ["2026-01-11", 1.26503], ["2026-01-12", 1.26108], ["2026-01-13", 1.25713], ["2026-01-14", 1.25318], ["2026-01-15", 1.24923], ["2026-01-16", 1.24528], ["2026-01-17", 1.24133], ["2026-01-18", 1.23738], ["2026-01-19", 1.23344], ["2026-01-20", 1.22949], ["2026-01-21", 1.23317], ["2026-01-22", 1.23686], ["2026-01-23", 1.24054], ["2026-01-24", 1.24423], ["2026-01-25", 1.24792], ["2026-01-26", 1.2516], ["2026-01-27", 1.25529], ["2026-01-28", 1.25898], ["2026-01-29", 1.26266], ["2026-01-30", 1.26635], ["2026-01-31", 1.27003], ["2026-02-01", 1.27372], ["2026-02-02", 1.27741], ["2026-02-03", 1.28109], ["2026-02-04", 1.28478], ["2026-02-05", 1.28846], ["2026-02-06", 1.29215], ["2026-02-07", 1.29584], ["2026-02-08", 1.29952], ["2026-02-09", 1.30321], ["2026-02-10", 1.3069], ["2026-02-11", 1.31058], ["2026-02-12", 1.31427], ["2026-02-13", 1.31795], ["2026-02-14", 1.32164], ["2026-02-15", 1.32533], ["2026-02-16", 1.32901], ["2026-02-17", 1.3327], ["2026-02-18", 1.33639], ["2026-02-19", 1.34007], ["2026-02-20", 1.34376], ["2026-02-21", 1.34744], ["2026-02-22", 1.35113], ["2026-02-23", 1.35482], ["2026-02-24", 1.3585], ["2026-02-25", 1.36219], ["2026-02-26", 1.36588], ["2026-02-27", 1.36956], ["2026-02-28", 1.37325], ["2026-03-01", 1.37693], ["2026-03-02", 1.38062], ["2026-03-03", 1.38431], ["2026-03-04", 1.38799], ["2026-03-05", 1.39168], ["2026-03-06", 1.39537], ["2026-03-07", 1.39905], ["2026-03-08", 1.40274], ["2026-03-09", 1.40642], ["2026-03-10", 1.41011], ["2026-03-11", 1.4138], ["2026-03-12", 1.41748], ["2026-03-13", 1.42117], ["2026-03-14", 1.42486], ["2026-03-15", 1.42854], ["2026-03-16", 1.43223]]

// Trade exit markers for dots on the curve
const TRADE_EXITS = [
  // T66 SHORT exit → LONG entry
  { date: '2025-04-21', equity: null },
  // T67 LONG exit → SHORT entry
  { date: '2025-06-17', equity: null },
  // T68 SHORT exit → LONG entry
  { date: '2025-06-29', equity: null },
  // T69 LONG exit → SHORT entry
  { date: '2025-07-01', equity: null },
  // T70 SHORT exit → LONG entry
  { date: '2025-07-02', equity: null },
  // T71 LONG exit → SHORT entry
  { date: '2025-08-18', equity: null },
  // T72 SHORT exit → LONG entry
  { date: '2025-09-16', equity: null },
  // T73 LONG exit → SHORT entry
  { date: '2025-09-19', equity: null },
  // T74 SHORT exit → LONG entry
  { date: '2025-10-01', equity: null },
  // T75 LONG exit → SHORT entry
  { date: '2025-10-10', equity: null },
  // T76 SHORT exit → LONG entry
  { date: '2026-01-05', equity: null },
  // T77 LONG exit → SHORT entry
  { date: '2026-01-09', equity: null },
  // T78 SHORT exit → LONG entry
  { date: '2026-01-11', equity: null },
  // T79 LONG exit → SHORT entry (T80 open)
  { date: '2026-01-20', equity: null },
]

// ─── Combined BTC Price + Equity Curve (shared x-axis) ────────────
function CombinedChart({ history, liveBtcPrice }) {
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

    // BTC price pts (newest-first → reverse)
    const btcPts = [...history].reverse().filter(d => d.price > 0)
    if (btcPts.length < 2) return

    // Build equity array aligned to same date range as btcPts
    // EQUITY_DAILY is [date, equity] pairs sorted ascending
    const equityMap = Object.fromEntries(EQUITY_DAILY)

    // Append live endpoint: T80 is SHORT from $88,341.87
    // liveEquity = lastKnownEquity * (88341.87 / currentPrice)
    const T80_ENTRY_PRICE = 88341.87
    if (liveBtcPrice > 0) {
      const lastKnown = EQUITY_DAILY[EQUITY_DAILY.length - 1][1]
      const liveEquity = lastKnown * (T80_ENTRY_PRICE / liveBtcPrice)
      const today = new Date().toISOString().slice(0, 10)
      equityMap[today] = liveEquity
    }

    // Map each BTC point to its equity value by date
    const equityPts = btcPts.map(p => {
      const dateStr = new Date(p.ts).toISOString().slice(0, 10)
      return equityMap[dateStr] ?? null
    })

    // Fill nulls by interpolation
    for (let i = 0; i < equityPts.length; i++) {
      if (equityPts[i] === null) {
        // find nearest non-null neighbours
        let prev = null, next = null
        for (let j = i - 1; j >= 0; j--) if (equityPts[j] !== null) { prev = { i: j, v: equityPts[j] }; break }
        for (let j = i + 1; j < equityPts.length; j++) if (equityPts[j] !== null) { next = { i: j, v: equityPts[j] }; break }
        if (prev && next) equityPts[i] = prev.v + (next.v - prev.v) * (i - prev.i) / (next.i - prev.i)
        else if (prev) equityPts[i] = prev.v
        else if (next) equityPts[i] = next.v
        else equityPts[i] = 1.0
      }
    }

    const validEquity = equityPts.filter(v => v !== null)
    if (validEquity.length === 0) return

    // Layout: top 60% = BTC price, bottom 40% = equity curve
    // Shared x-axis
    const pad = { t: 8, r: 52, b: 20, l: 60 }
    const splitY = Math.floor(H * 0.58) // divider between charts
    const cw = W - pad.l - pad.r
    const priceCh = splitY - pad.t - 4   // price chart height
    const equityCh = H - splitY - pad.b  // equity chart height

    ctx.clearRect(0, 0, W, H)

    // ── BTC Price chart (top) ──
    const prices = btcPts.map(d => d.price)
    const minP = Math.min(...prices), maxP = Math.max(...prices)
    const rangeP = maxP - minP || 1

    const pX = (i) => pad.l + (cw * i) / (btcPts.length - 1)
    const pY = (price) => pad.t + priceCh - (priceCh * (price - minP)) / rangeP

    // Price grid
    ctx.font = '9px monospace'; ctx.textAlign = 'right'
    for (let i = 0; i <= 3; i++) {
      const v = minP + (rangeP * i) / 3
      const y = pad.t + priceCh - (priceCh * i) / 3
      ctx.fillStyle = '#4b5563'
      ctx.fillText(`$${Math.round(v / 1000)}k`, pad.l - 4, y + 3)
      ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke()
    }

    // Price line (state-coloured)
    ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
    for (let i = 1; i < btcPts.length; i++) {
      ctx.strokeStyle = stateColor(btcPts[i].state)
      ctx.beginPath()
      ctx.moveTo(pX(i - 1), pY(btcPts[i - 1].price))
      ctx.lineTo(pX(i), pY(btcPts[i].price))
      ctx.stroke()
    }

    // Divider
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(pad.l, splitY); ctx.lineTo(pad.l + cw, splitY); ctx.stroke()
    ctx.setLineDash([])

    // ── Equity curve (bottom) ──
    const minE = Math.min(...validEquity), maxE = Math.max(...validEquity)
    const rangeE = maxE - minE || 0.01

    const eX = (i) => pad.l + (cw * i) / (equityPts.length - 1)
    const eY = (v) => splitY + 4 + equityCh - (equityCh * (v - minE)) / rangeE

    // 1.0 baseline
    const baselineY = eY(Math.max(minE, Math.min(maxE, 1.0)))
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 0.5
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(pad.l, baselineY); ctx.lineTo(pad.l + cw, baselineY); ctx.stroke()
    ctx.setLineDash([])

    // Equity grid + right y-axis labels
    ctx.font = '9px monospace'; ctx.textAlign = 'left'
    for (let i = 0; i <= 3; i++) {
      const v = minE + (rangeE * i) / 3
      const y = splitY + 4 + equityCh - (equityCh * i) / 3
      ctx.fillStyle = '#4b5563'
      ctx.fillText(`${v.toFixed(2)}x`, pad.l + cw + 4, y + 3)
    }

    // Gradient fill under equity curve
    const grad = ctx.createLinearGradient(0, splitY + 4, 0, H - pad.b)
    grad.addColorStop(0, 'rgba(129,140,248,0.2)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.beginPath()
    equityPts.forEach((v, i) => { i === 0 ? ctx.moveTo(eX(i), eY(v)) : ctx.lineTo(eX(i), eY(v)) })
    ctx.lineTo(eX(equityPts.length - 1), H - pad.b)
    ctx.lineTo(pad.l, H - pad.b)
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill()

    // Equity line
    ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
    for (let i = 1; i < equityPts.length; i++) {
      const prev = equityPts[i - 1], cur = equityPts[i]
      ctx.strokeStyle = (prev >= 1.0 && cur >= 1.0) ? '#818cf8'
        : (prev < 1.0 && cur < 1.0) ? '#f87171' : '#818cf8'
      ctx.beginPath(); ctx.moveTo(eX(i - 1), eY(prev)); ctx.lineTo(eX(i), eY(cur)); ctx.stroke()
    }

    // Trade exit dots on equity curve
    const equityDateMap = Object.fromEntries(EQUITY_DAILY)
    TRADE_EXITS.forEach(exit => {
      const idx = btcPts.findIndex(p => new Date(p.ts).toISOString().slice(0, 10) === exit.date)
      if (idx >= 0 && equityPts[idx] !== null) {
        const x = eX(idx), y = eY(equityPts[idx])
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = equityPts[idx] >= 1.0 ? '#818cf8' : '#f87171'
        ctx.fill()
      }
    })

    // Final equity value label
    const lastEq = equityPts[equityPts.length - 1]
    const lastX = eX(equityPts.length - 1)
    const lastY = eY(lastEq)
    ctx.fillStyle = lastEq >= 1.0 ? '#818cf8' : '#f87171'
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'
    ctx.fillText(`${lastEq.toFixed(3)}x`, lastX + 2, lastY - 2)

    // ── Shared x-axis labels (bottom) ──
    ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ;[0, Math.floor((btcPts.length - 1) / 2), btcPts.length - 1].forEach(i => {
      const d = new Date(btcPts[i].ts)
      const label = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
      ctx.fillText(label, pX(i), H - 4)
    })

  }, [history, liveBtcPrice])

  return (
    <canvas ref={canvasRef} className="w-full" style={{ height: 320, display: 'block' }} />
  )
}

// ─── Rotation Badge ───────────────────────────────────────────────
const ASSET_COLORS = {
  BTCUSD:  '#f59e0b',
  ETHUSD:  '#818cf8',
  SOLUSD:  '#a78bfa',
  XRPUSD:  '#60a5fa',
  BNBUSD:  '#fbbf24',
  DOGEUSD: '#fb923c',
  USD:     '#9ca3af',
}

function RotationCard({ rotation }) {
  if (!rotation) return null
  const asset = rotation.asset?.replace(/^(INDEX:|CRYPTO:)/, '') || 'USD'
  const col = ASSET_COLORS[asset] || '#9ca3af'
  const age = rotation.ts
    ? Math.floor((Date.now() - rotation.ts) / (1000 * 60 * 60))
    : null

  return (
    <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
        Rotation Signal
      </div>
      <div className="flex items-center gap-3">
        <div
          className="text-xl font-bold font-mono"
          style={{ color: col }}
        >
          {asset}
        </div>
        {rotation.prev_asset && (
          <div className="text-xs text-gray-500">
            ← {rotation.prev_asset.replace(/^(INDEX:|CRYPTO:)/, '')}
          </div>
        )}
      </div>
      {age != null && (
        <div className="text-xs text-gray-600 mt-1">
          {age < 1 ? 'Just now' : `${age}h ago`}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────
export default function TvSignals() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSignals = async () => {
    try {
      const res = await fetch('/api/signals')
      if (!res.ok) throw new Error('Failed to fetch signals')
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSignals()
    const interval = setInterval(fetchSignals, 60_000) // refresh every 60s
    return () => clearInterval(interval)
  }, [])

  const btc = data?.btc
  const rotation = data?.rotation
  const btcHistory = data?.history?.btc || []
  const stateMeta = STATE_META[btc?.state] || STATE_META['NEUTRAL']

  // ── Top signal banner (for embedding in page.js header area) ──
  // This is exported separately for use in the master overview bar
  return (
    <div className="space-y-4">

      {/* ── Signal Banner ── */}
      {btc && (
        <div
          className="flex items-center gap-4 bg-[#0f172a] border border-gray-800 rounded-lg px-4 py-3 font-mono text-sm"
          style={{ borderLeftWidth: 3, borderLeftColor: stateColor(btc.state) }}
        >
          <span className="text-gray-400">BTC</span>
          <span
            className={`px-2 py-0.5 rounded text-xs font-bold ${stateMeta.bg} ${stateMeta.text}`}
          >
            {btc.state}
          </span>
          <span className="text-gray-300">
            TPI <span style={{ color: stateColor(btc.state) }}>{fmt2(btc.tpi)}</span>
          </span>
          <span className="text-gray-300">
            RoC{' '}
            <span style={{ color: btc.roc >= 0 ? '#22c55e' : '#ef4444' }}>
              {fmt2(btc.roc)}
            </span>
          </span>
          {btc.price > 0 && (
            <span className="text-gray-400 ml-auto">{fmtPrice(btc.price)}</span>
          )}
          {btc.updated_at && (
            <span className="text-gray-600 text-xs">
              {new Date(btc.updated_at).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {loading && !btc && (
        <div className="bg-[#0f172a] border border-gray-800 rounded-lg px-4 py-3 text-gray-500 text-sm font-mono">
          Waiting for first TradingView signal…
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* ── Detail Cards Row ── */}
      <div className="grid grid-cols-2 gap-4">

        {/* BTC Signal Card */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-4 space-y-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider">BTC / ORPI1</div>

          {btc ? (
            <>
              <div className="flex items-center gap-3">
                <div
                  className={`px-3 py-1.5 rounded-md font-bold text-sm ${stateMeta.bg} ${stateMeta.text}`}
                >
                  {btc.state}
                </div>
                <div className="text-gray-300 text-lg font-mono font-bold">
                  {fmtPrice(btc.price)}
                </div>
              </div>

              <TpiGauge tpi={btc.tpi} />

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-gray-500">TPI (live)</div>
                  <div className="font-mono font-bold" style={{ color: stateColor(btc.state) }}>
                    {fmt2(btc.tpi)}
                  </div>
                </div>
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-gray-500">RoC</div>
                  <div
                    className="font-mono font-bold"
                    style={{ color: (btc.roc ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}
                  >
                    {fmt2(btc.roc)}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-600 text-sm">No signal yet</div>
          )}
        </div>

        {/* Rotation Card */}
        <div className="space-y-4">
          <RotationCard rotation={rotation} />

          {/* Legend */}
          <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">State Legend</div>
            <div className="space-y-1">
              {Object.entries(STATE_META).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${v.bg}`} />
                  <span className="text-xs text-gray-400">{k}</span>
                  <span className="text-xs text-gray-600 ml-auto">
                    {k === 'MAX LONG' ? '> 0.9' : k === 'LONG' ? '0.11 – 0.9' : k === 'NEUTRAL' ? '-0.1 – 0.11' : k === 'SHORT' ? '-0.9 – -0.11' : '< -0.9'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── BTC Price + ORPI1 Equity Curve (shared x-axis) ── */}
      {btcHistory.length > 1 && (
        <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider">
              BTC Price + ORPI1 Equity Curve
            </div>
            <div className="flex gap-3 text-xs text-gray-600">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-green-400 rounded" /> Long</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-red-400 rounded" /> Short</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-indigo-400 rounded" /> Equity</span>
            </div>
          </div>
          <CombinedChart history={btcHistory} liveBtcPrice={btc?.price || 0} />
          <div className="text-xs text-gray-700 mt-2">
            Equity normalized to 1.0 at chart start · 80 trades since 2018 · dots = signal changes · live endpoint interpolated from current BTC price
          </div>
        </div>
      )}

      {/* Empty state charts */}
      {btcHistory.length <= 1 && !loading && (
        <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-6 text-center">
          <div className="text-gray-600 text-sm">
            Charts will populate after receiving TradingView alerts
          </div>
          <div className="text-gray-700 text-xs mt-1 font-mono">
            POST {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Compact Banner (for page.js top bar) ─────────────────────────
export function TvSignalBanner({ btc }) {
  if (!btc) return null
  const stateMeta = STATE_META[btc.state] || STATE_META['NEUTRAL']
  return (
    <div
      className="inline-flex items-center gap-3 font-mono text-xs"
      style={{ color: stateColor(btc.state) }}
    >
      <span className="text-gray-500">BTC</span>
      <span className={`px-1.5 py-0.5 rounded font-bold ${stateMeta.bg} ${stateMeta.text}`}>
        {btc.state}
      </span>
      <span>TPI {fmt2(btc.tpi)}</span>
      <span>RoC {fmt2(btc.roc)}</span>
    </div>
  )
}
