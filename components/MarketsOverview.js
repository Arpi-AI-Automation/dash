'use client'
import { useEffect, useState, useCallback } from 'react'
import AssetCard from './AssetCard'
import SectionHeader from './SectionHeader'

const COINGECKO_IDS = [
  'bitcoin', 'ethereum', 'solana', 'sui', 'ripple',
  'monero', 'binancecoin', 'aave', 'dogecoin', 'pax-gold', 'hyperliquid'
]

const CRYPTO_META = {
  bitcoin:     { name: 'Bitcoin',     symbol: 'BTC' },
  ethereum:    { name: 'Ethereum',    symbol: 'ETH' },
  solana:      { name: 'Solana',      symbol: 'SOL' },
  sui:         { name: 'Sui',         symbol: 'SUI' },
  ripple:      { name: 'XRP',         symbol: 'XRP' },
  monero:      { name: 'Monero',      symbol: 'XMR' },
  binancecoin: { name: 'BNB',         symbol: 'BNB' },
  aave:        { name: 'Aave',        symbol: 'AAVE' },
  dogecoin:    { name: 'Dogecoin',    symbol: 'DOGE' },
  'pax-gold':  { name: 'PAX Gold',    symbol: 'PAXG' },
  hyperliquid: { name: 'Hyperliquid', symbol: 'HYPE' },
}

const MARKETS_META = {
  'SPY':     { name: 'S&P 500',   symbol: 'SPY',     group: 'stocks' },
  'QQQ':     { name: 'Nasdaq',    symbol: 'QQQ',     group: 'stocks' },
  'AUD/USD': { name: 'AUD/USD',   symbol: 'AUD/USD', group: 'forex' },
  'AUD/JPY': { name: 'AUD/JPY',   symbol: 'AUD/JPY', group: 'forex' },
  'EUR/JPY': { name: 'EUR/JPY',   symbol: 'EUR/JPY', group: 'forex' },
}

export default function MarketsOverview() {
  const [crypto, setCrypto]     = useState({})
  const [markets, setMarkets]   = useState({})
  const [audRate, setAudRate]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError]       = useState(null)

  const fetchAll = useCallback(async () => {
    try {
      // Parallel fetch — CoinGecko + our Yahoo proxy
      const [cgRes, mktRes] = await Promise.all([
        fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS.join(',')}&vs_currencies=usd&include_24hr_change=true`,
          { cache: 'no-store' }
        ),
        fetch('/api/markets', { cache: 'no-store' }),
      ])

      const cgData  = await cgRes.json()
      const mktData = await mktRes.json()

      setCrypto(cgData)
      if (mktData.ok) {
        setMarkets(mktData.data)
        // AUD/USD rate for conversion
        const audUsd = mktData.data['AUD/USD']?.price
        if (audUsd) setAudRate(audUsd)
      }

      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 60000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const cryptoCards = COINGECKO_IDS.map(id => {
    const meta = CRYPTO_META[id]
    const d    = crypto[id]
    return {
      ...meta,
      price:     d?.usd ?? null,
      change24h: d?.usd_24h_change ?? null,
      currency:  'USD',
    }
  })

  const stockCards = Object.entries(MARKETS_META).filter(([,m]) => m.group === 'stocks').map(([k, m]) => ({ ...m, key: k, ...markets[k] }))
  const forexCards = Object.entries(MARKETS_META).filter(([,m]) => m.group === 'forex').map(([k, m]) => ({ ...m, key: k, ...markets[k] }))

  if (loading) {
    return (
      <div className="text-[#555] text-xs tracking-widest py-12">
        LOADING MARKETS<span className="cursor" />
      </div>
    )
  }

  if (error) {
    return <div className="text-red-500 text-xs tracking-widest py-4">ERR: {error}</div>
  }

  return (
    <div className="space-y-10 fade-in">

      {/* CRYPTO */}
      <section>
        <SectionHeader label="Crypto" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {cryptoCards.map(c => (
            <AssetCard key={c.symbol} {...c} audRate={audRate} />
          ))}
        </div>
      </section>

      {/* STOCKS */}
      <section>
        <SectionHeader label="Equities" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {stockCards.map(c => (
            <AssetCard key={c.key} name={c.name} symbol={c.symbol} price={c.price} change24h={c.change24h} currency="USD" audRate={audRate} />
          ))}
        </div>
      </section>

      {/* FOREX */}
      <section>
        <SectionHeader label="Forex" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {forexCards.map(c => {
            const isJPY = c.symbol.includes('JPY')
            return (
              <AssetCard key={c.key} name={c.name} symbol={c.symbol} price={c.price} change24h={c.change24h} currency={isJPY ? 'JPY' : 'USD'} audRate={null} />
            )
          })}
        </div>
      </section>

      <div className="text-[10px] text-[#333] tracking-widest pt-2">
        LAST UPDATE {lastUpdated?.toLocaleTimeString('en-US', { hour12: false })}
        {' · '}CRYPTO VIA COINGECKO · MARKETS VIA STOOQ/FRANKFURTER · REFRESHES 60S
      </div>
    </div>
  )
}
