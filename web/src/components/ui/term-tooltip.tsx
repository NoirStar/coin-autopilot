import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
  buy_environment: '현재 시장이 매수하기 좋은 환경인지 판단. BTC 레짐(Risk-On/Off)과 활성 시그널 수를 기반으로 3단계(매수 비추천/보통/매수 추천)로 표시',
  fear_greed: '시장의 공포와 탐욕 수준 (0~100). 0에 가까우면 극단 공포(역발상 매수 기회), 100에 가까우면 극단 탐욕(과열 주의)',
  market_temperature: '시장 온도 (0~100). BTC 레짐, 공포/탐욕 지수, BTC 도미넌스, 활성 시그널을 종합한 매수 적합도. 높을수록 매수에 유리한 시장 분위기',
  btc_dominance: 'BTC가 전체 암호화폐 시장에서 차지하는 비중(%). 낮을수록 자금이 알트코인으로 이동 중이라 알트코인 매수에 유리',
  top_coins: '코인 분석에서 매수 점수가 가장 높은 상위 3개 코인. 점수는 거래량, 호가, OBV 등 5개 지표의 가중 합산',
  detection_indicators: '알트코인 분석에 사용하는 지표. 각 지표의 활성 여부와 가중치를 합산하여 매수 점수를 산출',
}

interface TermTooltipProps {
  term: string
  children: React.ReactNode
  className?: string
}

export function TermTooltip({ term, children, className = '' }: TermTooltipProps) {
  const description = TERM_DICTIONARY[term]
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      const tooltipWidth = 256
      let left = rect.left + rect.width / 2 - tooltipWidth / 2
      // viewport 경계 체크
      if (left < 8) left = 8
      if (left + tooltipWidth > window.innerWidth - 8) left = window.innerWidth - tooltipWidth - 8
      // 위쪽에 공간이 있으면 위, 없으면 아래
      const spaceAbove = rect.top
      const top = spaceAbove > 80
        ? rect.top + window.scrollY - 8
        : rect.bottom + window.scrollY + 8
      setPos({ top, left })
      setVisible(true)
    }, 300)
  }, [])

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(false)
    setPos(null)
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  if (!description) return <span className={className}>{children}</span>

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center gap-1 ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
        <HelpCircle className="h-3.5 w-3.5 min-w-[14px] text-text-muted transition-colors hover:text-text-secondary" />
      </span>
      {visible && pos && createPortal(
        <div
          className="pointer-events-none fixed z-50 w-64 rounded-md px-3 py-2.5 text-[12px] leading-relaxed shadow-xl"
          style={{
            top: pos.top,
            left: pos.left,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            transform: 'translateY(-100%)',
          }}
        >
          {description}
        </div>,
        document.body
      )}
    </>
  )
}
