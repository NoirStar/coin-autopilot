import { Hono } from 'hono'
import { supabase } from '../services/database.js'

export const dashboardRoutes = new Hono()

/** GET /api/dashboard/summary — 대시보드 KPI 요약 */
dashboardRoutes.get('/summary', async (c) => {
  try {
    // 최신 레짐
    const { data: regime } = await supabase
      .from('regime_states')
      .select('regime, btc_close, ema_200, rsi_14, atr_pct, timestamp')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    // 활성 시그널 수
    const { count: activeSignals } = await supabase
      .from('signals')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)

    // 최근 시그널 (24시간)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentSignals } = await supabase
      .from('signals')
      .select('id, strategy, symbol, direction, z_score, rsi, btc_regime, created_at')
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(10)

    // 최신 백테스트 성과 (시스템 레벨)
    const { data: latestBacktest } = await supabase
      .from('backtest_results')
      .select('sharpe_ratio, win_rate, max_drawdown, total_trades, total_return')
      .is('user_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return c.json({
      regime: regime ?? null,
      activeSignals: activeSignals ?? 0,
      recentSignals: recentSignals ?? [],
      backtestPerformance: latestBacktest ?? null,
    })
  } catch (err) {
    console.error('대시보드 요약 오류:', err)
    return c.json({ error: '대시보드 데이터 로드 실패' }, 500)
  }
})

/** GET /api/dashboard/equity-history — 에퀴티 히스토리 */
dashboardRoutes.get('/equity-history', async (c) => {
  // 최신 시스템 백테스트의 에퀴티 커브를 반환
  const { data, error } = await supabase
    .from('backtest_results')
    .select('equity_curve, period_start, period_end')
    .is('user_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return c.json({ data: [] })
  }

  return c.json({ data: data.equity_curve ?? [] })
})
