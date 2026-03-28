import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Radar,
  Activity,
  Clock,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react'
import { api } from '../services/api'

interface DetectionSignal {
  active: boolean
  value: number | string
  weight: number
}

interface DetectionResult {
  symbol: string
  score: number
  detected: boolean
  signals: {
    volumeZScore: DetectionSignal
    btcAdjustedPump: DetectionSignal
    orderbookImbalance: DetectionSignal
    obvDivergence: DetectionSignal
    morningReset: DetectionSignal
  }
  reasoning: Record<string, unknown>
}

interface ScanResponse {
  scannedAt: string
  totalScanned: number
  detected: number
  results: DetectionResult[]
}

export function DetectionPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<ScanResponse>({
    queryKey: ['detection-scan'],
    queryFn: () => api.scanDetection() as Promise<ScanResponse>,
    refetchInterval: 5 * 60 * 1000, // 5분마다 자동 갱신
    staleTime: 2 * 60 * 1000,
  })

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">알트코인 탐지</h1>
          <p className="text-[12px] text-text-muted">
            거래량, 호가, OBV, BTC 보정, 9시 리셋 5개 지표로 펌핑/매집 감지
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-text-muted hover:bg-secondary disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
        >
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          스캔
        </button>
      </div>

      {/* 스캔 요약 */}
      {data && (
        <div className="card-surface flex items-center gap-5 rounded-md px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-[12px]">
            <Radar className="h-3 w-3 text-text-faint" />
            <span className="text-text-muted">스캔:</span>
            <span className="font-mono-trading text-text-primary">{data.totalScanned}개</span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px]">
            <Activity className="h-3 w-3 text-text-faint" />
            <span className="text-text-muted">감지:</span>
            <span className={`font-mono-trading ${data.detected > 0 ? 'text-profit' : 'text-text-primary'}`}>
              {data.detected}개
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-text-faint">
            <Clock className="h-3 w-3" />
            {getTimeAgo(data.scannedAt)}
          </div>
        </div>
      )}

      {/* 로딩 */}
      {isLoading && (
        <div className="card-surface flex items-center justify-center rounded-md py-16">
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-text-faint" />
            <p className="text-[12px] text-text-muted">알트코인 스캔 중...</p>
            <p className="text-[11px] text-text-faint">25개 코인 분석, 약 10-20초 소요</p>
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="card-surface flex flex-col items-center justify-center gap-2 rounded-md py-8">
          <AlertTriangle className="h-5 w-5 text-loss" />
          <p className="text-[13px] font-medium text-text-secondary">탐지 스캔에 실패했습니다</p>
          <p className="text-[12px] text-text-muted">
            {error.message.includes('fetch') || error.message.includes('network')
              ? '서버에 연결할 수 없습니다. 백엔드 서버(localhost:3001)가 실행 중인지 확인하세요.'
              : error.message}
          </p>
          <button onClick={() => refetch()} className="mt-2 rounded-md border border-border px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-hover">
            다시 시도
          </button>
        </div>
      )}

      {/* 결과 없음 */}
      {data && data.results.length === 0 && (
        <div className="card-surface rounded-md py-12 text-center" style={{ border: '1px dashed var(--border)' }}>
          <Search className="mx-auto mb-3 h-8 w-8 text-text-faint" />
          <p className="text-[13px] font-medium text-text-secondary">현재 탐지된 이상 신호가 없습니다</p>
          <p className="mt-1 text-[11px] text-text-muted">
            5개 지표(거래량/호가/OBV/BTC보정/9시리셋) 중 3개 이상 합의해야 시그널이 발생합니다
          </p>
        </div>
      )}

      {/* 탐지 결과 */}
      {data && data.results.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-faint">
            탐지 결과 ({data.results.length}개)
          </h2>
          {data.results.map((result) => (
            <DetectionCard key={result.symbol} result={result} />
          ))}
        </div>
      )}

      {/* 지표 설명 */}
      <div className="card-surface rounded-md p-4">
        <h3 className="data-table-header mb-3">탐지 지표</h3>
        <div className="grid grid-cols-1 gap-2 text-[11px] md:grid-cols-2">
          <IndicatorInfo name="거래량 Z-Score" weight="25%" description="20일 평균 대비 거래량 이상치 (Z > 2.5)" />
          <IndicatorInfo name="BTC 보정 급등" weight="25%" description="BTC 연동분 제거 후 독립 상승률 (> 2%)" />
          <IndicatorInfo name="호가 불균형" weight="20%" description="매수/매도 호가 비율 (Bid/Ask > 2.0)" />
          <IndicatorInfo name="OBV 다이버전스" weight="15%" description="가격 하락 + 거래량 상승 = 숨겨진 축적" />
          <IndicatorInfo name="9시 리셋" weight="15%" description="업비트 09:00 리셋 직후 상승 모멘텀 (> 1%)" />
        </div>
      </div>
    </div>
  )
}

function DetectionCard({ result }: { result: DetectionResult }) {
  const [expanded, setExpanded] = useState(false)
  const activeCount = Object.values(result.signals).filter((s) => s.active).length

  return (
    <div className="card-surface rounded-md p-4">
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-semibold text-text-primary">{result.symbol}</span>
          <ScoreBadge score={result.score} />
          <span className="text-[11px] text-text-muted">
            {activeCount}/5 지표 활성
          </span>
        </div>
        <div className="flex items-center gap-2">
          {expanded
            ? <ChevronUp className="h-4 w-4 text-text-faint" />
            : <ChevronDown className="h-4 w-4 text-text-faint" />
          }
        </div>
      </div>

      {/* 시그널 바 */}
      <div className="mt-3 flex gap-1.5">
        <SignalDot label="거래량" active={result.signals.volumeZScore.active} />
        <SignalDot label="BTC보정" active={result.signals.btcAdjustedPump.active} />
        <SignalDot label="호가" active={result.signals.orderbookImbalance.active} />
        <SignalDot label="OBV" active={result.signals.obvDivergence.active} />
        <SignalDot label="9시" active={result.signals.morningReset.active} />
      </div>

      {/* 상세 */}
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border-subtle pt-3">
          <SignalDetail
            label="거래량 Z-Score"
            active={result.signals.volumeZScore.active}
            value={`Z = ${result.signals.volumeZScore.value}`}
            threshold="Z > 2.5"
          />
          <SignalDetail
            label="BTC 보정 급등"
            active={result.signals.btcAdjustedPump.active}
            value={`${result.signals.btcAdjustedPump.value}%`}
            threshold="> 2.0%"
          />
          <SignalDetail
            label="호가 Bid/Ask"
            active={result.signals.orderbookImbalance.active}
            value={`${result.signals.orderbookImbalance.value}`}
            threshold="> 2.0"
          />
          <SignalDetail
            label="OBV 다이버전스"
            active={result.signals.obvDivergence.active}
            value={String(result.signals.obvDivergence.value)}
            threshold="bullish"
          />
          <SignalDetail
            label="9시 리셋"
            active={result.signals.morningReset.active}
            value={`${result.signals.morningReset.value}%`}
            threshold="> 1.0%"
          />
        </div>
      )}
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 0.8
    ? 'bg-[var(--profit-bg)] text-profit'
    : score >= 0.6
      ? 'bg-[var(--warning-bg)] text-warning'
      : 'bg-muted text-text-muted'

  return (
    <span className={`rounded-full px-2 py-0.5 font-mono-trading text-[11px] font-semibold ${color}`}>
      {(score * 100).toFixed(0)}%
    </span>
  )
}

function SignalDot({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] ${
      active ? 'bg-[var(--profit-bg)] text-profit' : 'bg-secondary text-text-faint'
    }`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${active ? 'bg-profit' : 'bg-text-faint'}`} />
      {label}
    </div>
  )
}

function SignalDetail({ label, active, value, threshold }: {
  label: string
  active: boolean
  value: string
  threshold: string
}) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${active ? 'bg-profit' : 'bg-text-faint'}`} />
        <span className="text-text-muted">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`font-mono-trading ${active ? 'text-profit' : 'text-text-faint'}`}>{value}</span>
        <span className="text-[10px] text-text-faint">기준: {threshold}</span>
      </div>
    </div>
  )
}

function IndicatorInfo({ name, weight, description }: { name: string; weight: string; description: string }) {
  return (
    <div className="rounded-md bg-secondary p-2.5">
      <div className="flex items-center justify-between">
        <span className="font-medium text-text-secondary">{name}</span>
        <span className="font-mono-trading text-[10px] text-text-faint">{weight}</span>
      </div>
      <p className="mt-0.5 text-[10px] text-text-muted">{description}</p>
    </div>
  )
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}초 전`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}분 전`
  return `${Math.floor(minutes / 60)}시간 전`
}
