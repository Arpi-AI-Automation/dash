'use client'
import { useEffect, useState } from 'react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(v) {
  if (!v) return '—'
  return 'US$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function tpiStateLabel(state) {
  if (!state) return '—'
  if (state.includes('MAX LONG'))  return 'TPI Positive · Risk On'
  if (state.includes('LONG'))      return 'TPI Positive · Risk On'
  if (state.includes('MAX SHORT')) return 'TPI Negative · Risk Off'
  if (state.includes('SHORT'))     return 'TPI Negative · Risk Off'
  return state
}

function tpiMeta(signal) {
  if (!signal?.state) return { label: '—', color: '#6b7280', bg: 'rgba(107,114,128,.1)', border: 'rgba(107,114,128,.2)' }
  const s = signal.state
  if (s.includes('MAX LONG'))  return { label: tpiStateLabel(s), color: '#059669', bg: 'rgba(16,185,129,.1)',  border: 'rgba(16,185,129,.25)' }
  if (s.includes('LONG'))      return { label: tpiStateLabel(s), color: '#059669', bg: 'rgba(16,185,129,.1)',  border: 'rgba(16,185,129,.25)' }
  if (s.includes('MAX SHORT')) return { label: tpiStateLabel(s), color: '#dc2626', bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.25)'  }
  if (s.includes('SHORT'))     return { label: tpiStateLabel(s), color: '#dc2626', bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.25)'  }
  return { label: s, color: '#6b7280', bg: 'rgba(107,114,128,.1)', border: 'rgba(107,114,128,.2)' }
}

function fmtTpiDetail(signal) {
  if (!signal) return '—'
  const tpi = signal.tpi ?? null
  const roc = signal.roc ?? null
  const tpiStr = tpi !== null ? `${tpi >= 0 ? '+' : ''}${Number(tpi).toFixed(2)}` : null
  const rocStr = roc !== null
    ? (Math.abs(roc) < 0.05 ? 'steady' : roc > 0 ? `RoC +${Number(roc).toFixed(2)}` : `RoC ${Number(roc).toFixed(2)}`)
    : null
  return [tpiStr, rocStr].filter(Boolean).join(' · ')
}

function normaliseAsset(raw) {
  if (!raw) return null
  const s = raw.toUpperCase().trim()
  const MAP = { BTC:'BTC', ETH:'ETH', SOL:'SOL', SUI:'SUI', XRP:'XRP', BNB:'BNB', PAXG:'GOLD', USD:'USD' }
  if (MAP[s]) return MAP[s]
  const stripped = s.replace(/(USDT|USDC|USD|PERP)$/, '').trim()
  return MAP[stripped] ?? (stripped || null)
}

function fmtS1(signal) {
  if (!signal?.asset) return 'USD'
  const s = signal.asset.toLowerCase()
  if (s.includes('bnb'))  return 'BNB'
  if (s.includes('eth'))  return 'ETH'
  if (s.includes('sol'))  return 'SOL'
  if (s.includes('xrp'))  return 'XRP'
  if (s.includes('paxg')) return 'GOLD'
  if (s.includes('sui'))  return 'SUI'
  return 'USD'
}

function fmtS2(signal) {
  if (!signal) return '—'
  const assetUpper = (signal.asset ?? '').toUpperCase()
  if (assetUpper === 'USD' || assetUpper === '') return 'USD'
  if (signal.alloc) {
    const entries = Object.entries(signal.alloc).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a)
    if (entries.length) return entries.map(([k, v]) => `${normaliseAsset(k)} ${v}%`).join(' + ')
  }
  return normaliseAsset(signal.asset) ?? '—'
}

function viMeta(v) {
  if (v == null) return { color: '#9ca3af', pill: 'N/A' }
  const n = parseFloat(v)
  if (n >= 2)  return { color: '#dc2626', pill: 'OVERBOUGHT' }
  if (n >= 1)  return { color: '#f97316', pill: 'ELEVATED'   }
  if (n > -1)  return { color: '#f59e0b', pill: 'NEUTRAL'    }
  if (n > -2)  return { color: '#10b981', pill: 'GOOD VALUE' }
  return             { color: '#059669', pill: 'DEEP VALUE' }
}

function fgMeta(v) {
  if (v == null) return { color: '#9ca3af', label: 'N/A' }
  if (v <= 25) return { color: '#ef4444', label: 'Extreme Fear'  }
  if (v <= 45) return { color: '#f97316', label: 'Fear'          }
  if (v <= 55) return { color: '#f59e0b', label: 'Neutral'       }
  if (v <= 75) return { color: '#84cc16', label: 'Greed'         }
  return           { color: '#22c55e', label: 'Extreme Greed' }
}

function oiRegimeText(oiRising, priceUp) {
  if (oiRising === null) return '—'
  const oi    = oiRising ? 'OI ↑' : 'OI ↓'
  const price = priceUp  ? 'Price ↑' : 'Price ↓'
  return `${oi}  ${price}`
}

function frText(frPct) {
  if (frPct === null) return 'FR N/A'
  if (frPct <= -0.005) return 'Funding Negative'
  if (frPct <=  0.005) return 'Funding Neutral'
  if (frPct <=  0.050) return 'Funding Positive'
  return 'Funding Overheated'
}

function frColor(frPct) {
  if (frPct === null)   return '#9ca3af'
  if (frPct <= -0.005)  return '#10b981'   // negative = longs getting paid
  if (frPct <=  0.005)  return '#6b7280'   // neutral
  if (frPct <=  0.050)  return '#f59e0b'   // positive
  return '#ef4444'                          // overheated
}

function biasColor(bias) {
  if (bias === 'LONG')  return '#059669'
  if (bias === 'SHORT') return '#dc2626'
  return '#f59e0b'
}

// ── Sub-components ────────────────────────────────────────────────────────────

const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'

// Uniform row: left label (small caps) + right content
function Row({ label, children, last = false, sectionStart = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: sectionStart ? '10px 0 9px' : '9px 0',
      borderBottom: last ? 'none' : '1px solid #f3f4f6',
      gap: 8,
    }}>
      <span style={{
        fontFamily: FONT, fontSize: 11, fontWeight: 600,
        color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em',
        flexShrink: 0,
      }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 1, minWidth: 0, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  )
}

// Consistent pill — single style everywhere
function Pill({ children, color, size = 11 }) {
  return (
    <span style={{
      fontFamily: FONT, fontSize: size, fontWeight: 700,
      padding: '2px 8px', borderRadius: 20, lineHeight: 1.5,
      background: color + '18',
      color,
      border: `1px solid ${color}35`,
      whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

// Primary value (number + optional unit)
function Val({ children, color = '#111827', size = 14 }) {
  return (
    <span style={{ fontFamily: FONT, fontSize: size, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

// Muted secondary text
function Sub({ children }) {
  return (
    <span style={{ fontFamily: FONT, fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

// Section divider with label
function SectionDivider({ label }) {
  return (
    <div style={{ padding: '8px 0 2px', borderBottom: '1px solid #e5e7eb' }}>
      <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DailyBrief() {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [fgToday,    setFgToday]    = useState(null)
  const [fg7d,       setFg7d]       = useState(null)
  const [oiRising,   setOiRising]   = useState(null)
  const [priceUp,    setPriceUp]    = useState(null)
  const [frPct,      setFrPct]      = useState(null)
  const [checklist,  setChecklist]  = useState(null)

  useEffect(() => {
    fetch('/api/signals?history=false')
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false))

    // F&G — 8 days
    fetch('https://api.alternative.me/fng/?limit=8&format=json')
      .then(r => r.json())
      .then(d => {
        const list = d?.data ?? []
        setFgToday(list[0] ? parseInt(list[0].value) : null)
        setFg7d(list[7]    ? parseInt(list[7].value) : null)
      }).catch(() => {})

    // Bybit: OI + ticker + taker, then checklist with all params
    ;(async () => {
      try {
        const [tickerRes, oiRes, takerRes] = await Promise.all([
          fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT'),
          fetch('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=2'),
          fetch('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1d&limit=1'),
        ])
        const [ticker, oi, taker] = await Promise.all([tickerRes.json(), oiRes.json(), takerRes.json()])

        const t    = ticker.result?.list?.[0]
        const fr   = t ? parseFloat(t.fundingRate)  : null
        const p24h = t ? parseFloat(t.price24hPcnt) : null
        if (t) { setFrPct(fr * 100); setPriceUp(p24h > 0) }

        const oiList = oi.result?.list ?? []
        const oiCurr = oiList[0] ? parseFloat(oiList[0].openInterest) : null
        const oiPrev = oiList[1] ? parseFloat(oiList[1].openInterest) : null
        if (oiCurr !== null && oiPrev !== null) setOiRising(oiCurr > oiPrev)

        const takerBuyRatio = taker.result?.list?.[0] ? parseFloat(taker.result.list[0].buyRatio) * 100 : null

        // Use stored daily-close checklist (same source as DecisionChecklist component)
        const cl = await fetch('/api/checklist?stored=true', { cache: 'no-store' }).then(r => r.json())
        if (cl.ok) setChecklist(cl)
      } catch (_) {}
    })()
  }, [])

  if (loading) return (
    <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: '#9ca3af',
      textTransform: 'uppercase', letterSpacing: '0.07em', padding: '1rem 0' }}>
      Loading…
    </div>
  )

  const btc  = data?.btc
  const rot  = data?.rotation
  const s2   = data?.s2
  const vi   = data?.vi
  const vi2  = data?.vi2

  const tpi  = tpiMeta(btc)
  const viM  = viMeta(vi?.value)
  const vi2M = viMeta(vi2?.value)
  const fgM  = fgMeta(fgToday)
  const fgDelta = fgToday !== null && fg7d !== null ? fgToday - fg7d : null

  const clLong  = checklist?.longScore  ?? null
  const clShort = checklist?.shortScore ?? null
  const clCol   = clLong != null && clShort != null
    ? (clLong > clShort ? '#059669' : clShort > clLong ? '#dc2626' : '#f59e0b')
    : '#f59e0b'

  return (
    <div style={{ fontFamily: FONT }}>

      {/* ── Price hero ── */}
      <div style={{ marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
          <svg width="16" height="16" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#f7931a"/>
            <path d="M22.3 13.4c.3-2.1-1.3-3.2-3.5-4l.7-2.8-1.7-.4-.7 2.7-.9-.2.7-2.7-1.7-.4-.7 2.8c-.2-.1-.5-.1-.7-.2v0l-2.3-.6-.4 1.8s1.3.3 1.2.3c.7.2.8.6.8 1l-.9 3.4c.1 0 .1.1.2.1h-.2l-1.2 4.8c-.1.2-.3.6-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.2.6.8.2-.7 2.8 1.7.4.7-2.8.9.2-.7 2.8 1.7.4.7-2.8c2.8.5 4.9.3 5.8-2.2.7-2-.1-3.2-1.5-3.9 1-.3 1.8-1 2-2.4zm-3.6 5c-.5 2-3.9.9-5 .6l.9-3.5c1.1.3 4.7.8 4.1 2.9zm.5-5c-.5 1.8-3.3.9-4.2.7l.8-3.2c.9.2 3.9.7 3.4 2.5z" fill="white"/>
          </svg>
          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Bitcoin · UTC Close
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 30, fontWeight: 800, color: '#111827', lineHeight: 1, letterSpacing: '-0.02em' }}>
            {fmtPrice(btc?.price)}
          </span>
          {btc?.state && (
            <span style={{
              fontFamily: FONT, fontSize: 11, fontWeight: 700,
              padding: '3px 10px', borderRadius: 20,
              background: tpi.bg, color: tpi.color, border: `1px solid ${tpi.border}`,
            }}>
              {tpi.label}
            </span>
          )}
          {btc?.tpi != null && (
            <span style={{ fontSize: 12, fontWeight: 600, color: tpi.color }}>
              {fmtTpiDetail(btc)}
            </span>
          )}
        </div>
      </div>

      {/* ── Signals section ── */}
      <SectionDivider label="Signals" />

      <Row label="RSPS 1">
        <Val>{fmtS1(rot)}</Val>
      </Row>

      <Row label="RSPS 2">
        <Val>{fmtS2(s2)}</Val>
      </Row>

      {/* ── Market Cycle section ── */}
      <SectionDivider label="Market Cycle" />

      <Row label="Short-term Valuation">
        {vi?.value != null && (
          <Val color={viM.color}>{vi.value >= 0 ? '+' : ''}{Number(vi.value).toFixed(3)}</Val>
        )}
        <Pill color={viM.color}>{viM.pill}</Pill>
      </Row>

      <Row label="SDCA Valuation">
        {vi2?.value != null && (
          <Val color={vi2M.color}>{vi2.value >= 0 ? '+' : ''}{Number(vi2.value).toFixed(3)}</Val>
        )}
        <Pill color={vi2M.color}>{vi2M.pill}</Pill>
      </Row>

      <Row label="Fear & Greed">
        {fgToday !== null ? (
          <>
            <Val color={fgM.color}>{fgToday}</Val>
            <Pill color={fgM.color}>{fgM.label}</Pill>
            {fgDelta !== null && (
              <Sub>{fgDelta >= 0 ? '+' : ''}{fgDelta} vs 7D</Sub>
            )}
          </>
        ) : <Sub>Loading…</Sub>}
      </Row>

      {/* ── Market Structure section ── */}
      <SectionDivider label="Market Structure" />

      <Row label="OI × Funding">
        {oiRising !== null ? (
          <>
            <Val size={13}>{oiRegimeText(oiRising, priceUp)}</Val>
            <span style={{ color: '#d1d5db', fontSize: 10 }}>·</span>
            <Val size={12} color={frColor(frPct)}>{frText(frPct)}</Val>
          </>
        ) : <Sub>Loading…</Sub>}
      </Row>

      <Row label="L/S Confluence" last>
        {checklist ? (
          <>
            <Val color={clCol}>{clLong}L · {clShort}S</Val>
            <Pill color={clCol}>
              {clLong > clShort ? 'Long' : clShort > clLong ? 'Short' : 'Neutral'}
            </Pill>
          </>
        ) : <Sub>Loading…</Sub>}
      </Row>

    </div>
  )
}
