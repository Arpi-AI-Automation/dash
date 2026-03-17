'use client'
import { useEffect, useState, useCallback } from 'react'

const COINGECKO_IDS = [
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

function fmtPrice(price, sym) {
  if (price == null) return '—'
  if (sym?.includes('JPY')) return '¥' + price.toFixed(2)
  if (price >= 10000) return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (price >= 1000)  return '$' + price.toFixed(2)
  if (price >= 10)    return '$' + price.toFixed(2)
  if (price >= 1)     return '$' + price.toFixed(3)
  return '$' + price.toFixed(4)
}

function pct(v, decimals = 2) {
  if (v == null || isNaN(v)) return null
  return (v >= 0 ? '+' : '') + v.toFixed(decimals) + '%'
}

const UP   = '#26a69a'
const DOWN = '#ef5350'
const DIM  = '#444'

function PctBadge({ value, label }) {
  if (value == null) return null
  const up    = value >= 0
  const color = Math.abs(value) < 0.01 ? DIM : up ? UP : DOWN
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      {label && <div style={{ fontSize: 8, color: '#3a3a3a', letterSpacing: '0.05em', marginBottom: 1 }}>{label}</div>}
      <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color }}>
        {(up ? '+' : '') + value.toFixed(2) + '%'}
      </div>
    </div>
  )
}

function CryptoRow({ symbol, price, change24h, changeDailyClose }) {
  return (
    <div style={{ padding: '7px 0', borderBottom: '1px solid #181818' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#c8c8c8', fontFamily: 'monospace' }}>{symbol}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
          {fmtPrice(price)}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 2 }}>
        <PctBadge value={changeDailyClose} label="vs UTC close" />
        <PctBadge value={change24h} label="24h" />
      </div>
    </div>
  )
}

function MarketRow({ symbol, price, change24h, sym }) {
  const up    = (change24h ?? 0) >= 0
  const color = change24h == null || Math.abs(change24h) < 0.001 ? DIM : up ? UP : DOWN
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #181818' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#c8c8c8', fontFamily: 'monospace' }}>{symbol}</span>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
          {fmtPrice(price, sym)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color }}>
          {change24h != null ? (up ? '+' : '') + change24h.toFixed(2) + '%' : '—'}
        </div>
      </div>
    </div>
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

// Fetch UTC daily-close price from CoinGecko for each coin
// CoinGecko free: /coins/{id}/ohlc?vs_currency=usd&days=1 → array of [ts, o, h, l, c]
async function fetchDailyClosePrices(ids) {
  const results = {}
  await Promise.all(ids.map(async ({ id, symbol }) => {
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=1`)
      const data = await r.json()
      if (!Array.isArray(data) || data.length < 2) return
      // Last completed candle = second to last (current candle is still forming)
      const lastClose = data[data.length - 2]?.[4]
      if (lastClose) results[id] = lastClose
    } catch {}
  }))
  return results
}

export default function SidebarMarkets() {
  const [crypto,     setCrypto]     = useState({})
  const [dailyClose, setDailyClose] = useState({})
  const [markets,    setMarkets]    = useState({})
  const [updated,    setUpdated]    = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const ids = COINGECKO_IDS.map(c => c.id).join(',')
      const [cgRes, mktRes, closeMap] = await Promise.all([
        fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`),
        fetch('/api/markets'),
        fetchDailyClosePrices(COINGECKO_IDS),
      ])
      const cgData  = await cgRes.json()
      const mktData = await mktRes.json()
      setCrypto(cgData)
      setDailyClose(closeMap)
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

      <SectionLabel label="CRYPTO" />
      {COINGECKO_IDS.map(c => {
        const d        = crypto[c.id]
        const prevClose = dailyClose[c.id]
        const price    = d?.usd ?? null
        const changeDC = (price && prevClose) ? ((price - prevClose) / prevClose) * 100 : null
        return (
          <CryptoRow
            key={c.id}
            symbol={c.symbol}
            price={price}
            change24h={d?.usd_24h_change ?? null}
            changeDailyClose={changeDC}
          />
        )
      })}

      <SectionLabel label="FOREX" />
      {FOREX.map(sym => {
        const d = markets[sym]
        return (
          <MarketRow key={sym} symbol={sym.replace('/', '')} price={d?.price ?? null}
            change24h={d?.change24h ?? null} sym={sym} />
        )
      })}

      <SectionLabel label="EQUITIES" />
      {EQUITIES.map(sym => {
        const d = markets[sym]
        return (
          <MarketRow key={sym} symbol={sym} price={d?.price ?? null}
            change24h={d?.change24h ?? null} />
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
