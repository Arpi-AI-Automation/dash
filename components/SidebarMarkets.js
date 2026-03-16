'use client'
import { useEffect, useState, useCallback } from 'react'

const FOREX = ['AUD/USD', 'AUD/JPY', 'EUR/JPY']
const EQUITIES = ['SPY', 'QQQ']

function SidebarRow({ symbol, name, price, change, prefix = '$' }) {
  const up = change >= 0
  return (
    <div className="flex flex-col py-2.5 border-b border-[#0f0f0f] last:border-0">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-bold tracking-widest text-[#555]">{symbol}</span>
        <span className="text-[10px] font-bold" style={{ color: up ? '#22c55e' : '#ef4444' }}>
          {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-[#333] tracking-wide">{name}</span>
        <span className="text-[12px] font-bold text-[#ccc]">
          {prefix}{typeof price === 'number' ? price.toFixed(price > 10 ? 2 : 4) : '—'}
        </span>
      </div>
    </div>
  )
}

function SidebarSection({ label, children }) {
  return (
    <div className="mb-5">
      <div className="text-[9px] text-[#252525] tracking-[0.3em] mb-2 pb-1 border-b border-[#0d0d0d]">{label}</div>
      {children}
    </div>
  )
}

export default function SidebarMarkets() {
  const [data,    setData]    = useState({})
  const [loading, setLoading] = useState(true)
  const [updated, setUpdated] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/markets', { cache: 'no-store' })
      const d   = await res.json()
      if (d.ok) { setData(d.data); setUpdated(new Date()) }
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 60000)
    return () => clearInterval(iv)
  }, [fetchData])

  const forex    = FOREX.map(sym => ({ sym, ...data[sym] }))
  const equities = EQUITIES.map(sym => ({ sym, ...data[sym] }))

  return (
    <div>
      <div className="text-[9px] text-[#222] tracking-[0.3em] mb-5 pb-2 border-b border-[#0f0f0f]">
        MARKETS
      </div>

      {loading ? (
        <div className="text-[10px] text-[#2a2a2a] tracking-widest">LOADING...</div>
      ) : (
        <>
          <SidebarSection label="FOREX">
            {forex.map(f => (
              <SidebarRow
                key={f.sym}
                symbol={f.sym}
                name={f.sym}
                price={f.price}
                change={f.change24h ?? 0}
                prefix={f.sym.includes('JPY') ? '¥' : '$'}
              />
            ))}
          </SidebarSection>

          <SidebarSection label="EQUITIES">
            {equities.map(e => (
              <SidebarRow
                key={e.sym}
                symbol={e.sym}
                name={e.sym === 'SPY' ? 'S&P 500 ETF' : 'Nasdaq ETF'}
                price={e.price}
                change={e.change24h ?? 0}
              />
            ))}
          </SidebarSection>

          <SidebarSection label="GOLD">
            {data['PAXG'] ? (
              <SidebarRow symbol="PAXG" name="PAX Gold" price={data['PAXG']?.price} change={data['PAXG']?.change24h ?? 0} />
            ) : (
              <div className="text-[9px] text-[#2a2a2a]">via crypto prices</div>
            )}
          </SidebarSection>
        </>
      )}

      {updated && (
        <div className="text-[9px] text-[#1e1e1e] tracking-widest mt-4">
          {updated.toLocaleTimeString('en-US', { hour12: false })}
        </div>
      )}
    </div>
  )
}
