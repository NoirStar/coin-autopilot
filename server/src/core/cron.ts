import cron from 'node-cron'
import { generateSignals } from '../services/signal-generator.js'
import { runPaperTradingCycle } from '../services/paper-trading-engine.js'
import { runExecutionCycle } from '../services/execution-engine.js'
import { supabase } from '../services/database.js'
import { runFullScan, cleanOldCache } from '../routes/detection.js'

/**
 * 크론 작업 시작
 *
 * 4시간마다 실행: 캔들 수집 → 지표 → 레짐 → 시그널 → 가상매매
 * UTC 기준: 0시, 4시, 8시, 12시, 16시, 20시
 */
let signalFailCount = 0

export function startCronJobs(): void {
  // 4시간마다 시그널 생성 + 가상매매
  cron.schedule('0 0,4,8,12,16,20 * * *', async () => {
    console.log(`[크론] 시그널 생성 시작: ${new Date().toISOString()}`)
    try {
      await generateSignals()
      signalFailCount = 0
    } catch (err) {
      signalFailCount++
      console.error(`[크론] 시그널 생성 실패 (연속 ${signalFailCount}회):`, err)
      if (signalFailCount >= 2) {
        console.error(`[크론] 경고: 시그널 생성 연속 ${signalFailCount}회 실패! 데이터 파이프라인 점검 필요`)
      }
    }

    // 시그널 생성 후 가상매매 사이클 실행
    try {
      await runPaperTradingCycle()
    } catch (err) {
      console.error('[크론] 가상매매 사이클 오류:', err)
    }

    // 실전매매 사이클 (LIVE_TRADING=true 환경변수로 활성화)
    if (process.env.LIVE_TRADING === 'true') {
      try {
        await runExecutionCycle({ enabled: true })
      } catch (err) {
        console.error('[크론] 실전매매 사이클 오류:', err)
      }
    }
  })

  // 6시간마다 Supabase 헬스체크 (7일 미사용 정지 방지)
  cron.schedule('0 */6 * * *', async () => {
    try {
      const { error } = await supabase.from('regime_states').select('id').limit(1)
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

  console.log('[크론] 스케줄 등록 완료 (4시간 시그널 + 1시간 탐지 + 일일 캐시 정리)')
}
