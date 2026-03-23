'use client'
import { useEffect, useState } from 'react'

function fmtPrice(v) {
  if (!v) return '—'
  return 'US$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function tpiMeta(signal) {
  if (!signal?.state) return { label: '—', color: '#6b7280', bg: 'rgba(107,114,128,.1)', border: 'rgba(107,114,128,.2)' }
  const s = signal.state
  if (s.includes('MAX LONG'))  return { label: s, color: '#059669', bg: 'rgba(16,185,129,.1)', border: 'rgba(16,185,129,.2)' }
  if (s.includes('LONG'))      return { label: s, color: '#059669', bg: 'rgba(16,185,129,.1)', border: 'rgba(16,185,129,.2)' }
  if (s.includes('MAX SHORT')) return { label: s, color: '#dc2626', bg: 'rgba(239,68,68,.1)',  border: 'rgba(239,68,68,.2)'  }
  if (s.includes('SHORT'))     return { label: s, color: '#dc2626', bg: 'rgba(239,68,68,.1)',  border: 'rgba(239,68,68,.2)'  }
  return { label: s, color: '#6b7280', bg: 'rgba(107,114,128,.1)', border: 'rgba(107,114,128,.2)' }
}

function fmtTpiDetail(signal) {
  if (!signal) return '—'
  const tpi   = signal.tpi ?? null
  const roc   = signal.roc ?? null
  const state = tpiMeta(signal).label
  const tpiStr = tpi !== null ? ` (${tpi >= 0 ? '+' : ''}${Number(tpi).toFixed(2)})` : ''
  const rocStr = roc !== null
    ? ` / ${Math.abs(roc) < 0.05 ? 'steady' : roc > 0 ? `rising RoC +${Number(roc).toFixed(2)}` : `falling RoC ${Number(roc).toFixed(2)}`}`
    : ''
  return `${state.toLowerCase()}${tpiStr}${rocStr}`
}

// Normalise a TV asset ticker to a clean display label
// Handles: ETHUSD → ETH, BTCUSDT → BTC, PAXG → GOLD, USD → USD (not stripped)
function normaliseAsset(raw) {
  if (!raw) return null
  const s = raw.toUpperCase().trim()
  // Explicit map first — catches plain 'USD' before the regex strips it
  const MAP = {
    BTC: 'BTC', ETH: 'ETH', SOL: 'SOL', SUI: 'SUI',
    XRP: 'XRP', BNB: 'BNB', PAXG: 'GOLD', USD: 'USD',
  }
  if (MAP[s]) return MAP[s]
  // Strip quote currency suffix from composite tickers (e.g. ETHUSD → ETH)
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

// Format S2 signal — handles cash (all-zero alloc), active alloc, and plain asset
function fmtS2(signal) {
  if (!signal) return '—'

  // Cash / USD: asset is USD regardless of alloc values
  const assetUpper = (signal.asset ?? '').toUpperCase()
  if (assetUpper === 'USD' || assetUpper === '') {
    return 'USD 100%'
  }

  // Active allocation: show percentages
  if (signal.alloc) {
    const entries = Object.entries(signal.alloc)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
    if (entries.length) {
      return entries.map(([k, v]) => `${v}% ${normaliseAsset(k)}`).join(' + ')
    }
  }

  // Fallback: just show the normalised asset name
  return normaliseAsset(signal.asset) ?? '—'
}

function viMeta(v) {
  if (v == null) return { color: '#6b7280', bg: 'rgba(107,114,128,.08)', border: 'rgba(107,114,128,.2)', pill: 'N/A' }
  const n = parseFloat(v)
  if (n >= 2)  return { color: '#dc2626', bg: 'rgba(239,68,68,.08)',   border: 'rgba(239,68,68,.2)',   pill: 'OVERBOUGHT' }
  if (n >= 1)  return { color: '#f97316', bg: 'rgba(249,115,22,.08)',  border: 'rgba(249,115,22,.2)',  pill: 'ELEVATED'   }
  if (n > -1)  return { color: '#f59e0b', bg: 'rgba(245,158,11,.08)',  border: 'rgba(245,158,11,.2)',  pill: 'NEUTRAL'    }
  if (n > -2)  return { color: '#10b981', bg: 'rgba(16,185,129,.08)',  border: 'rgba(16,185,129,.2)',  pill: 'GOOD VALUE' }
  return             { color: '#059669', bg: 'rgba(16,185,129,.1)',   border: 'rgba(16,185,129,.3)',  pill: 'DEEP VALUE' }
}

const PILL = {
  display: 'inline-block', padding: '2px 9px', borderRadius: 20,
  fontSize: 11, fontWeight: 700, lineHeight: 1.4,
}
const LABEL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
const ROW = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '8px 0', borderBottom: '1px solid #f3f4f6',
}

export default function DailyBrief() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/signals?history=false')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ padding: '1.25rem' }}>
      <div style={{ ...LABEL, color: '#d1d5db' }}>Loading...</div>
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

  return (
    <div>
      {/* Price hero */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ ...LABEL, marginBottom: 4 }}>UTC close update</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: '#111827', lineHeight: 1 }}>
            {fmtPrice(btc?.price)}
          </span>
          {btc?.state && (
            <span style={{ ...PILL, background: tpi.bg, color: tpi.color, border: `1px solid ${tpi.border}` }}>
              TPI {tpi.label}
            </span>
          )}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #f3f4f6' }}>

        {/* MTPI */}
        <div style={ROW}>
          <span style={LABEL}>MTPI</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: tpi.color, textAlign: 'right', maxWidth: '65%' }}>
            {fmtTpiDetail(btc)}
          </span>
        </div>

        {/* System 1 */}
        <div style={ROW}>
          <span style={LABEL}>ROTATOOOR System 1</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{fmtS1(rot)}</span>
        </div>

        {/* System 2 — now correctly shows USD 100% for cash signal */}
        <div style={ROW}>
          <span style={LABEL}>ROTATOOOR System 2</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', textAlign: 'right', maxWidth: '55%' }}>
            {fmtS2(s2)}
          </span>
        </div>

        {/* Market Cycle header */}
        <div style={{ padding: '10px 0 6px', borderBottom: '1px solid #f3f4f6' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Market Cycle
          </span>
        </div>

        {/* Short-term VI */}
        <div style={ROW}>
          <span style={LABEL}>Short-term valuation</span>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: viM.color, marginRight: 6 }}>
              {vi?.value != null ? (vi.value >= 0 ? '+' : '') + Number(vi.value).toFixed(3) : '—'}
            </span>
            <span style={{ ...PILL, background: viM.bg, color: viM.color, border: `1px solid ${viM.border}`, fontSize: 10 }}>
              {viM.pill}
            </span>
          </div>
        </div>

        {/* Full-cycle VI */}
        <div style={{ ...ROW, borderBottom: 'none', paddingBottom: 0 }}>
          <span style={LABEL}>Full-cycle valuation</span>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: vi2M.color, marginRight: 6 }}>
              {vi2?.value != null ? (vi2.value >= 0 ? '+' : '') + Number(vi2.value).toFixed(3) : '—'}
            </span>
            <span style={{ ...PILL, background: vi2M.bg, color: vi2M.color, border: `1px solid ${vi2M.border}`, fontSize: 10 }}>
              {vi2M.pill}
            </span>
          </div>
        </div>

      </div>
    </div>
  )
}
