'use client'
import { useEffect, useState, useCallback } from 'react'
import SectionHeader from './SectionHeader'

// ─── Client-side fetches (Vercel IP blocked, browser works fine) ──────────────
async function fetchLongShort() {
  const res = await fetch(
    'https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1h&limit=1'
  )
  const json = await res.json()
  const row  = json.result?.list?.[0]
  if (!row) throw new Error('No L/S data')
  return {
    longRatio:  parseFloat(row.buyRatio)  * 100,
    shortRatio: parseFloat(row.sellRatio) * 100,
  }
}

async function fetchOiHistory() {
  const res = await fetch(
    'https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=5min&limit=6'
  )
  const json = await res.json()
  if (json.retCode !== 0) throw new Error(json.retMsg)
  const list = json.result?.list
  if (!list || list.length < 2) throw new Error('Insufficient OI data')
  const sorted  = [...list].reverse()
  const oldest  = parseFloat(sorted[0].openInterest)
  const newest  = parseFloat(sorted[sorted.length - 1].openInterest)
  return { oldest, newest }
}
// ─────────────────────────────────────────────────────────────────────────────

function ConditionRow({ label, pass, value, detail }) {
  const isNull = pass === null || pass === undefined
  const icon   = isNull ? '—' : pass ? '✓' : '✗'
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
          {value && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-[#111] text-[#555]">{value}</span>
          )}
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
    else if (ratio >= 0.5) { msg = `Partial conditions (${score}/${total}) — wait for more confluence`; color = '#eab308' }
    else                   { msg = `Weak conditions (${score}/${total}) — not the time for a LONG`;     color = '#555' }
  } else {
    if (ratio >= 0.83)     { msg = `Strong SHORT signal (${score}/${total}) — conditions met for entry`; color = '#ef4444' }
    else if (ratio >= 0.5) { msg = `Partial conditions (${score}/${total}) — wait for more confluence`;  color = '#eab308' }
    else                   { msg = `Weak conditions (${score}/${total}) — not the time for a SHORT`;     color = '#555' }
  }
  return (
    <div className="mt-4 p-3 border rounded-sm text-xs tracking-wide"
      style={{ borderColor: color + '44', background: color + '0d', color }}>
      {ratio >= 0.5 ? '⚠ ' : '● '}{msg}
    </div>
  )
}

function LeverageVerdict({ verdict, btcSignal, longScore, shortScore, total }) {
  if (!verdict && !btcSignal) return (
    <div className="mt-6 p-4 border border-[#1a1a1a] rounded-sm">
      <div className="text-[10px] text-[#333] tracking-widest mb-1">LEVERAGE VERDICT</div>
      <div className="text-xs text-[#444]">BTC strategy signal unavailable — connect webhook to enable</div>
    </div>
  )
  const { action, label, color, detail } = verdict
  const icon = { LEVERAGE_OK:'⚡', SPOT_ONLY:'●', REDUCE:'▼', SHORT_OK:'⚡', LIGHT_SHORT:'●', HOLD_SHORT:'◆', CONFLICT:'⚠' }[action] ?? '●'
  const longPct  = Math.round((longScore  / total) * 100)
  const shortPct = Math.round((shortScore / total) * 100)
  return (
    <div className="mt-6 border rounded-sm overflow-hidden" style={{ borderColor: color + '33' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: color + '22', background: color + '0a' }}>
        <span className="text-[10px] font-bold tracking-widest" style={{ color: color + 'aa' }}>LEVERAGE VERDICT</span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm border"
          style={{ borderColor: color + '44', color: color + 'cc', background: color + '11' }}>
          BTC STRAT: {btcSignal}
        </span>
      </div>
      <div className="px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xl">{icon}</span>
          <span className="text-sm font-bold tracking-wide" style={{ color }}>{label}</span>
        </div>
        <div className="text-[11px] text-[#555] leading-relaxed mb-4">{detail}</div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#444] w-10 text-right font-mono">LONG</span>
            <div className="flex-1 h-1.5 bg-[#111] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${longPct}%`, background: '#22c55e' }} />
            </div>
            <span className="text-[10px] font-mono text-[#444] w-8">{longScore}/{total}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#444] w-10 text-right font-mono">SHORT</span>
            <div className="flex-1 h-1.5 bg-[#111] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${shortPct}%`, background: '#ef4444' }} />
            </div>
            <span className="text-[10px] font-mono text-[#444] w-8">{shortScore}/{total}</span>
          </div>
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
      // 1. Fetch Vercel-blocked data client-side in parallel
      const [lsResult, oiResult] = await Promise.allSettled([
        fetchLongShort(),
        fetchOiHistory(),
      ])
      const ls = lsResult.status === 'fulfilled' ? lsResult.value : null
      const oi = oiResult.status === 'fulfilled' ? oiResult.value : null

      // 2. Pass to server API via query params
      const params = new URLSearchParams()
      if (ls) {
        params.set('longRatio',  ls.longRatio.toFixed(4))
        params.set('shortRatio', ls.shortRatio.toFixed(4))
      }
      if (oi) {
        params.set('oiOldest', oi.oldest.toFixed(2))
        params.set('oiNewest', oi.newest.toFixed(2))
      }

      const res  = await fetch(`/api/checklist?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      setData(json)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData])

  const biasColor = data?.bias === 'LONG'  ? '#22c55e'
    : data?.bias === 'SHORT' ? '#ef4444' : '#eab308'

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-1">
        <SectionHeader label="Decision Checklist — Long vs Short" />
        {data && (
          <span className="text-xs font-mono font-bold mb-4" style={{ color: biasColor }}>
            {data.bias} {data.longScore}/{data.total}
          </span>
        )}
      </div>
      <div className="text-[10px] text-[#444] tracking-wider mb-5">
        SCORED FROM LIVE DASHBOARD DATA — RECALCULATES ON EACH REFRESH ·{' '}
        <span className="text-[#f7931a]">⚠ NOT FINANCIAL ADVICE</span>
      </div>

      {loading && <div className="text-[#555] text-xs tracking-widest py-4">CALCULATING...</div>}
      {error   && <div className="text-red-500 text-xs py-2">ERR: {error}</div>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* LONG */}
            <div className="border border-[#1a2a1a] bg-[#0a0d0a] rounded-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a2a1a]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-bold tracking-widest text-green-400">LONG CONDITIONS</span>
                </div>
                <ScoreBadge score={data.longScore} total={data.total} side="long" />
              </div>
              <div className="px-5 py-2">
                {data.longConditions.map(c => <ConditionRow key={c.id} {...c} />)}
              </div>
              <div className="px-5 pb-4">
                <SummaryBox score={data.longScore} total={data.total} side="long" />
              </div>
            </div>

            {/* SHORT */}
            <div className="border border-[#2a1a1a] bg-[#0d0a0a] rounded-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a1a1a]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-xs font-bold tracking-widest text-red-400">SHORT CONDITIONS</span>
                </div>
                <ScoreBadge score={data.shortScore} total={data.total} side="short" />
              </div>
              <div className="px-5 py-2">
                {data.shortConditions.map(c => <ConditionRow key={c.id} {...c} />)}
              </div>
              <div className="px-5 pb-4">
                <SummaryBox score={data.shortScore} total={data.total} side="short" />
              </div>
            </div>
          </div>

          <LeverageVerdict
            verdict={data.leverageVerdict}
            btcSignal={data.btcSignal}
            longScore={data.longScore}
            shortScore={data.shortScore}
            total={data.total}
          />
        </>
      )}

      {!loading && !error && data && (
        <div className="mt-2 text-[10px] text-[#2a2a2a] tracking-widest">
          LAST UPDATE {lastUpdated?.toLocaleTimeString('en-US', { hour12: false })} · REFRESHES EVERY 5 MIN
          {data.meta?.lsSource && ` · L/S: ${data.meta.lsSource.toUpperCase()}`}
        </div>
      )}
    </div>
  )
}
