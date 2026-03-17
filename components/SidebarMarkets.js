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

function Chg({ value, size = 11 }) {
  if (value == null) return <span style={{ fontSize: size, color: DIM }}>—</span>
  return (
    <span style={{ fontSize: size, fontWeight: 700, fontFamily: 'monospace', color: chgColor(value) }}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

// Inline SVG sparkline
function Spark({ data, color }) {
  if (!data || data.length < 2) return null
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
      fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: '#555',
      padding: '14px 0 5px', borderBottom: '1px solid #161616', marginBottom: 4
    }}>
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
    <div style={{ padding: '8px 4px 60px' }}>

      {/* ── CRYPTO ── */}
      <SectionLabel label="CRYPTO" />
      {CRYPTO.map(c => {
        const d = crypto[c.id] ?? {}
        const sparkColor = d.change24h >= 0 ? UP : DOWN
        return (
          <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #181818' }}>
            {/* Row 1: symbol + price */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#888', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                {c.symbol}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
                {fmtPrice(d.price)}
              </span>
            </div>
            {/* Row 2: two deltas */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 3 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 8, color: '#3a3a3a', letterSpacing: '0.04em', marginBottom: 1 }}>today</span>
                <Chg value={d.changeDailyClose} size={11} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 8, color: '#3a3a3a', letterSpacing: '0.04em', marginBottom: 1 }}>24h</span>
                <Chg value={d.change24h} size={11} />
              </div>
            </div>
          </div>
        )
      })}

      {/* ── FOREX ── */}
      <SectionLabel label="FOREX" />
      {FOREX.map(sym => {
        const d = markets[sym] ?? {}
        const spark = d.spark7d
        const chg7d = (spark?.length >= 2) ? ((d.price - spark[0]) / spark[0]) * 100 : null
        const sparkColor = chg7d == null ? DIM : chg7d >= 0 ? UP : DOWN
        return (
          <div key={sym} style={{ padding: '8px 0', borderBottom: '1px solid #181818' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#888', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                {sym.replace('/', '')}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
                {fmtPrice(d.price, sym)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Spark data={spark} color={sparkColor} />
              <Chg value={chg7d} size={11} />
            </div>
          </div>
        )
      })}

      {/* ── EQUITIES ── */}
      <SectionLabel label="EQUITIES" />
      {EQUITIES.map(sym => {
        const d = markets[sym] ?? {}
        const spark = d.spark7d
        const chg7d = (spark?.length >= 2) ? ((d.price - spark[0]) / spark[0]) * 100 : null
        const sparkColor = chg7d == null ? DIM : chg7d >= 0 ? UP : DOWN
        return (
          <div key={sym} style={{ padding: '8px 0', borderBottom: '1px solid #181818' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#888', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                {sym}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
                {fmtPrice(d.price)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Spark data={spark} color={sparkColor} />
              <Chg value={chg7d} size={11} />
            </div>
          </div>
        )
      })}

      {updated && (
        <div style={{ fontSize: 9, color: '#2a2a2a', marginTop: 14, fontFamily: 'monospace' }}>
          {updated.toLocaleTimeString('en-US', { hour12: false })}
        </div>
      )}
    </div>
  )
}
