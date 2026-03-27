import { HelpCircle } from 'lucide-react'

const TERM_DICTIONARY: Record<string, string> = {
  regime: 'BTC의 현재 시장 상태. Risk-On이면 시장이 안정적이라 매수 가능, Risk-Off면 위험해서 관망',
  risk_on: '시장이 안정적인 상태. BTC가 장기 평균 위에 있고, 변동성이 낮을 때',
  risk_off: '시장이 불안정한 상태. BTC가 장기 평균 아래이거나 변동성이 높을 때',
  z_score: '평균에서 얼마나 벗어났는지. -1 이하면 "많이 빠졌다", +1 이상이면 "많이 올랐다"',
  rsi: '과매수/과매도를 나타내는 지표 (0~100). 30 이하면 과매도, 70 이상이면 과매수',
  ema: '최근 가격에 더 큰 비중을 두는 이동평균. EMA(200)은 장기 추세를 나타냄',
  atr: '평균 가격 변동폭. 높으면 변동성이 크고, 낮으면 조용한 시장',
  atr_pct: '가격 대비 평균 변동폭의 비율(%). 4% 이하면 조용, 6% 이상이면 격변',
  sharpe: '수익 대비 위험을 나타내는 지표. 1 이상이면 좋고, 2 이상이면 훌륭',
  mdd: '최고점 대비 최대 낙폭. -10%면 최고점에서 10% 빠진 적이 있다는 뜻',
  win_rate: '전체 거래 중 이긴 거래의 비율. 50% 이상이면 절반 이상을 이겼다는 뜻',
  kimchi_premium: '한국 거래소와 해외 거래소의 가격 차이. 양수면 한국이 더 비쌈',
  mean_reversion: '가격이 평균으로 돌아오려는 성질. 많이 빠지면 반등할 가능성이 높다는 전략',
  risk_profile: '투자 위험 허용 수준. 안전/중립/공격으로 나뉘며, 레버리지·동시보유·MDD 한도가 달라짐',
}

interface TermTooltipProps {
  term: string
  children: React.ReactNode
  className?: string
}

export function TermTooltip({ term, children, className = '' }: TermTooltipProps) {
  const description = TERM_DICTIONARY[term]
  if (!description) return <span className={className}>{children}</span>

  return (
    <span className={`group relative inline-flex items-center gap-0.5 ${className}`}>
      {children}
      <HelpCircle className="h-3 w-3 text-text-faint transition-colors group-hover:text-text-muted" />
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-md px-3 py-2 text-[11px] leading-relaxed opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
        }}
      >
        {description}
        <span
          className="absolute left-1/2 top-full -translate-x-1/2"
          style={{
            borderWidth: '4px',
            borderStyle: 'solid',
            borderColor: 'var(--surface) transparent transparent transparent',
          }}
        />
      </span>
    </span>
  )
}
