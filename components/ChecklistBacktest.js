'use client'
import { useEffect, useRef, useState } from 'react'

// ── TPI transitions ───────────────────────────────────────────────────────────
const TPI_TRANSITIONS_HISTORICAL = [
  {"date":"2024-12-07","state":"LONG"},  {"date":"2024-12-21","state":"SHORT"},
  {"date":"2025-01-16","state":"LONG"},  {"date":"2025-02-01","state":"SHORT"},
  {"date":"2025-04-21","state":"LONG"},  {"date":"2025-06-17","state":"SHORT"},
  {"date":"2025-06-29","state":"LONG"},  {"date":"2025-07-01","state":"SHORT"},
  {"date":"2025-07-02","state":"LONG"},  {"date":"2025-08-18","state":"SHORT"},
  {"date":"2025-09-16","state":"LONG"},  {"date":"2025-09-19","state":"SHORT"},
  {"date":"2025-10-01","state":"LONG"},  {"date":"2025-10-10","state":"SHORT"},
  {"date":"2026-01-05","state":"LONG"},  {"date":"2026-01-09","state":"SHORT"},
  {"date":"2026-01-11","state":"LONG"},  {"date":"2026-01-20","state":"SHORT"},
]

function interpolateTpi(transitions, date) {
  if (!transitions?.length) return null
  let state = transitions[0].state
  for (const t of transitions) {
    if (t.date <= date) state = t.state
    else break
  }
  return state
}

// ── Score a day using EXACT same logic as checklist/route.js buildChecklist() ─
// frPct = fundingRate * 100, all others as described
function scoreDay({ frPct, fg, tpiState, oiPrev, oiCurr, priceChangePct, takerBuyRatio, domTrend }) {
  const priceUp   = priceChangePct > 0
  const priceDown = priceChangePct < 0
  const oiRising  = (oiPrev !== null && oiCurr !== null) ? oiCurr > oiPrev : null
  const hasDom    = domTrend !== null && domTrend !== undefined

  const longScores = [
    frPct         !== null ? (frPct <= 0.005 ? 1 : 0)           : null, // C1 FR neutral/neg
    fg            !== null ? (fg < 30 ? 1 : 0)                  : null, // C2 Extreme fear
    tpiState      !== null ? (tpiState === 'LONG' ? 1 : 0)       : null, // C3 TPI LONG
    oiRising      !== null ? (oiRising && priceUp ? 1 : 0)       : null, // C4 OI↑ Price↑
    hasDom               ? (domTrend === 'rising' ? 1 : 0)       : null, // C5 Dom rising
    takerBuyRatio !== null ? (takerBuyRatio > 52 ? 1 : 0)        : null, // C6 CVD buy>52%
  ]
  const shortScores = [
    frPct         !== null ? (frPct > 0.05 ? 1 : 0)             : null,
    fg            !== null ? (fg > 70 ? 1 : 0)                  : null,
    tpiState      !== null ? (tpiState === 'SHORT' ? 1 : 0)      : null,
    oiRising      !== null ? (oiRising && priceDown ? 1 : 0)     : null,
    hasDom               ? (domTrend === 'falling' ? 1 : 0)      : null,
    takerBuyRatio !== null ? (takerBuyRatio < 48 ? 1 : 0)        : null,
  ]

  return {
    longScore:  longScores.filter(v => v === 1).length,
    shortScore: shortScores.filter(v => v === 1).length,
    available:  longScores.filter(v => v !== null).length,
    longScores, shortScores,
  }
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchBacktestData() {
  const [priceRes, fgRes, fundingRes, oiRes, takerRes, klRes, signalsRes] = await Promise.all([
    // CoinGecko: for price DISPLAY on chart only (not for scoring)
    fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=101&interval=daily'),
    fetch('https://api.alternative.me/fng/?limit=101&format=json'),
    fetch('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=300'),
    fetch('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=103'),
    fetch('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1d&limit=103'),
    // Bybit daily kline: [time, open, high, low, close, vol, turnover] — for price change %
    fetch('https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=D&limit=103'),
    fetch('/api/signals?history=true').catch(() => null),
  ])

  const [priceData, fgData, fundingData, oiData, takerData, klData] = await Promise.all([
    priceRes.json(), fgRes.json(), fundingRes.json(), oiRes.json(),
    takerRes.json(), klRes.json(),
  ])

  const signalsData = signalsRes ? await signalsRes.json().catch(() => null) : null

  // CoinGecko prices → used ONLY for the chart price line
  // Deduplicate by date (take last if two same date)
  const cgPriceMap = {}
  for (const [ts, price] of priceData.prices) {
    const d = new Date(ts).toISOString().slice(0, 10)
    cgPriceMap[d] = price
  }

  // F&G map
  const fgMap = {}
  for (const item of fgData.data) {
    fgMap[new Date(parseInt(item.timestamp) * 1000).toISOString().slice(0, 10)] = parseInt(item.value)
  }

  // Funding map: date → FIRST funding rate of that day (most conservative)
  const fundingMap = {}
  for (const item of (fundingData.result?.list ?? [])) {
    const date = new Date(parseInt(item.fundingRateTimestamp)).toISOString().slice(0, 10)
    if (!fundingMap[date]) fundingMap[date] = parseFloat(item.fundingRate)
  }

  // OI map: date → openInterest
  const oiMap = {}
  for (const item of (oiData.result?.list ?? [])) {
    oiMap[new Date(parseInt(item.timestamp)).toISOString().slice(0, 10)] = parseFloat(item.openInterest)
  }

  // Taker map: date → buyRatio (0–100)
  const takerMap = {}
  for (const item of (takerData.result?.list ?? [])) {
    takerMap[new Date(parseInt(item.timestamp)).toISOString().slice(0, 10)] = parseFloat(item.buyRatio) * 100
  }

  // Kline map: date → { open, close, changePct }
  // changePct = (close - open) / open * 100 — matches live checklist's price24hPcnt concept
  const klMap = {}
  for (const k of (klData.result?.list ?? [])) {
    const date  = new Date(parseInt(k[0])).toISOString().slice(0, 10)
    const open  = parseFloat(k[1])
    const close = parseFloat(k[4])
    klMap[date] = { open, close, changePct: ((close - open) / open) * 100 }
  }

  // Merge TPI transitions
  let tpiTransitions = [...TPI_TRANSITIONS_HISTORICAL]
  if (signalsData?.transitions) {
    const live = Array.isArray(signalsData.transitions)
      ? signalsData.transitions : Object.values(signalsData.transitions)
    const merged = Object.fromEntries(tpiTransitions.map(t => [t.date, t]))
    for (const t of live) { if (t.date && t.state) merged[t.date] = { date: t.date, state: t.state } }
    tpiTransitions = Object.values(merged).sort((a, b) => a.date.localeCompare(b.date))
  }

  // Stored daily checklist scores from Redis (ground truth at UTC close)
  const storedScores = {}
  const cdArray = Array.isArray(signalsData?.checklistDaily)
    ? signalsData.checklistDaily
    : Object.values(signalsData?.checklistDaily ?? {})
  for (const e of cdArray) { if (e.date) storedScores[e.date] = e }

  return { cgPriceMap, fgMap, fundingMap, oiMap, takerMap, klMap, tpiTransitions, storedScores }
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const LBL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

// ── Chart ─────────────────────────────────────────────────────────────────────
function drawChart(canvas, days, hoveredIdx) {
  if (!canvas || !days.length) return
  const dpr = window.devicePixelRatio || 1
  const W = canvas.offsetWidth, H = canvas.offsetHeight
  canvas.width = W * dpr; canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const PAD = { top: 16, right: 52, bottom: 32, left: 12 }
  const cW  = W - PAD.left - PAD.right
  const cH  = H - PAD.top - PAD.bottom
  const priceH = Math.floor(cH * 0.55)
  const histH  = cH - priceH - 10
  const histY0 = PAD.top + priceH + 10
  const zeroY  = histY0 + histH / 2

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#f9fafb'; ctx.fillRect(PAD.left, PAD.top, cW, priceH)
  ctx.fillStyle = '#f9fafb'; ctx.fillRect(PAD.left, histY0, cW, histH)

  const n = days.length, step = cW / n, barW = Math.max(2, step - 1)
  const prices = days.map(d => d.price).filter(Boolean)
  const minP = Math.min(...prices) * 0.994, maxP = Math.max(...prices) * 1.006
  const pY = p => PAD.top + priceH - ((p - minP) / (maxP - minP)) * priceH

  // TPI shading
  let tpiStart = null, tpiState = null
  const shadeTpi = (endX, state) => {
    if (tpiStart === null) return
    ctx.fillStyle = state === 'LONG' ? 'rgba(16,185,129,.07)' : 'rgba(239,68,68,.07)'
    ctx.fillRect(tpiStart, PAD.top, endX - tpiStart, priceH + histH + 10)
  }
  days.forEach((d, i) => {
    const x = PAD.left + i * step
    if (d.tpiState !== tpiState) { shadeTpi(x, tpiState); tpiStart = x; tpiState = d.tpiState }
    if (i === n - 1) shadeTpi(x + step, tpiState)
  })

  // Price grid
  ctx.font = '9px -apple-system,sans-serif'
  for (let i = 0; i <= 4; i++) {
    const val = minP + ((maxP - minP) / 4) * i
    const y   = pY(val)
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke()
    ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'left'
    ctx.fillText(`$${Math.round(val / 1000)}k`, W - PAD.right + 4, y + 3)
  }

  // Price line
  ctx.beginPath(); ctx.strokeStyle = '#f7931a'; ctx.lineWidth = 1.5
  days.forEach((d, i) => {
    if (!d.price) return
    const x = PAD.left + i * step + step / 2, y = pY(d.price)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()

  // Histogram zero line
  ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD.left, zeroY); ctx.lineTo(PAD.left + cW, zeroY); ctx.stroke()

  // Score labels
  ctx.fillStyle = '#9ca3af'; ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'left'
  ctx.fillText('+6', W - PAD.right + 4, histY0 + 8)
  ctx.fillText(' 0', W - PAD.right + 4, zeroY + 3)
  ctx.fillText('−6', W - PAD.right + 4, histY0 + histH - 2)

  const bScale = (histH / 2) / 6
  days.forEach((d, i) => {
    const x = PAD.left + i * step
    ctx.globalAlpha = i === hoveredIdx ? 1 : 0.8
    if (d.longScore  > 0) { ctx.fillStyle = '#10b981'; ctx.fillRect(x + 0.5, zeroY - d.longScore  * bScale, barW, d.longScore  * bScale) }
    if (d.shortScore > 0) { ctx.fillStyle = '#ef4444'; ctx.fillRect(x + 0.5, zeroY, barW, d.shortScore * bScale) }
    if (!d.longScore && !d.shortScore) { ctx.fillStyle = '#e5e7eb'; ctx.fillRect(x + 0.5, zeroY - 1, barW, 2) }
    ctx.globalAlpha = 1
  })

  // X labels
  ctx.fillStyle = '#9ca3af'; ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'center'
  const every = Math.ceil(n / 10)
  days.forEach((d, i) => {
    if (i % every === 0 || i === n - 1)
      ctx.fillText(d.date.slice(5), PAD.left + i * step + step / 2, H - PAD.bottom + 13)
  })

  // Hover crosshair
  if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < n) {
    const x = PAD.left + hoveredIdx * step + step / 2
    ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke()
    ctx.setLineDash([])
    if (days[hoveredIdx].price) {
      ctx.beginPath(); ctx.arc(x, pY(days[hoveredIdx].price), 3.5, 0, Math.PI * 2)
      ctx.fillStyle = '#f7931a'; ctx.fill()
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ChecklistBacktest() {
  const canvasRef = useRef(null)
  const [days,    setDays]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [hovered, setHovered] = useState(null)
  const [stats,   setStats]   = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const { cgPriceMap, fgMap, fundingMap, oiMap, takerMap, klMap, tpiTransitions, storedScores } =
          await fetchBacktestData()

        // Build sorted date list from kline (most reliable daily date source)
        // kline returns newest first, reverse for oldest→newest
        const klDates = Object.keys(klMap).sort()

        // Take last 100 dates we have price data for
        const allDates = klDates.filter(d => cgPriceMap[d] || klMap[d])
        const dates    = allDates.slice(-100)

        const computed = []

        for (let i = 0; i < dates.length; i++) {
          const date    = dates[i]
          const prevDate = dates[i - 1] ?? null

          // ── Price for display
          const price = cgPriceMap[date] ?? klMap[date]?.close ?? null

          // ── Use stored UTC-close score if available (ground truth)
          const stored = storedScores[date]
          if (stored && stored.longScore !== undefined && stored.shortScore !== undefined) {
            computed.push({
              date,
              price: Math.round(price ?? stored.price ?? 0),
              longScore:  stored.longScore,
              shortScore: stored.shortScore,
              fg:         stored.fg    ?? fgMap[date] ?? null,
              frPct:      stored.frPct ?? null,
              tpiState:   stored.tpiState ?? interpolateTpi(tpiTransitions, date),
              takerBuyRatio: null,  // not in stored
              source:     'stored',
              available:  stored.tpiAvail ? 6 : 5,  // approximate
            })
            continue
          }

          // ── No stored score — compute from raw data
          const fg   = fgMap[date]    ?? null
          const fr   = fundingMap[date] ?? null
          const frPct = fr !== null ? fr * 100 : null
          const tpiState = interpolateTpi(tpiTransitions, date)

          const oiCurr = oiMap[date]    ?? null
          const oiPrev = prevDate ? (oiMap[prevDate] ?? null) : null

          const takerBuyRatio = takerMap[date] ?? null

          // Price change: use Bybit kline open→close (same-day, avoids CoinGecko dedup issue)
          const kl = klMap[date]
          const priceChangePct = kl ? kl.changePct : null

          // Dominance: not available historically without CoinGecko paid API
          const domTrend = null

          const { longScore, shortScore, available } = scoreDay({
            frPct, fg, tpiState, oiPrev, oiCurr, priceChangePct, takerBuyRatio, domTrend,
          })

          computed.push({
            date, price: Math.round(price ?? kl?.close ?? 0),
            longScore, shortScore, available,
            fg, frPct, tpiState, takerBuyRatio,
            priceChangePct: priceChangePct ? parseFloat(priceChangePct.toFixed(2)) : null,
            source: 'computed',
          })
        }

        setDays(computed)

        // Win-rate stats
        const withScore = computed.filter(d => d.longScore + d.shortScore > 0)
        const longSig   = computed.filter(d => d.longScore  >= 4)
        const shortSig  = computed.filter(d => d.shortScore >= 4)
        const longWins  = longSig.filter(d => {
          const ni = computed.indexOf(d) + 1
          return ni < computed.length && (computed[ni].priceChangePct ?? 0) > 0
        })
        const shortWins = shortSig.filter(d => {
          const ni = computed.indexOf(d) + 1
          return ni < computed.length && (computed[ni].priceChangePct ?? 0) < 0
        })

        const storedCount = computed.filter(d => d.source === 'stored').length
        setStats({
          total: computed.length, storedCount,
          longSignals:  longSig.length,
          shortSignals: shortSig.length,
          longWinRate:  longSig.length  ? Math.round(longWins.length  / longSig.length  * 100) : null,
          shortWinRate: shortSig.length ? Math.round(shortWins.length / shortSig.length * 100) : null,
        })
        setError(null)
      } catch(e) { setError(e.message) }
      finally { setLoading(false) }
    })()
  }, [])

  useEffect(() => {
    if (!days.length || !canvasRef.current) return
    drawChart(canvasRef.current, days, hovered)
    const onResize = () => drawChart(canvasRef.current, days, hovered)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [days, hovered])

  const hoveredDay = hovered !== null ? days[hovered] : null
  const displayDay = hoveredDay ?? days[days.length - 1]
  const bias = displayDay
    ? displayDay.longScore > displayDay.shortScore  ? { text: `LONG ${displayDay.longScore}/6`,  color: '#10b981' }
    : displayDay.shortScore > displayDay.longScore  ? { text: `SHORT ${displayDay.shortScore}/6`, color: '#ef4444' }
    : { text: 'NEUTRAL', color: '#f59e0b' }
    : null

  const handleMouseMove = e => {
    const canvas = canvasRef.current
    if (!canvas || !days.length) return
    const rect = canvas.getBoundingClientRect()
    const step = (canvas.offsetWidth - 12 - 52) / days.length
    const idx  = Math.floor((e.clientX - rect.left - 12) / step)
    setHovered(idx >= 0 && idx < days.length ? idx : null)
  }

  return (
    <div>
      {/* Subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>
          Same 6 conditions as live checklist · UTC close scores from Redis where available · Bybit kline for historical
        </div>
        {stats && (
          <span style={{ fontSize: 10, color: '#9ca3af' }}>
            {stats.storedCount} days from Redis · {stats.total - stats.storedCount} computed
          </span>
        )}
      </div>

      {/* Win-rate stat cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { label: 'Long signals (≥4/6)',  value: stats.longSignals,  color: '#10b981', bg: 'rgba(16,185,129,.08)', border: 'rgba(16,185,129,.2)' },
            { label: 'Long next-day hit%',   value: stats.longWinRate  !== null ? stats.longWinRate  + '%' : '—', color: '#10b981', bg: 'rgba(16,185,129,.08)', border: 'rgba(16,185,129,.2)' },
            { label: 'Short signals (≥4/6)', value: stats.shortSignals, color: '#ef4444', bg: 'rgba(239,68,68,.08)',  border: 'rgba(239,68,68,.2)'  },
            { label: 'Short next-day hit%',  value: stats.shortWinRate !== null ? stats.shortWinRate + '%' : '—', color: '#ef4444', bg: 'rgba(239,68,68,.08)',  border: 'rgba(239,68,68,.2)'  },
          ].map(s => (
            <div key={s.label} style={{ padding: '10px 14px', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}` }}>
              <div style={{ ...LBL, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div style={{ ...LBL, color: '#d1d5db', padding: '3rem 0', textAlign: 'center' }}>Loading 100 days…</div>}
      {error   && <div style={{ fontSize: 12, color: '#dc2626' }}>Error: {error}</div>}

      {!loading && !error && days.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)' }}>

          {/* Info bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid #f3f4f6', minHeight: 42, flexWrap: 'wrap' }}>
            {displayDay ? (
              <>
                <span style={{ ...LBL, textTransform: 'none' }}>
                  {displayDay.date}{hoveredDay ? '' : ' (today)'}
                </span>
                {displayDay.price > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f7931a' }}>
                    ${displayDay.price.toLocaleString()}
                  </span>
                )}
                {displayDay.priceChangePct !== null && displayDay.priceChangePct !== undefined && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: displayDay.priceChangePct >= 0 ? '#10b981' : '#ef4444' }}>
                    {displayDay.priceChangePct >= 0 ? '+' : ''}{displayDay.priceChangePct}%
                  </span>
                )}
                {displayDay.fg !== null && <span style={{ fontSize: 11, color: '#6b7280' }}>F&G {displayDay.fg}</span>}
                {displayDay.frPct !== null && (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>FR {displayDay.frPct >= 0 ? '+' : ''}{displayDay.frPct.toFixed(4)}%</span>
                )}
                {displayDay.tpiState && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: displayDay.tpiState === 'LONG' ? '#10b981' : '#ef4444' }}>
                    TPI {displayDay.tpiState}
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#d1d5db' }}>
                  {displayDay.source === 'stored' ? '● Redis' : '● computed'}
                </span>
                {bias && (
                  <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: bias.color }}>
                    {bias.text}
                  </span>
                )}
              </>
            ) : (
              <span style={{ ...LBL, color: '#d1d5db' }}>Hover to inspect any day</span>
            )}
          </div>

          {/* Chart */}
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: 320, display: 'block', cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHovered(null)}
          />

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
            {[
              { color: '#f7931a',             label: 'BTC price' },
              { color: '#10b981',             label: 'Long score' },
              { color: '#ef4444',             label: 'Short score' },
              { color: 'rgba(16,185,129,.2)', label: 'TPI LONG zone' },
              { color: 'rgba(239,68,68,.2)',  label: 'TPI SHORT zone' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: 'inline-block' }} />
                <span style={{ fontSize: 10, color: '#9ca3af' }}>{l.label}</span>
              </div>
            ))}
            <span style={{ fontSize: 10, color: '#d1d5db', marginLeft: 'auto' }}>
              Bars above zero line = long score · below = short score
            </span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
        <span style={{ fontWeight: 600, color: '#6b7280' }}>Today's score</span> is set at UTC close by the cron and matches the live checklist.
        Historical dominance (C5) is only available from when Redis storage started — earlier days show C5 as unavailable.
        <span style={{ fontWeight: 600, color: '#6b7280' }}> Win rate</span> = next-day price direction when signal ≥4/6.
      </div>
    </div>
  )
}
