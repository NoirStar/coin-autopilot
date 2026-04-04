/**
 * API 라우트 — 대시보드 프론트엔드용
 *
 * V2 백엔드 모듈(오케스트레이터, 리스크, 연구루프 등)의 데이터를
 * 프론트엔드에 노출하는 API 엔드포인트 모음.
 * 모든 데이터는 테이블에서 조회한다.
 */

import { Hono } from 'hono'
import { supabase } from '../services/database.js'
import { getSlotStatus, calculateEdgeScore, executeDecision } from '../orchestrator/orchestrator.js'
import { getCircuitBreakerStatus } from '../risk/risk-manager.js'
import { getMarketSummary } from '../data/market-summary.js'
import { authMiddleware } from '../core/auth.js'

const apiRoutes = new Hono()

// ─── 인메모리 캐시 (30초 TTL) ─────────────────────────────────
// polling 주기와 동일. DB 호출을 분당 1회 이하로 제한.
let operatorHomeCache: { data: unknown; expiresAt: number } | null = null
const CACHE_TTL_MS = 30_000

/**
 * operator/home 데이터 조립 (캐시 없이 DB에서 조회)
 * 서버 시작 시 캐시 pre-seed용으로도 사용
 */
async function buildOperatorHomeData(): Promise<unknown> {
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    // 병렬 조회
    const [
      regimeResult,
      slotsResult,
      circuitBreakerResult,
      paperPositionResult,
      livePositionResult,
      todayClosedResult,
      openLiveResult,
      openPaperResult,
      pendingDecisionsResult,
      unresolvedRiskResult,
      recentDecisionsResult,
      researchRunningResult,
      researchQueuedResult,
      researchCompletedResult,
      topCandidatesResult,
    ] = await Promise.all([
      // 1. 최신 레짐
      supabase
        .from('regime_snapshots')
        .select('regime, btc_price, ema200, rsi14, atr_pct, recorded_at')
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single(),

      // 2. 슬롯 상태
      getSlotStatus(),

      // 3. 서킷 브레이커
      getCircuitBreakerStatus(),

      // 4. 페이퍼 포지션 수
      supabase
        .from('paper_positions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),

      // 5. 실전 포지션 수
      supabase
        .from('live_positions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),

      // 6. 오늘 청산된 실전 PnL
      supabase
        .from('live_positions')
        .select('realized_pnl')
        .eq('status', 'closed')
        .gte('exit_time', todayStart.toISOString()),

      // 7. 열린 실전 포지션 (미실현 손익)
      supabase
        .from('live_positions')
        .select('id, asset_key, exchange, side, entry_price, current_qty, peak_price, unrealized_pnl, realized_pnl, stop_price, leverage, margin_mode, entry_time, status')
        .eq('status', 'open')
        .order('entry_time', { ascending: false }),

      // 8. 열린 페이퍼 포지션
      supabase
        .from('paper_positions')
        .select('id, session_id, asset_key, side, entry_price, current_qty, peak_price, unrealized_pnl, realized_pnl, stop_price, entry_time, status')
        .eq('status', 'open')
        .order('entry_time', { ascending: false }),

      // 9. 승인 대기 판단 (queue)
      supabase
        .from('orchestrator_decisions')
        .select('id, slot_id, decision_type, status, from_strategy_id, to_strategy_id, regime, reason_summary, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),

      // 10. 미해결 리스크 이벤트 (queue)
      supabase
        .from('risk_events')
        .select('id, event_type, severity, details, resolved, created_at')
        .eq('resolved', false)
        .order('created_at', { ascending: false }),

      // 11. 최근 판단 로그
      supabase
        .from('orchestrator_decisions')
        .select('id, slot_id, decision_type, status, from_strategy_id, to_strategy_id, regime, reason_summary, created_at, executed_at')
        .order('created_at', { ascending: false })
        .limit(20),

      // 12. 연구 실행중 수
      supabase
        .from('research_runs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'running'),

      // 13. 연구 대기 수
      supabase
        .from('research_runs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'queued'),

      // 14. 연구 완료 수
      supabase
        .from('research_runs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed'),

      // 15. 최근 완료 연구 상위 5개
      supabase
        .from('research_runs')
        .select('id, strategy_id, market_scope, status, promotion_status, started_at, ended_at')
        .eq('status', 'completed')
        .order('ended_at', { ascending: false })
        .limit(5),
    ])

    // PnL 계산
    const todayRealizedPnl = (todayClosedResult.data ?? []).reduce(
      (sum, pos) => sum + Number(pos.realized_pnl ?? 0), 0,
    )
    const unrealizedPnl = (openLiveResult.data ?? []).reduce(
      (sum, pos) => sum + Number(pos.unrealized_pnl ?? 0), 0,
    )

    // 총 자산 (에퀴티 스냅샷에서 live + paper)
    const [{ data: latestLiveEquity }, { data: latestPaperEquity }] = await Promise.all([
      supabase
        .from('equity_snapshots')
        .select('total_equity, unrealized_pnl, realized_pnl')
        .eq('source', 'live')
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('equity_snapshots')
        .select('total_equity, unrealized_pnl, realized_pnl')
        .eq('source', 'paper')
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    // paper 오늘 손익 계산
    const { data: todayClosedPaper } = await supabase
      .from('paper_positions')
      .select('realized_pnl')
      .eq('status', 'closed')
      .gte('exit_time', todayStart.toISOString())

    const paperRealizedPnl = (todayClosedPaper ?? []).reduce(
      (sum, pos) => sum + Number(pos.realized_pnl ?? 0), 0,
    )
    const { data: openPaper } = await supabase
      .from('paper_positions')
      .select('unrealized_pnl')
      .eq('status', 'open')

    const paperUnrealizedPnl = (openPaper ?? []).reduce(
      (sum, pos) => sum + Number(pos.unrealized_pnl ?? 0), 0,
    )

    // 연구 상위 후보 메트릭 조회
    const topRunIds = (topCandidatesResult.data ?? []).map((r) => r.id)
    let topMetricsMap = new Map<string, Record<string, unknown>>()
    if (topRunIds.length > 0) {
      const { data: metrics } = await supabase
        .from('research_run_metrics')
        .select('research_run_id, total_return, max_drawdown, win_rate, sharpe, trade_count')
        .in('research_run_id', topRunIds)
      for (const m of metrics ?? []) {
        topMetricsMap.set(m.research_run_id, m)
      }
    }

    // 전략 이름 매핑 (상위 후보용)
    const strategyIds = [...new Set((topCandidatesResult.data ?? []).map((r) => r.strategy_id).filter(Boolean))]
    let strategyNameMap = new Map<string, string>()
    if (strategyIds.length > 0) {
      const { data: strategies } = await supabase
        .from('strategies')
        .select('id, strategy_id, name')
        .in('id', strategyIds)
      for (const s of strategies ?? []) {
        strategyNameMap.set(s.id, s.name ?? s.strategy_id)
      }
    }

    // 서킷 브레이커에서 riskLevel 추출
    const cb = circuitBreakerResult
    // currentLossPct는 드로다운(양수). 3% 이상이면 경고, 1% 이상이면 주의
    const riskLevel = cb.triggered ? 'critical' : cb.currentLossPct > 3 ? 'warning' : cb.currentLossPct > 1 ? 'caution' : 'normal'

    const pendingApprovals = (pendingDecisionsResult.data ?? []).length + (unresolvedRiskResult.data ?? []).length

    const response = {
      // 시스템 상태 (기본 health)
      // regime_snapshots가 비어있어도 DB 연결 자체는 정상일 수 있음
      system: {
        server: 'connected',
        database: regimeResult.error && regimeResult.error.code !== 'PGRST116' ? 'error' : 'connected',
        lastCollectedAt: regimeResult.data?.recorded_at ?? null,
      },

      // 히어로 요약 — live/paper 분리
      hero: {
        live: {
          totalEquity: Number(latestLiveEquity?.total_equity ?? 0),
          todayPnl: {
            realized: Math.round(todayRealizedPnl * 100) / 100,
            unrealized: Math.round(unrealizedPnl * 100) / 100,
            total: Math.round((todayRealizedPnl + unrealizedPnl) * 100) / 100,
          },
          count: livePositionResult.count ?? 0,
          active: process.env.LIVE_TRADING === 'true',
        },
        paper: {
          totalEquity: Number(latestPaperEquity?.total_equity ?? 0),
          todayPnl: {
            realized: Math.round(paperRealizedPnl * 100) / 100,
            unrealized: Math.round(paperUnrealizedPnl * 100) / 100,
            total: Math.round((paperRealizedPnl + paperUnrealizedPnl) * 100) / 100,
          },
          count: paperPositionResult.count ?? 0,
        },
        pendingApprovals,
        riskLevel,
        edgeScore: await calculateEdgeScore(),
      },

      // 슬롯 배치 상태
      slots: slotsResult,

      // 레짐 정보
      regime: regimeResult.data ?? null,

      // 승인 큐 (pending decisions + unresolved risk)
      queue: {
        pendingDecisions: (pendingDecisionsResult.data ?? []).map((d) => ({
          id: d.id,
          slotId: d.slot_id,
          type: d.decision_type,
          fromStrategy: d.from_strategy_id,
          toStrategy: d.to_strategy_id,
          regime: d.regime,
          reason: d.reason_summary,
          createdAt: d.created_at,
        })),
        unresolvedRisks: (unresolvedRiskResult.data ?? []).map((r) => ({
          id: r.id,
          eventType: r.event_type,
          severity: r.severity,
          details: r.details,
          createdAt: r.created_at,
        })),
      },

      // 열린 포지션
      positions: {
        live: (openLiveResult.data ?? []).map((p) => ({ ...p, source: 'live' as const })),
        paper: (openPaperResult.data ?? []).map((p) => ({ ...p, source: 'paper' as const })),
      },

      // 시장 상황 (거래소 실데이터 + 레짐)
      market: {
        regime: regimeResult.data?.regime ?? null,
        btcPrice: regimeResult.data?.btc_price ?? null,
        rsi14: regimeResult.data?.rsi14 ?? null,
        atrPct: regimeResult.data?.atr_pct ?? null,
        ...(await getMarketSummary(regimeResult.data?.atr_pct ?? null)),
      },

      // 최근 판단 로그
      decisions: (recentDecisionsResult.data ?? []).map((d) => ({
        id: d.id,
        slotId: d.slot_id,
        type: d.decision_type,
        status: d.status,
        fromStrategy: d.from_strategy_id,
        toStrategy: d.to_strategy_id,
        regime: d.regime,
        reason: d.reason_summary,
        createdAt: d.created_at,
        executedAt: d.executed_at,
      })),

      // 연구 요약
      research: {
        running: researchRunningResult.count ?? 0,
        queued: researchQueuedResult.count ?? 0,
        completed: researchCompletedResult.count ?? 0,
        topCandidates: (topCandidatesResult.data ?? []).map((r) => ({
          id: r.id,
          strategyName: strategyNameMap.get(r.strategy_id) ?? r.strategy_id,
          status: r.status,
          startedAt: r.started_at,
          completedAt: r.ended_at,
          metrics: topMetricsMap.get(r.id) ?? null,
        })),
      },

      // 서킷 브레이커
      circuitBreaker: cb,
    }

    return response
}

/**
 * 서버 시작 시 캐시 pre-seed
 * 백테스트 파이프라인 전에 호출하면 프론트엔드가 즉시 응답 받음
 */
export async function preSeedOperatorHomeCache(): Promise<void> {
  try {
    const data = await buildOperatorHomeData()
    operatorHomeCache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
    console.log('[API] operator/home 캐시 pre-seed 완료')
  } catch (err) {
    console.warn('[API] operator/home 캐시 pre-seed 실패:', err instanceof Error ? err.message : err)
  }
}

// ─── GET /operator/home — 트레이딩 대시보드 집계 데이터 (HANDOFF.md §2) ──

apiRoutes.get('/operator/home', async (c) => {
  // 캐시 유효하면 DB 조회 생략
  if (operatorHomeCache && Date.now() < operatorHomeCache.expiresAt) {
    return c.json(operatorHomeCache.data)
  }

  try {
    const data = await buildOperatorHomeData()
    operatorHomeCache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
    return c.json(data)
  } catch (err) {
    console.error('[API] 트레이딩 대시보드 데이터 조회 오류:', err)
    return c.json({ error: '대시보드 데이터 로드 실패' }, 500)
  }
})

// ─── GET /dashboard — 운영실 홈 데이터 (레거시, /operator/home 사용 권장) ──

apiRoutes.get('/dashboard', async (c) => {
  try {
    // 1. 최신 레짐
    const { data: regime } = await supabase
      .from('regime_snapshots')
      .select('regime, btc_price, ema200, rsi14, atr_pct, recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single()

    // 2. 슬롯 상태
    const slots = await getSlotStatus()

    // 3. 서킷 브레이커 상태
    const circuitBreaker = await getCircuitBreakerStatus()

    // 4. 활성 포지션 수 (페이퍼 + 실전)
    const { count: paperPositionCount } = await supabase
      .from('paper_positions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')

    const { count: livePositionCount } = await supabase
      .from('live_positions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')

    // 5. 오늘 PnL (UTC 기준)
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { data: todayClosedLive } = await supabase
      .from('live_positions')
      .select('realized_pnl')
      .eq('status', 'closed')
      .gte('exit_time', todayStart.toISOString())

    const todayRealizedPnl = (todayClosedLive ?? []).reduce(
      (sum, pos) => sum + Number(pos.realized_pnl ?? 0),
      0,
    )

    const { data: openLivePositions } = await supabase
      .from('live_positions')
      .select('unrealized_pnl')
      .eq('status', 'open')

    const unrealizedPnl = (openLivePositions ?? []).reduce(
      (sum, pos) => sum + Number(pos.unrealized_pnl ?? 0),
      0,
    )

    return c.json({
      regime: regime ?? null,
      slots,
      circuitBreaker,
      activePositions: {
        paper: paperPositionCount ?? 0,
        live: livePositionCount ?? 0,
      },
      todayPnl: {
        realized: Math.round(todayRealizedPnl * 100) / 100,
        unrealized: Math.round(unrealizedPnl * 100) / 100,
        total: Math.round((todayRealizedPnl + unrealizedPnl) * 100) / 100,
      },
    })
  } catch (err) {
    console.error('[API] 대시보드 데이터 조회 오류:', err)
    return c.json({ error: '대시보드 데이터 로드 실패' }, 500)
  }
})

// ─── GET /equity — 에퀴티 커브 데이터 ───────────────────────────

apiRoutes.get('/equity', async (c) => {
  try {
    const source = c.req.query('source') ?? 'live'
    const days = parseInt(c.req.query('days') ?? '7', 10)

    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data, error } = await supabase
      .from('equity_snapshots')
      .select('total_equity, regime, active_strategies, unrealized_pnl, realized_pnl, recorded_at')
      .eq('source', source)
      .gte('recorded_at', since.toISOString())
      .order('recorded_at', { ascending: true })

    if (error) {
      console.error('[API] 에퀴티 조회 오류:', error.message)
      return c.json({ error: '에퀴티 데이터 조회 실패' }, 500)
    }

    return c.json({ data: data ?? [] })
  } catch (err) {
    console.error('[API] 에퀴티 API 오류:', err)
    return c.json({ error: '에퀴티 데이터 로드 실패' }, 500)
  }
})

// ─── GET /equity/regime-bands — 레짐 히스토리 밴드 ──────────────

apiRoutes.get('/equity/regime-bands', async (c) => {
  try {
    const days = parseInt(c.req.query('days') ?? '7', 10)

    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data, error } = await supabase
      .from('regime_snapshots')
      .select('regime, btc_price, recorded_at')
      .gte('recorded_at', since.toISOString())
      .order('recorded_at', { ascending: true })

    if (error) {
      console.error('[API] 레짐 밴드 조회 오류:', error.message)
      return c.json({ error: '레짐 밴드 데이터 조회 실패' }, 500)
    }

    return c.json({ data: data ?? [] })
  } catch (err) {
    console.error('[API] 레짐 밴드 API 오류:', err)
    return c.json({ error: '레짐 밴드 데이터 로드 실패' }, 500)
  }
})

// ─── GET /decisions — 오케스트레이터 판단 로그 ──────────────────

apiRoutes.get('/decisions', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') ?? '20', 10)

    const { data, error } = await supabase
      .from('orchestrator_decisions')
      .select(`
        id, slot_id, decision_type, status,
        from_strategy_id, to_strategy_id,
        regime, reason_summary, created_at, executed_at
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[API] 판단 로그 조회 오류:', error.message)
      return c.json({ error: '판단 로그 조회 실패' }, 500)
    }

    return c.json({ data: data ?? [] })
  } catch (err) {
    console.error('[API] 판단 로그 API 오류:', err)
    return c.json({ error: '판단 로그 로드 실패' }, 500)
  }
})

// ─── GET /decisions/:id — 단일 판단 상세 ────────────────────────

apiRoutes.get('/decisions/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const { data, error } = await supabase
      .from('orchestrator_decisions')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return c.json({ error: '판단을 찾을 수 없습니다' }, 404)
    }

    return c.json({ data })
  } catch (err) {
    console.error('[API] 판단 상세 API 오류:', err)
    return c.json({ error: '판단 상세 로드 실패' }, 500)
  }
})

// ─── GET /slots — 현재 슬롯 배치 상태 ──────────────────────────

apiRoutes.get('/slots', async (c) => {
  try {
    const slots = await getSlotStatus()
    return c.json({ data: slots })
  } catch (err) {
    console.error('[API] 슬롯 상태 API 오류:', err)
    return c.json({ error: '슬롯 상태 로드 실패' }, 500)
  }
})

// ─── GET /strategies — 전략 카탈로그 ────────────────────────────

apiRoutes.get('/strategies', async (c) => {
  try {
    const { data, error } = await supabase
      .from('strategies')
      .select('id, strategy_id, name, description, asset_class, timeframe, exchange, direction, status, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API] 전략 카탈로그 조회 오류:', error.message)
      return c.json({ error: '전략 카탈로그 조회 실패' }, 500)
    }

    return c.json({ data: data ?? [] })
  } catch (err) {
    console.error('[API] 전략 카탈로그 API 오류:', err)
    return c.json({ error: '전략 카탈로그 로드 실패' }, 500)
  }
})

// ─── GET /strategies/comparison — 전략 비교 데이터 ──────────────

apiRoutes.get('/strategies/comparison', async (c) => {
  try {
    // 전략 목록 조회
    const { data: strategies, error: stratErr } = await supabase
      .from('strategies')
      .select('id, strategy_id, name, status')

    if (stratErr || !strategies) {
      return c.json({ error: '전략 목록 조회 실패' }, 500)
    }

    // 각 전략별 백테스트(연구), 페이퍼, 실전 성과 수집
    const comparison = await Promise.all(
      strategies.map(async (strategy) => {
        // 백테스트 성과 (연구 루프 최신 메트릭)
        const { data: researchRun } = await supabase
          .from('research_runs')
          .select('id')
          .eq('strategy_id', strategy.id)
          .eq('status', 'completed')
          .order('ended_at', { ascending: false })
          .limit(1)
          .single()

        let backtestMetrics = null
        if (researchRun) {
          const { data: metrics } = await supabase
            .from('research_run_metrics')
            .select('total_return, max_drawdown, win_rate, sharpe, trade_count')
            .eq('research_run_id', researchRun.id)
            .limit(1)
            .single()
          backtestMetrics = metrics
        }

        // 페이퍼 성과 (최신 세션)
        const { data: paperSession } = await supabase
          .from('paper_sessions')
          .select('id, initial_capital, current_equity, current_drawdown, status, started_at')
          .eq('strategy_id', strategy.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        // 실전 성과 (청산 포지션 합산)
        // 실전은 슬롯 기반이라 직접 전략 매핑이 없으므로, 슬롯에서 전략을 찾아 연결
        const { data: liveSlots } = await supabase
          .from('orchestrator_slots')
          .select('asset_key')
          .eq('strategy_id', strategy.id)
          .eq('status', 'active')

        let liveStats = null
        if (liveSlots && liveSlots.length > 0) {
          const assetKeys = liveSlots.map((s) => s.asset_key)
          const { data: livePositions } = await supabase
            .from('live_positions')
            .select('realized_pnl, unrealized_pnl, status')
            .in('asset_key', assetKeys)

          if (livePositions && livePositions.length > 0) {
            const totalRealized = livePositions.reduce(
              (sum, p) => sum + Number(p.realized_pnl ?? 0), 0,
            )
            const totalUnrealized = livePositions
              .filter((p) => p.status === 'open')
              .reduce((sum, p) => sum + Number(p.unrealized_pnl ?? 0), 0)
            liveStats = {
              totalRealized: Math.round(totalRealized * 100) / 100,
              totalUnrealized: Math.round(totalUnrealized * 100) / 100,
              positionCount: livePositions.length,
            }
          }
        }

        return {
          strategyId: strategy.strategy_id,
          name: strategy.name,
          status: strategy.status,
          backtest: backtestMetrics,
          paper: paperSession
            ? {
                initialCapital: Number(paperSession.initial_capital),
                currentEquity: Number(paperSession.current_equity),
                drawdown: Number(paperSession.current_drawdown),
                returnPct: ((Number(paperSession.current_equity) - Number(paperSession.initial_capital)) / Number(paperSession.initial_capital)) * 100,
                status: paperSession.status,
                startedAt: paperSession.started_at,
              }
            : null,
          live: liveStats,
        }
      }),
    )

    return c.json({ data: comparison })
  } catch (err) {
    console.error('[API] 전략 비교 API 오류:', err)
    return c.json({ error: '전략 비교 데이터 로드 실패' }, 500)
  }
})

// ─── GET /research/runs — 연구 루프 실행 이력 ───────────────────

apiRoutes.get('/research/runs', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') ?? '20', 10)

    const { data: runs, error } = await supabase
      .from('research_runs')
      .select(`
        id, strategy_id, market_scope, parameter_set,
        status, promotion_status,
        started_at, ended_at, created_at
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[API] 연구 실행 이력 조회 오류:', error.message)
      return c.json({ error: '연구 실행 이력 조회 실패' }, 500)
    }

    // 각 실행에 대한 메트릭 조회
    const runIds = (runs ?? []).map((r) => r.id)
    let metricsMap = new Map<string, Record<string, unknown>>()

    if (runIds.length > 0) {
      const { data: metrics } = await supabase
        .from('research_run_metrics')
        .select('research_run_id, total_return, max_drawdown, win_rate, sharpe, profit_factor, trade_count')
        .in('research_run_id', runIds)

      for (const m of metrics ?? []) {
        metricsMap.set(m.research_run_id, m)
      }
    }

    // 전략 이름 조회
    const strategyIds = [...new Set((runs ?? []).map((r) => r.strategy_id).filter(Boolean))]
    let strategyNameMap = new Map<string, string>()

    if (strategyIds.length > 0) {
      const { data: strategies } = await supabase
        .from('strategies')
        .select('id, strategy_id, name')
        .in('id', strategyIds)

      for (const s of strategies ?? []) {
        strategyNameMap.set(s.id, s.name)
      }
    }

    const enrichedRuns = (runs ?? []).map((run) => ({
      ...run,
      strategyName: strategyNameMap.get(run.strategy_id) ?? null,
      metrics: metricsMap.get(run.id) ?? null,
    }))

    return c.json({ data: enrichedRuns })
  } catch (err) {
    console.error('[API] 연구 실행 이력 API 오류:', err)
    return c.json({ error: '연구 실행 이력 로드 실패' }, 500)
  }
})

// ─── GET /research/candidates — 현재 후보 랭킹 ─────────────────

apiRoutes.get('/research/candidates', async (c) => {
  try {
    // 최신 랭킹 시점 조회
    const { data: latestRanking } = await supabase
      .from('orchestrator_candidate_rankings')
      .select('ranked_at')
      .order('ranked_at', { ascending: false })
      .limit(1)
      .single()

    if (!latestRanking) {
      return c.json({ data: [], rankedAt: null })
    }

    // 해당 시점의 모든 후보 조회
    const { data: candidates, error } = await supabase
      .from('orchestrator_candidate_rankings')
      .select('strategy_id, regime, score, sharpe, mdd, win_rate, ranked_at')
      .eq('ranked_at', latestRanking.ranked_at)
      .order('score', { ascending: false })

    if (error) {
      console.error('[API] 후보 랭킹 조회 오류:', error.message)
      return c.json({ error: '후보 랭킹 조회 실패' }, 500)
    }

    // 전략 이름 조회
    const strategyIds = [...new Set((candidates ?? []).map((c) => c.strategy_id))]
    const strategyNameMap = new Map<string, string>()
    const assetMap = new Map<string, string>()
    const promotionMap = new Map<string, string>()

    if (strategyIds.length > 0) {
      const { data: strategies } = await supabase
        .from('strategies')
        .select('id, strategy_id, name, exchange')
        .in('id', strategyIds)

      for (const s of strategies ?? []) {
        strategyNameMap.set(s.id, s.name)
        assetMap.set(s.id, s.exchange === 'okx' ? 'BTC-USDT' : 'BTC-KRW')
      }

      // 전략별 최신 연구 결과의 promotion_status
      const { data: latestRuns } = await supabase
        .from('research_runs')
        .select('strategy_id, promotion_status')
        .in('strategy_id', strategyIds)
        .eq('status', 'completed')
        .order('ended_at', { ascending: false })

      for (const r of latestRuns ?? []) {
        if (!promotionMap.has(r.strategy_id)) {
          promotionMap.set(r.strategy_id, r.promotion_status ?? 'none')
        }
      }
    }

    const enrichedCandidates = (candidates ?? []).map((candidate) => ({
      ...candidate,
      strategyName: strategyNameMap.get(candidate.strategy_id) ?? null,
      asset: assetMap.get(candidate.strategy_id) ?? '',
      promotionStatus: promotionMap.get(candidate.strategy_id) ?? 'none',
    }))

    return c.json({
      data: enrichedCandidates,
      rankedAt: latestRanking.ranked_at,
    })
  } catch (err) {
    console.error('[API] 후보 랭킹 API 오류:', err)
    return c.json({ error: '후보 랭킹 로드 실패' }, 500)
  }
})

// ─── GET /risk/status — 리스크 상태 ─────────────────────────────

apiRoutes.get('/risk/status', async (c) => {
  try {
    // 서킷 브레이커 상태
    const circuitBreaker = await getCircuitBreakerStatus()

    // 최근 리스크 이벤트 (최신 10건)
    const { data: recentEvents, error } = await supabase
      .from('risk_events')
      .select('id, event_type, severity, details, resolved, created_at, resolved_at')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('[API] 리스크 이벤트 조회 오류:', error.message)
    }

    return c.json({
      circuitBreaker,
      recentEvents: recentEvents ?? [],
    })
  } catch (err) {
    console.error('[API] 리스크 상태 API 오류:', err)
    return c.json({ error: '리스크 상태 로드 실패' }, 500)
  }
})

// ─── GET /positions — 포지션 목록 ───────────────────────────────

apiRoutes.get('/positions', async (c) => {
  try {
    const status = c.req.query('status') ?? 'open'

    // 페이퍼 포지션
    const { data: paperPositions, error: paperErr } = await supabase
      .from('paper_positions')
      .select(`
        id, session_id, asset_key, side, entry_price, current_qty,
        peak_price, unrealized_pnl, realized_pnl,
        stop_price, entry_time, exit_time, exit_reason, status
      `)
      .eq('status', status)
      .order('entry_time', { ascending: false })

    if (paperErr) {
      console.error('[API] 페이퍼 포지션 조회 오류:', paperErr.message)
    }

    // 실전 포지션
    const { data: livePositions, error: liveErr } = await supabase
      .from('live_positions')
      .select(`
        id, asset_key, exchange, side, entry_price, current_qty,
        peak_price, unrealized_pnl, realized_pnl,
        stop_price, leverage, margin_mode,
        entry_time, exit_time, exit_reason, status
      `)
      .eq('status', status)
      .order('entry_time', { ascending: false })

    if (liveErr) {
      console.error('[API] 실전 포지션 조회 오류:', liveErr.message)
    }

    return c.json({
      paper: (paperPositions ?? []).map((p) => ({ ...p, source: 'paper' })),
      live: (livePositions ?? []).map((p) => ({ ...p, source: 'live' })),
    })
  } catch (err) {
    console.error('[API] 포지션 목록 API 오류:', err)
    return c.json({ error: '포지션 목록 로드 실패' }, 500)
  }
})

// ─── GET /notifications — 알림 목록 ─────────────────────────────

apiRoutes.get('/notifications', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') ?? '20', 10)

    const { data, error } = await supabase
      .from('notifications')
      .select('id, event_type, priority, channel, target_ref, message_summary, message_detail, sent_at, acknowledged_at')
      .order('sent_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[API] 알림 목록 조회 오류:', error.message)
      return c.json({ error: '알림 목록 조회 실패' }, 500)
    }

    return c.json({ data: data ?? [] })
  } catch (err) {
    console.error('[API] 알림 목록 API 오류:', err)
    return c.json({ error: '알림 목록 로드 실패' }, 500)
  }
})

// ─── POST /notifications/:id/ack — 알림 읽음 처리 ──────────────

// 쓰기 작업에만 인증 적용 (읽기는 무인증, HANDOFF.md §1)
apiRoutes.post('/notifications/:id/ack', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id')

    const { data, error } = await supabase
      .from('notifications')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', id)
      .is('acknowledged_at', null)
      .select('id, acknowledged_at')
      .single()

    if (error) {
      console.error('[API] 알림 읽음 처리 오류:', error.message)
      return c.json({ error: '알림을 찾을 수 없거나 이미 읽음 처리됨' }, 404)
    }

    return c.json({ data })
  } catch (err) {
    console.error('[API] 알림 읽음 API 오류:', err)
    return c.json({ error: '알림 읽음 처리 실패' }, 500)
  }
})

// ─── POST /decisions/:id/approve — 판단 승인 ──────────────────

apiRoutes.post('/decisions/:id/approve', async (c) => {
  const id = c.req.param('id')

  // pending 상태인 판단만 승인 가능
  const { data: decision, error: fetchErr } = await supabase
    .from('orchestrator_decisions')
    .select('id, status, decision_type')
    .eq('id', id)
    .single()

  if (fetchErr || !decision) {
    return c.json({ error: '판단을 찾을 수 없습니다' }, 404)
  }

  if (decision.status !== 'pending') {
    return c.json({ error: `승인할 수 없는 상태입니다: ${decision.status}` }, 400)
  }

  // pending → approved → 즉시 실행
  await supabase
    .from('orchestrator_decisions')
    .update({ status: 'approved' })
    .eq('id', id)

  const success = await executeDecision(id)

  return c.json({
    success,
    id,
    previousStatus: 'pending',
    newStatus: success ? 'executed' : 'failed',
  })
})

// ─── POST /decisions/:id/reject — 판단 거부 ──────────────────

apiRoutes.post('/decisions/:id/reject', async (c) => {
  const id = c.req.param('id')

  const { data: decision, error: fetchErr } = await supabase
    .from('orchestrator_decisions')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchErr || !decision) {
    return c.json({ error: '판단을 찾을 수 없습니다' }, 404)
  }

  if (decision.status !== 'pending') {
    return c.json({ error: `거부할 수 없는 상태입니다: ${decision.status}` }, 400)
  }

  await supabase
    .from('orchestrator_decisions')
    .update({ status: 'rejected' })
    .eq('id', id)

  return c.json({ success: true, id, newStatus: 'rejected' })
})

// ─── POST /risk/events/:id/resolve — 리스크 이벤트 해결 ──────

apiRoutes.post('/risk/events/:id/resolve', async (c) => {
  const id = c.req.param('id')

  const { error } = await supabase
    .from('risk_events')
    .update({ resolved: true })
    .eq('id', id)
    .eq('resolved', false)

  if (error) {
    return c.json({ error: '리스크 이벤트를 찾을 수 없습니다' }, 404)
  }

  return c.json({ success: true, id })
})

export default apiRoutes
