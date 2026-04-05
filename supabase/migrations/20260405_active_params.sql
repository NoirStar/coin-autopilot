-- ═══════════════════════════════════════════════════════════
-- Research → Runtime 폐루프 지원
-- /plan-eng-review 2026-04-05
-- ═══════════════════════════════════════════════════════════
--
-- 목적:
-- 1. strategy_parameters에 해시 기반 유니크 제약 (중복 방지)
-- 2. strategies.active_param_set_id 추가 (현재 사용 중인 파라미터 포인터)
-- 3. research_promotions.param_set_id 추가 (승격 이력에 파라미터 참조)
-- 4. promote_strategy_with_params RPC (원자적 승격)
--
-- orphan FK 방지: active_param_set_id → strategy_parameters는 ON DELETE RESTRICT

-- ─── 1. strategy_parameters 확장 ──────────────────────────────

-- 해시 컬럼 (generated)
ALTER TABLE strategy_parameters
  ADD COLUMN IF NOT EXISTS param_set_hash text
  GENERATED ALWAYS AS (md5(param_set::text)) STORED;

-- 검증 상태 컬럼
ALTER TABLE strategy_parameters
  ADD COLUMN IF NOT EXISTS validation_status text
  NOT NULL DEFAULT 'draft';

-- 중복 방지: 같은 전략의 같은 파라미터 세트는 하나만
CREATE UNIQUE INDEX IF NOT EXISTS strategy_parameters_strategy_hash_idx
  ON strategy_parameters (strategy_id, param_set_hash);

-- ─── 2. strategies.active_param_set_id ─────────────────────────

-- orphan 방지: ON DELETE RESTRICT
-- strategy_parameters row 삭제 시 strategies가 참조 중이면 에러
ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS active_param_set_id uuid
  REFERENCES strategy_parameters(id) ON DELETE RESTRICT;

-- ─── 3. research_promotions.param_set_id ───────────────────────

ALTER TABLE research_promotions
  ADD COLUMN IF NOT EXISTS param_set_id uuid
  REFERENCES strategy_parameters(id);

-- ─── 4. 원자적 승격 RPC ────────────────────────────────────────
--
-- @supabase/supabase-js는 다중 테이블 트랜잭션을 지원하지 않으므로
-- PL/pgSQL 함수로 원자성을 보장한다.
--
-- 동작:
-- 1. strategy_parameters에 upsert (해시 기반 중복 방지)
-- 2. strategies.active_param_set_id + status 갱신
-- 3. research_promotions에 이력 저장
--
-- 모든 단계가 단일 트랜잭션으로 실행되며, 어느 하나라도 실패하면 롤백.

CREATE OR REPLACE FUNCTION promote_strategy_with_params(
  p_strategy_id uuid,
  p_param_set jsonb,
  p_run_id uuid,
  p_from_status strategy_status,
  p_reason text
) RETURNS uuid AS $$
DECLARE
  v_param_set_id uuid;
BEGIN
  -- 1. strategy_parameters에 upsert
  -- 같은 (strategy_id, param_set_hash) 조합이 있으면 기존 row 반환,
  -- 없으면 새로 insert
  INSERT INTO strategy_parameters (strategy_id, param_set, source, validation_status)
  VALUES (p_strategy_id, p_param_set, 'research_loop', 'promoted')
  ON CONFLICT (strategy_id, param_set_hash)
  DO UPDATE SET validation_status = 'promoted'
  RETURNING id INTO v_param_set_id;

  -- 2. strategies 갱신 — active_param_set_id + status
  UPDATE strategies
  SET
    status = 'paper_candidate',
    active_param_set_id = v_param_set_id,
    updated_at = now()
  WHERE id = p_strategy_id;

  -- 3. 승격 이력
  INSERT INTO research_promotions (research_run_id, param_set_id, from_status, to_status, reason)
  VALUES (p_run_id, v_param_set_id, p_from_status, 'paper_candidate', p_reason);

  RETURN v_param_set_id;
END;
$$ LANGUAGE plpgsql;
