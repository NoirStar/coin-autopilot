import type { MarketCondition } from '@/types/orchestration'

const volLabels: Record<string, { text: string; color: string }> = {
  low: { text: '낮음', color: 'text-profit' },
  medium: { text: '보통', color: 'text-text-secondary' },
  high: { text: '높음', color: 'text-warning' },
}

const trendLabels: Record<string, { text: string; color: string }> = {
  up: { text: '상승', color: 'text-profit' },
  flat: { text: '보합', color: 'text-text-secondary' },
  down: { text: '하락', color: 'text-loss' },
}

const formatBillion = (n: number): string => {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}조`
  if (n >= 1e8) return `${(n / 1e8).toFixed(0)}억`
  return n.toLocaleString()
}

const formatElapsed = (iso: string): string => {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return `${sec}초 전`
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  return `${Math.floor(sec / 3600)}시간 전`
}

interface MarketPanelProps {
  market: MarketCondition
}

export const MarketPanel = ({ market }: MarketPanelProps) => {
  const volFallback = { text: '보통', color: 'text-text-secondary' }
  const vol = volLabels[market.crypto.volatility] ?? volFallback

  return (
    <div className="flex-1 min-w-0 border-t lg:border-t-0 lg:border-l border-border-subtle overflow-y-auto">
      <div className="px-4 py-2.5 border-b border-border bg-surface flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-text-secondary">시장 상황</span>
        <span className="text-[12px] text-text-faint">{formatElapsed(market.crypto.updatedAt)}</span>
      </div>

      {/* 암호화폐 */}
      <div className="px-4 py-2 border-b border-border-subtle">
        <div className="text-[12px] font-semibold text-text-muted mb-2">암호화폐</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Metric
            label="변동성"
            value={vol.text}
            valueColor={vol.color}
            hint="가격 움직임의 크기"
          />
          <Metric
            label="펀딩비"
            value={`${market.crypto.fundingRate >= 0 ? '+' : ''}${market.crypto.fundingRate.toFixed(3)}%`}
            valueColor={market.crypto.fundingRate > 0.05 ? 'text-warning' : 'text-text-secondary'}
            hint="롱 포지션 유지 비용"
          />
          <Metric
            label="미결제약정"
            value={`$${formatBillion(market.crypto.openInterest)}`}
            hint="시장에 열린 계약 총액"
          />
          <Metric
            label="롱/숏 비율"
            value={market.crypto.longShortRatio.toFixed(2)}
            valueColor={market.crypto.longShortRatio > 1.5 ? 'text-warning' : 'text-text-secondary'}
            hint="1 이상이면 롱 우세"
          />
          <Metric
            label="김치 프리미엄"
            value={`${market.crypto.kimchiPremium >= 0 ? '+' : ''}${market.crypto.kimchiPremium.toFixed(1)}%`}
            valueColor={market.crypto.kimchiPremium > 3 ? 'text-warning' : 'text-text-secondary'}
            hint="한국 거래소와 해외 가격 차이"
          />
        </div>
      </div>

      {/* 한국주식 */}
      {market.krStock && (
        <div className="px-4 py-2">
          <div className="text-[12px] font-semibold text-text-muted mb-2">한국주식</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <Metric
              label="시장 추세"
              value={trendLabels[market.krStock.trend]?.text ?? '—'}
              valueColor={trendLabels[market.krStock.trend]?.color ?? 'text-text-muted'}
            />
            <Metric
              label="거래대금"
              value={formatBillion(market.krStock.volume)}
              hint="오늘 전체 거래 금액"
            />
            <Metric
              label="거래대금 변화"
              value={`${market.krStock.volumeChange >= 0 ? '+' : ''}${market.krStock.volumeChange.toFixed(1)}%`}
              valueColor={market.krStock.volumeChange > 0 ? 'text-profit' : 'text-loss'}
              hint="전일 대비"
            />
          </div>
        </div>
      )}
    </div>
  )
}

const Metric = ({
  label,
  value,
  valueColor = 'text-text-secondary',
  hint,
}: {
  label: string
  value: string
  valueColor?: string
  hint?: string
}) => (
  <div className="flex items-baseline justify-between py-0.5">
    <span className="text-[12px] text-text-muted" title={hint}>{label}</span>
    <span className={`font-mono text-[12px] font-medium tabular-nums ${valueColor}`}>{value}</span>
  </div>
)
