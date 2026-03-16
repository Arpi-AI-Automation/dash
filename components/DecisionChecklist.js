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
    <div className={`flex gap-3 py-2.5 border-b border-[#111] last:border-0 ${pass ? '' : 'opacity-70'}`}>
      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center mt-0.5">
        <span className="text-sm font-bold" style={{ color: iconColor }}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold tracking-wide" style={{ color: labelColor }}>{label}</span>
          {value && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-[#111] text-[#555]">{value}</span>}
        </div>
        <div className="text-[10px] text-[#444] mt-0.5 leading-relaxed">{detail}</div>
      </div>
    </div>
  )
}

function ScoreBadge({ score, total, side }) {
  const ratio = score / total
  const color = side === 'long'
    ? ratio >= 0.66 ? '#22c55e' : ratio >= 0.33 ? '#eab308' : '#555'
    : ratio >= 0.66 ? '#ef4444' : ratio >= 0.33 ? '#eab308' : '#555'
  return <span className="text-sm font-mono font-bold" style={{ color }}>{score}/{total} ✓</span>
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
    <div className="mt-4 p-3 border rounded-sm text-xs tracking-wide"
      style={{ borderColor: color + '44', background: color + '0d', color }}>
      {ratio >= 0.5 ? '⚠ ' : '● '}{msg}
    </div>
  )
}

function LeverageVerdict({ verdict, tpiSignal, longScore, shortScore, total }) {
  if (!verdict && !tpiSignal) return (
    <div className="mt-6 p-4 border border-[#1a1a1a] rounded-sm">
      <div className="text-[10px] text-[#333] tracking-widest mb-1">LEVERAGE VERDICT</div>
      <div className="text-xs text-[#444]">TPI signal unavailable — connect webhook to enable</div>
    </div>
  )
  if (!verdict) return null
  const { action, label, color, detail } = verdict
  const icon = { LEVERAGE_OK:'⚡', SPOT_ONLY:'●', REDUCE:'▼', SHORT_OK:'⚡', LIGHT_SHORT:'●', HOLD_SHORT:'◆', CONFLICT:'⚠' }[action] ?? '●'
  return (
    <div className="mt-6 border rounded-sm overflow-hidden" style={{ borderColor: color + '33' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: color + '22', background: color + '0a' }}>
        <span className="text-[10px] font-bold tracking-widest" style={{ color: color + 'aa' }}>LEVERAGE VERDICT</span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm border"
          style={{ borderColor: color + '44', color: color + 'cc', background: color + '11' }}>
          TPI: {tpiSignal}
        </span>
      </div>
      <div className="px-5 py-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xl">{icon}</span>
          <span className="text-sm font-bold tracking-wide" style={{ color }}>{label}</span>
        </div>
        <div className="text-[11px] text-[#555] leading-relaxed mb-4">{detail}</div>
        <div className="space-y-2">
          {[['LONG', longScore, '#22c55e'], ['SHORT', shortScore, '#ef4444']].map(([lbl, score, clr]) => (
            <div key={lbl} className="flex items-center gap-3">
              <span className="text-[10px] text-[#444] w-10 text-right font-mono">{lbl}</span>
              <div className="flex-1 h-1.5 bg-[#111] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round(score/total*100)}%`, background: clr }} />
              </div>
              <span className="text-[10px] font-mono text-[#444] w-8">{score}/{total}</span>
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

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-1">
        <SectionHeader label="Decision Checklist — Long vs Short" />
        {data && <span className="text-xs font-mono font-bold mb-4" style={{ color: biasColor }}>{data.bias} {data.longScore}/{data.total}</span>}
      </div>
      <div className="text-[10px] text-[#444] tracking-wider mb-5">
        SCORED FROM LIVE DATA — RECALCULATES EVERY 5 MIN · <span className="text-[#f7931a]">⚠ NOT FINANCIAL ADVICE</span>
      </div>

      {loading && <div className="text-[#555] text-xs tracking-widest py-4">CALCULATING...</div>}
      {error   && <div className="text-red-500 text-xs py-2">ERR: {error}</div>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[['long', 'LONG CONDITIONS', 'green', '#1a2a1a', '#0a0d0a', data.longConditions, data.longScore],
              ['short','SHORT CONDITIONS','red',   '#2a1a1a', '#0d0a0a', data.shortConditions, data.shortScore]
            ].map(([side, title, clr, border, bg, conds, score]) => (
              <div key={side} className="rounded-sm overflow-hidden" style={{ border: `1px solid ${border}`, background: bg }}>
                <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${border}` }}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full bg-${clr}-500`} />
                    <span className={`text-xs font-bold tracking-widest text-${clr}-400`}>{title}</span>
                  </div>
                  <ScoreBadge score={score} total={data.total} side={side} />
                </div>
                <div className="px-5 py-2">{conds.map(c => <ConditionRow key={c.id} {...c} />)}</div>
                <div className="px-5 pb-4"><SummaryBox score={score} total={data.total} side={side} /></div>
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
        <div className="mt-2 text-[10px] text-[#2a2a2a] tracking-widest">
          LAST UPDATE {lastUpdated?.toLocaleTimeString('en-US', { hour12: false })} · REFRESHES EVERY 5 MIN
        </div>
      )}
    </div>
  )
}
