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

const UP   = '#22c55e'
const DOWN = '#ef4444'
const DIM  = '#444'

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

function ChgValue({ value }) {
  if (value == null) return <span style={{ fontSize: 20, fontWeight: 800, color: DIM, fontFamily: 'monospace' }}>—</span>
  const color = chgColor(value)
  return (
    <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color }}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

function Spark({ data, color }) {
  if (!data || data.length < 2) return <div style={{ width: 72, height: 24 }} />
  const W = 72, H = 24
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function SectionLabel({ label }) {
  return (
    <div style={{
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.2em',
      color: '#3a3a3a',
      padding: '18px 0 8px',
      borderBottom: '1px solid #1a1a1a',
      marginBottom: 2,
      textTransform: 'uppercase',
    }}>
      {label}
    </div>
  )
}

// Card-style row matching the new format from screenshot
function PriceCard({ symbol, price, leftLabel, leftValue, rightLabel, rightValue, sym }) {
  return (
    <div style={{
      padding: '10px 0',
      borderBottom: '1px solid #141414',
    }}>
      {/* Row 1: symbol (left) + price (right, large) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{
          fontSize: 13,
          fontWeight: 800,
          color: '#e5e5e5',
          fontFamily: 'monospace',
          letterSpacing: '0.06em',
        }}>
          {symbol}
        </span>
        <span style={{
          fontSize: 18,
          fontWeight: 800,
          color: '#ffffff',
          fontFamily: 'monospace',
          letterSpacing: '-0.01em',
        }}>
          {fmtPrice(price, sym)}
        </span>
      </div>

      {/* Row 2: two delta blocks side by side */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        {/* Left delta */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <span style={{ fontSize: 9, color: '#555', letterSpacing: '0.05em', textTransform: 'lowercase' }}>
            {leftLabel}
          </span>
          <ChgValue value={leftValue} />
        </div>
        {/* Right delta */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ fontSize: 9, color: '#555', letterSpacing: '0.05em', textTransform: 'lowercase' }}>
            {rightLabel}
          </span>
          <ChgValue value={rightValue} />
        </div>
      </div>
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
    <div style={{ padding: '8px 6px 60px', background: '#0a0a0a', minHeight: '100%' }}>

      {/* ── CRYPTO ── */}
      <SectionLabel label="Crypto" />
      {CRYPTO.map(c => {
        const d = crypto[c.id] ?? {}
        return (
          <PriceCard
            key={c.id}
            symbol={c.symbol}
            price={d.price}
            leftLabel="last 24h"
            leftValue={d.change24h}
            rightLabel="today"
            rightValue={d.changeDailyClose}
          />
        )
      })}

      {/* ── FOREX ── */}
      <SectionLabel label="Forex" />
      {FOREX.map(sym => {
        const d = markets[sym] ?? {}
        const spark = d.spark7d
        const chg7d = (spark?.length >= 2) ? ((d.price - spark[0]) / spark[0]) * 100 : null
        const sparkColor = chg7d == null ? DIM : chg7d >= 0 ? UP : DOWN
        return (
          <div key={sym} style={{ padding: '10px 0', borderBottom: '1px solid #141414' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#e5e5e5', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
                {sym.replace('/', '')}
              </span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', fontFamily: 'monospace' }}>
                {fmtPrice(d.price, sym)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Spark data={spark} color={sparkColor} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <span style={{ fontSize: 9, color: '#555', letterSpacing: '0.05em' }}>7d</span>
                <ChgValue value={chg7d} />
              </div>
            </div>
          </div>
        )
      })}

      {/* ── EQUITIES ── */}
      <SectionLabel label="Equities" />
      {EQUITIES.map(sym => {
        const d = markets[sym] ?? {}
        const spark = d.spark7d
        const chg7d = (spark?.length >= 2) ? ((d.price - spark[0]) / spark[0]) * 100 : null
        const sparkColor = chg7d == null ? DIM : chg7d >= 0 ? UP : DOWN
        return (
          <div key={sym} style={{ padding: '10px 0', borderBottom: '1px solid #141414' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#e5e5e5', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
                {sym}
              </span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', fontFamily: 'monospace' }}>
                {fmtPrice(d.price)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Spark data={spark} color={sparkColor} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <span style={{ fontSize: 9, color: '#555', letterSpacing: '0.05em' }}>7d</span>
                <ChgValue value={chg7d} />
              </div>
            </div>
          </div>
        )
      })}

      {updated && (
        <div style={{ fontSize: 9, color: '#222', marginTop: 16, fontFamily: 'monospace', textAlign: 'right' }}>
          {updated.toLocaleTimeString('en-US', { hour12: false })}
        </div>
      )}
    </div>
  )
}
