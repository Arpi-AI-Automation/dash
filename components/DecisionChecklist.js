'use client'
import { useEffect, useState, useCallback } from 'react'

// ALL Bybit endpoints are Vercel IP blocked — fetched client-side
async function fetchBybit() {
  const [tickerRes, oiRes, takerRes] = await Promise.allSettled([
    fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT'),
    fetch('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=2'),
    fetch('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1d&limit=1'),
  ])
  let fundingRate = null, oiUsd = null, price24hPcnt = null
  if (tickerRes.status === 'fulfilled') {
    const d = await tickerRes.value.json()
    const t = d.result?.list?.[0]
    if (t) { fundingRate = parseFloat(t.fundingRate); oiUsd = parseFloat(t.openInterestValue); price24hPcnt = parseFloat(t.price24hPcnt) }
  }
  let oiPrev = null, oiCurr = null
  if (oiRes.status === 'fulfilled') {
    const d = await oiRes.value.json()
    const list = d.result?.list ?? []
    if (list.length >= 2) { oiCurr = parseFloat(list[0].openInterest); oiPrev = parseFloat(list[1].openInterest) }
  }
  let takerBuyRatio = null
  if (takerRes.status === 'fulfilled') {
    const d = await takerRes.value.json()
    const row = d.result?.list?.[0]
    if (row) takerBuyRatio = parseFloat(row.buyRatio) * 100
  }
  return { fundingRate, oiUsd, price24hPcnt, oiPrev, oiCurr, takerBuyRatio }
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const LBL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ConditionRow({ label, pass, value, detail, isLast }) {
  const isNull = pass === null || pass === undefined
  const icon  = isNull ? '—' : pass ? '✓' : '✗'
  const iconBg = isNull ? '#f3f4f6'
    : pass ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.08)'
  const iconColor = isNull ? '#9ca3af' : pass ? '#059669' : '#dc2626'
  const rowBg = pass === true ? 'rgba(16,185,129,.03)' : 'transparent'

  return (
    <div style={{
      display: 'flex', gap: 12, padding: '10px 14px',
      borderBottom: isLast ? 'none' : '1px solid #f3f4f6',
      background: rowBg,
    }}>
      {/* Icon badge */}
      <div style={{
        flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
        background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 1,
      }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: iconColor }}>{icon}</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: isNull ? '#9ca3af' : pass ? '#111827' : '#374151',
          }}>{label}</span>
          {value && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
              background: isNull ? '#f3f4f6' : pass ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.08)',
              color: isNull ? '#9ca3af' : pass ? '#059669' : '#dc2626',
              border: `1px solid ${isNull ? '#e5e7eb' : pass ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.2)'}`,
            }}>{value}</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.4 }}>{detail}</div>
      </div>
    </div>
  )
}

function SideCard({ title, accentColor, conditions, score, total }) {
  const ratio = score / total
  const barColor = accentColor
  const scoreColor = ratio >= 0.66 ? accentColor : ratio >= 0.33 ? '#f59e0b' : '#6b7280'

  // Summary text
  const summary = ratio >= 0.83 ? `Strong signal — ${score}/${total} conditions met`
    : ratio >= 0.5 ? `Partial — ${score}/${total} — wait for more confluence`
    : `Weak — ${score}/${total} — insufficient conditions`

  return (
    <div style={{
      background: '#fff', border: '1px solid #d1d5db', borderRadius: 12,
      boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)', overflow: 'hidden',
      borderTop: `3px solid ${accentColor}`,
    }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, display: 'inline-block' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', letterSpacing: '0.04em' }}>{title}</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, color: scoreColor }}>
            {score}<span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>/{total}</span>
          </span>
        </div>
        {/* Score bar */}
        <div style={{ height: 4, background: '#f3f4f6', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{
            width: `${(score / total) * 100}%`, height: '100%', background: barColor,
            borderRadius: 9999, transition: 'width .5s',
          }} />
        </div>
      </div>

      {/* Conditions */}
      <div>
        {conditions.map((c, i) => (
          <ConditionRow key={c.id} {...c} isLast={i === conditions.length - 1} />
        ))}
      </div>

      {/* Summary */}
      <div style={{
        margin: '0 14px 14px', padding: '8px 12px', borderRadius: 8,
        background: ratio >= 0.5 ? accentColor + '0d' : '#f9fafb',
        border: `1px solid ${ratio >= 0.5 ? accentColor + '30' : '#f3f4f6'}`,
        fontSize: 12, fontWeight: 600,
        color: ratio >= 0.5 ? accentColor : '#6b7280',
      }}>
        {ratio >= 0.5 ? '⚡ ' : '● '}{summary}
      </div>
    </div>
  )
}

function VerdictBanner({ verdict, tpiSignal, longScore, shortScore, total }) {
  if (!verdict) return null
  const { label, color, detail } = verdict
  const bgColor = color + '0a'
  const borderColor = color + '35'

  return (
    <div style={{
      background: '#fff', border: `1px solid ${borderColor}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 12, padding: '16px 20px',
      boxShadow: '0 4px 6px -1px rgba(0,0,0,.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...LBL }}>Leverage Verdict</span>
          <span style={{
            fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
            background: bgColor, color, border: `1px solid ${borderColor}`,
          }}>{label}</span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
          background: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb',
        }}>TPI: {tpiSignal}</span>
      </div>

      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, marginBottom: 12 }}>{detail}</div>

      {/* Long/Short score bars */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[['LONG', longScore, '#10b981'], ['SHORT', shortScore, '#ef4444']].map(([lbl, score, clr]) => (
          <div key={lbl}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: clr }}>{lbl}</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{score}/{total}</span>
            </div>
            <div style={{ height: 4, background: '#f3f4f6', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ width: `${(score / total) * 100}%`, height: '100%', background: clr, borderRadius: 9999 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DecisionChecklist() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const { fundingRate, oiUsd, price24hPcnt, oiPrev, oiCurr, takerBuyRatio } = await fetchBybit()
      const params = new URLSearchParams()
      if (fundingRate   !== null) params.set('fundingRate',   fundingRate.toFixed(8))
      if (oiUsd         !== null) params.set('oiUsd',         oiUsd.toFixed(2))
      if (price24hPcnt  !== null) params.set('price24hPcnt',  price24hPcnt.toFixed(6))
      if (oiPrev        !== null) params.set('oiPrev',        oiPrev.toFixed(2))
      if (oiCurr        !== null) params.set('oiCurr',        oiCurr.toFixed(2))
      if (takerBuyRatio !== null) params.set('takerBuyRatio', takerBuyRatio.toFixed(4))
      const res  = await fetch(`/api/checklist?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setData(json)
      setLastUpdated(new Date())
      setError(null)
      // Write today's full score (including Bybit OI/taker) to Redis
      // so the backtest reads the same values we just computed
      try {
        const today = new Date().toISOString().slice(0, 10)
        await fetch('/api/checklist-store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date:           today,
            longScore:      json.longScore,
            shortScore:     json.shortScore,
            fg:             json.meta?.fearGreed        ?? null,
            frPct:          json.meta?.frPct            ?? null,
            tpiState:       json.tpiSignal              ?? null,
            oiRising:       oiCurr !== null && oiPrev !== null ? oiCurr > oiPrev : null,
            takerBuyRatio:  takerBuyRatio,
            domTrend:       json.meta?.dominanceTrend   ?? null,
            priceChangePct: price24hPcnt !== null ? price24hPcnt * 100 : null,
            price:          null,
          }),
        })
      } catch (_) {}
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [fetchData])

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {data && (
            <span style={{
              fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
              background: data.bias === 'LONG' ? 'rgba(16,185,129,.1)' : data.bias === 'SHORT' ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)',
              color: data.bias === 'LONG' ? '#059669' : data.bias === 'SHORT' ? '#dc2626' : '#f59e0b',
              border: `1px solid ${data.bias === 'LONG' ? 'rgba(16,185,129,.3)' : data.bias === 'SHORT' ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.3)'}`,
            }}>
              {data.bias} · {data.longScore > data.shortScore ? data.longScore : data.shortScore}/{data.total} conditions
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              Updated {lastUpdated.toLocaleTimeString('en-US', { hour12: false })} · refreshes every 5 min
            </span>
          )}
          <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>⚠ Not financial advice</span>
        </div>
      </div>

      {loading && <div style={{ ...LBL, color: '#d1d5db', padding: '2rem 0', textAlign: 'center' }}>Calculating…</div>}
      {error   && <div style={{ fontSize: 12, color: '#dc2626', padding: '8px 0' }}>Error: {error}</div>}

      {!loading && !error && data && (
        <>
          {/* Two-column conditions — uses full width */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <SideCard
              title="Long Conditions"
              accentColor="#10b981"
              conditions={data.longConditions}
              score={data.longScore}
              total={data.total}
            />
            <SideCard
              title="Short Conditions"
              accentColor="#ef4444"
              conditions={data.shortConditions}
              score={data.shortScore}
              total={data.total}
            />
          </div>

          {/* Verdict banner — full width */}
          <VerdictBanner
            verdict={data.leverageVerdict}
            tpiSignal={data.tpiSignal}
            longScore={data.longScore}
            shortScore={data.shortScore}
            total={data.total}
          />

          {/* Data sources note */}
          <div style={{ marginTop: 10, fontSize: 10, color: '#d1d5db' }}>
            Sources: Bybit (FR, OI, CVD) · Alternative.me (F&G) · CoinGecko (dominance) · TradingView webhook (TPI)
          </div>
        </>
      )}
    </div>
  )
}

// ─── Standalone LeverageVerdictCard — kept for backward compat but now unused ──
export function LeverageVerdictCard() {
  const [data, setData] = useState(null)
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/checklist')
        const j = await r.json()
        if (j.ok) setData(j)
      } catch {}
    }
    load()
    const iv = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])
  if (!data?.leverageVerdict) return null
  return (
    <VerdictBanner
      verdict={data.leverageVerdict}
      tpiSignal={data.tpiSignal}
      longScore={data.longScore}
      shortScore={data.shortScore}
      total={data.total}
    />
  )
}
