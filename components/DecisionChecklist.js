'use client'
import { useEffect, useState, useCallback } from 'react'
import SectionHeader from './SectionHeader'

function ConditionRow({ label, pass, value, detail }) {
  const isNull = pass === null || pass === undefined

  const icon = isNull ? '—' : pass ? '✓' : '✗'
  const iconColor = isNull ? '#444' : pass ? '#22c55e' : '#ef4444'
  const labelColor = pass ? '#e8e8e8' : isNull ? '#555' : '#666'

  return (
    <div className={`flex gap-3 py-2.5 border-b border-[#111] last:border-0 ${pass ? '' : 'opacity-70'}`}>
      {/* Icon */}
      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center mt-0.5">
        <span className="text-sm font-bold" style={{ color: iconColor }}>{icon}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold tracking-wide" style={{ color: labelColor }}>
            {label}
          </span>
          {value && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-[#111] text-[#555]">
              {value}
            </span>
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

  return (
    <span className="text-sm font-mono font-bold" style={{ color }}>
      {score}/{total} ✓
    </span>
  )
}

function SummaryBox({ score, total, side }) {
  const ratio = score / total
  let msg, color

  if (side === 'long') {
    if (ratio >= 0.83)     { msg = `Strong LONG signal (${score}/${total}) — conditions met for entry`; color = '#22c55e' }
    else if (ratio >= 0.5) { msg = `Partial conditions (${score}/${total}) — wait for more confluence before acting`; color = '#eab308' }
    else                   { msg = `Weak conditions (${score}/${total}) — not the time for a LONG`; color = '#555' }
  } else {
    if (ratio >= 0.83)     { msg = `Strong SHORT signal (${score}/${total}) — conditions met for entry`; color = '#ef4444' }
    else if (ratio >= 0.5) { msg = `Partial conditions (${score}/${total}) — wait for more confluence before acting`; color = '#eab308' }
    else                   { msg = `Weak conditions (${score}/${total}) — not the time for a SHORT`; color = '#555' }
  }

  return (
    <div className="mt-4 p-3 border rounded-sm text-xs tracking-wide"
      style={{ borderColor: color + '44', background: color + '0d', color }}>
      {ratio >= 0.5 ? '⚠ ' : '● '}{msg}
    </div>
  )
}

export default function DecisionChecklist() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const res  = await fetch('/api/checklist', { cache: 'no-store' })
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
    const interval = setInterval(fetchData, 5 * 60 * 1000) // every 5 min
    return () => clearInterval(interval)
  }, [fetchData])

  const biasColor = data?.bias === 'LONG' ? '#22c55e'
    : data?.bias === 'SHORT' ? '#ef4444'
    : '#eab308'

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

      {loading && (
        <div className="text-[#555] text-xs tracking-widest py-4">
          CALCULATING<span className="cursor" />
        </div>
      )}
      {error && <div className="text-red-500 text-xs py-2">ERR: {error}</div>}

      {!loading && !error && data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* LONG side */}
          <div className="border border-[#1a2a1a] bg-[#0a0d0a] rounded-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a2a1a]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs font-bold tracking-widest text-green-400">LONG CONDITIONS</span>
              </div>
              <ScoreBadge score={data.longScore} total={data.total} side="long" />
            </div>

            <div className="px-5 py-2">
              {data.longConditions.map(c => (
                <ConditionRow key={c.id} {...c} />
              ))}
            </div>

            <div className="px-5 pb-4">
              <SummaryBox score={data.longScore} total={data.total} side="long" />
            </div>
          </div>

          {/* SHORT side */}
          <div className="border border-[#2a1a1a] bg-[#0d0a0a] rounded-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a1a1a]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs font-bold tracking-widest text-red-400">SHORT CONDITIONS</span>
              </div>
              <ScoreBadge score={data.shortScore} total={data.total} side="short" />
            </div>

            <div className="px-5 py-2">
              {data.shortConditions.map(c => (
                <ConditionRow key={c.id} {...c} />
              ))}
            </div>

            <div className="px-5 pb-4">
              <SummaryBox score={data.shortScore} total={data.total} side="short" />
            </div>
          </div>
        </div>
      )}

      {!loading && !error && data && (
        <div className="mt-2 text-[10px] text-[#2a2a2a] tracking-widest">
          LAST UPDATE {lastUpdated?.toLocaleTimeString('en-US', { hour12: false })} · REFRESHES EVERY 5 MIN
        </div>
      )}
    </div>
  )
}
