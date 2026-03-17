'use client'
import { useEffect, useState } from 'react'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtPrice(v) {
  if (!v) return '—'
  return 'US$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtTpi(signal) {
  if (!signal) return '—'
  const tpi = signal.tpi ?? signal.tpi_bar ?? null
  const roc = signal.roc ?? null
  const state = signal.state ?? ''

  const stateLabel = state === 'LONG' ? 'long'
    : state === 'SHORT'     ? 'short'
    : state === 'MAX LONG'  ? 'max long'
    : state === 'MAX SHORT' ? 'max short'
    : state.toLowerCase() || '—'

  let tpiDesc = stateLabel
  if (tpi !== null) {
    const abs = Math.abs(tpi)
    const qualifier = abs < 0.15 ? 'marginally ' : abs < 0.4 ? 'weakly ' : abs < 0.7 ? '' : 'strongly '
    tpiDesc = `${qualifier}${stateLabel} (${tpi >= 0 ? '+' : ''}${Number(tpi).toFixed(2)})`
  }

  let rocDesc = ''
  if (roc !== null) {
    const r = Number(roc)
    if (Math.abs(r) < 0.05)  rocDesc = 'steady'
    else if (r > 0.3)         rocDesc = `positive RoC (+${r.toFixed(2)})`
    else if (r > 0)           rocDesc = `positive RoC (+${r.toFixed(2)})`
    else if (r < -0.3)        rocDesc = `negative RoC (${r.toFixed(2)})`
    else                      rocDesc = `negative RoC (${r.toFixed(2)})`
  }

  return rocDesc ? `${tpiDesc} / ${rocDesc}` : tpiDesc
}

function tpiColor(signal) {
  if (!signal?.state) return '#ffffff'
  return signal.state.includes('LONG') ? '#4ade80' : signal.state.includes('SHORT') ? '#f87171' : '#ffffff'
}

// Handles both "eth", "ETH", "ETHUSD", "ETHUSDT" etc.
function normaliseAsset(raw) {
  if (!raw) return null
  const s = raw.toUpperCase().replace(/(USD[T]?|USDT|PERP)$/, '').trim()
  const MAP = { BTC: 'BTC', ETH: 'ETH', SOL: 'SOL', SUI: 'SUI', XRP: 'XRP', BNB: 'BNB', PAXG: 'GOLD', USD: 'USD' }
  return MAP[s] ?? s
}

function assetKey(raw) {
  if (!raw) return 'usd'
  const s = raw.toLowerCase()
  if (s.includes('bnb'))  return 'bnb'
  if (s.includes('eth'))  return 'eth'
  if (s.includes('sol'))  return 'sol'
  if (s.includes('xrp'))  return 'xrp'
  if (s.includes('paxg')) return 'paxg'
  if (s.includes('sui'))  return 'sui'
  return 'usd'
}

function fmtS1(signal) {
  // Match RotationChart behaviour: defaults to USD when no signal
  const key = assetKey(signal?.asset)
  return key.toUpperCase().replace('PAXG', 'GOLD')
}

function fmtS2(signal) {
  if (!signal) return 'No data yet'
  if (signal.alloc) {
    const entries = Object.entries(signal.alloc)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
    if (entries.length)
      return entries.map(([k, v]) => `${v}% ${normaliseAsset(k)}`).join(' + ')
  }
  return normaliseAsset(signal.asset) ?? signal.asset ?? '—'
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
  if (!signal || signal.value == null) return 'Awaiting first webhook'
  const v = parseFloat(signal.value)
  const sign = v >= 0 ? '+' : ''
  const zone = v >= 2 ? 'overbought' : v >= 1 ? 'elevated' : v > -1 ? 'neutral' : v > -2 ? 'good value' : 'deep value'
  return `${sign}${v.toFixed(3)} (${zone})`
}

// ── Shared text style — matches "GM." size and weight ──────────────────────
const BASE = {
  fontFamily: 'monospace',
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 1,
  lineHeight: 1.5,
}

const LABEL = {
  ...BASE,
  color: '#888888',
  fontWeight: 400,
}

// ── Component ──────────────────────────────────────────────────────────────
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
      <span style={{ ...BASE, color: '#444' }}>LOADING...</span>
    </div>
  )

  if (!data) return null

  return (
    <div style={{ borderBottom: '1px solid #1a1a1a', padding: '20px 24px 20px', background: '#080808' }}>

      {/* Line 1: GM. UTC close update. BTC price */}
      <div style={{ marginBottom: 10 }}>
        <span style={{ ...BASE, color: '#ffffff' }}>GM. </span>
        <span style={{ ...BASE, color: '#ffffff', fontWeight: 700 }}>UTC close update. </span>
        <span style={{ ...BASE, color: '#f7931a' }}>
          BTC {fmtPrice(data.btc?.price)}
        </span>
      </div>

      {/* MTPI */}
      <div style={{ marginBottom: 4 }}>
        <span style={LABEL}>MTPI: </span>
        <span style={{ ...BASE, color: tpiColor(data.btc) }}>{fmtTpi(data.btc)}</span>
      </div>

      {/* System 1 */}
      <div style={{ marginBottom: 4 }}>
        <span style={LABEL}>ROTATOOOR System 1: </span>
        <span style={{ ...BASE, color: '#ffffff' }}>{fmtS1(data.rotation)}</span>
      </div>

      {/* System 2 */}
      <div style={{ marginBottom: 16 }}>
        <span style={LABEL}>ROTATOOOR System 2: </span>
        <span style={{ ...BASE, color: '#ffffff' }}>{fmtS2(data.s2)}</span>
      </div>

      {/* Market Cycle header */}
      <div style={{ marginBottom: 6 }}>
        <span style={{ ...BASE, color: '#ffffff', fontWeight: 700 }}>Market Cycle</span>
      </div>

      {/* VI */}
      <div style={{ marginBottom: 4 }}>
        <span style={LABEL}>Short-term BTC valuation: </span>
        <span style={{ ...BASE, color: viColor(data.vi?.value) }}>{fmtVi(data.vi)}</span>
      </div>

      {/* VI-2 */}
      <div>
        <span style={LABEL}>Full-cycle BTC valuation: </span>
        <span style={{ ...BASE, color: viColor(data.vi2?.value) }}>{fmtVi(data.vi2)}</span>
      </div>

    </div>
  )
}
