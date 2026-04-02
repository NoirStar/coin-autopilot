-- v2 보안 및 버그 수정 마이그레이션
-- 1. v2_live_positions에 strategy_id 컬럼 추가 (#1)
-- 2. v2_ 테이블 RLS 활성화 (#11)

-- ═══════════════════════════════════════════════════════════
-- 1. strategy_id 컬럼 추가 — 포지션 소유 전략 추적
-- ═══════════════════════════════════════════════════════════

ALTER TABLE v2_live_positions
  ADD COLUMN IF NOT EXISTS strategy_id uuid REFERENCES v2_strategies(id);

-- 기존 오픈 포지션이 있다면 null 허용 (이후 reconcile에서 채워짐)

-- ═══════════════════════════════════════════════════════════
-- 2. RLS 활성화 — 서비스 키만 접근 허용
-- ═══════════════════════════════════════════════════════════
-- 백엔드는 service_role_key를 사용하므로 RLS를 우회함.
-- anon key(프론트엔드)로 직접 접근 시 차단.

ALTER TABLE v2_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_asset_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_strategy_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_candles ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_regime_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_research_run_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_research_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_orchestrator_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_orchestrator_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_orchestrator_candidate_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_paper_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_paper_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_paper_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_equity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_live_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_live_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_live_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_notifications ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 읽기만 허용 (쓰기는 서버 service_role만)
CREATE POLICY "인증된 사용자 읽기" ON v2_equity_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON v2_regime_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON v2_strategies FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON v2_research_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON v2_research_run_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON v2_orchestrator_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON v2_orchestrator_decisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON v2_orchestrator_candidate_rankings FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON v2_paper_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON v2_paper_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON v2_live_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON v2_risk_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON v2_notifications FOR SELECT TO authenticated USING (true);

-- 알림 확인 처리 (인증된 사용자가 acknowledged_at 업데이트 가능)
CREATE POLICY "인증된 사용자 알림 확인" ON v2_notifications FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
