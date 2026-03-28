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
  TrendingUp,
  TrendingDown,
  BarChart3,
} from 'lucide-react'
import { API_BASE } from '../services/api'

interface DetectionSignal {
  active: boolean
  value: number | string
  weight: number
}

interface DetectionResult {
  symbol: string
  score: number
  detected?: boolean
  rsi14: number
  atrPct: number
  changePct: number
  price: number
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
  strategy: string
  scannedAt: string
  totalScanned: number
  detected: number
  results: DetectionResult[]
}

type StrategyType = 'composite' | 'oversold' | 'momentum' | 'volume'

const STRATEGY_TABS: { id: StrategyType; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'composite', label: '복합 탐지', icon: <Radar className="h-3.5 w-3.5" />, desc: '5개 지표 가중합산 (0.6 이상)' },
  { id: 'oversold', label: '과매도', icon: <TrendingDown className="h-3.5 w-3.5" />, desc: 'RSI ≤ 30 과매도 반등 대상' },
  { id: 'momentum', label: '모멘텀', icon: <TrendingUp className="h-3.5 w-3.5" />, desc: '건강한 상승세 (RSI 50~70)' },
  { id: 'volume', label: '거래량 폭발', icon: <BarChart3 className="h-3.5 w-3.5" />, desc: '거래량 Z-Score > 1.5' },
]

export function DetectionPage() {
  const [strategy, setStrategy] = useState<StrategyType>('composite')
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; symbol: string } | null>(null)

  const { data, isLoading, error, refetch, isFetching } = useQuery<ScanResponse>({
    queryKey: ['detection-scan', strategy],
    queryFn: () =>
      new Promise<ScanResponse>((resolve, reject) => {
        let done = false
        const es = new EventSource(`${API_BASE}/api/detection/scan/stream?strategy=${strategy}`)

        es.addEventListener('progress', (e) => {
          const d = JSON.parse(e.data)
          if (d.type === 'start') {
            setScanProgress({ current: 0, total: d.total, symbol: '' })
          } else if (d.current !== undefined) {
            setScanProgress({ current: d.current, total: d.total, symbol: d.symbol ?? '' })
          }
        })

        es.addEventListener('complete', (e) => {
          done = true
          setScanProgress(null)
          es.close()
          resolve(JSON.parse(e.data))
        })

        es.addEventListener('scan-error', (e) => {
          done = true
          setScanProgress(null)
          es.close()
          reject(new Error(JSON.parse(e.data).message ?? '스캔 실패'))
        })

        es.onerror = () => {
          if (!done) {
            setScanProgress(null)
            es.close()
            reject(new Error('스캔 연결 실패'))
          }
        }
      }),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">알트코인 탐지</h1>
          <p className="text-[13px] text-text-muted">
            실시간 업비트 KRW 마켓 스캔 — 전략별 필터링
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

      {/* 전략 탭 */}
      <div className="flex gap-2 overflow-x-auto">
        {STRATEGY_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStrategy(tab.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-2 text-[12px] transition-colors ${
              strategy === tab.id
                ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent)]'
                : 'border-border text-text-muted hover:bg-secondary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-text-muted">
        {STRATEGY_TABS.find((t) => t.id === strategy)?.desc}
      </p>

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
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <Clock className="h-3 w-3" />
            {getTimeAgo(data.scannedAt)}
          </div>
        </div>
      )}

      {/* 스캔 프로그레스 */}
      {isFetching && (
        <div className="card-surface rounded-md px-4 py-4">
          <div className="flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
              <span className="text-text-muted">
                <span className="font-medium text-text-secondary">{scanProgress?.symbol || '마켓 목록 로딩'}</span> 스캔 중
              </span>
            </div>
            <span className="font-mono-trading text-text-muted">
              {scanProgress ? `${scanProgress.current}/${scanProgress.total}` : '0/?'}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-150"
              style={{ width: scanProgress && scanProgress.total > 0 ? `${(scanProgress.current / scanProgress.total) * 100}%` : '0%' }}
            />
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
          <p className="text-[13px] font-medium text-text-secondary">현재 탐지된 코인이 없습니다</p>
          <p className="mt-1 text-[11px] text-text-muted">
            {strategy === 'composite' && '5개 지표 중 3개 이상 합의해야 시그널이 발생합니다'}
            {strategy === 'oversold' && 'RSI(14)가 30 이하인 과매도 코인이 없습니다'}
            {strategy === 'momentum' && 'RSI 50~70 구간의 건강한 상승 종목이 없습니다'}
            {strategy === 'volume' && '거래량 Z-Score > 1.5인 코인이 없습니다'}
          </p>
        </div>
      )}

      {/* 탐지 결과 */}
      {data && data.results.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            탐지 결과 ({data.results.length}개)
          </h2>
          {data.results.map((result) => (
            <DetectionCard key={result.symbol} result={result} strategy={strategy} />
          ))}
        </div>
      )}

      {/* 지표 설명 */}
      <div className="card-surface rounded-md p-4">
        <h3 className="data-table-header mb-3">탐지 지표</h3>
        <div className="grid grid-cols-1 gap-2 text-[11px] md:grid-cols-2">
          <IndicatorInfo name="RSI(14)" description="과매수/과매도 지표 (0~100). 30↓ 과매도, 70↑ 과매수" />
          <IndicatorInfo name="ATR%" description="가격 대비 평균 변동폭의 비율(%). 4%↓ 조용, 6%↑ 격변" />
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

function DetectionCard({ result, strategy }: { result: DetectionResult; strategy: StrategyType }) {
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
          <ScoreBadge score={result.score} strategy={strategy} />
          {result.changePct !== 0 && (
            <span className={`flex items-center gap-0.5 font-mono-trading text-[11px] ${result.changePct > 0 ? 'text-profit' : 'text-loss'}`}>
              {result.changePct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {result.changePct > 0 ? '+' : ''}{result.changePct.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono-trading text-[11px] text-text-muted">
            {result.price ? `₩${result.price.toLocaleString()}` : ''}
          </span>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-text-faint" />
            : <ChevronDown className="h-4 w-4 text-text-faint" />
          }
        </div>
      </div>

      {/* 핵심 지표 바 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <MetricPill label="RSI" value={result.rsi14.toFixed(1)} color={getRsiColor(result.rsi14)} />
        <MetricPill label="ATR%" value={`${result.atrPct.toFixed(2)}%`} color={getAtrColor(result.atrPct)} />
        <MetricPill
          label="Vol Z"
          value={(result.signals.volumeZScore.value as number).toFixed(1)}
          color={(result.signals.volumeZScore.value as number) > 2.5 ? 'profit' : 'muted'}
        />
        <span className="mx-1 self-center text-[11px] text-text-faint">|</span>
        <SignalDot label="거래량" active={result.signals.volumeZScore.active} />
        <SignalDot label="BTC보정" active={result.signals.btcAdjustedPump.active} />
        <SignalDot label="호가" active={result.signals.orderbookImbalance.active} />
        <SignalDot label="OBV" active={result.signals.obvDivergence.active} />
        <SignalDot label="9시" active={result.signals.morningReset.active} />
        <span className="ml-auto text-[11px] text-text-muted">{activeCount}/5</span>
      </div>

      {/* 상세 */}
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border-subtle pt-3">
          <div className="mb-2 grid grid-cols-3 gap-2">
            <MetricBox label="RSI(14)" value={result.rsi14.toFixed(1)} desc={getRsiDesc(result.rsi14)} color={getRsiColor(result.rsi14)} />
            <MetricBox label="ATR%" value={`${result.atrPct.toFixed(2)}%`} desc={getAtrDesc(result.atrPct)} color={getAtrColor(result.atrPct)} />
            <MetricBox label="24h 변동" value={`${result.changePct > 0 ? '+' : ''}${result.changePct.toFixed(2)}%`} desc="" color={result.changePct > 0 ? 'profit' : result.changePct < 0 ? 'loss' : 'muted'} />
          </div>
          <SignalDetail
            label="거래량 Z-Score"
            active={result.signals.volumeZScore.active}
            value={`Z = ${(result.signals.volumeZScore.value as number).toFixed(2)}`}
            threshold="Z > 2.5"
          />
          <SignalDetail
            label="BTC 보정 급등"
            active={result.signals.btcAdjustedPump.active}
            value={`${(result.signals.btcAdjustedPump.value as number).toFixed(2)}%`}
            threshold="> 2.0%"
          />
          <SignalDetail
            label="호가 Bid/Ask"
            active={result.signals.orderbookImbalance.active}
            value={`${(result.signals.orderbookImbalance.value as number).toFixed(2)}`}
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
            value={`${(result.signals.morningReset.value as number).toFixed(2)}%`}
            threshold="> 1.0%"
          />
        </div>
      )}
    </div>
  )
}

function ScoreBadge({ score, strategy }: { score: number; strategy: StrategyType }) {
  let color: string
  let label: string

  if (strategy === 'composite') {
    color = score >= 0.8 ? 'bg-[var(--profit-bg)] text-profit' : score >= 0.6 ? 'bg-[var(--warning-bg)] text-warning' : 'bg-muted text-text-muted'
    label = `${(score * 100).toFixed(0)}%`
  } else if (strategy === 'oversold') {
    color = score <= 20 ? 'bg-[var(--profit-bg)] text-profit' : 'bg-[var(--warning-bg)] text-warning'
    label = `${(score * 100).toFixed(0)}%`
  } else {
    color = 'bg-[var(--accent-bg)] text-[var(--accent)]'
    label = `${(score * 100).toFixed(0)}%`
  }

  return (
    <span className={`rounded-full px-2 py-0.5 font-mono-trading text-[11px] font-semibold ${color}`}>
      {label}
    </span>
  )
}

function MetricPill({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClass = color === 'profit' ? 'text-profit' : color === 'loss' ? 'text-loss' : color === 'warning' ? 'text-warning' : 'text-text-muted'
  return (
    <span className={`rounded-md bg-secondary px-2 py-0.5 text-[11px] ${colorClass}`}>
      <span className="text-text-muted">{label}</span> <span className="font-mono-trading font-medium">{value}</span>
    </span>
  )
}

function MetricBox({ label, value, desc, color }: { label: string; value: string; desc: string; color: string }) {
  const colorClass = color === 'profit' ? 'text-profit' : color === 'loss' ? 'text-loss' : color === 'warning' ? 'text-warning' : 'text-text-secondary'
  return (
    <div className="rounded-md bg-secondary p-2 text-center">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className={`font-mono-trading text-[14px] font-semibold ${colorClass}`}>{value}</div>
      {desc && <div className="text-[10px] text-text-muted">{desc}</div>}
    </div>
  )
}

function SignalDot({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${
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
        <span className="text-[11px] text-text-muted">기준: {threshold}</span>
      </div>
    </div>
  )
}

function IndicatorInfo({ name, weight, description }: { name: string; weight?: string; description: string }) {
  return (
    <div className="rounded-md bg-secondary p-2.5">
      <div className="flex items-center justify-between">
        <span className="font-medium text-text-secondary">{name}</span>
        {weight && <span className="font-mono-trading text-[11px] text-text-muted">{weight}</span>}
      </div>
      <p className="mt-0.5 text-[11px] text-text-muted">{description}</p>
    </div>
  )
}

function getRsiColor(rsi: number): string {
  if (rsi === 0) return 'muted'
  if (rsi <= 30) return 'profit'  // 과매도 = 매수 기회
  if (rsi >= 70) return 'loss'    // 과매수 = 주의
  if (rsi >= 52 && rsi <= 70) return 'muted'
  return 'muted'
}

function getRsiDesc(rsi: number): string {
  if (rsi === 0) return '데이터 부족'
  if (rsi <= 30) return '과매도'
  if (rsi >= 70) return '과매수'
  if (rsi >= 52) return '안전 구간'
  return '중립'
}

function getAtrColor(atr: number): string {
  if (atr === 0) return 'muted'
  if (atr <= 4) return 'profit'
  if (atr >= 6) return 'loss'
  return 'warning'
}

function getAtrDesc(atr: number): string {
  if (atr === 0) return '데이터 부족'
  if (atr <= 4) return '조용'
  if (atr >= 6) return '격변'
  return '보통'
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}초 전`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}분 전`
  return `${Math.floor(minutes / 60)}시간 전`
}
