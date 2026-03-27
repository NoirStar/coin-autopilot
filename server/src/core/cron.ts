import cron from 'node-cron'
import { generateSignals } from '../services/signal-generator.js'
import { supabase } from '../services/database.js'

/**
 * 크론 작업 시작
 *
 * 4시간마다 실행: 캔들 수집 → 지표 → 레짐 → 시그널
 * UTC 기준: 0시, 4시, 8시, 12시, 16시, 20시
 */
export function startCronJobs(): void {
  // 4시간마다 시그널 생성
  cron.schedule('0 0,4,8,12,16,20 * * *', async () => {
    console.log(`[크론] 시그널 생성 시작: ${new Date().toISOString()}`)
    await generateSignals()
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

  console.log('[크론] 스케줄 등록 완료 (4시간 주기)')
}
