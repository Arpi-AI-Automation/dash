'use client'
import { useEffect, useState, useCallback } from 'react'

const CRYPTO = [
  { id: 'bitcoin',     symbol: 'BTC'  },
  { id: 'ethereum',    symbol: 'ETH'  },
  { id: 'solana',      symbol: 'SOL'  },
  { id: 'sui',         symbol: 'SUI'  },
  { id: 'ripple',      symbol: 'XRP'  },
  { id: 'hyperliquid', symbol: 'HYPE' },
  { id: 'pax-gold',    symbol: 'PAXG' },
]
const FOREX    = ['AUD/USD', 'AUD/JPY', 'EUR/JPY', 'GBP/JPY', 'USD/JPY']
const EQUITIES = ['SPY', 'QQQ']

const UP   = '#26a69a'
const DOWN = '#ef5350'
const DIM  = '#555'

function fmtPrice(price, sym) {
  if (price == null) return '—'
  if (sym?.includes('JPY')) return '¥' + price.toFixed(2)
  if (price >= 10000) return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (price >= 1000)  return '$' + price.toFixed(2)
  if (price >= 10)    return '$' + price.toFixed(2)
  if (price >= 1)     return '$' + price.toFixed(3)
  return '$' + price.toFixed(4)
}

function chgColor(v) {
  if (v == null || Math.abs(v) < 0.001) return DIM
  return v >= 0 ? UP : DOWN
}

function ChgBadge({ value, tiny }) {
  if (value == null) return <span style={{ fontSize: tiny ? 9 : 11, color: DIM }}>—</span>
  const color = chgColor(value)
  return (
    <span style={{ fontSize: tiny ? 9 : 11, fontWeight: 600, fontFamily: 'monospace', color }}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

function SectionLabel({ label }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: '#555',
      padding: '12px 0 4px', borderBottom: '1px solid #161616', marginBottom: 2 }}>
      {label}
    </div>
  )
}

export default function SidebarMarkets() {
  const [crypto,  setCrypto]  = useState({})
  const [markets, setMarkets] = useState({})
  const [updated, setUpdated] = useState(null)

  const fetchData = useCallback(async (retry = 0) => {
    try {
      const [cgRes, mktRes] = await Promise.all([
        fetch('/api/crypto-prices'),
        fetch('/api/markets'),
      ])
      const cgData  = await cgRes.json()
      const mktData = await mktRes.json()
      if (cgData.ok)  setCrypto(cgData.data)
      if (mktData.ok) setMarkets(mktData.data)
      setUpdated(new Date())
    } catch {
      if (retry < 2) setTimeout(() => fetchData(retry + 1), 3000)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 60000)
    return () => clearInterval(iv)
  }, [fetchData])

  return (
    <div style={{ padding: '8px 4px 40px' }}>

      {/* CRYPTO */}
      <SectionLabel label="CRYPTO" />
      {CRYPTO.map(c => {
        const d = crypto[c.id] ?? {}
        return (
          <div key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid #181818' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#c8c8c8', fontFamily: 'monospace' }}>
                {c.symbol}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
                {fmtPrice(d.price)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 1 }}>
              <ChgBadge value={d.change24h} tiny />
            </div>
          </div>
        )
      })}

      {/* FOREX */}
      <SectionLabel label="FOREX" />
      {FOREX.map(sym => {
        const d = markets[sym] ?? {}
        return (
          <div key={sym} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #181818' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#c8c8c8', fontFamily: 'monospace' }}>
              {sym.replace('/', '')}
            </span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
                {fmtPrice(d.price, sym)}
              </div>
              <ChgBadge value={d.change24h} />
            </div>
          </div>
        )
      })}

      {/* EQUITIES */}
      <SectionLabel label="EQUITIES" />
      {EQUITIES.map(sym => {
        const d = markets[sym] ?? {}
        return (
          <div key={sym} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #181818' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#c8c8c8', fontFamily: 'monospace' }}>
              {sym}
            </span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
                {fmtPrice(d.price)}
              </div>
              <ChgBadge value={d.change24h} />
            </div>
          </div>
        )
      })}

      {updated && (
        <div style={{ fontSize: 9, color: '#2a2a2a', marginTop: 12, fontFamily: 'monospace' }}>
          {updated.toLocaleTimeString('en-US', { hour12: false })}
        </div>
      )}
    </div>
  )
}
