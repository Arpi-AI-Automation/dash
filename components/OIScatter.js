'use client'
import { useEffect, useState } from 'react'

// ── Regime logic ──────────────────────────────────────────────────────────────
function getRegime(priceChg, oiChg) {
  if (priceChg >= 0 && oiChg >= 0) return { label: 'LEVERAGE BUILDING', sub: 'OI↑ Price↑ · Bullish momentum, check funding',  color: '#f59e0b', bg: 'rgba(245,158,11,.08)',  border: 'rgba(245,158,11,.25)', icon: '⚡' }
  if (priceChg <  0 && oiChg >= 0) return { label: 'SHORTS PRESSING',   sub: 'OI↑ Price↓ · Bearish pressure, longs at risk',  color: '#ef4444', bg: 'rgba(239,68,68,.08)',   border: 'rgba(239,68,68,.25)',  icon: '🔻' }
  if (priceChg >= 0 && oiChg <  0) return { label: 'SHORT COVERING',    sub: 'OI↓ Price↑ · Spot-driven rally, healthy',       color: '#10b981', bg: 'rgba(16,185,129,.08)',  border: 'rgba(16,185,129,.25)', icon: '🟢' }
  return                                   { label: 'LONG FLUSH',        sub: 'OI↓ Price↓ · Longs capitulating, exhaustion',  color: '#6b7280', bg: 'rgba(107,114,128,.08)', border: 'rgba(107,114,128,.2)', icon: '🔽' }
}

function fundingMeta(fr) {
  if (fr === null || fr === undefined) return { color: '#9ca3af', label: 'No data',   dot: '#9ca3af' }
  if (fr >  0.05) return { color: '#dc2626', label: `+${fr.toFixed(4)}% — longs overheated`, dot: '#ef4444' }
  if (fr >  0.01) return { color: '#f97316', label: `+${fr.toFixed(4)}% — positive`,          dot: '#f97316' }
  if (fr > -0.01) return { color: '#6b7280', label: `${fr.toFixed(4)}% — neutral`,             dot: '#94a3b8' }
  if (fr > -0.05) return { color: '#818cf8', label: `${fr.toFixed(4)}% — negative`,            dot: '#818cf8' }
  return                 { color: '#10b981', label: `${fr.toFixed(4)}% — shorts overheated`,   dot: '#22c55e' }
}

// ── Fetch client-side (Bybit blocks Vercel server IPs) ───────────────────────
async function fetchLast7Days() {
  const [oiRes, klRes, frRes] = await Promise.all([
    fetch('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=10'),
    fetch('https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=D&limit=10'),
    fetch('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=30'),
  ])
  const [oiData, klData, frData] = await Promise.all([oiRes.json(), klRes.json(), frRes.json()])

  const oiList = oiData?.result?.list ?? []
  const klList = klData?.result?.list ?? []
  const frList = frData?.result?.list ?? []

  const oiMap = {}
  for (const item of oiList) {
    const d = new Date(parseInt(item.timestamp)).toISOString().slice(0, 10)
    oiMap[d] = parseFloat(item.openInterest)
  }

  const priceMap = {}
  for (const k of klList) {
    const d = new Date(parseInt(k[0])).toISOString().slice(0, 10)
    priceMap[d] = { open: parseFloat(k[1]), close: parseFloat(k[4]) }
  }

  const frByDate = {}
  for (const f of frList) {
    const d = new Date(parseInt(f.fundingRateTimestamp)).toISOString().slice(0, 10)
    if (!frByDate[d]) frByDate[d] = []
    frByDate[d].push(parseFloat(f.fundingRate) * 100)
  }

  const dates = Object.keys(oiMap).filter(d => priceMap[d]).sort().slice(-8)
  const points = []
  for (let i = 1; i < dates.length; i++) {
    const d = dates[i], prev = dates[i - 1]
    const oiNow = oiMap[d], oiPrev = oiMap[prev], price = priceMap[d]
    if (!oiNow || !oiPrev || !price) continue
    const oiChg    = ((oiNow - oiPrev) / oiPrev) * 100
    const priceChg = ((price.close - price.open) / price.open) * 100
    const frs      = frByDate[d] ?? []
    const avgFr    = frs.length ? frs.reduce((a, b) => a + b, 0) / frs.length : null
    points.push({
      date:      d,
      priceChg:  parseFloat(priceChg.toFixed(2)),
      oiChg:     parseFloat(oiChg.toFixed(2)),
      price:     parseFloat(price.close.toFixed(0)),
      fr:        avgFr !== null ? parseFloat(avgFr.toFixed(4)) : null,
    })
  }
  return points.slice(-7)
}

const LBL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

function fmtDay(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function Arrow({ priceChg, oiChg }) {
  // Arrow direction encodes the quadrant
  const up    = priceChg >= 0
  const oiUp  = oiChg >= 0
  // Use SVG arrow — diagonal showing both price and OI direction
  const color = up ? '#10b981' : '#ef4444'
  // Right = price up, left = price down; Up = OI up, Down = OI down
  const rotate = up && oiUp ? -45 : !up && oiUp ? 225 : up && !oiUp ? 45 : 135
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
      <g transform={`rotate(${rotate}, 10, 10)`}>
        <line x1="10" y1="16" x2="10" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
        <polyline points="6,8 10,4 14,8" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </g>
    </svg>
  )
}

export default function OIScatter() {
  const [points,  setPoints]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    fetchLast7Days()
      .then(pts => { setPoints(pts); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div style={{ ...LBL, color: '#d1d5db', padding: '1rem 0' }}>Loading…</div>
  if (error)   return <div style={{ fontSize: 12, color: '#dc2626' }}>Error: {error}</div>
  if (!points.length) return <div style={{ ...LBL, color: '#d1d5db' }}>No data</div>

  return (
    <div>
      {/* ── Subtitle ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ ...LBL }}>Daily % change · Bybit BTCUSDT Perp · last 7 days</span>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[['#ef4444','FR > +0.05%'],['#f97316','FR positive'],['#94a3b8','Neutral'],['#818cf8','FR negative'],['#22c55e','FR < −0.05%']].map(([c, l]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9ca3af' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block' }} />
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[...points].reverse().map((p, i) => {
          const isToday   = i === 0
          const regime    = getRegime(p.priceChg, p.oiChg)
          const fr        = fundingMeta(p.fr)

          return (
            <div
              key={p.date}
              style={{
                display: 'grid',
                gridTemplateColumns: isToday ? '100px 1fr auto' : '100px 1fr auto',
                alignItems: 'center',
                gap: 12,
                padding: isToday ? '14px 16px' : '9px 14px',
                borderRadius: 10,
                border: isToday ? `1.5px solid ${regime.border}` : '1px solid #f3f4f6',
                background: isToday ? regime.bg : '#fafafa',
                transition: 'all .15s',
              }}
            >
              {/* Date + arrow */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Arrow priceChg={p.priceChg} oiChg={p.oiChg} />
                <div>
                  <div style={{ fontSize: isToday ? 12 : 11, fontWeight: isToday ? 700 : 500, color: isToday ? '#111827' : '#6b7280' }}>
                    {fmtDay(p.date)}
                  </div>
                  {isToday && <div style={{ fontSize: 10, fontWeight: 700, color: regime.color, letterSpacing: '0.04em' }}>TODAY</div>}
                </div>
              </div>

              {/* Regime + metrics */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: isToday ? 12 : 11, fontWeight: 700,
                  color: regime.color,
                  background: regime.bg, border: `1px solid ${regime.border}`,
                  borderRadius: 20, padding: isToday ? '3px 10px' : '2px 8px',
                  whiteSpace: 'nowrap',
                }}>
                  {regime.icon} {regime.label}
                </span>
                {isToday && (
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{regime.sub}</span>
                )}
              </div>

              {/* Numbers */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                {/* Price change */}
                <div style={{ textAlign: 'right', minWidth: 56 }}>
                  <div style={{ ...LBL, marginBottom: 1 }}>Price</div>
                  <div style={{ fontSize: isToday ? 14 : 12, fontWeight: 700, color: p.priceChg >= 0 ? '#10b981' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                    {p.priceChg >= 0 ? '+' : ''}{p.priceChg}%
                  </div>
                </div>

                {/* OI change */}
                <div style={{ textAlign: 'right', minWidth: 52 }}>
                  <div style={{ ...LBL, marginBottom: 1 }}>OI</div>
                  <div style={{ fontSize: isToday ? 14 : 12, fontWeight: 700, color: p.oiChg >= 0 ? '#f59e0b' : '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                    {p.oiChg >= 0 ? '+' : ''}{p.oiChg}%
                  </div>
                </div>

                {/* Funding dot + value */}
                <div style={{ textAlign: 'right', minWidth: 68 }}>
                  <div style={{ ...LBL, marginBottom: 1 }}>Funding</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: fr.dot, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: isToday ? 13 : 11, fontWeight: 700, color: fr.color, fontVariantNumeric: 'tabular-nums' }}>
                      {p.fr !== null ? (p.fr >= 0 ? '+' : '') + p.fr.toFixed(4) + '%' : '—'}
                    </span>
                  </div>
                </div>

                {/* BTC close */}
                <div style={{ textAlign: 'right', minWidth: 72 }}>
                  <div style={{ ...LBL, marginBottom: 1 }}>BTC close</div>
                  <div style={{ fontSize: isToday ? 13 : 11, fontWeight: isToday ? 700 : 500, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                    ${p.price.toLocaleString('en-US')}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Quadrant legend ───────────────────────────────────────────────── */}
      <div style={{ marginTop: 14, padding: '10px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 24px' }}>
        {[
          { color: '#f59e0b', icon: '⚡', label: 'LEVERAGE BUILDING', sub: 'OI↑ Price↑ — bullish momentum, watch funding' },
          { color: '#ef4444', icon: '🔻', label: 'SHORTS PRESSING',   sub: 'OI↑ Price↓ — bearish pressure, longs at risk' },
          { color: '#10b981', icon: '🟢', label: 'SHORT COVERING',    sub: 'OI↓ Price↑ — spot rally, healthy unwind' },
          { color: '#6b7280', icon: '🔽', label: 'LONG FLUSH',        sub: 'OI↓ Price↓ — capitulation, exhaustion likely' },
        ].map(q => (
          <div key={q.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ fontSize: 12, lineHeight: 1.4 }}>{q.icon}</span>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: q.color }}>{q.label} </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>— {q.sub.split('—')[1]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
