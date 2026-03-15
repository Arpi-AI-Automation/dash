import Nav from '../components/Nav'
import MarketsOverview from '../components/MarketsOverview'
import BtcComparison from '../components/BtcComparison'
import FearGreed from '../components/FearGreed'
import FundingRate from '../components/FundingRate'
import LongShortRatio from '../components/LongShortRatio'
import DecisionChecklist from '../components/DecisionChecklist'
import TvSignals from '../components/TvSignals'

// Read Redis directly — avoids self-calling HTTP on Vercel
async function getBtcSignal() {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) return null

    const res = await fetch(`${url}/get/signal:btc`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const data = await res.json()
    if (!data.result) return null

    // Handle single or double stringified
    const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed
  } catch {
    return null
  }
}

export default async function Home() {
  const btcSignal = await getBtcSignal()

  const stateColor = (state) =>
    state?.includes('LONG') ? '#22c55e' : state?.includes('SHORT') ? '#ef4444' : '#9ca3af'

  const fmt2 = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}`)

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="px-6 py-10 max-w-5xl mx-auto">

        <div className="mb-10">
          <div className="text-[10px] text-[#333] tracking-widest mb-1">COMMAND CENTER</div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h1 className="text-2xl tracking-widest text-[#e8e8e8]">
              ARPI <span style={{ color: '#f7931a' }}>OS</span>
            </h1>

            {btcSignal ? (
              <div
                className="flex items-center gap-3 font-mono text-xs px-3 py-1.5 rounded border"
                style={{
                  borderColor: stateColor(btcSignal.state),
                  color: '#e8e8e8',
                  background: 'rgba(0,0,0,0.4)',
                }}
              >
                <span className="text-gray-500">ORPI1</span>
                <span
                  className="font-bold px-1.5 py-0.5 rounded text-black"
                  style={{ background: stateColor(btcSignal.state) }}
                >
                  {btcSignal.state}
                </span>
                <span>
                  TPI <span style={{ color: stateColor(btcSignal.state) }}>{fmt2(btcSignal.tpi)}</span>
                </span>
                <span>
                  RoC <span style={{ color: (btcSignal.roc ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>{fmt2(btcSignal.roc)}</span>
                </span>
              </div>
            ) : (
              <div className="font-mono text-xs text-gray-700 px-3 py-1.5 rounded border border-gray-800">
                ORPI1 — awaiting first signal
              </div>
            )}
          </div>
        </div>

        <MarketsOverview />
        <BtcComparison />
        <FearGreed />
        <FundingRate />
        <LongShortRatio />

        <div className="mt-10">
          <div className="text-[10px] text-[#333] tracking-widest mb-4">TRADING SIGNALS</div>
          <TvSignals />
        </div>

        <DecisionChecklist />
      </main>
    </div>
  )
}
