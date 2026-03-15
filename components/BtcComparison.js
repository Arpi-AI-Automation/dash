'use client'
import { useEffect, useState, useCallback } from 'react'
import SectionHeader from './SectionHeader'

const ASSET_MAP = [
  { key: 'ethereum',    name: 'Ethereum',    symbol: 'ETH',     group: 'Crypto' },
  { key: 'solana',      name: 'Solana',      symbol: 'SOL',     group: 'Crypto' },
  { key: 'sui',         name: 'Sui',         symbol: 'SUI',     group: 'Crypto' },
  { key: 'ripple',      name: 'XRP',         symbol: 'XRP',     group: 'Crypto' },
  { key: 'monero',      name: 'Monero',      symbol: 'XMR',     group: 'Crypto' },
  { key: 'binancecoin', name: 'BNB',         symbol: 'BNB',     group: 'Crypto' },
  { key: 'aave',        name: 'Aave',        symbol: 'AAVE',    group: 'Crypto' },
  { key: 'dogecoin',    name: 'Dogecoin',    symbol: 'DOGE',    group: 'Crypto' },
  { key: 'pax-gold',    name: 'PAX Gold',    symbol: 'PAXG',    group: 'Crypto' },
  { key: 'hyperliquid', name: 'Hyperliquid', symbol: 'HYPE',    group: 'Crypto' },
  { key: 'SPY',         name: 'S&P 500',     symbol: 'SPY',     group: 'Equities' },
  { key: 'QQQ',         name: 'Nasdaq',      symbol: 'QQQ',     group: 'Equities' },
  { key: 'AUD/USD',     name: 'AUD/USD',     symbol: 'AUD/USD', group: 'Forex' },
  { key: 'AUD/JPY',     name: 'AUD/JPY',     symbol: 'AUD/JPY', group: 'Forex' },
  { key: 'EUR/JPY',     name: 'EUR/JPY',     symbol: 'EUR/JPY', group: 'Forex' },
]

function fmt(v) {
  if (v == null) return null
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%'
}

function colorClass(v, neutral = false) {
  if (v == null) return 'text-[#3a3a3a]'
  if (neutral) return 'text-[#888]'
  if (v > 0.05)  return 'text-emerald-400'
  if (v < -0.05) return 'text-red-400'
  return 'text-[#888]'
}

// Desktop row
function AssetRow({ asset, d, btc }) {
  return (
    <tr className="border-b border-[#111] hover:bg-[#0d0d0d] transition-colors">
      <td className="px-4 py-3 w-36">
        <div className="text-sm font-semibold text-[#ccc] tracking-wide">{asset.symbol}</div>
        <div className="text-xs text-[#555] mt-0.5">{asset.name}</div>
      </td>
      {/* Asset returns — coloured green/red */}
      {[d?.ret1d, d?.ret7d, d?.ret30d].map((v, i) => (
        <td key={i} className={`px-4 py-3 text-center text-sm font-mono tabular-nums ${colorClass(v)}`}>
          {fmt(v) ?? '—'}
        </td>
      ))}
      <td className="w-px bg-[#1a1a1a]" />
      {/* Delta vs BTC */}
      {[d?.vs1d, d?.vs7d, d?.vs30d].map((v, i) => (
        <td key={i} className={`px-4 py-3 text-center text-sm font-mono tabular-nums ${colorClass(v)}`}>
          {fmt(v) ?? '—'}
        </td>
      ))}
    </tr>
  )
}

// Mobile card — stacks nicely, one per asset
function AssetCard({ asset, d }) {
  const periods = [
    { label: '24H', ret: d?.ret1d, vs: d?.vs1d },
    { label: '7D',  ret: d?.ret7d, vs: d?.vs7d },
    { label: '30D', ret: d?.ret30d, vs: d?.vs30d },
  ]
  return (
    <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded p-3 mb-2">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-base font-semibold text-[#ccc]">{asset.symbol}</span>
        <span className="text-xs text-[#555]">{asset.name}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {periods.map(({ label, ret, vs }) => (
          <div key={label} className="text-center">
            <div className="text-[10px] text-[#444] tracking-widest mb-1">{label}</div>
            <div className={`text-sm font-mono tabular-nums ${colorClass(ret)}`}>
              {fmt(ret) ?? '—'}
            </div>
            <div className={`text-xs font-mono tabular-nums mt-0.5 ${colorClass(vs)}`}>
              {fmt(vs) ? `Δ${fmt(vs)}` : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
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
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData])

  const groups = [...new Set(ASSET_MAP.map(a => a.group))]

  return (
    <div className="mt-10">
      <SectionHeader label="vs BTC" />
      <div className="text-[10px] text-[#444] tracking-wider mb-4">
        DELTA = ASSET RETURN − BTC RETURN · GREEN = BEAT BTC · RED = LOST TO BTC
      </div>

      {loading && (
        <div className="text-[#555] text-xs tracking-widest py-6">CALCULATING<span className="cursor" /></div>
      )}
      {error && <div className="text-red-500 text-xs py-4">ERR: {error}</div>}

      {!loading && !error && data && btc && (<>

        {/* ── DESKTOP TABLE (md+) ── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#1e1e1e]">
                <th className="px-4 py-2 text-left text-[10px] text-[#444] tracking-widest font-normal w-36">ASSET</th>
                <th className="px-4 py-2 text-center text-[10px] text-[#666] tracking-widest font-normal" colSpan={3}>ASSET RETURN</th>
                <th className="w-px bg-[#1e1e1e]" />
                <th className="px-4 py-2 text-center text-[10px] text-[#f7931a] tracking-widest font-normal" colSpan={3}>ΔBTC OUTPERFORMANCE</th>
              </tr>
              <tr className="border-b border-[#1e1e1e]">
                <th className="px-4 py-2" />
                {['24H','7D','30D'].map(h => (
                  <th key={h} className="px-4 py-2 text-center text-[10px] text-[#555] font-normal tracking-widest">{h}</th>
                ))}
                <th className="w-px bg-[#1e1e1e]" />
                {['24H','7D','30D'].map(h => (
                  <th key={h} className="px-4 py-2 text-center text-[10px] text-[#f7931a] font-normal tracking-widest">{h}</th>
                ))}
              </tr>
              {/* BTC baseline */}
              <tr className="border-b border-[#222] bg-[#0f0f0f]">
                <td className="px-4 py-3 text-sm text-[#f7931a] font-bold tracking-wider">₿ BTC BASE</td>
                {[btc.ret1d, btc.ret7d, btc.ret30d].map((v, i) => (
                  <td key={i} className={`px-4 py-3 text-center text-sm font-mono tabular-nums ${colorClass(v)}`}>
                    {fmt(v) ?? '—'}
                  </td>
                ))}
                <td className="w-px bg-[#1a1a1a]" />
                <td colSpan={3} className="px-4 py-3 text-center text-[#333] text-xs">— — —</td>
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <>
                  <tr key={`g-${group}`}>
                    <td colSpan={8} className="px-4 pt-4 pb-1 text-[10px] text-[#444] tracking-[0.2em] uppercase">{group}</td>
                  </tr>
                  {ASSET_MAP.filter(a => a.group === group).map(asset => (
                    <AssetRow key={asset.key} asset={asset} d={data[asset.key]} btc={btc} />
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── MOBILE CARDS (< md) ── */}
        <div className="md:hidden">
          {/* BTC baseline card */}
          <div className="bg-[#0f0f0f] border border-[#f7931a22] rounded p-3 mb-4">
            <div className="text-sm font-bold text-[#f7931a] mb-3">₿ BTC BASE</div>
            <div className="grid grid-cols-3 gap-2">
              {[{l:'24H',v:btc.ret1d},{l:'7D',v:btc.ret7d},{l:'30D',v:btc.ret30d}].map(({l,v}) => (
                <div key={l} className="text-center">
                  <div className="text-[10px] text-[#444] tracking-widest mb-1">{l}</div>
                  <div className={`text-sm font-mono tabular-nums ${colorClass(v)}`}>{fmt(v) ?? '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {groups.map(group => (
            <div key={group} className="mb-4">
              <div className="text-[10px] text-[#444] tracking-[0.2em] uppercase mb-2">{group}</div>
              {ASSET_MAP.filter(a => a.group === group).map(asset => (
                <AssetCard key={asset.key} asset={asset} d={data[asset.key]} />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-4 text-[10px] text-[#2a2a2a] tracking-widest">
          LAST UPDATE {lastUpdated?.toLocaleTimeString('en-US', { hour12: false })} · REFRESHES EVERY 5 MIN
        </div>
      </>)}
    </div>
  )
}
