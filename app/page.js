import Nav from '../components/Nav'
import CryptoTicker from '../components/CryptoTicker'
import SidebarMarkets from '../components/SidebarMarkets'
import TvSignals from '../components/TvSignals'
import RotationChart from '../components/RotationChart'
import DecisionChecklist from '../components/DecisionChecklist'
import ChecklistBacktest from '../components/ChecklistBacktest'
import FearGreed from '../components/FearGreed'
import FundingRate from '../components/FundingRate'
import BtcComparison from '../components/BtcComparison'

export const dynamic = 'force-dynamic'

async function getBtcSignal() {
  try {
    const url   = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) return null
    const res    = await fetch(`${url}/get/signal:btc`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const data   = await res.json()
    if (!data.result) return null
    const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed
  } catch { return null }
}

export default async function Home() {
  const btcSignal  = await getBtcSignal()
  const stateColor = (s) => s?.includes('LONG') ? '#22c55e' : s?.includes('SHORT') ? '#ef4444' : '#555'
  const fmt2       = (v)  => v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}`
  const signalColor = stateColor(btcSignal?.state)

  return (
    <div className="min-h-screen bg-[#080808] text-[#e8e8e8]">
      {/* ── TICKER BAR ─────────────────────────────────── */}
      <CryptoTicker />

      {/* ── NAV ────────────────────────────────────────── */}
      <Nav />

      {/* ── BODY: main + right sidebar ─────────────────── */}
      <div style={{ display: 'flex', minHeight: '100vh' }}>

        {/* ── MAIN COLUMN ──────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, padding: '24px 20px 80px' }}>

          {/* HEADER */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #111' }}>
            <div>
              <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.3em', marginBottom: '2px' }}>COMMAND CENTER</div>
              <h1 style={{ fontSize: '20px', letterSpacing: '0.2em', fontWeight: 700, margin: 0 }}>
                ARPI <span style={{ color: '#f7931a' }}>OS</span>
              </h1>
            </div>
            {btcSignal ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', fontFamily: 'monospace' }}>
                <span style={{ color: '#333', letterSpacing: '0.1em' }}>ORPI1</span>
                <span style={{ fontWeight: 700, padding: '2px 10px', borderRadius: '2px', fontSize: '10px', letterSpacing: '0.1em', background: signalColor + '22', color: signalColor, border: `1px solid ${signalColor}44` }}>
                  {btcSignal.state}
                </span>
                <span style={{ color: '#444' }}>
                  TPI <span style={{ fontWeight: 700, color: signalColor }}>{fmt2(btcSignal.tpi)}</span>
                </span>
                <span style={{ color: '#444' }}>
                  RoC <span style={{ fontWeight: 700, color: (btcSignal.roc ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>{fmt2(btcSignal.roc)}</span>
                </span>
              </div>
            ) : (
              <div style={{ fontSize: '10px', color: '#333', border: '1px solid #1a1a1a', padding: '6px 12px', letterSpacing: '0.1em' }}>
                ORPI1 — awaiting signal
              </div>
            )}
          </div>

          {/* SIGNAL ROW: BTC strat + Asset rotation */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div style={{ border: '1px solid #161616', background: '#0a0a0a', padding: '16px', borderRadius: '2px' }}>
              <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.25em', marginBottom: '12px' }}>BTC STRATEGY · ORPI1</div>
              <TvSignals />
            </div>
            <div style={{ border: '1px solid #161616', background: '#0a0a0a', padding: '16px', borderRadius: '2px' }}>
              <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.25em', marginBottom: '12px' }}>ASSET ROTATION</div>
              <RotationChart />
            </div>
          </div>

          {/* DECISION CHECKLIST */}
          <DecisionChecklist />

          {/* CONTEXT DIVIDER */}
          <div style={{ borderTop: '1px solid #0f0f0f', paddingTop: '24px', marginTop: '32px' }}>
            <div style={{ fontSize: '9px', color: '#222', letterSpacing: '0.3em', marginBottom: '16px' }}>CONTEXT · MARKET CONDITIONS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <FearGreed />
              <FundingRate />
            </div>
            <BtcComparison />
          </div>

          {/* BACKTEST */}
          <div style={{ borderTop: '1px solid #0f0f0f', paddingTop: '24px', marginTop: '32px' }}>
            <ChecklistBacktest />
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ─────────────────────────────── */}
        <div style={{ width: '200px', flexShrink: 0, borderLeft: '1px solid #111', padding: '24px 16px 80px', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          <SidebarMarkets />
        </div>

      </div>
    </div>
  )
}
