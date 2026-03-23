'use client'
import { useEffect, useState } from 'react'

function fmtPrice(v) {
  if (!v) return '—'
  return 'US$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function tpiMeta(signal) {
  if (!signal?.state) return { label: '—', color: '#6b7280', bg: 'rgba(107,114,128,.1)', border: 'rgba(107,114,128,.2)' }
  const s = signal.state
  if (s.includes('MAX LONG'))  return { label: s, color: '#059669', bg: 'rgba(16,185,129,.1)',  border: 'rgba(16,185,129,.2)'  }
  if (s.includes('LONG'))      return { label: s, color: '#059669', bg: 'rgba(16,185,129,.1)',  border: 'rgba(16,185,129,.2)'  }
  if (s.includes('MAX SHORT')) return { label: s, color: '#dc2626', bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.2)'   }
  if (s.includes('SHORT'))     return { label: s, color: '#dc2626', bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.2)'   }
  return { label: s, color: '#6b7280', bg: 'rgba(107,114,128,.1)', border: 'rgba(107,114,128,.2)' }
}

function fmtTpiDetail(signal) {
  if (!signal) return '—'
  const tpi = signal.tpi ?? null
  const roc = signal.roc ?? null
  const state = tpiMeta(signal).label
  const tpiStr = tpi !== null ? ` (${tpi >= 0 ? '+' : ''}${Number(tpi).toFixed(2)})` : ''
  const rocStr = roc !== null
    ? ` / ${Math.abs(roc) < 0.05 ? 'steady' : roc > 0 ? `rising RoC +${Number(roc).toFixed(2)}` : `falling RoC ${Number(roc).toFixed(2)}`}`
    : ''
  return `${state.toLowerCase()}${tpiStr}${rocStr}`
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
  if (assetUpper === 'USD' || assetUpper === '') return 'USD 100%'
  if (signal.alloc) {
    const entries = Object.entries(signal.alloc).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a)
    if (entries.length) return entries.map(([k, v]) => `${v}% ${normaliseAsset(k)}`).join(' + ')
  }
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

function fgZoneMeta(v) {
  if (v == null) return { color: '#6b7280', label: 'N/A' }
  if (v <= 25) return { color: '#ef4444', label: 'Extreme Fear' }
  if (v <= 45) return { color: '#f97316', label: 'Fear' }
  if (v <= 55) return { color: '#f59e0b', label: 'Neutral' }
  if (v <= 75) return { color: '#84cc16', label: 'Greed' }
  return           { color: '#22c55e', label: 'Extreme Greed' }
}

function oiRegimeLabel(oiRising, priceUp) {
  if (oiRising === null) return '—'
  if (oiRising && priceUp)   return 'OI ↑ Price ↑'
  if (oiRising && !priceUp)  return 'OI ↑ Price ↓'
  if (!oiRising && priceUp)  return 'OI ↓ Price ↑'
  return 'OI ↓ Price ↓'
}

function frLabel(frPct) {
  if (frPct === null) return 'FR N/A'
  if (frPct <= -0.005) return 'Funding Negative'
  if (frPct <=  0.005) return 'Funding Neutral'
  if (frPct <=  0.050) return 'Funding Positive'
  return 'Funding Overheated'
}

const PILL = { display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, lineHeight: 1.4 }
const LABEL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
const ROW = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }

export default function DailyBrief() {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  // Extra data for the 3 new rows — fetched client-side
  const [fgToday,    setFgToday]    = useState(null)
  const [fg7d,       setFg7d]       = useState(null)
  const [oiRising,   setOiRising]   = useState(null)
  const [priceUp,    setPriceUp]    = useState(null)
  const [frPct,      setFrPct]      = useState(null)
  const [checklist,  setChecklist]  = useState(null)

  useEffect(() => {
    // Signals (already fetched by DailyBrief)
    fetch('/api/signals?history=false')
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false))

    // F&G — 8 days to get today + 7d ago
    fetch('https://api.alternative.me/fng/?limit=8&format=json')
      .then(r => r.json())
      .then(d => {
        const list = d?.data ?? []
        setFgToday(list[0] ? parseInt(list[0].value) : null)
        setFg7d(list[7]    ? parseInt(list[7].value) : null)
      }).catch(() => {})

    // Bybit: OI delta + funding rate — then pass to /api/checklist (same as DecisionChecklist)
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

        if (t) {
          setFrPct(fr * 100)
          setPriceUp(p24h > 0)
        }

        const oiList = oi.result?.list ?? []
        const oiCurr = oiList[0] ? parseFloat(oiList[0].openInterest) : null
        const oiPrev = oiList[1] ? parseFloat(oiList[1].openInterest) : null
        if (oiCurr !== null && oiPrev !== null) setOiRising(oiCurr > oiPrev)

        const takerBuyRatio = taker.result?.list?.[0] ? parseFloat(taker.result.list[0].buyRatio) * 100 : null

        // Build params — identical to DecisionChecklist
        const params = new URLSearchParams()
        if (fr   !== null) params.set('fundingRate',   fr.toFixed(8))
        if (p24h !== null) params.set('price24hPcnt',  p24h.toFixed(6))
        if (oiCurr !== null) params.set('oiCurr',      oiCurr.toFixed(2))
        if (oiPrev !== null) params.set('oiPrev',       oiPrev.toFixed(2))
        if (takerBuyRatio !== null) params.set('takerBuyRatio', takerBuyRatio.toFixed(4))

        const cl = await fetch(`/api/checklist?${params}`, { cache: 'no-store' }).then(r => r.json())
        if (cl.ok) setChecklist(cl)
      } catch (_) {}
    })()
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

  // F&G display
  const fgMeta  = fgZoneMeta(fgToday)
  const fgDelta = fgToday !== null && fg7d !== null ? fgToday - fg7d : null

  // OI+FR regime
  const regimeStr = oiRegimeLabel(oiRising, priceUp)
  const frStr     = frLabel(frPct)

  // Checklist summary
  const clBias  = checklist?.bias ?? null
  const clLong  = checklist?.longScore ?? null
  const clShort = checklist?.shortScore ?? null
  const clTotal = checklist?.total ?? 6
  const clScore = clLong !== null && clShort !== null
    ? Math.max(clLong, clShort)
    : null
  const clColor = clBias === 'LONG'  ? '#059669'
                : clBias === 'SHORT' ? '#dc2626'
                : '#f59e0b'

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

        {/* System 2 */}
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
        <div style={ROW}>
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

        {/* ── NEW ROW 1: Fear & Greed ── */}
        <div style={ROW}>
          <span style={LABEL}>Fear & Greed</span>
          <div style={{ textAlign: 'right' }}>
            {fgToday !== null ? (
              <>
                <span style={{ fontSize: 14, fontWeight: 800, color: fgMeta.color, marginRight: 6 }}>
                  {fgToday}
                </span>
                <span style={{ ...PILL, background: fgMeta.color + '18', color: fgMeta.color, border: `1px solid ${fgMeta.color}40`, fontSize: 10 }}>
                  {fgMeta.label}
                </span>
                {fgDelta !== null && (
                  <span style={{ fontSize: 11, color: fgDelta >= 0 ? '#059669' : '#dc2626', marginLeft: 8, fontWeight: 600 }}>
                    {fgDelta >= 0 ? '+' : ''}{fgDelta} vs 7D ago
                  </span>
                )}
              </>
            ) : (
              <span style={{ ...LABEL, color: '#d1d5db', textTransform: 'none' }}>Loading…</span>
            )}
          </div>
        </div>

        {/* ── NEW ROW 2: OI × Funding Regime ── */}
        <div style={ROW}>
          <span style={LABEL}>OI × Funding Regime</span>
          <div style={{ textAlign: 'right' }}>
            {oiRising !== null ? (
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                {regimeStr}
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginLeft: 8 }}>·</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: frPct !== null && frPct > 0.05 ? '#ef4444' : frPct !== null && frPct < -0.005 ? '#10b981' : '#6b7280', marginLeft: 6 }}>
                  {frStr}
                </span>
              </span>
            ) : (
              <span style={{ ...LABEL, color: '#d1d5db', textTransform: 'none' }}>Loading…</span>
            )}
          </div>
        </div>

        {/* ── NEW ROW 3: Leverage Checklist ── */}
        <div style={{ ...ROW, borderBottom: 'none', paddingBottom: 0 }}>
          <span style={LABEL}>Leverage Checklist</span>
          <div style={{ textAlign: 'right' }}>
            {checklist ? (
              <>
                <span style={{ fontSize: 13, fontWeight: 700, color: clColor, marginRight: 6 }}>
                  {clBias ?? 'NEUTRAL'}
                </span>
                <span style={{ ...PILL, background: clColor + '18', color: clColor, border: `1px solid ${clColor}40`, fontSize: 10 }}>
                  {clScore ?? '—'}/{clTotal} conditions
                </span>
              </>
            ) : (
              <span style={{ ...LABEL, color: '#d1d5db', textTransform: 'none' }}>Loading…</span>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
