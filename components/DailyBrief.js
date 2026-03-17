'use client'
import { useEffect, useState } from 'react'

function fmtPrice(v) {
  if (!v) return '—'
  return 'US$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtTpi(signal) {
  if (!signal) return '—'
  const state = signal.state ?? '—'
  const tpi   = signal.tpi ?? signal.tpi_bar ?? null
  const roc   = signal.roc ?? null

  const stateLabel = state === 'LONG' ? 'long'
    : state === 'SHORT'     ? 'short'
    : state === 'MAX LONG'  ? 'max long'
    : state === 'MAX SHORT' ? 'max short'
    : state?.toLowerCase() ?? '—'

  let tpiDesc = ''
  if (tpi !== null) {
    const abs = Math.abs(tpi)
    if (abs < 0.15)     tpiDesc = 'marginally ' + stateLabel
    else if (abs < 0.4) tpiDesc = 'weakly ' + stateLabel
    else if (abs < 0.7) tpiDesc = stateLabel
    else                tpiDesc = 'strongly ' + stateLabel
    tpiDesc += ` (${tpi >= 0 ? '+' : ''}${Number(tpi).toFixed(2)})`
  } else {
    tpiDesc = stateLabel
  }

  let rocDesc = ''
  if (roc !== null) {
    const r = Number(roc)
    if (Math.abs(r) < 0.05)  rocDesc = 'steady'
    else if (r > 0.3)         rocDesc = `rising fast (+${r.toFixed(2)})`
    else if (r > 0)           rocDesc = `rising (+${r.toFixed(2)})`
    else if (r < -0.3)        rocDesc = `falling fast (${r.toFixed(2)})`
    else                      rocDesc = `falling (${r.toFixed(2)})`
  }

  return rocDesc ? `${tpiDesc} / ${rocDesc}` : tpiDesc
}

function tpiColor(signal) {
  if (!signal?.state) return '#ffffff'
  return signal.state.includes('LONG') ? '#4ade80' : signal.state.includes('SHORT') ? '#f87171' : '#ffffff'
}

const ASSET_NAMES = {
  btc: 'BTC', eth: 'ETH', sol: 'SOL', sui: 'SUI',
  xrp: 'XRP', bnb: 'BNB', paxg: 'GOLD', usd: 'USD',
}

function fmtS1(signal) {
  if (!signal) return '—'
  return ASSET_NAMES[signal.asset?.toLowerCase()] ?? signal.asset ?? '—'
}

function fmtS2(signal) {
  if (!signal) return '—'
  if (signal.alloc) {
    const entries = Object.entries(signal.alloc)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
    if (entries.length)
      return entries.map(([k, v]) => `${v}% ${ASSET_NAMES[k] ?? k.toUpperCase()}`).join(' + ')
  }
  return ASSET_NAMES[signal.asset?.toLowerCase()] ?? signal.asset ?? '—'
}

function viColor(v) {
  if (v == null) return '#ffffff'
  const n = parseFloat(v)
  if (n >=  2) return '#f87171'
  if (n >=  1) return '#fb923c'
  if (n > -1)  return '#ffffff'
  if (n > -2)  return '#4ade80'
  return '#22c55e'
}

function fmtVi(signal) {
  if (!signal || signal.value == null) return '—'
  const v = parseFloat(signal.value)
  const sign = v >= 0 ? '+' : ''
  let zone = v >= 2 ? 'overbought' : v >= 1 ? 'elevated' : v > -1 ? 'neutral' : v > -2 ? 'good value' : 'deep value'
  return `${sign}${v.toFixed(3)} (${zone})`
}

export default function DailyBrief() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/signals?history=false')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ padding: '20px 24px', borderBottom: '1px solid #1a1a1a' }}>
      <span style={{ fontSize: 16, color: '#444', fontFamily: 'monospace' }}>LOADING...</span>
    </div>
  )

  if (!data) return null

  const rows = [
    {
      label: 'MTPI',
      value: fmtTpi(data.btc),
      color: tpiColor(data.btc),
    },
    {
      label: 'ROTATOOOR System 1',
      value: fmtS1(data.rotation),
      color: '#ffffff',
    },
    {
      label: 'ROTATOOOR System 2',
      value: fmtS2(data.s2),
      color: '#ffffff',
    },
  ]

  const viRows = [
    {
      label: 'Short-term BTC valuation',
      value: fmtVi(data.vi),
      color: viColor(data.vi?.value),
    },
    {
      label: 'Full-cycle BTC valuation',
      value: fmtVi(data.vi2),
      color: viColor(data.vi2?.value),
    },
  ]

  return (
    <div style={{
      borderBottom: '1px solid #1a1a1a',
      padding: '20px 24px 18px',
      background: '#080808',
    }}>

      {/* GM + BTC price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22, fontFamily: 'monospace', color: '#ffffff', fontWeight: 700, letterSpacing: 2 }}>
          GM.
        </span>
        <span style={{ fontSize: 16, fontFamily: 'monospace', color: '#aaaaaa', letterSpacing: 1 }}>
          UTC close update.
        </span>
        {data.btc?.price && (
          <span style={{ fontSize: 20, fontFamily: 'monospace', color: '#f7931a', fontWeight: 700, marginLeft: 'auto' }}>
            BTC {fmtPrice(data.btc.price)}
          </span>
        )}
      </div>

      {/* Main signal rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {rows.map(row => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{
              fontSize: 13, fontFamily: 'monospace', color: '#666',
              minWidth: 200, flexShrink: 0,
            }}>
              {row.label}:
            </span>
            <span style={{
              fontSize: 15, fontFamily: 'monospace', fontWeight: 600,
              color: row.color, letterSpacing: 0.5,
            }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* Market Cycle divider */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#555', letterSpacing: 3, textTransform: 'uppercase' }}>
          Market Cycle
        </span>
      </div>

      {/* VI rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {viRows.map(row => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{
              fontSize: 13, fontFamily: 'monospace', color: '#666',
              minWidth: 200, flexShrink: 0,
            }}>
              {row.label}:
            </span>
            <span style={{
              fontSize: 15, fontFamily: 'monospace', fontWeight: 600,
              color: row.color, letterSpacing: 0.5,
            }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

    </div>
  )
}
