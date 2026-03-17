import dynamic from 'next/dynamic'
import DailyBrief from '../components/DailyBrief'
import SidebarMarkets from '../components/SidebarMarkets'
import DecisionChecklist, { LeverageVerdictCard } from '../components/DecisionChecklist'
import ChecklistBacktest from '../components/ChecklistBacktest'
import FundingRate from '../components/FundingRate'
import BtcComparison from '../components/BtcComparison'
import FearGreed from '../components/FearGreed'

const TvSignals      = dynamic(() => import('../components/TvSignals'),      { ssr: false })
const RotationChart  = dynamic(() => import('../components/RotationChart'),  { ssr: false })
const RotationChart2 = dynamic(() => import('../components/RotationChart2'), { ssr: false })
const ValuationIndex = dynamic(() => import('../components/ValuationIndex'), { ssr: false })

export const dynamic_ = 'force-dynamic'
export const revalidate = 0

const card = {
  border: '1px solid #161616',
  background: '#0a0a0a',
  borderRadius: '2px',
  overflow: 'hidden',
}

const cardPad = {
  ...card,
  padding: '16px',
}

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#e8e8e8' }}>
      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, padding: '20px 20px 80px' }}>

          {/*
            ROW 1 — 3 columns above the fold:
            Col A (narrow): Daily Brief + BTC TPI Strat
            Col B (wide):   BTC Price vs TPI chart (ValuationIndex — no card padding, component owns its chrome)
            Col C (wide):   Rotation System 2 (has RS Scores inside)
          */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '30fr 40fr 30fr',
            gap: '16px',
            marginBottom: '16px',
            alignItems: 'start',
          }}>
            {/* Col A */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={cardPad}><DailyBrief /></div>
              <div style={cardPad}><TvSignals /></div>
            </div>

            {/* Col B: price chart — no extra padding wrapper, component fills naturally */}
            <div style={card}>
              <ValuationIndex />
            </div>

            {/* Col C: Rotation System 2 (contains RS Scores) */}
            <div style={card}>
              <RotationChart2 />
            </div>
          </div>

          {/* ROW 2 — Rotation System 1 full width */}
          <div style={{ ...card, marginBottom: '16px' }}>
            <RotationChart />
          </div>

          {/* ROW 3 — Leverage Verdict + Fear & Greed */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px', alignItems: 'start' }}>
            <div style={cardPad}><LeverageVerdictCard /></div>
            <div style={cardPad}><FearGreed /></div>
          </div>

          {/* ROW 4 — VS BTC table + Funding Rate */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '16px', marginBottom: '16px', alignItems: 'start' }}>
            <div style={cardPad}><BtcComparison /></div>
            <div style={cardPad}><FundingRate /></div>
          </div>

          {/* ROW 5 — Checklist */}
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
