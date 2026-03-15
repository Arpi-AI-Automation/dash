import Nav from '../components/Nav'
import MarketsOverview from '../components/MarketsOverview'
import BtcComparison from '../components/BtcComparison'
import FearGreed from '../components/FearGreed'
import FundingRate from '../components/FundingRate'
import LongShortRatio from '../components/LongShortRatio'
import DecisionChecklist from '../components/DecisionChecklist'

export default function Home() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="px-6 py-10 max-w-5xl mx-auto">
        <div className="mb-10">
          <div className="text-[10px] text-[#333] tracking-widest mb-1">COMMAND CENTER</div>
          <h1 className="text-2xl tracking-widest text-[#e8e8e8]">
            ARPI <span style={{ color: '#f7931a' }}>OS</span>
          </h1>
        </div>
        <MarketsOverview />
        <BtcComparison />
        <FearGreed />
        <FundingRate />
        <LongShortRatio />
        <DecisionChecklist />
      </main>
    </div>
  )
}
