import { useQuery } from '@tanstack/react-query'
import { FlaskConical, Loader2, CheckCircle2, XCircle, Clock, Brain, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { formatPercent, formatNumber } from '@/lib/utils'
import { api } from '@/services/api'

interface ResearchRun {
  id: string
  strategy_name: string
  asset: string
  status: 'completed' | 'running' | 'failed' | 'queued'
  params: Record<string, unknown>
  total_return: number | null
  sharpe_ratio: number | null
  max_drawdown: number | null
  win_rate: number | null
  total_trades: number | null
  started_at: string
  completed_at: string | null
}

interface ResearchCandidate {
  id: string
  strategy_name: string
  asset: string
  total_return: number
  sharpe_ratio: number
  max_drawdown: number
  win_rate: number
  total_trades: number
  promotion_status: 'none' | 'paper_candidate' | 'paper_running' | 'champion'
  completed_at: string
}

interface AiReview {
  id: string
  strategyName: string | null
  trigger_reason: string
  review_type: string
  summary: string | null
  analysis: {
    strengths: string[]
    weaknesses: string[]
    risks: string[]
    paramSuggestions?: Array<{
      key: string
      currentRange: [number, number]
      suggestedRange: [number, number]
      reason: string
    }>
    recommendation: string
    confidence: number
  } | null
  status: string
  model_id: string | null
  input_tokens: number | null
  output_tokens: number | null
  latency_ms: number | null
  created_at: string
}

const triggerLabels: Record<string, string> = {
  ambiguous_ranking: '후보 접전',
  performance_collapse: '성과 급락',
  param_re_explore: '파라미터 재탐색',
  high_ev_high_mdd: 'EV+/MDD 과도',
  validation_wipeout: '검증 전멸',
  manual_request: '수동 요청',
}

const reviewTypeLabels: Record<string, string> = {
  research_analysis: '연구 분석',
  param_proposal: '파라미터 제안',
  strategy_comparison: '전략 비교',
  failure_analysis: '실패 분석',
}

const statusConfig = {
  completed: { icon: CheckCircle2, label: '완료', color: 'text-profit', bg: 'bg-profit/10' },
  running: { icon: Loader2, label: '실행중', color: 'text-info', bg: 'bg-info/10' },
  failed: { icon: XCircle, label: '실패', color: 'text-loss', bg: 'bg-loss/10' },
  queued: { icon: Clock, label: '대기', color: 'text-text-muted', bg: 'bg-surface-hover' },
}

const promotionLabels: Record<string, { label: string; color: string; bg: string }> = {
  champion: { label: '챔피언', color: 'text-accent', bg: 'bg-accent/10' },
  paper_running: { label: '페이퍼 실행', color: 'text-info', bg: 'bg-info/10' },
  paper_candidate: { label: '페이퍼 후보', color: 'text-warning', bg: 'bg-warning/10' },
  none: { label: '', color: '', bg: '' },
}

const formatDate = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const ResearchPage = () => {
  const { data: runs, isLoading: runsLoading, isError: runsError } = useQuery<ResearchRun[]>({
    queryKey: ['research-runs'],
    queryFn: async () => {
      const res = await api.request<{ data: Array<Record<string, unknown>> }>('/api/dash/research/runs')
      return (res.data ?? []).map((r): ResearchRun => ({
        id: String(r.id),
        strategy_name: String(r.strategyName ?? r.strategy_id ?? ''),
        asset: String(r.market_scope ?? ''),
        status: r.status as ResearchRun['status'],
        params: (r.parameter_set as Record<string, unknown>) ?? {},
        total_return: (r.metrics as Record<string, unknown>)?.total_return as number | null ?? null,
        sharpe_ratio: (r.metrics as Record<string, unknown>)?.sharpe as number | null ?? null,
        max_drawdown: (r.metrics as Record<string, unknown>)?.max_drawdown as number | null ?? null,
        win_rate: (r.metrics as Record<string, unknown>)?.win_rate as number | null ?? null,
        total_trades: (r.metrics as Record<string, unknown>)?.trade_count as number | null ?? null,
        started_at: String(r.started_at ?? ''),
        completed_at: r.ended_at ? String(r.ended_at) : null,
      }))
    },
    refetchInterval: 30000,
  })

  const { data: aiReviews, isLoading: aiLoading, isError: aiError } = useQuery<AiReview[]>({
    queryKey: ['ai-reviews'],
    queryFn: async () => {
      const res = await api.request<{ data: AiReview[] }>('/api/dash/research/ai-reviews?limit=10')
      return res.data ?? []
    },
    refetchInterval: 60000,
  })

  const { data: aiStatus } = useQuery<{ enabled: boolean; provider: string | null }>({
    queryKey: ['ai-status'],
    queryFn: () => api.request<{ enabled: boolean; provider: string | null }>('/api/dash/research/ai-status'),
    refetchInterval: 300000,
  })

  const { data: candidates, isLoading: candidatesLoading, isError: candidatesError } = useQuery<ResearchCandidate[]>({
    queryKey: ['research-candidates'],
    queryFn: async () => {
      const res = await api.request<{ data: Array<Record<string, unknown>>; rankedAt: string | null }>('/api/dash/research/candidates')
      return (res.data ?? []).map((c): ResearchCandidate => ({
        id: String(c.strategy_id ?? ''),
        strategy_name: String(c.strategyName ?? c.strategy_id ?? ''),
        asset: String(c.asset ?? ''),
        total_return: Number(c.score ?? 0) * 100,
        sharpe_ratio: Number(c.sharpe ?? 0),
        max_drawdown: Number(c.mdd ?? 0),
        win_rate: Number(c.win_rate ?? 0),
        total_trades: 0,
        promotion_status: String(c.promotionStatus ?? 'none') as ResearchCandidate['promotion_status'],
        completed_at: String(c.ranked_at ?? ''),
      }))
    },
    refetchInterval: 60000,
  })

  return (
    <div className="flex flex-col h-full">
      {/* 페이지 헤더 */}
      <div className="px-6 py-4 border-b border-border-subtle">
        <h1 className="text-[20px] font-bold text-text-primary">연구 & 백테스트</h1>
        <p className="text-[13px] text-text-muted mt-1">
          자동 연구 루프 실행 이력과 후보 전략 랭킹
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 실행 이력 */}
        <div className="px-6 pt-5 pb-2">
          <div className="font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase mb-3 pb-2 border-b border-border-subtle">
            RESEARCH RUNS
          </div>

          {runsLoading ? (
            <LoadingState />
          ) : runsError ? (
            <ErrorState message="연구 실행 이력을 불러올 수 없습니다" />
          ) : !runs || runs.length === 0 ? (
            <EmptyState message="실행된 연구가 없습니다" />
          ) : (
            <div className="border border-border-subtle rounded-md overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">STATUS</th>
                    <th className="text-left px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">STRATEGY</th>
                    <th className="text-left px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">ASSET</th>
                    <th className="text-right px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">RETURN</th>
                    <th className="text-right px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">SHARPE</th>
                    <th className="text-right px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">MDD</th>
                    <th className="text-right px-3 py-2 text-[12px] font-semibold text-text-muted">승률</th>
                    <th className="text-right px-3 py-2 text-[12px] font-semibold text-text-muted">시작</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const cfg = statusConfig[run.status]
                    const Icon = cfg.icon
                    return (
                      <tr key={run.id} className="border-b border-border-subtle hover:bg-surface-hover transition-colors duration-100">
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium ${cfg.bg} ${cfg.color}`}>
                            <Icon className={`w-3 h-3 ${run.status === 'running' ? 'animate-spin' : ''}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[13px] font-medium text-text-primary">{run.strategy_name}</td>
                        <td className="px-3 py-2 text-[13px] text-text-secondary">{run.asset}</td>
                        <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${
                          run.total_return !== null ? (run.total_return >= 0 ? 'text-profit' : 'text-loss') : 'text-text-faint'
                        }`}>
                          {run.total_return !== null ? formatPercent(run.total_return) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[13px] text-text-secondary tabular-nums">
                          {run.sharpe_ratio !== null ? formatNumber(run.sharpe_ratio) : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${
                          run.max_drawdown !== null ? 'text-loss' : 'text-text-faint'
                        }`}>
                          {run.max_drawdown !== null ? formatPercent(run.max_drawdown) : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${
                          run.win_rate !== null && run.win_rate >= 55 ? 'text-profit' : 'text-text-secondary'
                        }`}>
                          {run.win_rate !== null ? `${run.win_rate.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[12px] text-text-faint">
                          {formatDate(run.started_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 후보 랭킹 */}
        <div className="px-6 pt-6 pb-6">
          <div className="font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase mb-3 pb-2 border-b border-border-subtle">
            CANDIDATES
          </div>

          {candidatesLoading ? (
            <LoadingState />
          ) : candidatesError ? (
            <ErrorState message="후보 전략 랭킹을 불러올 수 없습니다" />
          ) : !candidates || candidates.length === 0 ? (
            <EmptyState message="후보 전략이 없습니다" />
          ) : (
            <div className="border border-border-subtle rounded-md overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">STRATEGY</th>
                    <th className="text-left px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">ASSET</th>
                    <th className="text-right px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">RETURN</th>
                    <th className="text-right px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">SHARPE</th>
                    <th className="text-right px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">MDD</th>
                    <th className="text-right px-3 py-2 text-[12px] font-semibold text-text-muted">승률</th>
                    <th className="text-left px-3 py-2 text-[12px] font-semibold text-text-muted">승격</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const promo = promotionLabels[c.promotion_status] ?? promotionLabels.none ?? { label: '', bg: '', color: '' }
                    return (
                      <tr key={c.id} className="border-b border-border-subtle hover:bg-surface-hover transition-colors duration-100">
                        <td className="px-3 py-2 text-[13px] font-medium text-text-primary">{c.strategy_name}</td>
                        <td className="px-3 py-2 text-[13px] text-text-secondary">{c.asset}</td>
                        <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${c.total_return >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {formatPercent(c.total_return)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[13px] text-text-secondary tabular-nums">
                          {formatNumber(c.sharpe_ratio)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[13px] text-loss tabular-nums">
                          {formatPercent(c.max_drawdown)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${c.win_rate >= 55 ? 'text-profit' : 'text-text-secondary'}`}>
                          {c.win_rate.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2">
                          {promo?.label && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium ${promo.bg} ${promo.color}`}>
                              {promo.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* AI 리뷰 */}
        <div className="px-6 pt-6 pb-6">
          <div className="flex items-center gap-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase mb-3 pb-2 border-b border-border-subtle">
            <Brain className="w-3.5 h-3.5" />
            AI REVIEWS
            {aiStatus?.enabled && (
              <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-text-muted">
                {aiStatus.provider === 'openai' ? 'OpenAI' : 'Anthropic'} 활성
              </span>
            )}
            {aiStatus && !aiStatus.enabled && (
              <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-text-faint">
                비활성 (API 키 미설정)
              </span>
            )}
          </div>

          {aiLoading ? (
            <LoadingState />
          ) : aiError ? (
            <ErrorState message="AI 리뷰를 불러올 수 없습니다" />
          ) : !aiReviews || aiReviews.length === 0 ? (
            <EmptyAiState enabled={aiStatus?.enabled ?? false} />
          ) : (
            <div className="space-y-2">
              {aiReviews.map((review) => (
                <AiReviewCard key={review.id} review={review} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const AiReviewCard = ({ review }: { review: AiReview }) => {
  const [expanded, setExpanded] = useState(false)
  const analysis = review.analysis

  return (
    <div className="border border-border-subtle rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors duration-100 text-left"
      >
        {/* 상태 아이콘 */}
        <div className={`shrink-0 ${review.status === 'completed' ? 'text-profit' : review.status === 'failed' ? 'text-loss' : 'text-text-muted'}`}>
          {review.status === 'completed' ? <Sparkles className="w-4 h-4" /> :
           review.status === 'failed' ? <XCircle className="w-4 h-4" /> :
           review.status === 'processing' ? <Loader2 className="w-4 h-4 animate-spin" /> :
           <Clock className="w-4 h-4" />}
        </div>

        {/* 메인 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-text-primary truncate">
              {review.strategyName ?? '전략'}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-surface-hover text-text-muted">
              {triggerLabels[review.trigger_reason] ?? review.trigger_reason}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-info/10 text-info">
              {reviewTypeLabels[review.review_type] ?? review.review_type}
            </span>
          </div>
          {review.summary && (
            <p className="text-[12px] text-text-muted mt-0.5 truncate">{review.summary}</p>
          )}
        </div>

        {/* 메타 */}
        <div className="shrink-0 flex items-center gap-3 text-[11px] font-mono text-text-faint">
          {analysis && (
            <span className={`tabular-nums ${analysis.confidence >= 0.7 ? 'text-profit' : analysis.confidence >= 0.4 ? 'text-warning' : 'text-loss'}`}>
              {(analysis.confidence * 100).toFixed(0)}%
            </span>
          )}
          {review.latency_ms && (
            <span className="tabular-nums">{(review.latency_ms / 1000).toFixed(1)}s</span>
          )}
          <span>{formatDate(review.created_at)}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* 펼친 상세 */}
      {expanded && analysis && (
        <div className="px-4 pb-4 border-t border-border-subtle space-y-3">
          {/* 강점/약점/위험 */}
          <div className="grid grid-cols-3 gap-3 pt-3">
            {analysis.strengths.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-profit mb-1">STRENGTHS</div>
                <ul className="space-y-0.5">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="text-[12px] text-text-secondary">+ {s}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.weaknesses.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-warning mb-1">WEAKNESSES</div>
                <ul className="space-y-0.5">
                  {analysis.weaknesses.map((w, i) => (
                    <li key={i} className="text-[12px] text-text-secondary">- {w}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.risks.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-loss mb-1">RISKS</div>
                <ul className="space-y-0.5">
                  {analysis.risks.map((r, i) => (
                    <li key={i} className="text-[12px] text-text-secondary">! {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 파라미터 제안 */}
          {analysis.paramSuggestions && analysis.paramSuggestions.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-info mb-1.5">PARAM SUGGESTIONS</div>
              <div className="border border-border-subtle rounded overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="text-left px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-text-faint">KEY</th>
                      <th className="text-right px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-text-faint">CURRENT</th>
                      <th className="text-right px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-text-faint">SUGGESTED</th>
                      <th className="text-left px-2 py-1 text-[12px] text-text-muted">사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.paramSuggestions.map((ps, i) => (
                      <tr key={i} className="border-b border-border-subtle last:border-b-0">
                        <td className="px-2 py-1 text-[12px] font-mono text-text-primary">{ps.key}</td>
                        <td className="px-2 py-1 text-right text-[12px] font-mono text-text-muted tabular-nums">
                          [{ps.currentRange[0]}, {ps.currentRange[1]}]
                        </td>
                        <td className="px-2 py-1 text-right text-[12px] font-mono text-info tabular-nums">
                          [{ps.suggestedRange[0]}, {ps.suggestedRange[1]}]
                        </td>
                        <td className="px-2 py-1 text-[12px] text-text-secondary">{ps.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 권장 행동 */}
          <div className="flex items-start gap-2 p-2.5 rounded bg-surface-hover">
            <Brain className="w-3.5 h-3.5 text-text-muted mt-0.5 shrink-0" />
            <p className="text-[12px] text-text-secondary">{analysis.recommendation}</p>
          </div>

          {/* 토큰/모델 메타 */}
          <div className="flex items-center gap-4 text-[11px] font-mono text-text-faint">
            {review.model_id && <span>{review.model_id}</span>}
            {review.input_tokens != null && review.output_tokens != null && (
              <span className="tabular-nums">{review.input_tokens}+{review.output_tokens} tokens</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const EmptyAiState = ({ enabled }: { enabled: boolean }) => (
  <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-md">
    <Brain className="w-8 h-8 text-text-faint mb-2" />
    <span className="text-[13px] text-text-secondary">
      {enabled ? 'AI 리뷰가 아직 없습니다' : 'AI 리뷰 비활성 상태'}
    </span>
    <span className="text-[12px] text-text-muted mt-1">
      {enabled
        ? '파이프라인에서 조건 충족 시 자동으로 실행됩니다'
        : 'ANTHROPIC_API_KEY 또는 OPENAI_API_KEY를 설정하세요'}
    </span>
  </div>
)

const LoadingState = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
    <span className="ml-2 text-[13px] text-text-muted">불러오는 중...</span>
  </div>
)

const ErrorState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-12 border border-dashed border-loss/30 rounded-md">
    <XCircle className="w-8 h-8 text-loss/50 mb-2" />
    <span className="text-[13px] text-text-secondary">{message}</span>
    <span className="text-[12px] text-text-muted mt-1">API 서버 연결을 확인하세요</span>
  </div>
)

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-md">
    <FlaskConical className="w-8 h-8 text-text-faint mb-2" />
    <span className="text-[13px] text-text-secondary">{message}</span>
    <span className="text-[12px] text-text-muted mt-1">연구 루프가 실행되면 여기에 표시됩니다</span>
  </div>
)
