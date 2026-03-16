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

export default async function Home() {
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
            <div style={{ border: '1px solid #161616', background: '#0a0a0a', padding: '16px', borderRadius: '2px' }}>
              <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.25em', marginBottom: '12px' }}>BTC STRATEGY · ORPI1</div>
              <TvSignals />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ border: '1px solid #161616', background: '#0a0a0a', padding: '16px', borderRadius: '2px', flex: 1 }}>
                <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.25em', marginBottom: '12px' }}>ASSET ROTATION</div>
                <RotationChart />
              </div>
              <div style={{ border: '1px solid #161616', background: '#0a0a0a', padding: '16px', borderRadius: '2px' }}>
                <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.25em', marginBottom: '12px' }}>FEAR & GREED</div>
                <FearGreed />
              </div>
            </div>
          </div>

          {/* CHECKLIST */}
          <DecisionChecklist />

          {/* CONTEXT */}
          <div style={{ borderTop: '1px solid #0f0f0f', paddingTop: '24px', marginTop: '32px' }}>
            <div style={{ fontSize: '9px', color: '#222', letterSpacing: '0.3em', marginBottom: '16px' }}>CONTEXT · MARKET CONDITIONS</div>
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
        <div style={{ width: '200px', flexShrink: 0, borderLeft: '1px solid #111', padding: '24px 16px 80px', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          <SidebarMarkets />
        </div>

      </div>
    </div>
  )
}
