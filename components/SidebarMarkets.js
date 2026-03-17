'use client'
import { useEffect, useState, useCallback } from 'react'

const COINGECKO_IDS = [
  { id: 'bitcoin',     symbol: 'BTC',  name: 'Bitcoin'     },
  { id: 'ethereum',    symbol: 'ETH',  name: 'Ethereum'    },
  { id: 'solana',      symbol: 'SOL',  name: 'Solana'      },
  { id: 'sui',         symbol: 'SUI',  name: 'Sui'         },
  { id: 'ripple',      symbol: 'XRP',  name: 'XRP'         },
  { id: 'hyperliquid', symbol: 'HYPE', name: 'Hyperliquid' },
  { id: 'pax-gold',    symbol: 'PAXG', name: 'PAX Gold'    },
]
const FOREX    = ['AUD/USD', 'AUD/JPY', 'EUR/JPY', 'GBP/JPY', 'USD/JPY']
const EQUITIES = ['SPY', 'QQQ']

function fmtPrice(price, sym) {
  if (price == null) return '—'
  if (sym?.includes('JPY')) return '¥' + price.toFixed(2)
  if (price >= 10000) return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (price >= 100)   return '$' + price.toFixed(2)
  if (price >= 1)     return '$' + price.toFixed(3)
  return '$' + price.toFixed(4)
}

function Row({ symbol, price, change, sym }) {
  const up   = (change ?? 0) >= 0
  const zero = Math.abs(change ?? 0) < 0.001
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 0', borderBottom: '1px solid #1a1a1a'
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#c8c8c8', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
        {symbol}
      </span>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
          {fmtPrice(price, sym)}
        </div>
        <div style={{
          fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
          color: zero ? '#555' : up ? '#26a69a' : '#ef5350'
        }}>
          {zero ? '—' : (up ? '+' : '') + (change ?? 0).toFixed(2) + '%'}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ label }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
      color: '#555', padding: '10px 0 4px', textTransform: 'uppercase'
    }}>
      {label}
    </div>
  )
}

export default function SidebarMarkets() {
  const [crypto,  setCrypto]  = useState({})
  const [markets, setMarkets] = useState({})
  const [updated, setUpdated] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const ids = COINGECKO_IDS.map(c => c.id).join(',')
      const [cgRes, mktRes] = await Promise.all([
        fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`, { cache: 'no-store' }),
        fetch('/api/markets', { cache: 'no-store' }),
      ])
      const cgData  = await cgRes.json()
      const mktData = await mktRes.json()
      setCrypto(cgData)
      if (mktData.ok) setMarkets(mktData.data)
      setUpdated(new Date())
    } catch {}
  }, [])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 60000)
    return () => clearInterval(iv)
  }, [fetchData])

  return (
    <div style={{ padding: '8px 4px 40px' }}>

      {/* CRYPTO */}
      <SectionLabel label="Crypto" />
      {COINGECKO_IDS.map(c => {
        const d = crypto[c.id]
        return (
          <Row
            key={c.id}
            symbol={c.symbol}
            price={d?.usd ?? null}
            change={d?.usd_24h_change ?? null}
          />
        )
      })}

      {/* FOREX */}
      <SectionLabel label="Forex" />
      {FOREX.map(sym => {
        const d = markets[sym]
        return (
          <Row
            key={sym}
            symbol={sym.replace('/', '')}
            price={d?.price ?? null}
            change={d?.change24h ?? null}
            sym={sym}
          />
        )
      })}

      {/* EQUITIES */}
      <SectionLabel label="Equities" />
      {EQUITIES.map(sym => {
        const d = markets[sym]
        return (
          <Row
            key={sym}
            symbol={sym}
            price={d?.price ?? null}
            change={d?.change24h ?? null}
          />
        )
      })}

      {updated && (
        <div style={{ fontSize: 9, color: '#333', marginTop: 12, fontFamily: 'monospace' }}>
          {updated.toLocaleTimeString('en-US', { hour12: false })}
        </div>
      )}
    </div>
  )
}
