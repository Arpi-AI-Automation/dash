'use client'
import { useEffect, useState, useCallback } from 'react'
import SectionHeader from './SectionHeader'

// ALL Bybit endpoints are Vercel IP blocked — fetch everything client-side
async function fetchClientData() {
  const [tickerRes, oiRes, takerRes] = await Promise.allSettled([
    fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT'),
    fetch('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=2'),
    fetch('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1d&limit=1'),
  ])

  let fundingRate = null, oiUsd = null, price24hPcnt = null
  if (tickerRes.status === 'fulfilled') {
    const d = await tickerRes.value.json()
    const t = d.result?.list?.[0]
    if (t) {
      fundingRate  = parseFloat(t.fundingRate)
      oiUsd        = parseFloat(t.openInterestValue)
      price24hPcnt = parseFloat(t.price24hPcnt)
    }
  }

  let oiPrev = null, oiCurr = null
  if (oiRes.status === 'fulfilled') {
    const d = await oiRes.value.json()
    const list = d.result?.list ?? []
    if (list.length >= 2) {
      oiCurr = parseFloat(list[0].openInterest)
      oiPrev = parseFloat(list[1].openInterest)
    }
  }

  let takerBuyRatio = null
  if (takerRes.status === 'fulfilled') {
    const d = await takerRes.value.json()
    const row = d.result?.list?.[0]
    if (row) takerBuyRatio = parseFloat(row.buyRatio) * 100
  }

  return { fundingRate, oiUsd, price24hPcnt, oiPrev, oiCurr, takerBuyRatio }
}

function ConditionRow({ label, pass, value, detail }) {
  const isNull     = pass === null || pass === undefined
  const icon       = isNull ? '—' : pass ? '✓' : '✗'
  const iconColor  = isNull ? '#444' : pass ? '#22c55e' : '#ef4444'
  const labelColor = pass ? '#e8e8e8' : isNull ? '#555' : '#666'
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #111', opacity: pass ? 1 : 0.7 }}>
      <div style={{ flexShrink: 0, width: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 2 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: iconColor }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: labelColor }}>{label}</span>
          {value && <span style={{ fontFamily: 'monospace', fontSize: 12, padding: '1px 6px', borderRadius: 3, background: '#111', color: '#555' }}>{value}</span>}
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#444', marginTop: 2, lineHeight: 1.4 }}>{detail}</div>
      </div>
    </div>
  )
}

function ScoreBadge({ score, total, side }) {
  const ratio = score / total
  const color = side === 'long'
    ? ratio >= 0.66 ? '#22c55e' : ratio >= 0.33 ? '#eab308' : '#555'
    : ratio >= 0.66 ? '#ef4444' : ratio >= 0.33 ? '#eab308' : '#555'
  return <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color }}>{score}/{total} ✓</span>
}

function SummaryBox({ score, total, side }) {
  const ratio = score / total
  let msg, color
  if (side === 'long') {
    if (ratio >= 0.83)     { msg = `Strong LONG signal (${score}/${total}) — conditions met for entry`; color = '#22c55e' }
    else if (ratio >= 0.5) { msg = `Partial (${score}/${total}) — wait for more confluence`;           color = '#eab308' }
    else                   { msg = `Weak (${score}/${total}) — not the time for a LONG`;               color = '#555' }
  } else {
    if (ratio >= 0.83)     { msg = `Strong SHORT signal (${score}/${total}) — conditions met`;         color = '#ef4444' }
    else if (ratio >= 0.5) { msg = `Partial (${score}/${total}) — wait for more confluence`;           color = '#eab308' }
    else                   { msg = `Weak (${score}/${total}) — not the time for a SHORT`;              color = '#555' }
  }
  return (
    <div style={{ marginTop: 14, padding: '10px 14px', border: `1px solid ${color}44`, borderRadius: 4,
      background: color + '0d', color, fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.03em' }}>
      {ratio >= 0.5 ? '⚠ ' : '● '}{msg}
    </div>
  )
}

function LeverageVerdict({ verdict, tpiSignal, longScore, shortScore, total }) {
  if (!verdict && !tpiSignal) return (
    <div style={{ marginTop: 20, padding: 16, border: '1px solid #1a1a1a', borderRadius: 4 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#333', letterSpacing: '0.1em', marginBottom: 4 }}>LEVERAGE VERDICT</div>
      <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#444' }}>TPI signal unavailable — connect webhook to enable</div>
    </div>
  )
  if (!verdict) return null
  const { action, label, color, detail } = verdict
  const icon = { LEVERAGE_OK:'⚡', SPOT_ONLY:'●', REDUCE:'▼', SHORT_OK:'⚡', LIGHT_SHORT:'●', HOLD_SHORT:'◆', CONFLICT:'⚠' }[action] ?? '●'
  return (
    <div style={{ marginTop: 20, border: `1px solid ${color}33`, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px',
        borderBottom: `1px solid ${color}22`, background: color + '0a' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: color + 'aa' }}>LEVERAGE VERDICT</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', borderRadius: 3,
          border: `1px solid ${color}44`, color: color + 'cc', background: color + '11' }}>
          TPI: {tpiSignal}
        </span>
      </div>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color }}>{label}</span>
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#555', lineHeight: 1.5, marginBottom: 12 }}>{detail}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[['LONG', longScore, '#22c55e'], ['SHORT', shortScore, '#ef4444']].map(([lbl, score, clr]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#444', width: 40, textAlign: 'right' }}>{lbl}</span>
              <div style={{ flex: 1, height: 4, background: '#111', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{ width: `${Math.round(score/total*100)}%`, height: '100%', background: clr, borderRadius: 9999 }} />
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#444', width: 32 }}>{score}/{total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DecisionChecklist() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const { fundingRate, oiUsd, price24hPcnt, oiPrev, oiCurr, takerBuyRatio } = await fetchClientData()
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
    } catch (e) { setError(e.message) }
    finally     { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [fetchData])

  const biasColor = data?.bias === 'LONG' ? '#22c55e' : data?.bias === 'SHORT' ? '#ef4444' : '#eab308'

  const LBL = { fontFamily: 'monospace', fontSize: 11, fontWeight: 400, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase' }

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <SectionHeader label="Decision Checklist — Long vs Short" />
        {data && <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: biasColor }}>{data.bias} {data.longScore}/{data.total}</span>}
      </div>
      <div style={{ ...LBL, marginBottom: 20 }}>
        SCORED FROM LIVE DATA — RECALCULATES EVERY 5 MIN · <span style={{ color: '#f7931a' }}>⚠ NOT FINANCIAL ADVICE</span>
      </div>

      {loading && <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#555', letterSpacing: '0.1em', padding: '16px 0' }}>CALCULATING...</div>}
      {error   && <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#ef4444', padding: '8px 0' }}>ERR: {error}</div>}

      {!loading && !error && data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              ['long',  'LONG CONDITIONS',  '#22c55e', '#0a140a', data.longConditions,  data.longScore],
              ['short', 'SHORT CONDITIONS', '#ef4444', '#140a0a', data.shortConditions, data.shortScore],
            ].map(([side, title, color, bg, conds, score]) => (
              <div key={side} style={{ borderRadius: 6, overflow: 'hidden', border: `1px solid ${color}22`, background: bg }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderBottom: `1px solid ${color}22` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color, letterSpacing: '0.08em' }}>{title}</span>
                  </div>
                  <ScoreBadge score={score} total={data.total} side={side} />
                </div>
                <div style={{ padding: '4px 16px' }}>{conds.map(c => <ConditionRow key={c.id} {...c} />)}</div>
                <div style={{ padding: '0 16px 16px' }}><SummaryBox score={score} total={data.total} side={side} /></div>
              </div>
            ))}
          </div>
          <LeverageVerdict
            verdict={data.leverageVerdict}
            tpiSignal={data.tpiSignal}
            longScore={data.longScore}
            shortScore={data.shortScore}
            total={data.total}
          />
        </>
      )}

      {!loading && !error && data && (
        <div style={{ ...LBL, marginTop: 8, color: '#2a2a2a' }}>
          LAST UPDATE {lastUpdated?.toLocaleTimeString('en-US', { hour12: false })} · REFRESHES EVERY 5 MIN
        </div>
      )}
    </div>
  )
}

// ─── Standalone card for embedding outside the main checklist ─────
// Fetches server-side only (TPI + F&G + dominance). No Bybit params.
// Used in page.js left column below TvSignals.
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

  if (!data) return null
  return (
    <LeverageVerdict
      verdict={data.leverageVerdict}
      tpiSignal={data.tpiSignal}
      longScore={data.longScore}
      shortScore={data.shortScore}
      total={data.total}
    />
  )
}
