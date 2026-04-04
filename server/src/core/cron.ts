import cron from 'node-cron'
import { supabase } from '../services/database.js'
import { runResearchLoop } from '../research/research-loop.js'
import { runOrchestratorCycle } from '../orchestrator/orchestrator.js'
import { runPaperTradingCycle } from '../paper/paper-engine.js'
import { reconcilePositions } from '../execution/execution-engine.js'
import { runRiskCheck } from '../risk/risk-manager.js'
import { runFullScan, cleanOldCache } from '../routes/detection.js'
import { collectLatestCandles, backfillCandles } from '../data/candle-collector.js'
import { preSeedOperatorHomeCache } from '../routes/api.js'

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

/** 특정 캔들 수가 충분한지 확인 */
async function candleCount(assetKey: string, exchange: string, timeframe: string): Promise<number> {
  const { count } = await supabase
    .from('candles')
    .select('id', { count: 'exact', head: true })
    .eq('asset_key', assetKey)
    .eq('exchange', exchange)
    .eq('timeframe', timeframe)
  return count ?? 0
}

/** 캔들이 충분한지 확인하고, 부족하면 backfill */
async function ensureMinimumCandles(): Promise<void> {
  // 타임프레임별 최소 캔들 수 (연구루프 CANDLE_LIMITS와 동기화)
  const MIN_BY_TF: Record<string, number> = { '1h': 18000, '4h': 5000 }

  // 전략이 사용하는 모든 (exchange, asset_key, timeframe) 조합
  const targets: Array<{ exchange: 'upbit' | 'okx'; key: string; tf: '4h' | '1h' }> = [
    // 4h 타임프레임 (upbit)
    { exchange: 'upbit', key: 'BTC-KRW', tf: '4h' },
    { exchange: 'upbit', key: 'ETH-KRW', tf: '4h' },
    { exchange: 'upbit', key: 'XRP-KRW', tf: '4h' },
    { exchange: 'upbit', key: 'SOL-KRW', tf: '4h' },
    { exchange: 'upbit', key: 'DOGE-KRW', tf: '4h' },
    // 4h 타임프레임 (okx) — btc_ema_crossover, btc_bollinger_reversion
    { exchange: 'okx', key: 'BTC-USDT', tf: '4h' },
    { exchange: 'okx', key: 'ETH-USDT', tf: '4h' },
    // 1h 타임프레임 (okx) — btc_macd_momentum, btc_donchian_breakout
    { exchange: 'okx', key: 'BTC-USDT', tf: '1h' },
    { exchange: 'okx', key: 'ETH-USDT', tf: '1h' },
    // 1h 타임프레임 (upbit) — alt_detection + alt_mean_reversion 연구용
    { exchange: 'upbit', key: 'BTC-KRW', tf: '1h' },
    { exchange: 'upbit', key: 'ETH-KRW', tf: '1h' },
    { exchange: 'upbit', key: 'XRP-KRW', tf: '1h' },
    { exchange: 'upbit', key: 'SOL-KRW', tf: '1h' },
    { exchange: 'upbit', key: 'DOGE-KRW', tf: '1h' },
  ]

  let needsBackfill = false
  for (const t of targets) {
    const minNeeded = MIN_BY_TF[t.tf] ?? 5000
    const cnt = await candleCount(t.key, t.exchange, t.tf)
    if (cnt < minNeeded) {
      needsBackfill = true
      break
    }
  }

  if (!needsBackfill) return

  console.log(`[크론] 캔들 부족 감지 — backfill 시작`)

  for (const t of targets) {
    const minNeeded = MIN_BY_TF[t.tf] ?? 5000
    const cnt = await candleCount(t.key, t.exchange, t.tf)
    if (cnt < minNeeded) {
      // 1h: 30개월(2.5년, ~18000개), 4h: 30개월(2.5년, ~5400개)
      const months = 30
      console.log(`[크론] ${t.exchange}/${t.key} ${t.tf}: ${cnt}개 (필요 ${minNeeded}) → backfill (${months}개월)`)
      await backfillCandles(t.exchange, t.key, t.tf, months)
    }
  }

  console.log('[크론] backfill 완료')
}

/** 메인 파이프라인 실행 (크론 + 서버 시작 시 공용) */
async function runMainPipeline(): Promise<void> {
  console.log(`[크론] ═══ 4H 파이프라인 시작: ${new Date().toISOString()} ═══`)

  // 0. 최초 실행 시 캔들 부족하면 자동 backfill
  await ensureMinimumCandles()

  // 1. 캔들 증분 수집
  const upbitKeys = ['BTC-KRW', 'ETH-KRW', 'XRP-KRW', 'SOL-KRW', 'DOGE-KRW']
  await collectLatestCandles('upbit', upbitKeys, '4h')
  await collectLatestCandles('upbit', upbitKeys, '1h')
  await collectLatestCandles('okx', ['BTC-USDT', 'ETH-USDT'], '4h')
  await collectLatestCandles('okx', ['BTC-USDT', 'ETH-USDT'], '1h')

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
  // 서버 시작 시 캐시 pre-seed → 파이프라인 실행
  setTimeout(async () => {
    // 대시보드 캐시 먼저 채움 — 프론트엔드가 즉시 데이터를 받을 수 있도록
    await preSeedOperatorHomeCache()

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
