import cron from 'node-cron'
import { supabase } from '../services/database.js'
import { runResearchLoop } from '../research/research-loop.js'
import { runOrchestratorCycle } from '../orchestrator/orchestrator.js'
import { runPaperTradingCycle } from '../paper/paper-engine.js'
import { reconcilePositions } from '../execution/execution-engine.js'
import { runRiskCheck } from '../risk/risk-manager.js'
import { runFullScan, cleanOldCache } from '../routes/detection.js'
import { collectLatestCandles } from '../data/candle-collector.js'

/**
 * 크론 작업 시작
 *
 * 4시간마다: 캔들 수집 → 연구 루프 → 오케스트레이터 → 가상매매 → 실전 조정 → 리스크 체크
 * 1시간마다: 알트코인 탐지 스캔
 * 6시간마다: Supabase 헬스체크
 * 매일 0시: 캐시 정리
 */
let cycleFailCount = 0

/**
 * 에퀴티 스냅샷 저장
 *
 * - live: OKX 실잔고 조회 (LIVE_TRADING 시) 또는 DB live_positions 기준
 * - paper: 모든 running paper_sessions 합산
 */
async function snapshotEquity(): Promise<void> {
  try {
    // ── live 에퀴티 ──
    let liveEquity = 0
    let liveUnrealized = 0
    let liveRealized = 0

    let usedExchangeApi = false
    if (process.env.LIVE_TRADING === 'true') {
      try {
        const { fetchBalance } = await import('../exchange/okx-client.js')
        const bal = await fetchBalance()
        liveEquity = bal.total
        usedExchangeApi = true
      } catch (err) {
        console.warn('[스냅샷] OKX 잔고 조회 실패, DB 기반 폴백:', err)
      }
    }

    if (!usedExchangeApi || liveEquity === 0) {
      // DB 기반 live 포지션 합산
      const { data: openLive } = await supabase
        .from('live_positions')
        .select('unrealized_pnl, realized_pnl')
        .eq('status', 'open')

      liveUnrealized = (openLive ?? []).reduce((s, p) => s + Number(p.unrealized_pnl ?? 0), 0)

      const { data: closedToday } = await supabase
        .from('live_positions')
        .select('realized_pnl')
        .eq('status', 'closed')
        .gte('exit_time', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())

      liveRealized = (closedToday ?? []).reduce((s, p) => s + Number(p.realized_pnl ?? 0), 0)
      liveEquity = liveRealized + liveUnrealized
    }

    // 현재 레짐
    const { data: regimeRow } = await supabase
      .from('regime_snapshots')
      .select('regime')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single()

    const regime = regimeRow?.regime ?? 'neutral'

    await supabase.from('equity_snapshots').insert({
      source: 'live',
      total_equity: Math.round(liveEquity * 100) / 100,
      regime,
      unrealized_pnl: Math.round(liveUnrealized * 100) / 100,
      realized_pnl: Math.round(liveRealized * 100) / 100,
    })

    // ── paper 에퀴티 (전체 세션 합산) ──
    const { data: sessions } = await supabase
      .from('paper_sessions')
      .select('id, current_equity')
      .eq('status', 'running')

    if (sessions && sessions.length > 0) {
      const paperTotal = sessions.reduce((s, sess) => s + Number(sess.current_equity ?? 0), 0)

      // paper 포지션 미실현 합산
      const sessionIds = sessions.map((s) => s.id)
      const { data: paperOpen } = await supabase
        .from('paper_positions')
        .select('unrealized_pnl')
        .eq('status', 'open')
        .in('session_id', sessionIds)

      const paperUnrealized = (paperOpen ?? []).reduce((s, p) => s + Number(p.unrealized_pnl ?? 0), 0)

      await supabase.from('equity_snapshots').insert({
        source: 'paper',
        total_equity: Math.round(paperTotal * 100) / 100,
        regime,
        unrealized_pnl: Math.round(paperUnrealized * 100) / 100,
        realized_pnl: 0,
      })
    }

    console.log(`[스냅샷] 에퀴티 저장 완료 — live: ${liveEquity.toFixed(2)}, paper 세션: ${sessions?.length ?? 0}개`)
  } catch (err) {
    console.error('[스냅샷] 에퀴티 저장 실패:', err)
  }
}

/** 메인 파이프라인 실행 (크론 + 서버 시작 시 공용) */
async function runMainPipeline(): Promise<void> {
  console.log(`[크론] ═══ 4H 파이프라인 시작: ${new Date().toISOString()} ═══`)
  // 1. 캔들 수집 (업비트 KRW 마켓 + OKX USDT 마켓, 4H 타임프레임)
  await collectLatestCandles('upbit', ['BTC-KRW', 'ETH-KRW', 'XRP-KRW', 'SOL-KRW', 'DOGE-KRW'], '4h')
  await collectLatestCandles('okx', ['BTC-USDT', 'ETH-USDT'], '4h')

  // 2. 연구 루프 (백테스트 → 승격 평가)
  await runResearchLoop()

  // 3. 오케스트레이터 (레짐 판정 → 전략 배치/교체)
  await runOrchestratorCycle()

  // 4. 가상매매 사이클
  await runPaperTradingCycle()

  // 5. 실전 포지션 조정 (거래소 ↔ DB 동기화)
  await reconcilePositions()

  // 6. 리스크 체크 (일일 손실 한도, 서킷 브레이커)
  await runRiskCheck()

  // 7. 에퀴티 스냅샷 저장 (live + paper 합산)
  await snapshotEquity()

  console.log(`[크론] ═══ 4H 파이프라인 완료 ═══`)
}

export function startCronJobs(): void {
  // 서버 시작 시 즉시 1회 실행 (비동기, 서버 응답 차단 안 함)
  setTimeout(async () => {
    console.log('[크론] 서버 시작 — 최초 파이프라인 실행')
    try {
      await runMainPipeline()
      cycleFailCount = 0
    } catch (err) {
      cycleFailCount++
      console.error('[크론] 최초 파이프라인 실패:', err)
    }
  }, 3_000) // 3초 대기 (DB 연결 안정화)

  // 4시간마다 메인 파이프라인
  cron.schedule('0 0,4,8,12,16,20 * * *', async () => {
    try {
      await runMainPipeline()
      cycleFailCount = 0
    } catch (err) {
      cycleFailCount++
      console.error(`[크론] 4H 파이프라인 실패 (연속 ${cycleFailCount}회):`, err)
      if (cycleFailCount >= 2) {
        console.error(`[크론] 경고: 파이프라인 연속 ${cycleFailCount}회 실패! 점검 필요`)
      }
    }
  })

  // 6시간마다 Supabase 헬스체크 (7일 미사용 정지 방지)
  cron.schedule('0 */6 * * *', async () => {
    try {
      const { error } = await supabase.from('regime_snapshots').select('id').limit(1)
      if (error) console.warn('[헬스체크] Supabase 연결 문제:', error.message)
      else console.log('[헬스체크] Supabase OK')
    } catch (err) {
      console.error('[헬스체크] 오류:', err)
    }
  })

  // 1시간마다 알트코인 탐지 스캔 + 캐시 저장
  cron.schedule('5 * * * *', async () => {
    console.log(`[크론] 알트코인 탐지 스캔 시작: ${new Date().toISOString()}`)
    try {
      const result = await runFullScan()
      console.log(`[크론] 탐지 스캔 완료: ${result.totalScanned}개 스캔, ${result.detected}개 감지`)
    } catch (err) {
      console.error('[크론] 탐지 스캔 실패:', err)
    }
  })

  // 매일 0시에 30일 이전 캐시 정리
  cron.schedule('0 0 * * *', async () => {
    await cleanOldCache()
  })

  console.log('[크론] 스케줄 등록 완료 (4H 파이프라인 + 1H 탐지 + 일일 캐시 정리)')
}
