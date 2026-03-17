'use client'

import { useEffect, useState } from 'react'

const COINS = [
  { id: 'bitcoin',       symbol: 'BTC' },
  { id: 'ethereum',      symbol: 'ETH' },
  { id: 'solana',        symbol: 'SOL' },
  { id: 'sui',           symbol: 'SUI' },
  { id: 'ripple',        symbol: 'XRP' },
  { id: 'binancecoin',   symbol: 'BNB' },
  { id: 'aave',          symbol: 'AAVE' },
  { id: 'dogecoin',      symbol: 'DOGE' },
  { id: 'hyperliquid',   symbol: 'HYPE' },
  { id: 'pax-gold',      symbol: 'PAXG' },
  { id: 'monero',        symbol: 'XMR' },
]

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 0 })
  if (n >= 1)    return n.toFixed(2)
  return n.toFixed(4)
}

function pct(n) {
  if (n == null) return ''
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export default function CryptoTicker() {
  const [prices, setPrices] = useState({})

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const ids = COINS.map(c => c.id).join(',')
        const res = await fetch(`/api/crypto-prices?ids=${ids}`)
        const data = await res.json()
        setPrices(data)
      } catch {}
    }
    fetchPrices()
    const iv = setInterval(fetchPrices, 30_000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div style={{
      display: 'flex', gap: '24px', padding: '8px 16px',
      borderBottom: '1px solid #111', overflowX: 'auto',
      background: '#050505', flexShrink: 0,
    }}>
      {COINS.map(coin => {
        const d = prices[coin.id]
        const change = d?.usd_24h_change
        const color = change == null ? '#666' : change >= 0 ? '#26a69a' : '#ef5350'
        return (
          <div key={coin.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace' }}>{coin.symbol}</span>
            <span style={{ fontSize: 12, color: '#ccc', fontFamily: 'monospace', fontWeight: 600 }}>
              ${fmt(d?.usd)}
            </span>
            <span style={{ fontSize: 10, color, fontFamily: 'monospace' }}>
              {pct(change)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
