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

        {/* ── MAIN ── */}
        <div style={{ flex: 1, minWidth: 0, padding: '20px 20px 80px' }}>

          {/*
            ── ABOVE THE FOLD ──
            Col A (35%): Daily Brief + BTC TPI Strat stacked
            Col B (65%): BTC Price chart (top) + Rotation 1 & 2 side by side (bottom)
          */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '35fr 65fr',
            gap: '16px',
            marginBottom: '16px',
            alignItems: 'start',
          }}>

            {/* Col A: Daily Brief + BTC TPI stacked, no gap waste */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={cardPad}>
                <DailyBrief />
              </div>
              <div style={cardPad}>
                <TvSignals />
              </div>
            </div>

            {/* Col B: Price chart on top, then Rotation 1 + 2 side by side */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={cardPad}>
                <ValuationIndex />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={card}>
                  <RotationChart />
                </div>
                <div style={card}>
                  <RotationChart2 />
                </div>
              </div>
            </div>

          </div>

          {/* ── ROW 2: Leverage Verdict + Fear & Greed ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '16px',
            alignItems: 'start',
          }}>
            <div style={cardPad}>
              <LeverageVerdictCard />
            </div>
            <div style={cardPad}>
              <FearGreed />
            </div>
          </div>

          {/* ── ROW 3: BTC Comparison (wide) + Funding Rate (narrow) ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '3fr 2fr',
            gap: '16px',
            marginBottom: '16px',
            alignItems: 'start',
          }}>
            <div style={cardPad}>
              <BtcComparison />
            </div>
            <div style={cardPad}>
              <FundingRate />
            </div>
          </div>

          {/* ── ROW 4: Decision Checklist ── */}
          <div style={{ marginBottom: '16px' }}>
            <DecisionChecklist />
          </div>

          {/* ── ROW 5: Backtest ── */}
          <div style={{ borderTop: '1px solid #0f0f0f', paddingTop: '24px' }}>
            <ChecklistBacktest />
          </div>

        </div>

        {/* ── SIDEBAR ── */}
        <div style={{
          width: '220px',
          flexShrink: 0,
          borderLeft: '1px solid #1e1e1e',
          padding: '0 12px 80px',
          background: '#0a0a0a',
        }}>
          <SidebarMarkets />
        </div>

      </div>
    </div>
  )
}
