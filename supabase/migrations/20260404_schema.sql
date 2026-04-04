-- Coin Autopilot 스키마
-- 기존 객체를 모두 삭제 후 재생성한다.
-- 모든 timestamp는 UTC (timestamptz)

-- ═══════════════════════════════════════════════════════════
-- 0. 기존 객체 전부 삭제 (역순)
-- ═══════════════════════════════════════════════════════════

-- v2_ 접두사 테이블/타입 동적 삭제
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'v2_%'
  LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;

  FOR r IN
    SELECT typname FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typtype = 'e' AND t.typname LIKE 'v2_%'
  LOOP
    EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;
END $$;

DROP TABLE IF EXISTS detection_cache CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS approval_requests CASCADE;
DROP TABLE IF EXISTS risk_events CASCADE;
DROP TABLE IF EXISTS live_positions CASCADE;
DROP TABLE IF EXISTS live_fills CASCADE;
DROP TABLE IF EXISTS live_orders CASCADE;
DROP TABLE IF EXISTS equity_snapshots CASCADE;
DROP TABLE IF EXISTS paper_positions CASCADE;
DROP TABLE IF EXISTS paper_fills CASCADE;
DROP TABLE IF EXISTS paper_orders CASCADE;
DROP TABLE IF EXISTS paper_sessions CASCADE;
DROP TABLE IF EXISTS orchestrator_candidate_rankings CASCADE;
DROP TABLE IF EXISTS orchestrator_decisions CASCADE;
DROP TABLE IF EXISTS orchestrator_slots CASCADE;
DROP TABLE IF EXISTS research_promotions CASCADE;
DROP TABLE IF EXISTS research_run_metrics CASCADE;
DROP TABLE IF EXISTS research_runs CASCADE;
DROP TABLE IF EXISTS regime_snapshots CASCADE;
DROP TABLE IF EXISTS candles CASCADE;
DROP TABLE IF EXISTS strategy_parameters CASCADE;
DROP TABLE IF EXISTS strategies CASCADE;
DROP TABLE IF EXISTS asset_mappings CASCADE;
DROP TABLE IF EXISTS assets CASCADE;

DROP TYPE IF EXISTS risk_event_type CASCADE;
DROP TYPE IF EXISTS promotion_status CASCADE;
DROP TYPE IF EXISTS research_run_status CASCADE;
DROP TYPE IF EXISTS notification_channel CASCADE;
DROP TYPE IF EXISTS notification_priority CASCADE;
DROP TYPE IF EXISTS decision_status CASCADE;
DROP TYPE IF EXISTS decision_type CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS session_status CASCADE;
DROP TYPE IF EXISTS strategy_status CASCADE;
DROP TYPE IF EXISTS order_side CASCADE;
DROP TYPE IF EXISTS position_side CASCADE;
DROP TYPE IF EXISTS regime_state CASCADE;
DROP TYPE IF EXISTS market_type CASCADE;
DROP TYPE IF EXISTS asset_class CASCADE;

-- ═══════════════════════════════════════════════════════════
-- 1. ENUM 타입
-- ═══════════════════════════════════════════════════════════

CREATE TYPE asset_class AS ENUM ('crypto_spot', 'crypto_futures', 'kr_stock');
CREATE TYPE market_type AS ENUM ('spot', 'linear_swap', 'inverse_swap');
CREATE TYPE regime_state AS ENUM ('risk_on', 'risk_off', 'neutral');
CREATE TYPE position_side AS ENUM ('long', 'short');
CREATE TYPE order_side AS ENUM ('buy', 'sell');

CREATE TYPE strategy_status AS ENUM (
  'research_only', 'backtest_running', 'backtest_completed',
  'validated_candidate', 'paper_candidate', 'paper_running',
  'paper_verified', 'live_candidate', 'approval_pending',
  'live_running', 'retired'
);

CREATE TYPE session_status AS ENUM (
  'draft', 'approval_pending', 'ready', 'running',
  'paused', 'stop_requested', 'stopped', 'failed', 'completed'
);

CREATE TYPE order_status AS ENUM (
  'pending_validation', 'pending_approval', 'approved', 'rejected',
  'queued', 'submitted', 'partially_filled', 'filled',
  'cancel_requested', 'cancelled', 'replaced', 'failed'
);

CREATE TYPE decision_type AS ENUM (
  'strategy_assign', 'strategy_switch', 'strategy_retire',
  'go_flat', 'rebalance'
);

CREATE TYPE decision_status AS ENUM (
  'pending', 'executing', 'executed', 'failed', 'cancelled'
);

CREATE TYPE notification_priority AS ENUM ('info', 'warning', 'critical');
CREATE TYPE notification_channel AS ENUM ('in_app', 'telegram', 'discord');
CREATE TYPE research_run_status AS ENUM ('queued', 'running', 'completed', 'failed');
CREATE TYPE promotion_status AS ENUM ('not_evaluated', 'below_threshold', 'promoted_to_paper', 'promoted_to_live');

CREATE TYPE risk_event_type AS ENUM (
  'daily_loss_limit', 'drawdown_limit', 'circuit_breaker',
  'regime_change', 'position_divergence'
);

-- ═══════════════════════════════════════════════════════════
-- 2. 공용 마스터 데이터
-- ═══════════════════════════════════════════════════════════

-- 자산 마스터
CREATE TABLE assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key     text NOT NULL UNIQUE,
  asset_class   asset_class NOT NULL,
  base_currency text NOT NULL,
  quote_currency text NOT NULL,
  market_type   market_type NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 거래소별 심볼 매핑
CREATE TABLE asset_mappings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      uuid NOT NULL REFERENCES assets(id),
  exchange      text NOT NULL,
  exchange_symbol text NOT NULL,
  UNIQUE(asset_id, exchange)
);

-- 전략 카탈로그
CREATE TABLE strategies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id     text NOT NULL UNIQUE,
  name            text NOT NULL,
  description     text,
  asset_class     asset_class NOT NULL,
  timeframe       text NOT NULL,
  exchange        text NOT NULL,
  direction       text NOT NULL DEFAULT 'both',
  default_params  jsonb NOT NULL DEFAULT '{}',
  status          strategy_status NOT NULL DEFAULT 'research_only',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 전략 파라미터 세트
CREATE TABLE strategy_parameters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id   uuid NOT NULL REFERENCES strategies(id),
  param_set     jsonb NOT NULL,
  source        text NOT NULL DEFAULT 'manual',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 3. 시계열 데이터
-- ═══════════════════════════════════════════════════════════

-- OHLCV 캔들
CREATE TABLE candles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key     text NOT NULL,
  exchange      text NOT NULL,
  timeframe     text NOT NULL,
  open_time     timestamptz NOT NULL,
  open          numeric NOT NULL,
  high          numeric NOT NULL,
  low           numeric NOT NULL,
  close         numeric NOT NULL,
  volume        numeric NOT NULL,
  UNIQUE(asset_key, exchange, timeframe, open_time)
);

CREATE INDEX idx_candles_lookup ON candles(asset_key, exchange, timeframe, open_time DESC);

-- 레짐 스냅샷
CREATE TABLE regime_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regime        regime_state NOT NULL,
  btc_price     numeric NOT NULL,
  ema200        numeric,
  rsi14         numeric,
  atr_pct       numeric,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_regime_time ON regime_snapshots(recorded_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 4. 연구 루프
-- ═══════════════════════════════════════════════════════════

CREATE TABLE research_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id     uuid NOT NULL REFERENCES strategies(id),
  param_set_id    uuid REFERENCES strategy_parameters(id),
  market_scope    text NOT NULL,
  parameter_set   jsonb NOT NULL,
  status          research_run_status NOT NULL DEFAULT 'queued',
  promotion_status promotion_status NOT NULL DEFAULT 'not_evaluated',
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE research_run_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id uuid NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  total_return    numeric,
  max_drawdown    numeric,
  win_rate        numeric,
  sharpe          numeric,
  profit_factor   numeric,
  trade_count     integer,
  avg_hold_hours  numeric,
  cost_ratio      numeric,
  equity_curve    jsonb,
  trades          jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 승격 이력
CREATE TABLE research_promotions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id uuid NOT NULL REFERENCES research_runs(id),
  from_status     strategy_status NOT NULL,
  to_status       strategy_status NOT NULL,
  reason          text,
  promoted_at     timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 5. 오케스트레이터
-- ═══════════════════════════════════════════════════════════

-- 자산별 전략 슬롯
CREATE TABLE orchestrator_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key       text NOT NULL,
  slot_type       text NOT NULL DEFAULT 'primary',
  strategy_id     uuid REFERENCES strategies(id),
  allocation_pct  numeric NOT NULL DEFAULT 0,
  regime          regime_state,
  status          text NOT NULL DEFAULT 'empty',
  cooldown_until  timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 오케스트레이터 판단 로그
CREATE TABLE orchestrator_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         uuid REFERENCES orchestrator_slots(id),
  decision_type   decision_type NOT NULL,
  status          decision_status NOT NULL DEFAULT 'pending',
  from_strategy_id uuid REFERENCES strategies(id),
  to_strategy_id  uuid REFERENCES strategies(id),
  regime          regime_state NOT NULL,
  reason_summary  text NOT NULL,
  score_snapshot  jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  executed_at     timestamptz
);

CREATE INDEX idx_decisions_time ON orchestrator_decisions(created_at DESC);

-- 후보 전략 랭킹
CREATE TABLE orchestrator_candidate_rankings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id     uuid NOT NULL REFERENCES strategies(id),
  regime          regime_state NOT NULL,
  score           numeric NOT NULL,
  sharpe          numeric,
  mdd             numeric,
  win_rate        numeric,
  ranked_at       timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 6. 페이퍼트레이딩
-- ═══════════════════════════════════════════════════════════

CREATE TABLE paper_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  strategy_id     uuid NOT NULL REFERENCES strategies(id),
  asset_slot      text,
  status          session_status NOT NULL DEFAULT 'draft',
  initial_capital numeric NOT NULL DEFAULT 10000,
  current_equity  numeric NOT NULL DEFAULT 10000,
  current_drawdown numeric NOT NULL DEFAULT 0,
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE paper_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES paper_sessions(id) ON DELETE CASCADE,
  asset_key       text NOT NULL,
  side            order_side NOT NULL,
  position_side   position_side,
  order_type      text NOT NULL DEFAULT 'market',
  requested_qty   numeric NOT NULL,
  requested_price numeric,
  status          order_status NOT NULL DEFAULT 'pending_validation',
  submitted_at    timestamptz,
  filled_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE paper_fills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES paper_orders(id) ON DELETE CASCADE,
  fill_qty        numeric NOT NULL,
  fill_price      numeric NOT NULL,
  fill_fee        numeric NOT NULL DEFAULT 0,
  slippage_bps    numeric NOT NULL DEFAULT 0,
  filled_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE paper_positions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES paper_sessions(id) ON DELETE CASCADE,
  asset_key       text NOT NULL,
  side            position_side NOT NULL,
  entry_price     numeric NOT NULL,
  current_qty     numeric NOT NULL,
  peak_price      numeric,
  unrealized_pnl  numeric NOT NULL DEFAULT 0,
  realized_pnl    numeric NOT NULL DEFAULT 0,
  stop_price      numeric,
  entry_time      timestamptz NOT NULL DEFAULT now(),
  exit_time       timestamptz,
  exit_reason     text,
  status          text NOT NULL DEFAULT 'open'
);

-- 에퀴티 스냅샷
CREATE TABLE equity_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL,
  total_equity    numeric NOT NULL,
  regime          regime_state NOT NULL,
  active_strategies jsonb NOT NULL DEFAULT '[]',
  unrealized_pnl  numeric NOT NULL DEFAULT 0,
  realized_pnl    numeric NOT NULL DEFAULT 0,
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_equity_time ON equity_snapshots(source, recorded_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 7. 실전 매매
-- ═══════════════════════════════════════════════════════════

CREATE TABLE live_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id     uuid REFERENCES orchestrator_decisions(id),
  asset_key       text NOT NULL,
  exchange        text NOT NULL,
  side            order_side NOT NULL,
  position_side   position_side,
  order_type      text NOT NULL,
  requested_qty   numeric NOT NULL,
  requested_price numeric,
  exchange_order_id text,
  status          order_status NOT NULL DEFAULT 'pending_validation',
  submitted_at    timestamptz,
  filled_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE live_fills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES live_orders(id) ON DELETE CASCADE,
  fill_qty        numeric NOT NULL,
  fill_price      numeric NOT NULL,
  fill_fee        numeric NOT NULL DEFAULT 0,
  exchange_fill_id text,
  filled_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE live_positions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key       text NOT NULL,
  exchange        text NOT NULL,
  side            position_side NOT NULL,
  entry_price     numeric NOT NULL,
  current_qty     numeric NOT NULL,
  peak_price      numeric,
  unrealized_pnl  numeric NOT NULL DEFAULT 0,
  realized_pnl    numeric NOT NULL DEFAULT 0,
  stop_price      numeric,
  stop_order_id   text,
  leverage        integer NOT NULL DEFAULT 1,
  margin_mode     text NOT NULL DEFAULT 'isolated',
  strategy_id     uuid REFERENCES strategies(id),
  entry_time      timestamptz NOT NULL DEFAULT now(),
  exit_time       timestamptz,
  exit_reason     text,
  status          text NOT NULL DEFAULT 'open'
);

-- ═══════════════════════════════════════════════════════════
-- 8. 리스크 / 승인 / 알림
-- ═══════════════════════════════════════════════════════════

CREATE TABLE risk_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      risk_event_type NOT NULL,
  severity        notification_priority NOT NULL DEFAULT 'warning',
  details         jsonb NOT NULL DEFAULT '{}',
  resolved        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE TABLE approval_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  target_type     text NOT NULL,
  target_id       uuid NOT NULL,
  reason_summary  text NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  requested_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE TABLE notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  event_type      text NOT NULL,
  priority        notification_priority NOT NULL DEFAULT 'info',
  channel         notification_channel NOT NULL DEFAULT 'in_app',
  target_ref      text,
  message_summary text NOT NULL,
  message_detail  text,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

-- ═══════════════════════════════════════════════════════════
-- 9. 사용자 (Stage 3 예약)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE user_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id         uuid UNIQUE,
  display_name    text,
  risk_profile    text DEFAULT 'moderate',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 10. 알트코인 탐지 캐시
-- ═══════════════════════════════════════════════════════════

CREATE TABLE detection_cache (
  id BIGSERIAL PRIMARY KEY,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_scanned INT NOT NULL,
  detected INT NOT NULL,
  results JSONB NOT NULL,
  scan_duration_ms INT,
  created_by TEXT DEFAULT 'system'
);

CREATE INDEX idx_detection_cache_scanned_at ON detection_cache (scanned_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 11. RLS 정책
-- ═══════════════════════════════════════════════════════════

-- 모든 테이블 RLS 활성화
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE candles ENABLE ROW LEVEL SECURITY;
ALTER TABLE regime_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_run_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestrator_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestrator_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestrator_candidate_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE equity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 읽기 정책
CREATE POLICY "인증된 사용자 읽기" ON equity_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON regime_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON strategies FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON research_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON research_run_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON orchestrator_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON orchestrator_decisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON orchestrator_candidate_rankings FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON paper_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON paper_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON live_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON risk_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "인증된 사용자 읽기" ON notifications FOR SELECT TO authenticated USING (true);

-- 알림 확인 처리
CREATE POLICY "인증된 사용자 알림 확인" ON notifications FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- 탐지 캐시 공개 읽기
ALTER TABLE detection_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_detection_cache" ON detection_cache FOR SELECT USING (true);
