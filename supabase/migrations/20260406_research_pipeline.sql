-- 연구 파이프라인 2단계: IS/OOS/WF 검증 지원
-- 의존: 20260404_schema.sql, 20260405_active_params.sql

-- 1. research_run_segments: IS/OOS/WF 구간별 백테스트 결과 저장
CREATE TABLE IF NOT EXISTS research_run_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  param_set_id UUID REFERENCES strategy_parameters(id),
  segment_name TEXT NOT NULL,        -- 'IS', 'OOS', 'WF_fold_1_IS', 'WF_fold_1_OOS', ...
  segment_role TEXT NOT NULL,        -- 'in_sample', 'out_of_sample', 'walk_forward'
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  candle_count INTEGER,
  total_return DECIMAL,
  max_drawdown DECIMAL,
  expected_value DECIMAL,
  win_rate DECIMAL,
  trade_count INTEGER,
  sharpe DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_segments_run ON research_run_segments(research_run_id);
CREATE INDEX idx_segments_param ON research_run_segments(param_set_id);

-- 2. research_run_metrics에 expected_value 컬럼 추가
ALTER TABLE research_run_metrics
  ADD COLUMN IF NOT EXISTS expected_value DECIMAL;

-- 3. research_runs에 pipeline_mode 컬럼 추가 (legacy vs pipeline)
ALTER TABLE research_runs
  ADD COLUMN IF NOT EXISTS pipeline_mode TEXT DEFAULT 'legacy';
