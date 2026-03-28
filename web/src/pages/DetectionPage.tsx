import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
} from 'lucide-react'
import { api, API_BASE, type DetectionResultItem, type DetectionCacheResponse } from '../services/api'
import { TermTooltip } from '../components/ui/term-tooltip'

// --- 캐시된 결과 조회 ---

function useDetectionCache() {
  return useQuery<DetectionCacheResponse>({
    queryKey: ['detection-cache'],
    queryFn: () => api.getDetectionCached(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })
}

export function DetectionPage() {
  const queryClient = useQueryClient()
  const { data: cache, isLoading: cacheLoading } = useDetectionCache()
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; symbol: string } | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  // 폴백: SSE 실패 시 POST /refresh로 스캔
  const fallbackScan = async () => {
    try {
      setScanProgress({ current: 0, total: 1, symbol: '전체 스캔 중...' })
      await api.refreshDetection()
      setScanProgress(null)
      setScanning(false)
      queryClient.invalidateQueries({ queryKey: ['detection-cache'] })
    } catch {
      setScanProgress(null)
      setScanning(false)
      setScanError('스캔에 실패했습니다. 서버 상태를 확인해주세요.')
    }
  }

  // SSE 스트리밍 스캔 (실패 시 폴백)
  const startScan = () => {
    setScanning(true)
    setScanError(null)
    setScanProgress(null)

    const es = new EventSource(`${API_BASE}/api/detection/scan/stream`)
    let connected = false

    es.addEventListener('progress', (e) => {
      connected = true
      const d = JSON.parse(e.data)
      if (d.type === 'start') {
        setScanProgress({ current: 0, total: d.total, symbol: '' })
      } else if (d.current !== undefined) {
        setScanProgress({ current: d.current, total: d.total, symbol: d.symbol ?? '' })
      }
    })

    es.addEventListener('complete', () => {
      setScanProgress(null)
      setScanning(false)
      es.close()
      queryClient.invalidateQueries({ queryKey: ['detection-cache'] })
    })

    es.addEventListener('scan-error', (e) => {
      const d = JSON.parse(e.data)
      setScanProgress(null)
      setScanning(false)
      setScanError(d.message ?? '스캔 실패')
      es.close()
    })

    es.onerror = () => {
      es.close()
      if (!connected) {
        // SSE 연결 자체가 안 됐으면 폴백
        fallbackScan()
      } else {
        setScanProgress(null)
        setScanning(false)
        setScanError('스캔 연결이 끊어졌습니다')
      }
    }
  }

  // 결과 데이터: 캐시에서 가져옴
  const results = cache?.cached ? (cache.results ?? []) : []
  const sortedResults = [...results].sort((a, b) => b.score - a.score)

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">코인 분석</h1>
        <p className="text-[13px] text-text-muted">
          업비트 KRW 마켓 · <span className="font-mono-trading">1</span>시간봉 기준 · 매수 점수 산출
        </p>
      </div>

      {/* 스캔 버튼 (눈에 띄는 위치) */}
      <button
        onClick={startScan}
        disabled={scanning}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--accent)] bg-[var(--accent-bg)] px-4 py-2.5 text-[13px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10 disabled:cursor-not-allowed disabled:border-border disabled:bg-secondary disabled:text-text-faint"
      >
        {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {scanning ? '스캔 중...' : cache?.cached ? `재스캔 (최근: ${getTimeAgo(cache.scannedAt!)})` : '코인 스캔 시작'}
      </button>

      {/* 스캔 프로그레스 */}
      {scanning && scanProgress && (
        <div className="card-surface rounded-md px-4 py-4">
          <div className="flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
              <span className="text-text-muted">
                <span className="font-medium text-text-secondary">{scanProgress.symbol || '마켓 목록 로딩'}</span> 스캔 중
              </span>
            </div>
            <span className="font-mono-trading text-text-muted">
              {scanProgress.current}/{scanProgress.total}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-150"
              style={{ width: scanProgress.total > 0 ? `${(scanProgress.current / scanProgress.total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* 에러 */}
      {scanError && (
        <div className="card-surface flex flex-col items-center justify-center gap-2 rounded-md py-8">
          <AlertTriangle className="h-5 w-5 text-loss" />
          <p className="text-[13px] font-medium text-text-secondary">스캔에 실패했습니다</p>
          <p className="text-[12px] text-text-muted">{scanError}</p>
          <button onClick={startScan} className="mt-2 rounded-md border border-border px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-hover">
            다시 시도
          </button>
        </div>
      )}

      {/* 스캔 요약 */}
      {cache?.cached && (
        <div className="card-surface flex items-center gap-5 rounded-md px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-[12px]">
            <Radar className="h-3 w-3 text-text-faint" />
            <span className="text-text-muted">스캔:</span>
            <span className="font-mono-trading text-text-primary">{cache.totalScanned}개</span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px]">
            <Activity className="h-3 w-3 text-text-faint" />
            <span className="text-text-muted">감지:</span>
            <span className={`font-mono-trading ${(cache.detected ?? 0) > 0 ? 'text-profit' : 'text-text-primary'}`}>
              {cache.detected}개
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
            <Clock className="h-3 w-3" />
            {cache.scannedAt ? getTimeAgo(cache.scannedAt) : ''}
          </div>
          {cache.scanDurationMs && (
            <div className="text-[12px] text-text-faint">
              {(cache.scanDurationMs / 1000).toFixed(0)}초
            </div>
          )}
        </div>
      )}

      {/* 초기 로딩 */}
      {cacheLoading && (
        <div className="card-surface flex items-center justify-center gap-2 rounded-md py-12">
          <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
          <span className="text-[13px] text-text-muted">캐시 로딩 중...</span>
        </div>
      )}

      {/* 결과 없음 */}
      {!cacheLoading && sortedResults.length === 0 && !scanning && (
        <div className="card-surface rounded-md py-12 text-center" style={{ border: '1px dashed var(--border)' }}>
          <Search className="mx-auto mb-3 h-8 w-8 text-text-faint" />
          <p className="text-[13px] font-medium text-text-secondary">
            {cache?.cached ? '현재 탐지된 코인이 없습니다' : '스캔을 실행하면 매수 추천 코인이 표시됩니다'}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            위의 스캔 버튼을 눌러 업비트 전체 코인을 분석하세요.
          </p>
        </div>
      )}

      {/* 탐지 결과 */}
      {sortedResults.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[12px] font-semibold text-text-muted">
            분석 결과 ({sortedResults.length}개)
          </h2>
          {sortedResults.map((result) => (
            <DetectionCard key={result.symbol} result={result} />
          ))}
        </div>
      )}

      {/* 지표 설명 */}
      <div className="card-surface rounded-md p-4">
        <h3 className="data-table-header mb-3">
          <TermTooltip term="detection_indicators">분석 지표 안내</TermTooltip>
        </h3>
        <div className="grid grid-cols-1 gap-2 text-[12px] md:grid-cols-2">
          <IndicatorInfo name="매수 점수" description="5개 지표의 가중 합산. 60점 이상이면 매수 시그널." />
          <IndicatorInfo name="RSI(14)" description="과매수/과매도 지표 (0~100). 30 이하 과매도, 70 이상 과매수." />
          <IndicatorInfo name="거래량 Z-Score" weight="25%" description="20일 평균 대비 거래량 이상치. Z > 2.5이면 활성." />
          <IndicatorInfo name="BTC 보정 급등" weight="25%" description="BTC 연동분 제거 후 독립 상승률. > 2%이면 활성." />
          <IndicatorInfo name="호가 불균형" weight="20%" description="매수/매도 호가 비율. Bid/Ask > 2.0이면 활성." />
          <IndicatorInfo name="OBV 다이버전스" weight="15%" description="가격 하락 + 거래량 상승 = 숨겨진 축적." />
          <IndicatorInfo name="9시 리셋" weight="15%" description="업비트 09:00 리셋 직후 상승 모멘텀. > 1%이면 활성." />
        </div>
      </div>
    </div>
  )
}

// --- 탐지 카드 (간소화 + detail 숨김) ---

function DetectionCard({ result }: { result: DetectionResultItem }) {
  const [expanded, setExpanded] = useState(false)
  const scorePercent = Math.round(result.score * 100)
  const rec = getRecommendation(result)

  return (
    <div className="card-surface rounded-md">
      {/* 기본: 코인명 + 매수 점수 + 추천 뱃지 + 가격 + 24h 변동 */}
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[14px] font-semibold text-text-primary">{result.koreanName}</span>
            <span className="text-[12px] text-text-muted">{result.symbol}</span>
          </div>
          <span className={`rounded-full px-2 py-0.5 font-mono-trading text-[12px] font-semibold ${
            scorePercent >= 80 ? 'bg-[var(--profit-bg)] text-profit' :
            scorePercent >= 60 ? 'bg-[var(--warning-bg)] text-warning' :
            'bg-secondary text-text-muted'
          }`}>
            {scorePercent}점
          </span>
          {rec && (
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${rec.color}`}>
              {rec.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="font-mono-trading text-[13px] text-text-primary">
              {result.price.toLocaleString('ko-KR')}원
            </span>
            {result.changePct !== 0 && (
              <span className={`ml-2 flex items-center gap-0.5 font-mono-trading text-[12px] ${result.changePct > 0 ? 'text-profit' : 'text-loss'}`}>
                {result.changePct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {result.changePct > 0 ? '+' : ''}{result.changePct.toFixed(2)}%
              </span>
            )}
          </div>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-text-faint" />
            : <ChevronDown className="h-4 w-4 text-text-faint" />
          }
        </div>
      </div>

      {/* 상세 (펼치면 보임) */}
      {expanded && (
        <div className="border-t border-border-subtle px-4 py-3 space-y-3">
          {/* 핵심 지표 */}
          <div className="grid grid-cols-3 gap-2">
            <MetricBox label="RSI(14)" value={result.rsi14.toFixed(1)} desc={getRsiDesc(result.rsi14)} color={getRsiColor(result.rsi14)} />
            <MetricBox label="ATR%" value={`${result.atrPct.toFixed(2)}%`} desc={getAtrDesc(result.atrPct)} color={getAtrColor(result.atrPct)} />
            <MetricBox label="24h 변동" value={`${result.changePct > 0 ? '+' : ''}${result.changePct.toFixed(2)}%`} desc="" color={result.changePct > 0 ? 'profit' : result.changePct < 0 ? 'loss' : 'muted'} />
          </div>

          {/* 5개 시그널 상세 */}
          <div className="space-y-1.5">
            <p className="text-[12px] font-semibold text-text-muted">탐지 지표</p>
            <SignalDetail
              label="거래량 Z-Score"
              active={result.signals.volumeZScore.active}
              value={`Z = ${(result.signals.volumeZScore.value as number).toFixed(2)}`}
              threshold="Z > 2.5"
              weight="25%"
            />
            <SignalDetail
              label="BTC 보정 급등"
              active={result.signals.btcAdjustedPump.active}
              value={`${(result.signals.btcAdjustedPump.value as number).toFixed(2)}%`}
              threshold="> 2.0%"
              weight="25%"
            />
            <SignalDetail
              label="호가 Bid/Ask"
              active={result.signals.orderbookImbalance.active}
              value={`${(result.signals.orderbookImbalance.value as number).toFixed(2)}`}
              threshold="> 2.0"
              weight="20%"
            />
            <SignalDetail
              label="OBV 다이버전스"
              active={result.signals.obvDivergence.active}
              value={String(result.signals.obvDivergence.value)}
              threshold="bullish"
              weight="15%"
            />
            <SignalDetail
              label="9시 리셋"
              active={result.signals.morningReset.active}
              value={`${(result.signals.morningReset.value as number).toFixed(2)}%`}
              threshold="> 1.0%"
              weight="15%"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// --- 추천 로직 ---

function getRecommendation(result: DetectionResultItem): { label: string; color: string } | null {
  const { score, rsi14 } = result
  const activeCount = Object.values(result.signals).filter((s) => s.active).length

  if (rsi14 >= 70) {
    return { label: '매도 주의', color: 'bg-[var(--loss-bg)] text-loss' }
  }

  if (score >= 0.8 && activeCount >= 4) return { label: '강력 매수', color: 'bg-[var(--profit-bg)] text-profit' }
  if (score >= 0.8) return { label: '매수 추천', color: 'bg-[var(--profit-bg)] text-profit' }
  if (score >= 0.6) return { label: '매수 관심', color: 'bg-[var(--warning-bg)] text-warning' }

  return null
}

// --- 보조 컴포넌트 ---

function MetricBox({ label, value, desc, color }: { label: string; value: string; desc: string; color: string }) {
  const colorClass = color === 'profit' ? 'text-profit' : color === 'loss' ? 'text-loss' : color === 'warning' ? 'text-warning' : 'text-text-secondary'
  return (
    <div className="rounded-md bg-secondary p-2 text-center">
      <div className="text-[12px] text-text-muted">{label}</div>
      <div className={`font-mono-trading text-[14px] font-semibold ${colorClass}`}>{value}</div>
      {desc && <div className="text-[12px] text-text-muted">{desc}</div>}
    </div>
  )
}

function SignalDetail({ label, active, value, threshold, weight }: {
  label: string
  active: boolean
  value: string
  threshold: string
  weight: string
}) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${active ? 'bg-profit' : 'bg-text-faint'}`} />
        <span className="text-text-muted">{label}</span>
        <span className="text-[11px] text-text-faint">({weight})</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-mono-trading ${active ? 'text-profit' : 'text-text-secondary'}`}>
          {value}
        </span>
        <span className="text-text-faint">{threshold}</span>
      </div>
    </div>
  )
}

function IndicatorInfo({ name, description, weight }: { name: string; description: string; weight?: string }) {
  return (
    <div className="flex gap-2">
      <span className="font-medium text-text-secondary">{name}</span>
      {weight && <span className="text-text-faint">({weight})</span>}
      <span className="text-text-muted">{description}</span>
    </div>
  )
}

// --- 유틸 ---

function getRsiColor(rsi: number): string {
  if (rsi <= 30) return 'profit'
  if (rsi >= 70) return 'loss'
  if (rsi >= 50 && rsi <= 65) return 'profit'
  return 'muted'
}

function getRsiDesc(rsi: number): string {
  if (rsi <= 30) return '과매도'
  if (rsi >= 70) return '과매수'
  if (rsi >= 50 && rsi <= 65) return '건강'
  return ''
}

function getAtrColor(atr: number): string {
  if (atr <= 3) return 'profit'
  if (atr >= 6) return 'loss'
  return 'muted'
}

function getAtrDesc(atr: number): string {
  if (atr <= 3) return '조용'
  if (atr >= 6) return '격변'
  return ''
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}
