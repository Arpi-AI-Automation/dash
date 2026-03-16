'use client'
import { useEffect, useState, useRef } from 'react'

const COINS = [
  { id: 'bitcoin',     symbol: 'BTC',  name: 'Bitcoin'     },
  { id: 'ethereum',    symbol: 'ETH',  name: 'Ethereum'    },
  { id: 'solana',      symbol: 'SOL',  name: 'Solana'      },
  { id: 'sui',         symbol: 'SUI',  name: 'Sui'         },
  { id: 'ripple',      symbol: 'XRP',  name: 'XRP'         },
  { id: 'binancecoin', symbol: 'BNB',  name: 'BNB'         },
  { id: 'aave',        symbol: 'AAVE', name: 'Aave'        },
  { id: 'dogecoin',    symbol: 'DOGE', name: 'Dogecoin'    },
  { id: 'hyperliquid', symbol: 'HYPE', name: 'Hyperliquid' },
  { id: 'pax-gold',    symbol: 'PAXG', name: 'PAX Gold'    },
  { id: 'monero',      symbol: 'XMR',  name: 'Monero'      },
]

function TickerItem({ symbol, price, change }) {
  const up = change >= 0
  return (
    <span className="inline-flex items-center gap-2 px-5 border-r border-[#111] whitespace-nowrap">
      <span className="text-[10px] font-bold tracking-widest text-[#666]">{symbol}</span>
      <span className="text-[11px] font-bold text-[#e8e8e8]">
        ${price < 1 ? price.toFixed(4) : price < 100 ? price.toFixed(2) : price.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </span>
      <span className="text-[10px] font-bold" style={{ color: up ? '#22c55e' : '#ef4444' }}>
        {up ? '+' : ''}{change.toFixed(2)}%
      </span>
    </span>
  )
}

export default function CryptoTicker() {
  const [prices, setPrices]   = useState({})
  const [loading, setLoading] = useState(true)
  const trackRef = useRef(null)

  const fetchPrices = async () => {
    try {
      const ids = COINS.map(c => c.id).join(',')
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
        { cache: 'no-store' }
      )
      const data = await res.json()
      setPrices(data)
      setLoading(false)
    } catch {}
  }

  useEffect(() => {
    fetchPrices()
    const iv = setInterval(fetchPrices, 60000)
    return () => clearInterval(iv)
  }, [])

  const items = COINS.filter(c => prices[c.id]).map(c => ({
    ...c,
    price:  prices[c.id]?.usd ?? 0,
    change: prices[c.id]?.usd_24h_change ?? 0,
  }))

  // Duplicate for seamless loop
  const display = [...items, ...items]

  return (
    <div className="w-full bg-[#060606] border-b border-[#111] overflow-hidden relative h-9 flex items-center">
      {/* fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to right, #060606, transparent)' }} />
      <div className="absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to left, #060606, transparent)' }} />

      {loading ? (
        <div className="text-[10px] text-[#333] tracking-widest px-5">LOADING MARKETS...</div>
      ) : (
        <div className="ticker-track flex" ref={trackRef}>
          {display.map((coin, i) => (
            <TickerItem key={`${coin.id}-${i}`} symbol={coin.symbol} price={coin.price} change={coin.change} />
          ))}
        </div>
      )}

      <style>{`
        .ticker-track {
          animation: ticker-scroll 60s linear infinite;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
