import dynamic from 'next/dynamic'
import DailyBrief from '../components/DailyBrief'
import SidebarMarkets from '../components/SidebarMarkets'
import DecisionChecklist, { LeverageVerdictCard } from '../components/DecisionChecklist'
import ChecklistBacktest from '../components/ChecklistBacktest'
import FundingRate from '../components/FundingRate'
import BtcComparison from '../components/BtcComparison'
import FearGreed from '../components/FearGreed'
import AiHedgePortfolio from '../components/AiHedgePortfolio'
import ValuationIndex from '../components/ValuationIndex'

const TvSignalGauge = dynamic(() => import('../components/TvSignals').then(m => ({ default: m.TvSignalGauge })), { ssr: false })
const TvSignalChart = dynamic(() => import('../components/TvSignals').then(m => ({ default: m.TvSignalChart })), { ssr: false })
const RotationChart  = dynamic(() => import('../components/RotationChart'),  { ssr: false })
const RotationChart2 = dynamic(() => import('../components/RotationChart2'), { ssr: false })

export const dynamic_ = 'force-dynamic'
export const revalidate = 0

const card = { border: '1px solid #161616', background: '#0a0a0a', borderRadius: '2px', overflow: 'hidden' }
const cardPad = { ...card, padding: '16px' }

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#e8e8e8' }}>
      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, padding: '20px 20px 80px' }}>

          {/* ROW 1 — Col A (30%): Daily Brief → Leverage Verdict | Col B (70%): Price chart → Rotations */}
          <div style={{ display: 'grid', gridTemplateColumns: '30fr 70fr', gap: '16px', marginBottom: '16px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={cardPad}><DailyBrief /></div>
              <div style={cardPad}><LeverageVerdictCard /></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div><TvSignalChart /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={card}><RotationChart /></div>
                <div style={card}><RotationChart2 /></div>
              </div>
            </div>
          </div>

          {/* ROW 2 — BTC TPI Gauge + Fear & Greed */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px', alignItems: 'start' }}>
            <div><TvSignalGauge /></div>
            <div style={cardPad}><FearGreed /></div>
          </div>

          {/* ROW 3 — Valuation Index + Funding Rate */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px', alignItems: 'start' }}>
            <div style={cardPad}><ValuationIndex /></div>
            <div style={cardPad}><FundingRate /></div>
          </div>

          {/* ROW 4 — VS BTC table */}
          <div style={{ ...cardPad, marginBottom: '16px' }}><BtcComparison /></div>

          {/* ROW 5 — AI Hedge Portfolio */}
          <div style={{ ...cardPad, marginBottom: '16px' }}><AiHedgePortfolio /></div>

          {/* ROW 6 — Checklist */}
          <div style={{ marginBottom: '16px' }}><DecisionChecklist /></div>

          {/* ROW 6 — Backtest */}
          <div style={{ borderTop: '1px solid #0f0f0f', paddingTop: '24px' }}><ChecklistBacktest /></div>

        </div>

        {/* SIDEBAR */}
        <div style={{ width: '220px', flexShrink: 0, borderLeft: '1px solid #1e1e1e', padding: '0 12px 80px', background: '#0a0a0a' }}>
          <SidebarMarkets />
        </div>
      </div>
    </div>
  )
}
