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

/** 메인 파이프라인 실행 (크론 + 서버 시작 시 공용) */
async function runMainPipeline(): Promise<void> {
  console.log(`[크론] ═══ 4H 파이프라인 시작: ${new Date().toISOString()} ═══`)
  // 1. 캔들 수집 (업비트 + OKX, 4H 타임프레임)
  await collectLatestCandles('upbit', ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE'], '4h')
  await collectLatestCandles('okx', ['BTC', 'ETH'], '4h')

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
