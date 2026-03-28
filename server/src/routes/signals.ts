import { Hono } from 'hono'
import { supabase } from '../services/database.js'
import { generateSignals } from '../services/signal-generator.js'

export const signalRoutes = new Hono()

/** 최신 활성 시그널 목록 (공개, 인증 불필요) */
signalRoutes.get('/', async (c) => {
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ signals: data })
})

/** 현재 BTC 레짐 상태 */
signalRoutes.get('/regime', async (c) => {
  const { data, error } = await supabase
    .from('regime_states')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()

  if (error) return c.json({ regime: null, error: error.message })
  return c.json({ regime: data })
})

/** 백테스트 성과 요약 (최신 결과) */
signalRoutes.get('/performance', async (c) => {
  const { data, error } = await supabase
    .from('backtest_results')
    .select('strategy, sharpe_ratio, win_rate, max_drawdown, total_trades, period_start, period_end, timeframe')
    .is('user_id', null) // 시스템 백테스트 (공개)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ performance: data })
})

/** 수동 시그널 생성 트리거 */
signalRoutes.post('/generate', async (c) => {
  try {
    await generateSignals()
    return c.json({ success: true, message: '시그널 생성 완료' })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})
