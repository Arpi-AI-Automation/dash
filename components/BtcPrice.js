'use client'
import { useEffect, useState } from 'react'

export default function BtcPrice() {
  const [price, setPrice] = useState(null)
  const [prev, setPrev] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  async function fetchPrice() {
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
        { cache: 'no-store' }
      )
      const data = await res.json()
      setPrev(p => price ?? p)
      setPrice(data.bitcoin.usd)
      setLastUpdated(new Date())
      setError(false)
      setLoading(false)
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPrice()
    const interval = setInterval(fetchPrice, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [])

  const change24h = price ? null : null // placeholder for next step

  const direction = price && prev
    ? price > prev ? 'up' : price < prev ? 'down' : 'flat'
    : 'flat'

  const fmt = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="fade-in">
      <div className="text-xs text-[#555] tracking-widest mb-6">BITCOIN / USD</div>

      {loading && (
        <div className="text-[#555] text-sm tracking-wider">
          FETCHING<span className="cursor" />
        </div>
      )}

      {error && (
        <div className="text-red-500 text-sm tracking-wider">
          ERR: COINGECKO UNREACHABLE
        </div>
      )}

      {!loading && !error && price && (
        <>
          <div className="flex items-end gap-3">
            <span
              className="text-6xl font-bold tracking-tight transition-colors duration-300"
              style={{
                color: direction === 'up' ? '#22c55e' : direction === 'down' ? '#ef4444' : '#f7931a',
              }}
            >
              {fmt(price)}
            </span>
            <span className="text-[#555] text-sm mb-2">
              {direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—'}
            </span>
          </div>

          <div className="mt-4 text-xs text-[#555] tracking-widest">
            LAST UPDATE {lastUpdated?.toLocaleTimeString('en-US', { hour12: false })}
            {' · '}
            <span className="text-[#333]">REFRESHES EVERY 30S</span>
          </div>
        </>
      )}
    </div>
  )
}
