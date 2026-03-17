'use client'
import { useEffect, useState } from 'react'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtPrice(v) {
  if (!v) return '—'
  return 'US$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtTpi(signal) {
  if (!signal) return '—'
  const state = signal.state ?? '—'
  const tpi   = signal.tpi  ?? signal.tpi_bar ?? null
  const roc   = signal.roc  ?? null

  // State label
  const stateLabel = state === 'LONG'      ? 'long'
    : state === 'SHORT'     ? 'short'
    : state === 'MAX LONG'  ? 'max long'
    : state === 'MAX SHORT' ? 'max short'
    : state?.toLowerCase() ?? '—'

  // TPI value description
  let tpiDesc = ''
  if (tpi !== null) {
    const abs = Math.abs(tpi)
    if (abs < 0.15)      tpiDesc = 'marginally ' + stateLabel
    else if (abs < 0.4)  tpiDesc = 'weakly ' + stateLabel
    else if (abs < 0.7)  tpiDesc = stateLabel
    else                 tpiDesc = 'strongly ' + stateLabel
    tpiDesc += ` (${tpi >= 0 ? '+' : ''}${Number(tpi).toFixed(2)})`
  } else {
    tpiDesc = stateLabel
  }

  // RoC description
  let rocDesc = ''
  if (roc !== null) {
    const r = Number(roc)
    if (Math.abs(r) < 0.05)       rocDesc = 'steady'
    else if (r > 0.3)              rocDesc = `rising fast (+${r.toFixed(2)})`
    else if (r > 0)                rocDesc = `rising (+${r.toFixed(2)})`
    else if (r < -0.3)             rocDesc = `falling fast (${r.toFixed(2)})`
    else                           rocDesc = `falling (${r.toFixed(2)})`
  }

  return rocDesc ? `${tpiDesc} / ${rocDesc}` : tpiDesc
}

function fmtS1(signal) {
  if (!signal) return '—'
  return signal.asset ?? '—'
}

const ASSET_NAMES = {
  btc: 'BTC', eth: 'ETH', sol: 'SOL', sui: 'SUI',
  xrp: 'XRP', bnb: 'BNB', paxg: 'GOLD', usd: 'USD',
}

function fmtS2(signal) {
  if (!signal) return '—'
  if (signal.alloc) {
    const entries = Object.entries(signal.alloc)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
    if (entries.length) {
      return entries.map(([k, v]) => `${v}% ${ASSET_NAMES[k] ?? k.toUpperCase()}`).join(' + ')
    }
  }
  return signal.asset ?? '—'
}

function fmtVi(signal, label) {
  if (!signal || signal.value == null) return `${label}: —`
  const v = parseFloat(signal.value)
  const sign = v >= 0 ? '+' : ''
  let zone = ''
  if (v >=  2) zone = 'overbought'
  else if (v >=  1) zone = 'elevated'
  else if (v > -1)  zone = 'neutral'
  else if (v > -2)  zone = 'good value area'
  else              zone = 'deep value'
  return `${sign}${v.toFixed(3)} (${zone})`
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
    <div className="text-[10px] text-[#2a2a2a] tracking-widest font-mono py-4 px-1">
      LOADING BRIEF...
    </div>
  )

  if (!data) return null

  const btcPrice = data.btc?.price
  const lines = [
    { label: 'MTPI',                  value: fmtTpi(data.btc) },
    { label: 'ROTATOOOR System 1',    value: fmtS1(data.rotation) },
    { label: 'ROTATOOOR System 2',    value: fmtS2(data.s2) },
    null, // spacer → "Market Cycle:"
    { label: 'Short-term valuation',  value: fmtVi(data.vi,  'VI')  },
    { label: 'Full-cycle valuation',  value: fmtVi(data.vi2, 'VI2') },
  ]

  const stateColor = data.btc?.state?.includes('LONG')  ? '#22c55e'
    : data.btc?.state?.includes('SHORT') ? '#ef4444' : '#9ca3af'

  return (
    <div style={{
      borderBottom: '1px solid #111',
      padding: '14px 20px 12px',
      background: '#080808',
    }}>
      {/* GM header */}
      <div className="flex items-baseline gap-3 mb-3 flex-wrap">
        <span className="text-[11px] font-mono text-[#666] tracking-widest">GM.</span>
        <span className="text-[11px] font-mono text-[#333] tracking-wider">UTC close update.</span>
        {btcPrice && (
          <span className="text-[11px] font-mono ml-auto" style={{ color: '#f7931a' }}>
            BTC {fmtPrice(btcPrice)}
          </span>
        )}
      </div>

      {/* Data lines */}
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {lines.map((line, i) => {
          if (!line) return (
            <div key={i} className="w-full mt-0.5 mb-0.5">
              <span className="text-[9px] text-[#333] tracking-widest font-mono uppercase">
                Market Cycle
              </span>
            </div>
          )

          // Pick colour per field
          let valueColor = '#555'
          if (line.label === 'MTPI') valueColor = stateColor
          else if (line.label.includes('valuation')) {
            const v = line.label.includes('Short') ? data.vi?.value : data.vi2?.value
            if (v != null) {
              const n = parseFloat(v)
              valueColor = n >=  2 ? '#ef4444' : n >=  1 ? '#f97316' : n > -1 ? '#555' : n > -2 ? '#22c55e' : '#16a34a'
            }
          }

          return (
            <div key={i} className="flex items-baseline gap-1.5">
              <span className="text-[9px] text-[#2a2a2a] font-mono tracking-wider whitespace-nowrap">
                {line.label}:
              </span>
              <span className="text-[10px] font-mono tracking-wide whitespace-nowrap"
                style={{ color: valueColor }}>
                {line.value}
              </span>
            </div>
          )
        })}
      </div>

      {/* Last updated */}
      {data.fetched_at && (
        <div className="mt-2 text-[8px] text-[#1e1e1e] font-mono tracking-widest">
          {new Date(data.fetched_at).toUTCString()}
        </div>
      )}
    </div>
  )
}
