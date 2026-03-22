'use client'
import { useEffect, useState, useCallback } from 'react'

// ── Bybit fetched client-side (browser → Bybit directly)
// Server-side route blocked by Bybit's IP filter on Vercel's Portland servers.
// Same pattern as FundingRate.js, OIScatter.js, FearGreed.js.

const SYMBOLS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','SUIUSDT','XRPUSDT',
  'XMRUSDT','BNBUSDT','AAVEUSDT','DOGEUSDT','HYPEUSDT',
]

function getZone(rate) {
  const pct = rate * 100
  if (pct >  0.10) return { label: 'DANGER',  color: '#dc2626', bg: 'rgba(220,38,38,.08)',   border: 'rgba(220,38,38,.2)',   desc: 'Overleveraged longs' }
  if (pct >  0.05) return { label: 'HOT',     color: '#f97316', bg: 'rgba(249,115,22,.08)',  border: 'rgba(249,115,22,.2)',  desc: 'Longs dominant' }
  if (pct < -0.05) return { label: 'SQUEEZE', color: '#059669', bg: 'rgba(16,185,129,.08)',  border: 'rgba(16,185,129,.2)',  desc: 'Short squeeze risk' }
  if (pct < -0.01) return { label: 'BEARISH', color: '#3b82f6', bg: 'rgba(59,130,246,.08)',  border: 'rgba(59,130,246,.2)',  desc: 'Shorts dominant' }
  return                   { label: 'NEUTRAL', color: '#6b7280', bg: 'transparent',            border: '#e5e7eb',              desc: 'Balanced' }
}

const LBL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

function Countdown({ nextFundingTime }) {
  const [remaining, setRemaining] = useState('')
  useEffect(() => {
    const update = () => {
      const diff = nextFundingTime - Date.now()
      if (diff <= 0) { setRemaining('00:00:00'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [nextFundingTime])
  return <span style={{ fontSize: 10, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{remaining}</span>
}

function FundingCard({ symbol, fundingRate, nextFundingTime, markPrice }) {
  const pct  = fundingRate * 100
  const zone = getZone(fundingRate)
  const sign = pct >= 0 ? '+' : ''
  return (
    <div style={{
      background: zone.bg,
      border: `1px solid ${zone.border}`,
      borderRadius: 10,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{symbol}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: zone.color,
          background: zone.color + '18', border: `1px solid ${zone.color}40`,
          borderRadius: 20, padding: '2px 7px',
        }}>{zone.label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: zone.color === '#6b7280' ? '#111827' : zone.color, fontVariantNumeric: 'tabular-nums', marginBottom: 6 }}>
        {sign}{pct.toFixed(4)}%
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#9ca3af' }}>{zone.desc}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: '#d1d5db' }}>next</span>
          <Countdown nextFundingTime={nextFundingTime} />
        </div>
      </div>
    </div>
  )
}

export default function FundingRate() {
  const [data,        setData]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      // Fetch all symbols in parallel directly from Bybit (client-side, no Vercel IP block)
      const results = await Promise.allSettled(
        SYMBOLS.map(async sym => {
          const res  = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`)
          const json = await res.json()
          if (json.retCode !== 0) throw new Error(`${sym}: ${json.retMsg}`)
          const t = json.result?.list?.[0]
          if (!t) throw new Error(`No data for ${sym}`)
          return {
            symbol:          sym.replace('USDT', ''),
            fundingRate:     parseFloat(t.fundingRate),
            nextFundingTime: parseInt(t.nextFundingTime),
            markPrice:       parseFloat(t.markPrice),
          }
        })
      )
      const order   = SYMBOLS.map(s => s.replace('USDT', ''))
      const fetched = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .sort((a, b) => order.indexOf(a.symbol) - order.indexOf(b.symbol))

      if (fetched.length === 0) throw new Error('All Bybit requests failed')
      setData(fetched)
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
    const iv = setInterval(fetchData, 60_000)
    return () => clearInterval(iv)
  }, [fetchData])

  const avgRate     = data.length ? data.reduce((s, d) => s + d.fundingRate, 0) / data.length : null
  const dangerCount = data.filter(d => d.fundingRate * 100 >  0.10).length
  const squeezeCount= data.filter(d => d.fundingRate * 100 < -0.05).length

  if (loading) return (
    <div style={{ ...LBL, color: '#d1d5db', padding: '1rem 0' }}>Loading…</div>
  )

  if (error) return (
    <div style={{ fontSize: 12, color: '#dc2626', padding: '8px 0' }}>
      Error: {error}
    </div>
  )

  return (
    <div>
      {/* Summary bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20,
        padding: '10px 14px', marginBottom: 12,
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ ...LBL, marginBottom: 2 }}>Avg rate</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: avgRate >= 0 ? '#f97316' : '#3b82f6', fontVariantNumeric: 'tabular-nums' }}>
            {avgRate >= 0 ? '+' : ''}{(avgRate * 100).toFixed(4)}%
          </div>
        </div>
        <div style={{ width: 1, height: 28, background: '#e5e7eb' }} />
        <div>
          <div style={{ ...LBL, marginBottom: 2 }}>Danger zone</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: dangerCount > 0 ? '#dc2626' : '#9ca3af' }}>{dangerCount} pairs</div>
        </div>
        <div style={{ width: 1, height: 28, background: '#e5e7eb' }} />
        <div>
          <div style={{ ...LBL, marginBottom: 2 }}>Squeeze risk</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: squeezeCount > 0 ? '#059669' : '#9ca3af' }}>{squeezeCount} pairs</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 10, color: '#d1d5db' }}>
          {lastUpdated?.toLocaleTimeString('en-US', { hour12: false })}
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {data.map(d => <FundingCard key={d.symbol} {...d} />)}
      </div>

      {/* Legend */}
      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {[
          ['#dc2626', 'DANGER: FR > +0.10% — overleveraged longs'],
          ['#f97316', 'HOT: FR > +0.05% — longs dominant'],
          ['#059669', 'SQUEEZE: FR < −0.05% — short squeeze risk'],
        ].map(([color, text]) => (
          <span key={text} style={{ fontSize: 10, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
            {text}
          </span>
        ))}
      </div>

      {/* Source note */}
      <div style={{ marginTop: 8, fontSize: 10, color: '#d1d5db' }}>
        Positive = longs pay shorts · Negative = shorts pay longs · Source: Bybit perpetuals
      </div>
    </div>
  )
}
