'use client'
import { useEffect, useState, useCallback } from 'react'
import SectionHeader from './SectionHeader'

// Funding rate interpretation
// Positive = longs pay shorts (market leaning long / overheated)
// Negative = shorts pay longs (market leaning short / possible squeeze)

function getZone(rate) {
  const abs = Math.abs(rate)
  const pct = rate * 100

  if (pct > 0.10)  return { label: 'DANGER',   color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   desc: 'Overleveraged longs' }
  if (pct > 0.05)  return { label: 'HOT',      color: '#f97316', bg: 'rgba(249,115,22,0.08)',  desc: 'Longs dominant' }
  if (pct < -0.05) return { label: 'SQUEEZE',  color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   desc: 'Short squeeze risk' }
  if (pct < -0.01) return { label: 'BEARISH',  color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  desc: 'Shorts dominant' }
  return           { label: 'NEUTRAL',  color: '#555',    bg: 'transparent',              desc: 'Balanced' }
}

function Countdown({ nextFundingTime }) {
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    function update() {
      const diff = nextFundingTime - Date.now()
      if (diff <= 0) { setRemaining('00:00:00'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [nextFundingTime])

  return <span className="text-[10px] text-[#333] font-mono">{remaining}</span>
}

function FundingCard({ symbol, fundingRate, nextFundingTime }) {
  const pct  = fundingRate * 100
  const zone = getZone(fundingRate)
  const sign = pct >= 0 ? '+' : ''

  return (
    <div
      className="border border-[#1e1e1e] p-4 rounded-sm transition-colors"
      style={{ background: zone.bg, borderColor: zone.color === '#555' ? '#1e1e1e' : zone.color + '33' }}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs text-[#888] tracking-widest font-mono">{symbol}</span>
        <span className="text-[10px] tracking-widest px-1.5 py-0.5 rounded-sm"
          style={{ color: zone.color, background: zone.color + '1a' }}>
          {zone.label}
        </span>
      </div>

      <div className="text-2xl font-bold font-mono tabular-nums my-1"
        style={{ color: zone.color === '#555' ? '#e8e8e8' : zone.color }}>
        {sign}{pct.toFixed(4)}%
      </div>

      <div className="flex justify-between items-center mt-2">
        <span className="text-[10px] text-[#444]">{zone.desc}</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[#333]">next</span>
          <Countdown nextFundingTime={nextFundingTime} />
        </div>
      </div>
    </div>
  )
}

export default function FundingRate() {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const res  = await fetch('/api/fundingrate', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setData(json.data)
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
    const interval = setInterval(fetchData, 60000) // refresh every 60s
    return () => clearInterval(interval)
  }, [fetchData])

  // Summary stats
  const avgRate = data.length
    ? data.reduce((s, d) => s + d.fundingRate, 0) / data.length
    : null

  const dangerCount   = data.filter(d => d.fundingRate * 100 >  0.10).length
  const squeezeCount  = data.filter(d => d.fundingRate * 100 < -0.05).length

  return (
    <div className="mt-10">
      <SectionHeader label="Funding Rate · Perpetuals" />

      <div className="text-[10px] text-[#444] tracking-wider mb-4">
        POSITIVE = LONGS PAY SHORTS · NEGATIVE = SHORTS PAY LONGS · SOURCE: BINANCE FAPI
      </div>

      {loading && (
        <div className="text-[#555] text-xs tracking-widest py-4">
          LOADING<span className="cursor" />
        </div>
      )}
      {error && <div className="text-red-500 text-xs py-2">ERR: {error}</div>}

      {!loading && !error && data.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="flex gap-6 mb-5 p-3 border border-[#1a1a1a] bg-[#0a0a0a] rounded-sm">
            <div>
              <div className="text-[10px] text-[#444] tracking-widest">AVG RATE</div>
              <div className={`text-sm font-mono font-bold ${avgRate >= 0 ? 'text-[#f97316]' : 'text-[#60a5fa]'}`}>
                {avgRate >= 0 ? '+' : ''}{(avgRate * 100).toFixed(4)}%
              </div>
            </div>
            <div className="w-px bg-[#1a1a1a]" />
            <div>
              <div className="text-[10px] text-[#444] tracking-widest">⚠ DANGER ZONE</div>
              <div className="text-sm font-mono font-bold text-red-400">{dangerCount} pairs</div>
            </div>
            <div className="w-px bg-[#1a1a1a]" />
            <div>
              <div className="text-[10px] text-[#444] tracking-widest">✓ SQUEEZE RISK</div>
              <div className="text-sm font-mono font-bold text-green-400">{squeezeCount} pairs</div>
            </div>
            <div className="ml-auto self-center text-[10px] text-[#2a2a2a] tracking-widest">
              {lastUpdated?.toLocaleTimeString('en-US', { hour12: false })}
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {data.map(d => (
              <FundingCard key={d.symbol} {...d} />
            ))}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-[#444] tracking-wider">
            <span><span className="text-red-400">■</span> DANGER: FR &gt; +0.10% — overleveraged longs</span>
            <span><span className="text-green-400">■</span> SQUEEZE: FR &lt; -0.05% — short squeeze risk</span>
          </div>
        </>
      )}
    </div>
  )
}
