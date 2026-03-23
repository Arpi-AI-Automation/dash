import dynamic from 'next/dynamic'
import DailyBrief from '../components/DailyBrief'
import DecisionChecklist from '../components/DecisionChecklist'
import ChecklistBacktest from '../components/ChecklistBacktest'
import FundingRate from '../components/FundingRate'
import BtcComparison from '../components/BtcComparison'
import FearGreed from '../components/FearGreed'
import AiHedgePortfolio from '../components/AiHedgePortfolio'
import OIScatter from '../components/OIScatter'
import ValuationIndex from '../components/ValuationIndex'

const TvSignalChart = dynamic(
  () => import('../components/TvSignals').then(m => ({ default: m.TvSignalChart })),
  { ssr: false }
)
const RotationChart  = dynamic(() => import('../components/RotationChart'),  { ssr: false })
const RotationChart2 = dynamic(() => import('../components/RotationChart2'), { ssr: false })

export const dynamic_ = 'force-dynamic'
export const revalidate = 0

const card = {
  background: '#ffffff', border: '1px solid #d1d5db', borderRadius: 12,
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)', marginBottom: 0,
}
const cardPad    = { ...card, padding: '1.25rem' }
const cardBlue   = { ...cardPad, borderLeft: '4px solid #3b82f6' }
const cardGreen  = { ...cardPad, borderLeft: '4px solid #10b981' }
const cardYellow = { ...cardPad, borderLeft: '4px solid #f59e0b' }
const cardPurple = { ...cardPad, borderLeft: '4px solid #8b5cf6' }
const cardRed    = { ...cardPad, borderLeft: '4px solid #ef4444' }
const cardOrange = { ...cardPad, borderLeft: '4px solid #f97316' }

const LABEL = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: '1rem', display: 'block',
}

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>

      <header style={{ background: '#ffffff', borderBottom: '1px solid #d1d5db', padding: '.875rem 1.5rem', position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: 0 }}>Shredder OS</h1>
        <span style={{ fontSize: '.78rem', color: '#9ca3af' }}>BTC Strategy Dashboard · UTC</span>
      </header>

      <main style={{ padding: '1.5rem', maxWidth: 1400, margin: '0 auto' }}>

        {/* ROW 1 — Executive Summary + BTC Chart */}
        <div style={{ display: 'grid', gridTemplateColumns: '30fr 70fr', gap: '1.25rem', marginBottom: '1.25rem', alignItems: 'stretch' }}>
          <div style={cardBlue}>
            <span style={LABEL}>Executive Summary</span>
            <DailyBrief />
          </div>
          <TvSignalChart />
        </div>

        {/* ROW 2 — Rotation S1 + S2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem', alignItems: 'start' }}>
          <RotationChart />
          <RotationChart2 />
        </div>

        {/* ROW 3 — AI Hedge Portfolio */}
        <div style={{ ...cardYellow, marginBottom: '1.25rem' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>AI Hedge Portfolio</div>
          <AiHedgePortfolio />
        </div>

        {/* ROW 4 — Valuation + Funding */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem', alignItems: 'start' }}>
          <div style={cardGreen}>
            <span style={LABEL}>Valuation Index</span>
            <ValuationIndex />
          </div>
          <div style={cardOrange}>
            <span style={LABEL}>Funding Rate · Perpetuals</span>
            <FundingRate />
          </div>
        </div>

        {/* ROW 5 — Fear & Greed (full width) */}
        <div style={{ ...cardPad, marginBottom: '1.25rem' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: '1.25rem' }}>Fear & Greed</div>
          <FearGreed />
        </div>

        {/* ROW 6 — OI Scatter */}
        <div style={{ ...cardPurple, marginBottom: '1.25rem' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>Futures OI vs Price</div>
          <OIScatter />
        </div>

        {/* ROW 7 — VS BTC */}
        <div style={{ ...cardPad, marginBottom: '1.25rem' }}>
          <span style={LABEL}>vs BTC — Asset outperformance</span>
          <BtcComparison />
        </div>

        {/* ROW 8 — Decision Checklist (full width, verdict included) */}
        <div style={{ ...cardPad, marginBottom: '1.25rem' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>Decision Checklist — Long vs Short</div>
          <DecisionChecklist />
        </div>

        {/* ROW 9 — Backtest */}
        <div style={{ ...cardPad, marginBottom: '1.25rem' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>Checklist Backtest · 100 Days</div>
          <ChecklistBacktest />
        </div>

      </main>
    </div>
  )
}
