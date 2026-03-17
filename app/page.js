import dynamic from 'next/dynamic'
import CryptoTicker from '../components/CryptoTicker'
import SidebarMarkets from '../components/SidebarMarkets'
import DecisionChecklist from '../components/DecisionChecklist'
import ChecklistBacktest from '../components/ChecklistBacktest'
import FundingRate from '../components/FundingRate'
import BtcComparison from '../components/BtcComparison'
import FearGreed from '../components/FearGreed'

// Client-only — prevents SSR duplicate render
const TvSignals    = dynamic(() => import('../components/TvSignals'),    { ssr: false })
const RotationChart = dynamic(() => import('../components/RotationChart'), { ssr: false })

export const dynamic_ = 'force-dynamic'
export const revalidate = 0

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#e8e8e8' }}>

      {/* TICKER */}
      <CryptoTicker />

      {/* BODY */}
      <div style={{ display: 'flex' }}>

        {/* MAIN */}
        <div style={{ flex: 1, minWidth: 0, padding: '24px 20px 80px' }}>

          {/* SIGNAL ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            {/* Left: BTC strategy */}
            <div style={{ border: '1px solid #161616', background: '#0a0a0a', padding: '16px', borderRadius: '2px' }}>
              <div style={{ fontSize: '10px', color: '#666', letterSpacing: '0.2em', marginBottom: '12px', fontWeight: 700 }}>BTC STRATEGY · ORPI1</div>
              <TvSignals />
            </div>
            {/* Right: Rotation + F&G stacked */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ border: '1px solid #161616', background: '#0a0a0a', borderRadius: '2px', flex: 1, overflow: 'hidden' }}>
                <RotationChart />
              </div>
              <div style={{ border: '1px solid #161616', background: '#0a0a0a', padding: '16px', borderRadius: '2px' }}>
                <div style={{ fontSize: '10px', color: '#666', letterSpacing: '0.2em', marginBottom: '12px', fontWeight: 700 }}>FEAR & GREED</div>
                <FearGreed />
              </div>
            </div>
          </div>

          {/* CHECKLIST */}
          <DecisionChecklist />

          {/* CONTEXT */}
          <div style={{ borderTop: '1px solid #0f0f0f', paddingTop: '24px', marginTop: '32px' }}>
            <div style={{ fontSize: '10px', color: '#444', letterSpacing: '0.25em', marginBottom: '16px', fontWeight: 600 }}>CONTEXT · MARKET CONDITIONS</div>
            <div style={{ marginBottom: '24px' }}>
              <FundingRate />
            </div>
            <BtcComparison />
          </div>

          {/* BACKTEST */}
          <div style={{ borderTop: '1px solid #0f0f0f', paddingTop: '24px', marginTop: '32px' }}>
            <ChecklistBacktest />
          </div>
        </div>

        {/* SIDEBAR */}
        <div style={{ width: '220px', flexShrink: 0, borderLeft: '1px solid #1e1e1e', padding: '0 12px 80px', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', background: '#0a0a0a' }}>
          <SidebarMarkets />
        </div>

      </div>
    </div>
  )
}
