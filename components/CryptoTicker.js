'use client'
import { useEffect, useState } from 'react'

const COINS = [
  { id: 'bitcoin',     symbol: 'BTC'  },
  { id: 'ethereum',    symbol: 'ETH'  },
  { id: 'solana',      symbol: 'SOL'  },
  { id: 'sui',         symbol: 'SUI'  },
  { id: 'ripple',      symbol: 'XRP'  },
  { id: 'binancecoin', symbol: 'BNB'  },
  { id: 'aave',        symbol: 'AAVE' },
  { id: 'dogecoin',    symbol: 'DOGE' },
  { id: 'hyperliquid', symbol: 'HYPE' },
  { id: 'pax-gold',    symbol: 'PAXG' },
  { id: 'monero',      symbol: 'XMR'  },
]

function fmt(price) {
  if (price >= 1000)  return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (price >= 1)     return '$' + price.toFixed(2)
  return '$' + price.toFixed(4)
}

export default function CryptoTicker() {
  const [prices, setPrices] = useState({})

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const ids = COINS.map(c => c.id).join(',')
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`, { cache: 'no-store' })
        setPrices(await r.json())
      } catch {}
    }
    fetch_()
    const iv = setInterval(fetch_, 60000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div style={{ width: '100%', background: '#060606', borderBottom: '1px solid #111', display: 'flex', alignItems: 'center', height: '36px', overflow: 'hidden', padding: '0 16px', gap: 0 }}>
      {COINS.map((coin, i) => {
        const d = prices[coin.id]
        const change = d?.usd_24h_change ?? 0
        const up = change >= 0
        return (
          <div key={coin.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', borderRight: '1px solid #111', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: '#444' }}>{coin.symbol}</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#d0d0d0' }}>{d ? fmt(d.usd) : '—'}</span>
            <span style={{ fontSize: '10px', fontWeight: 600, color: up ? '#22c55e' : '#ef4444' }}>
              {d ? (up ? '+' : '') + change.toFixed(2) + '%' : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
