-- DB 인덱스 성능 최적화 — 폴링/오케스트레이터/리스크 쿼리 대상
-- 의존: 20260404_schema.sql

-- research_runs: 쿨다운 체크 (.eq('strategy_id').eq('status').gte('ended_at'))
CREATE INDEX IF NOT EXISTS idx_research_runs_strategy_status
  ON research_runs(strategy_id, status, ended_at DESC);

-- orchestrator_slots: 활성 슬롯 조회 (.eq('status'))
CREATE INDEX IF NOT EXISTS idx_orchestrator_slots_status
  ON orchestrator_slots(status);

-- paper_sessions: 세션 조회 (.eq('status'), .eq('strategy_id'))
CREATE INDEX IF NOT EXISTS idx_paper_sessions_status
  ON paper_sessions(status, strategy_id);

-- live_positions: 리스크 매니저 (.eq('status'), .gte('exit_time'))
CREATE INDEX IF NOT EXISTS idx_live_positions_status
  ON live_positions(status);

CREATE INDEX IF NOT EXISTS idx_live_positions_closed_exit
  ON live_positions(exit_time DESC) WHERE status = 'closed';

-- strategies: strategy_id 조회 (연구루프, 팩토리 등)
CREATE INDEX IF NOT EXISTS idx_strategies_strategy_id
  ON strategies(strategy_id);

-- risk_events: 대시보드 조회 (.order('created_at'))
CREATE INDEX IF NOT EXISTS idx_risk_events_created
  ON risk_events(created_at DESC);

-- notifications: 사용자별 조회
CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications(created_at DESC);
