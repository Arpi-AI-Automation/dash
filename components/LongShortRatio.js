'use client'
import { useEffect, useState, useCallback } from 'react'
import SectionHeader from './SectionHeader'

// Signal thresholds (matching reference dashboard logic)
function getSignal(longRatio) {
  if (longRatio >= 70) return { label: 'EXTREME LONGS', color: '#ef4444', note: 'Highly overleveraged longs — contrarian short signal' }
  if (longRatio >= 60) return { label: 'LONGS DOMINANT', color: '#f97316', note: 'Bullish bias — watch for long squeeze' }
  if (longRatio <= 30) return { label: 'EXTREME SHORTS', color: '#22c55e', note: 'Short squeeze risk — contrarian long signal' }
  if (longRatio <= 40) return { label: 'SHORTS DOMINANT', color: '#60a5fa', note: 'Bearish bias — watch for short squeeze' }
  return { label: 'BALANCED', color: '#555', note: 'No extreme bias' }
}

function RatioBar({ symbol, longRatio, shortRatio }) {
  const signal = getSignal(longRatio)
  const isExtreme = longRatio >= 65 || longRatio <= 35

  return (
    <div className="py-3 border-b border-[#111] last:border-0">
      {/* Symbol + signal */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-mono text-[#888] tracking-widest">
          {symbol}/USDT
        </span>
        {isExtreme && (
          <span className="text-[10px] px-2 py-0.5 rounded-sm tracking-wider"
            style={{ color: signal.color, background: signal.color + '1a' }}>
            ⚠ {signal.label}
          </span>
        )}
      </div>

      {/* Bar */}
      <div className="relative h-7 flex rounded-sm overflow-hidden">
        {/* Long side */}
        <div
          className="flex items-center justify-end pr-2 transition-all duration-700"
          style={{ width: `${longRatio}%`, background: '#16a34a' }}
        >
          <span className="text-[11px] font-mono font-bold text-white">
            {longRatio.toFixed(1)}%
          </span>
        </div>
        {/* Short side */}
        <div
          className="flex items-center justify-start pl-2 transition-all duration-700"
          style={{ width: `${shortRatio}%`, background: '#dc2626' }}
        >
          <span className="text-[11px] font-mono font-bold text-white">
            {shortRatio.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-green-600 font-mono tracking-wider">
          LONG {longRatio.toFixed(1)}%
        </span>
        <span className="text-[10px] text-red-600 font-mono tracking-wider">
          SHORT {shortRatio.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

export default function LongShortRatio() {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const res  = await fetch('/api/longshort', { cache: 'no-store' })
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
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Market-wide summary
  const avgLong = data.length
    ? data.reduce((s, d) => s + d.longRatio, 0) / data.length
    : null

  const marketSignal = avgLong != null ? getSignal(avgLong) : null

  return (
    <div className="mt-10">
      <SectionHeader label="Long / Short Ratio · Top Traders" />

      <div className="text-[10px] text-[#444] tracking-wider mb-4">
        GLOBAL ACCOUNT RATIO · SOURCE: BINANCE FAPI · 1H PERIOD
      </div>

      {loading && (
        <div className="text-[#555] text-xs tracking-widest py-4">
          LOADING<span className="cursor" />
        </div>
      )}
      {error && <div className="text-red-500 text-xs py-2">ERR: {error}</div>}

      {!loading && !error && data.length > 0 && (
        <div className="border border-[#1e1e1e] bg-[#0d0d0d] rounded-sm overflow-hidden">

          {/* Bars */}
          <div className="px-5 pt-4 pb-2">
            {data.map(d => (
              <RatioBar key={d.symbol} {...d} />
            ))}
          </div>

          {/* Market signal summary box */}
          {avgLong != null && (
            <div className="mx-5 mb-5 mt-3 p-3 border rounded-sm text-xs"
              style={{
                borderColor: marketSignal.color + '44',
                background:  marketSignal.color + '0d',
                color:       marketSignal.color === '#555' ? '#888' : marketSignal.color,
              }}>
              <span className="font-bold tracking-wider">
                {marketSignal.color === '#555' ? '⚖' : '⚠'} MARKET:{' '}
              </span>
              <span className="font-mono">L:{avgLong.toFixed(0)}% / S:{(100 - avgLong).toFixed(0)}%</span>
              <span className="text-[#555]"> — {marketSignal.note}</span>
            </div>
          )}

          {/* Footer */}
          <div className="px-5 pb-3 text-[10px] text-[#2a2a2a] tracking-widest">
            LAST UPDATE {lastUpdated?.toLocaleTimeString('en-US', { hour12: false })} · REFRESHES 60S
          </div>
        </div>
      )}
    </div>
  )
}
