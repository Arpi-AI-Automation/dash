'use client'
import { useEffect, useState, useCallback } from 'react'
import SectionHeader from './SectionHeader'

// Maps every asset to display name + group
const ASSET_MAP = [
  // Crypto
  { key: 'bitcoin',     name: 'Bitcoin',     symbol: 'BTC',      group: 'Crypto' },
  { key: 'ethereum',    name: 'Ethereum',    symbol: 'ETH',      group: 'Crypto' },
  { key: 'solana',      name: 'Solana',      symbol: 'SOL',      group: 'Crypto' },
  { key: 'sui',         name: 'Sui',         symbol: 'SUI',      group: 'Crypto' },
  { key: 'ripple',      name: 'XRP',         symbol: 'XRP',      group: 'Crypto' },
  { key: 'monero',      name: 'Monero',      symbol: 'XMR',      group: 'Crypto' },
  { key: 'binancecoin', name: 'BNB',         symbol: 'BNB',      group: 'Crypto' },
  { key: 'aave',        name: 'Aave',        symbol: 'AAVE',     group: 'Crypto' },
  { key: 'dogecoin',    name: 'Dogecoin',    symbol: 'DOGE',     group: 'Crypto' },
  { key: 'pax-gold',    name: 'PAX Gold',    symbol: 'PAXG',     group: 'Crypto' },
  { key: 'hyperliquid', name: 'Hyperliquid', symbol: 'HYPE',     group: 'Crypto' },
  // Equities
  { key: 'SPY',         name: 'S&P 500',     symbol: 'SPY',      group: 'Equities' },
  { key: 'QQQ',         name: 'Nasdaq',      symbol: 'QQQ',      group: 'Equities' },
  // Forex
  { key: 'AUDUSD=X',    name: 'AUD/USD',     symbol: 'AUD/USD',  group: 'Forex' },
  { key: 'AUDJPY=X',    name: 'AUD/JPY',     symbol: 'AUD/JPY',  group: 'Forex' },
  { key: 'EURJPY=X',    name: 'EUR/JPY',     symbol: 'EUR/JPY',  group: 'Forex' },
  // Commodities
  { key: 'GC=F',        name: 'Gold',        symbol: 'XAU/USD',  group: 'Commodities' },
  { key: 'CL=F',        name: 'Crude Oil',   symbol: 'WTI',      group: 'Commodities' },
  { key: 'HG=F',        name: 'Copper',      symbol: 'COPPER',   group: 'Commodities' },
]

function DeltaCell({ value }) {
  if (value == null) return <td className="px-3 py-2 text-center text-[#333] text-xs">—</td>

  const isPos = value > 0.05
  const isNeg = value < -0.05

  return (
    <td className={`px-3 py-2 text-center text-xs font-mono tabular-nums ${
      isPos ? 'text-green-400' : isNeg ? 'text-red-400' : 'text-[#555]'
    }`}>
      {value > 0 ? '+' : ''}{value.toFixed(2)}%
    </td>
  )
}

function ReturnCell({ value }) {
  if (value == null) return <td className="px-3 py-2 text-center text-[#333] text-xs">—</td>
  return (
    <td className={`px-3 py-2 text-center text-xs font-mono tabular-nums text-[#555]`}>
      {value > 0 ? '+' : ''}{value.toFixed(2)}%
    </td>
  )
}

export default function BtcComparison() {
  const [data, setData]       = useState(null)
  const [btc, setBtc]         = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const res  = await fetch('/api/compare', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setData(json.data)
      setBtc(json.btc)
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
    // Compare data is heavy — refresh every 5 min
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData])

  const groups = [...new Set(ASSET_MAP.map(a => a.group))]

  return (
    <div className="mt-10">
      <SectionHeader label="vs BTC" />

      <div className="text-[10px] text-[#444] tracking-wider mb-4">
        DELTA = ASSET RETURN − BTC RETURN OVER PERIOD · GREEN = BEAT BTC · RED = LOST TO BTC
      </div>

      {loading && (
        <div className="text-[#555] text-xs tracking-widest py-6">
          CALCULATING<span className="cursor" />
        </div>
      )}

      {error && (
        <div className="text-red-500 text-xs py-4">ERR: {error}</div>
      )}

      {!loading && !error && data && btc && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#1e1e1e]">
                <th className="px-3 py-2 text-left text-[10px] text-[#444] tracking-widest font-normal w-32">ASSET</th>
                {/* BTC absolute returns for reference */}
                <th className="px-3 py-2 text-center text-[10px] text-[#444] tracking-widest font-normal" colSpan={3}>
                  ASSET RETURN
                </th>
                <th className="w-px bg-[#1e1e1e]" />
                <th className="px-3 py-2 text-center text-[10px] text-[#f7931a] tracking-widest font-normal" colSpan={3}>
                  ΔBTC (OUTPERFORMANCE)
                </th>
              </tr>
              <tr className="border-b border-[#1e1e1e]">
                <th className="px-3 py-2 text-left text-[10px] text-[#333] font-normal"></th>
                <th className="px-3 py-2 text-center text-[10px] text-[#444] font-normal tracking-widest">24H</th>
                <th className="px-3 py-2 text-center text-[10px] text-[#444] font-normal tracking-widest">7D</th>
                <th className="px-3 py-2 text-center text-[10px] text-[#444] font-normal tracking-widest">30D</th>
                <th className="w-px bg-[#1e1e1e]" />
                <th className="px-3 py-2 text-center text-[10px] text-[#f7931a] font-normal tracking-widest">24H</th>
                <th className="px-3 py-2 text-center text-[10px] text-[#f7931a] font-normal tracking-widest">7D</th>
                <th className="px-3 py-2 text-center text-[10px] text-[#f7931a] font-normal tracking-widest">30D</th>
              </tr>
              {/* BTC baseline row */}
              <tr className="border-b border-[#2a2a2a] bg-[#111]">
                <td className="px-3 py-2 text-[10px] text-[#f7931a] tracking-widest font-bold">
                  ₿ BTC BASE
                </td>
                <ReturnCell value={btc.ret1d} />
                <ReturnCell value={btc.ret7d} />
                <ReturnCell value={btc.ret30d} />
                <td className="w-px bg-[#1e1e1e]" />
                <td className="px-3 py-2 text-center text-[10px] text-[#333]">—</td>
                <td className="px-3 py-2 text-center text-[10px] text-[#333]">—</td>
                <td className="px-3 py-2 text-center text-[10px] text-[#333]">—</td>
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <>
                  <tr key={`group-${group}`} className="border-t border-[#1a1a1a]">
                    <td colSpan={8} className="px-3 pt-3 pb-1 text-[9px] text-[#333] tracking-[0.2em] uppercase">
                      {group}
                    </td>
                  </tr>
                  {ASSET_MAP.filter(a => a.group === group).map(asset => {
                    const d = data[asset.key]
                    return (
                      <tr
                        key={asset.key}
                        className="border-b border-[#111] hover:bg-[#0f0f0f] transition-colors"
                      >
                        <td className="px-3 py-2">
                          <div className="text-[11px] text-[#888]">{asset.symbol}</div>
                          <div className="text-[10px] text-[#444]">{asset.name}</div>
                        </td>
                        <ReturnCell value={d?.ret1d} />
                        <ReturnCell value={d?.ret7d} />
                        <ReturnCell value={d?.ret30d} />
                        <td className="w-px bg-[#1a1a1a]" />
                        <DeltaCell value={d?.vs1d} />
                        <DeltaCell value={d?.vs7d} />
                        <DeltaCell value={d?.vs30d} />
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>

          <div className="mt-3 text-[10px] text-[#2a2a2a] tracking-widest">
            LAST UPDATE {lastUpdated?.toLocaleTimeString('en-US', { hour12: false })} · REFRESHES EVERY 5 MIN
          </div>
        </div>
      )}
    </div>
  )
}
