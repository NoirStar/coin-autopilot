-- ────────────────────────────────────────────────────────────
-- AI 리뷰 테이블 + research_runs 연결
--
-- PRD 04_RESEARCH_LOOP_SPEC §15, §17:
--   AI는 "보조 분석자"로서 연구 결과를 해석하고
--   파라미터 재탐색 범위를 제안한다.
--   research_runs에 ai_review_summary를 저장한다.
-- ────────────────────────────────────────────────────────────

-- 1. AI 리뷰 테이블
CREATE TABLE IF NOT EXISTS ai_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 리뷰 대상: 단일 연구 실행 또는 전략 전체 비교
  research_run_id UUID REFERENCES research_runs(id) ON DELETE SET NULL,
  strategy_id     UUID REFERENCES strategies(id) ON DELETE CASCADE,

  -- 트리거 사유
  trigger_reason  TEXT NOT NULL,
  -- 'ambiguous_ranking'      상위 후보 간 비교 판단이 애매
  -- 'performance_collapse'   특정 전략군 성과 급락
  -- 'param_re_explore'       파라미터 재탐색 범위 좁히기
  -- 'high_ev_high_mdd'       EV 양수지만 MDD 과도
  -- 'manual_request'         운영자 수동 요청

  -- AI 응답
  review_type     TEXT NOT NULL DEFAULT 'research_analysis',
  -- 'research_analysis'      연구 결과 분석 + 해석
  -- 'param_proposal'         파라미터 범위 재제안
  -- 'strategy_comparison'    전략 간 비교 분석

  summary         TEXT,           -- 1~3줄 요약
  analysis        JSONB,          -- 구조화된 분석 결과
  -- analysis 스키마:
  -- {
  --   strengths: string[],       -- 강점
  --   weaknesses: string[],      -- 약점
  --   risks: string[],           -- 위험 요소
  --   paramSuggestions?: {       -- 파라미터 제안 (param_proposal일 때)
  --     key: string,
  --     currentRange: [number, number],
  --     suggestedRange: [number, number],
  --     reason: string
  --   }[],
  --   recommendation: string,    -- 권장 행동
  --   confidence: number         -- 0~1 신뢰도
  -- }

  -- 메타
  model_id        TEXT,            -- 사용된 모델 ID (claude-sonnet-4-6 등)
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  latency_ms      INTEGER,

  status          TEXT NOT NULL DEFAULT 'pending',
  -- 'pending'    요청 생성, 아직 AI 호출 전
  -- 'processing' AI 호출 중
  -- 'completed'  완료
  -- 'failed'     실패
  -- 'skipped'    API 키 없음 등으로 스킵

  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

-- 2. research_runs에 AI 리뷰 연결 컬럼
ALTER TABLE research_runs
  ADD COLUMN IF NOT EXISTS ai_review_id UUID REFERENCES ai_reviews(id) ON DELETE SET NULL;

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_ai_reviews_strategy
  ON ai_reviews(strategy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_reviews_status
  ON ai_reviews(status) WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_ai_reviews_run
  ON ai_reviews(research_run_id) WHERE research_run_id IS NOT NULL;
