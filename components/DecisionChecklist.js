'use client'
import { useEffect, useState } from 'react'

// ── Design tokens ─────────────────────────────────────────────────────────────
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'
const LBL  = { fontFamily: FONT, fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }

// ── Sub-components ────────────────────────────────────────────────────────────
function ConditionRow({ label, pass, value, detail, isLast }) {
  const isNull    = pass === null || pass === undefined
  const icon      = isNull ? '—' : pass ? '✓' : '✗'
  const iconBg    = isNull ? '#f3f4f6' : pass ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.08)'
  const iconColor = isNull ? '#9ca3af' : pass ? '#059669' : '#dc2626'
  const rowBg     = pass === true ? 'rgba(16,185,129,.03)' : 'transparent'
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 14px', borderBottom: isLast ? 'none' : '1px solid #f3f4f6', background: rowBg }}>
      <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: iconColor }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: isNull ? '#9ca3af' : pass ? '#111827' : '#374151' }}>{label}</span>
          {value && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
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
  const ratio      = score / total
  const scoreColor = ratio >= 0.66 ? accentColor : ratio >= 0.33 ? '#f59e0b' : '#6b7280'
  const summary    = ratio >= 0.83 ? `Strong signal — ${score}/${total} conditions met`
    : ratio >= 0.5  ? `Partial — ${score}/${total} — wait for more confluence`
    :                 `Weak — ${score}/${total} — insufficient conditions`
  return (
    <div style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)', overflow: 'hidden', borderTop: `3px solid ${accentColor}` }}>
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
        <div style={{ height: 4, background: '#f3f4f6', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{ width: `${(score / total) * 100}%`, height: '100%', background: accentColor, borderRadius: 9999, transition: 'width .5s' }} />
        </div>
      </div>
      <div>
        {conditions.map((c, i) => (
          <ConditionRow key={c.id} {...c} isLast={i === conditions.length - 1} />
        ))}
      </div>
      <div style={{ margin: '0 14px 14px', padding: '8px 12px', borderRadius: 8,
        background: ratio >= 0.5 ? accentColor + '0d' : '#f9fafb',
        border: `1px solid ${ratio >= 0.5 ? accentColor + '30' : '#f3f4f6'}`,
        fontSize: 12, fontWeight: 600, color: ratio >= 0.5 ? accentColor : '#6b7280',
      }}>
        {ratio >= 0.5 ? '⚡ ' : '● '}{summary}
      </div>
    </div>
  )
}

function VerdictBanner({ verdict, tpiSignal, longScore, shortScore, total }) {
  if (!verdict) return null
  const { label, color, detail } = verdict
  return (
    <div style={{ background: '#fff', border: `1px solid ${color}35`, borderLeft: `4px solid ${color}`, borderRadius: 12, padding: '16px 20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...LBL }}>Leverage Verdict</span>
          <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 20, background: color + '0a', color, border: `1px solid ${color}35` }}>{label}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb' }}>TPI: {tpiSignal}</span>
      </div>
      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, marginBottom: 12 }}>{detail}</div>
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

// ── Stale notice ──────────────────────────────────────────────────────────────
function StaleNotice({ date }) {
  if (!date) return null
  const today   = new Date().toISOString().slice(0, 10)
  const isStale = date < today
  if (!isStale) return null
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', fontSize: 11, fontWeight: 600, color: '#f59e0b' }}>
      ⏱ Daily close data from {date} — updates at UTC 00:05
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DecisionChecklist() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        // Always read from daily-close stored data — no live Bybit calls
        const res  = await fetch('/api/checklist?stored=true', { cache: 'no-store' })
        const json = await res.json()
        if (!json.ok) throw new Error(json.error ?? 'No stored data')
        setData(json)
        setError(null)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    // Refresh once per hour — data only changes at UTC 00:05 anyway
    const iv = setInterval(load, 60 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {data && (
            <span style={{
              fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
              background: data.longScore > data.shortScore ? 'rgba(16,185,129,.1)' : data.shortScore > data.longScore ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)',
              color:      data.longScore > data.shortScore ? '#059669'              : data.shortScore > data.longScore ? '#dc2626'              : '#f59e0b',
              border: `1px solid ${data.longScore > data.shortScore ? 'rgba(16,185,129,.3)' : data.shortScore > data.longScore ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.3)'}`,
            }}>
              {data.longScore}L · {data.shortScore}S
            </span>
          )}
          {data && <StaleNotice date={data.date} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>Daily close · UTC 00:05</span>
          <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>⚠ Not financial advice</span>
        </div>
      </div>

      {loading && <div style={{ ...LBL, color: '#d1d5db', padding: '2rem 0', textAlign: 'center' }}>Loading daily close data…</div>}

      {error && (
        <div style={{ padding: '16px', background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 10, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
          <strong>Daily data not yet available.</strong> The checklist snapshot is written by the UTC 00:05 cron job each night.
          {error.includes('cron') && <span> First reading will appear after the next UTC midnight.</span>}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <SideCard title="Long Conditions" accentColor="#10b981" conditions={data.longConditions}  score={data.longScore}  total={data.total} />
            <SideCard title="Short Conditions" accentColor="#ef4444" conditions={data.shortConditions} score={data.shortScore} total={data.total} />
          </div>
          <VerdictBanner verdict={data.leverageVerdict} tpiSignal={data.tpiSignal} longScore={data.longScore} shortScore={data.shortScore} total={data.total} />
          <div style={{ marginTop: 10, fontSize: 10, color: '#d1d5db' }}>
            Sources: Bybit (FR, OI, CVD) · Alternative.me (F&G) · CoinGecko (dominance) · TradingView webhook (TPI) · Snapshot taken at UTC 00:05 daily close
          </div>
        </>
      )}
    </div>
  )
}

// ─── Standalone LeverageVerdictCard — reads same daily-close data ─────────────
export function LeverageVerdictCard() {
  const [data, setData] = useState(null)
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/checklist?stored=true', { cache: 'no-store' })
        const j = await r.json()
        if (j.ok) setData(j)
      } catch {}
    }
    load()
    const iv = setInterval(load, 60 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])
  if (!data?.leverageVerdict) return null
  return <VerdictBanner verdict={data.leverageVerdict} tpiSignal={data.tpiSignal} longScore={data.longScore} shortScore={data.shortScore} total={data.total} />
}
