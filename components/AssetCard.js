'use client'

export default function AssetCard({ name, symbol, price, change24h, currency = 'USD', audRate }) {
  const isUp = change24h > 0
  const isDown = change24h < 0

  const fmtPrice = (val, cur) => {
    if (val == null) return '—'
    // For forex pairs, show 4 decimal places
    const isForex = cur === 'USD' && val < 10
    const decimals = isForex ? 4 : val < 1 ? 6 : val < 100 ? 2 : 0
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur === 'JPY' ? 'JPY' : 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(val)
  }

  const priceUSD = price != null ? fmtPrice(price, currency) : '—'
  const priceAUD = price != null && audRate != null && currency !== 'JPY'
    ? fmtPrice(price / audRate, 'USD').replace('$', 'A$')
    : null

  return (
    <div className="border border-[#1e1e1e] bg-[#0d0d0d] p-4 rounded-sm hover:border-[#2e2e2e] transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-[10px] text-[#444] tracking-widest">{symbol}</div>
          <div className="text-sm text-[#aaa] mt-0.5">{name}</div>
        </div>
        {change24h != null && (
          <div className={`text-xs font-mono px-2 py-0.5 rounded-sm ${
            isUp ? 'text-green-400 bg-green-400/10' :
            isDown ? 'text-red-400 bg-red-400/10' :
            'text-[#555] bg-[#1a1a1a]'
          }`}>
            {isUp ? '+' : ''}{change24h?.toFixed(2)}%
          </div>
        )}
      </div>

      <div className="text-xl font-bold font-mono text-[#e8e8e8]">
        {priceUSD}
      </div>
      {priceAUD && (
        <div className="text-xs text-[#444] font-mono mt-1">
          {priceAUD}
        </div>
      )}
    </div>
  )
}
