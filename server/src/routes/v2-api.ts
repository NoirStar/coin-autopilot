/**
 * V2 API 라우트 — 대시보드 프론트엔드용
 *
 * V2 백엔드 모듈(오케스트레이터, 리스크, 연구루프 등)의 데이터를
 * 프론트엔드에 노출하는 API 엔드포인트 모음.
 * 모든 데이터는 v2_ 접두사 테이블에서 조회한다.
 */

import { Hono } from 'hono'
import { supabase } from '../services/database.js'
import { getSlotStatus } from '../orchestrator/v2-orchestrator.js'
import { getCircuitBreakerStatus } from '../risk/v2-risk-manager.js'

const v2ApiRoutes = new Hono()

// ─── GET /dashboard — 운영실 홈 데이터 ──────────────────────────

v2ApiRoutes.get('/dashboard', async (c) => {
  try {
    // 1. 최신 레짐
    const { data: regime } = await supabase
      .from('v2_regime_snapshots')
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
      .from('v2_paper_positions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')

    const { count: livePositionCount } = await supabase
      .from('v2_live_positions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')

    // 5. 오늘 PnL (UTC 기준)
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { data: todayClosedLive } = await supabase
      .from('v2_live_positions')
      .select('realized_pnl')
      .eq('status', 'closed')
      .gte('exit_time', todayStart.toISOString())

    const todayRealizedPnl = (todayClosedLive ?? []).reduce(
      (sum, pos) => sum + Number(pos.realized_pnl ?? 0),
      0,
    )

    const { data: openLivePositions } = await supabase
      .from('v2_live_positions')
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
    console.error('[V2 API] 대시보드 데이터 조회 오류:', err)
    return c.json({ error: '대시보드 데이터 로드 실패' }, 500)
  }
})

// ─── GET /equity — 에퀴티 커브 데이터 ───────────────────────────

v2ApiRoutes.get('/equity', async (c) => {
  try {
    const source = c.req.query('source') ?? 'live'
    const days = parseInt(c.req.query('days') ?? '7', 10)

    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data, error } = await supabase
      .from('v2_equity_snapshots')
      .select('total_equity, regime, active_strategies, unrealized_pnl, realized_pnl, recorded_at')
      .eq('source', source)
      .gte('recorded_at', since.toISOString())
      .order('recorded_at', { ascending: true })

    if (error) {
      console.error('[V2 API] 에퀴티 조회 오류:', error.message)
      return c.json({ error: '에퀴티 데이터 조회 실패' }, 500)
    }

    return c.json({ data: data ?? [] })
  } catch (err) {
    console.error('[V2 API] 에퀴티 API 오류:', err)
    return c.json({ error: '에퀴티 데이터 로드 실패' }, 500)
  }
})

// ─── GET /equity/regime-bands — 레짐 히스토리 밴드 ──────────────

v2ApiRoutes.get('/equity/regime-bands', async (c) => {
  try {
    const days = parseInt(c.req.query('days') ?? '7', 10)

    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data, error } = await supabase
      .from('v2_regime_snapshots')
      .select('regime, btc_price, recorded_at')
      .gte('recorded_at', since.toISOString())
      .order('recorded_at', { ascending: true })

    if (error) {
      console.error('[V2 API] 레짐 밴드 조회 오류:', error.message)
      return c.json({ error: '레짐 밴드 데이터 조회 실패' }, 500)
    }

    return c.json({ data: data ?? [] })
  } catch (err) {
    console.error('[V2 API] 레짐 밴드 API 오류:', err)
    return c.json({ error: '레짐 밴드 데이터 로드 실패' }, 500)
  }
})

// ─── GET /decisions — 오케스트레이터 판단 로그 ──────────────────

v2ApiRoutes.get('/decisions', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') ?? '20', 10)

    const { data, error } = await supabase
      .from('v2_orchestrator_decisions')
      .select(`
        id, slot_id, decision_type, status,
        from_strategy_id, to_strategy_id,
        regime, reason_summary, created_at, executed_at
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[V2 API] 판단 로그 조회 오류:', error.message)
      return c.json({ error: '판단 로그 조회 실패' }, 500)
    }

    return c.json({ data: data ?? [] })
  } catch (err) {
    console.error('[V2 API] 판단 로그 API 오류:', err)
    return c.json({ error: '판단 로그 로드 실패' }, 500)
  }
})

// ─── GET /decisions/:id — 단일 판단 상세 ────────────────────────

v2ApiRoutes.get('/decisions/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const { data, error } = await supabase
      .from('v2_orchestrator_decisions')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return c.json({ error: '판단을 찾을 수 없습니다' }, 404)
    }

    return c.json({ data })
  } catch (err) {
    console.error('[V2 API] 판단 상세 API 오류:', err)
    return c.json({ error: '판단 상세 로드 실패' }, 500)
  }
})

// ─── GET /slots — 현재 슬롯 배치 상태 ──────────────────────────

v2ApiRoutes.get('/slots', async (c) => {
  try {
    const slots = await getSlotStatus()
    return c.json({ data: slots })
  } catch (err) {
    console.error('[V2 API] 슬롯 상태 API 오류:', err)
    return c.json({ error: '슬롯 상태 로드 실패' }, 500)
  }
})

// ─── GET /strategies — 전략 카탈로그 ────────────────────────────

v2ApiRoutes.get('/strategies', async (c) => {
  try {
    const { data, error } = await supabase
      .from('v2_strategies')
      .select('id, strategy_id, name, description, asset_class, timeframe, exchange, direction, status, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[V2 API] 전략 카탈로그 조회 오류:', error.message)
      return c.json({ error: '전략 카탈로그 조회 실패' }, 500)
    }

    return c.json({ data: data ?? [] })
  } catch (err) {
    console.error('[V2 API] 전략 카탈로그 API 오류:', err)
    return c.json({ error: '전략 카탈로그 로드 실패' }, 500)
  }
})

// ─── GET /strategies/comparison — 전략 비교 데이터 ──────────────

v2ApiRoutes.get('/strategies/comparison', async (c) => {
  try {
    // 전략 목록 조회
    const { data: strategies, error: stratErr } = await supabase
      .from('v2_strategies')
      .select('id, strategy_id, name, status')

    if (stratErr || !strategies) {
      return c.json({ error: '전략 목록 조회 실패' }, 500)
    }

    // 각 전략별 백테스트(연구), 페이퍼, 실전 성과 수집
    const comparison = await Promise.all(
      strategies.map(async (strategy) => {
        // 백테스트 성과 (연구 루프 최신 메트릭)
        const { data: researchRun } = await supabase
          .from('v2_research_runs')
          .select('id')
          .eq('strategy_id', strategy.id)
          .eq('status', 'completed')
          .order('ended_at', { ascending: false })
          .limit(1)
          .single()

        let backtestMetrics = null
        if (researchRun) {
          const { data: metrics } = await supabase
            .from('v2_research_run_metrics')
            .select('total_return, max_drawdown, win_rate, sharpe, trade_count')
            .eq('research_run_id', researchRun.id)
            .limit(1)
            .single()
          backtestMetrics = metrics
        }

        // 페이퍼 성과 (최신 세션)
        const { data: paperSession } = await supabase
          .from('v2_paper_sessions')
          .select('id, initial_capital, current_equity, current_drawdown, status, started_at')
          .eq('strategy_id', strategy.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        // 실전 성과 (청산 포지션 합산)
        // 실전은 슬롯 기반이라 직접 전략 매핑이 없으므로, 슬롯에서 전략을 찾아 연결
        const { data: liveSlots } = await supabase
          .from('v2_orchestrator_slots')
          .select('asset_key')
          .eq('strategy_id', strategy.id)
          .eq('status', 'active')

        let liveStats = null
        if (liveSlots && liveSlots.length > 0) {
          const assetKeys = liveSlots.map((s) => s.asset_key)
          const { data: livePositions } = await supabase
            .from('v2_live_positions')
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
    console.error('[V2 API] 전략 비교 API 오류:', err)
    return c.json({ error: '전략 비교 데이터 로드 실패' }, 500)
  }
})

// ─── GET /research/runs — 연구 루프 실행 이력 ───────────────────

v2ApiRoutes.get('/research/runs', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') ?? '20', 10)

    const { data: runs, error } = await supabase
      .from('v2_research_runs')
      .select(`
        id, strategy_id, market_scope, parameter_set,
        status, promotion_status,
        started_at, ended_at, created_at
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[V2 API] 연구 실행 이력 조회 오류:', error.message)
      return c.json({ error: '연구 실행 이력 조회 실패' }, 500)
    }

    // 각 실행에 대한 메트릭 조회
    const runIds = (runs ?? []).map((r) => r.id)
    let metricsMap = new Map<string, Record<string, unknown>>()

    if (runIds.length > 0) {
      const { data: metrics } = await supabase
        .from('v2_research_run_metrics')
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
        .from('v2_strategies')
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
    console.error('[V2 API] 연구 실행 이력 API 오류:', err)
    return c.json({ error: '연구 실행 이력 로드 실패' }, 500)
  }
})

// ─── GET /research/candidates — 현재 후보 랭킹 ─────────────────

v2ApiRoutes.get('/research/candidates', async (c) => {
  try {
    // 최신 랭킹 시점 조회
    const { data: latestRanking } = await supabase
      .from('v2_orchestrator_candidate_rankings')
      .select('ranked_at')
      .order('ranked_at', { ascending: false })
      .limit(1)
      .single()

    if (!latestRanking) {
      return c.json({ data: [], rankedAt: null })
    }

    // 해당 시점의 모든 후보 조회
    const { data: candidates, error } = await supabase
      .from('v2_orchestrator_candidate_rankings')
      .select('strategy_id, regime, score, sharpe, mdd, win_rate, ranked_at')
      .eq('ranked_at', latestRanking.ranked_at)
      .order('score', { ascending: false })

    if (error) {
      console.error('[V2 API] 후보 랭킹 조회 오류:', error.message)
      return c.json({ error: '후보 랭킹 조회 실패' }, 500)
    }

    // 전략 이름 조회
    const strategyIds = [...new Set((candidates ?? []).map((c) => c.strategy_id))]
    let strategyNameMap = new Map<string, string>()

    if (strategyIds.length > 0) {
      const { data: strategies } = await supabase
        .from('v2_strategies')
        .select('id, strategy_id, name')
        .in('id', strategyIds)

      for (const s of strategies ?? []) {
        strategyNameMap.set(s.id, s.name)
      }
    }

    const enrichedCandidates = (candidates ?? []).map((candidate) => ({
      ...candidate,
      strategyName: strategyNameMap.get(candidate.strategy_id) ?? null,
    }))

    return c.json({
      data: enrichedCandidates,
      rankedAt: latestRanking.ranked_at,
    })
  } catch (err) {
    console.error('[V2 API] 후보 랭킹 API 오류:', err)
    return c.json({ error: '후보 랭킹 로드 실패' }, 500)
  }
})

// ─── GET /risk/status — 리스크 상태 ─────────────────────────────

v2ApiRoutes.get('/risk/status', async (c) => {
  try {
    // 서킷 브레이커 상태
    const circuitBreaker = await getCircuitBreakerStatus()

    // 최근 리스크 이벤트 (최신 10건)
    const { data: recentEvents, error } = await supabase
      .from('v2_risk_events')
      .select('id, event_type, severity, details, resolved, created_at, resolved_at')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('[V2 API] 리스크 이벤트 조회 오류:', error.message)
    }

    return c.json({
      circuitBreaker,
      recentEvents: recentEvents ?? [],
    })
  } catch (err) {
    console.error('[V2 API] 리스크 상태 API 오류:', err)
    return c.json({ error: '리스크 상태 로드 실패' }, 500)
  }
})

// ─── GET /positions — 포지션 목록 ───────────────────────────────

v2ApiRoutes.get('/positions', async (c) => {
  try {
    const status = c.req.query('status') ?? 'open'

    // 페이퍼 포지션
    const { data: paperPositions, error: paperErr } = await supabase
      .from('v2_paper_positions')
      .select(`
        id, session_id, asset_key, side, entry_price, current_qty,
        peak_price, unrealized_pnl, realized_pnl,
        stop_price, entry_time, exit_time, exit_reason, status
      `)
      .eq('status', status)
      .order('entry_time', { ascending: false })

    if (paperErr) {
      console.error('[V2 API] 페이퍼 포지션 조회 오류:', paperErr.message)
    }

    // 실전 포지션
    const { data: livePositions, error: liveErr } = await supabase
      .from('v2_live_positions')
      .select(`
        id, asset_key, exchange, side, entry_price, current_qty,
        peak_price, unrealized_pnl, realized_pnl,
        stop_price, leverage, margin_mode,
        entry_time, exit_time, exit_reason, status
      `)
      .eq('status', status)
      .order('entry_time', { ascending: false })

    if (liveErr) {
      console.error('[V2 API] 실전 포지션 조회 오류:', liveErr.message)
    }

    return c.json({
      paper: (paperPositions ?? []).map((p) => ({ ...p, source: 'paper' })),
      live: (livePositions ?? []).map((p) => ({ ...p, source: 'live' })),
    })
  } catch (err) {
    console.error('[V2 API] 포지션 목록 API 오류:', err)
    return c.json({ error: '포지션 목록 로드 실패' }, 500)
  }
})

// ─── GET /notifications — 알림 목록 ─────────────────────────────

v2ApiRoutes.get('/notifications', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') ?? '20', 10)

    const { data, error } = await supabase
      .from('v2_notifications')
      .select('id, event_type, priority, channel, target_ref, message_summary, message_detail, sent_at, acknowledged_at')
      .order('sent_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[V2 API] 알림 목록 조회 오류:', error.message)
      return c.json({ error: '알림 목록 조회 실패' }, 500)
    }

    return c.json({ data: data ?? [] })
  } catch (err) {
    console.error('[V2 API] 알림 목록 API 오류:', err)
    return c.json({ error: '알림 목록 로드 실패' }, 500)
  }
})

// ─── POST /notifications/:id/ack — 알림 읽음 처리 ──────────────

v2ApiRoutes.post('/notifications/:id/ack', async (c) => {
  try {
    const id = c.req.param('id')

    const { data, error } = await supabase
      .from('v2_notifications')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', id)
      .is('acknowledged_at', null)
      .select('id, acknowledged_at')
      .single()

    if (error) {
      console.error('[V2 API] 알림 읽음 처리 오류:', error.message)
      return c.json({ error: '알림을 찾을 수 없거나 이미 읽음 처리됨' }, 404)
    }

    return c.json({ data })
  } catch (err) {
    console.error('[V2 API] 알림 읽음 API 오류:', err)
    return c.json({ error: '알림 읽음 처리 실패' }, 500)
  }
})

export default v2ApiRoutes
