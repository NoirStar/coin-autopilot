-- V2 스키마: PRD 12_SCHEMA_AND_API_CONTRACT 기준
-- 빈 DB에서 시작. 기존 테이블은 건드리지 않음 (별도 정리 예정)
-- 모든 timestamp는 UTC (timestamptz)

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
CREATE TABLE v2_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key     text NOT NULL UNIQUE,  -- "BTC-KRW", "BTC-USDT-SWAP"
  asset_class   asset_class NOT NULL,
  base_currency text NOT NULL,         -- "BTC"
  quote_currency text NOT NULL,        -- "KRW", "USDT"
  market_type   market_type NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 거래소별 심볼 매핑
CREATE TABLE v2_asset_mappings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      uuid NOT NULL REFERENCES v2_assets(id),
  exchange      text NOT NULL,         -- "upbit", "okx"
  exchange_symbol text NOT NULL,       -- "KRW-BTC", "BTC-USDT-SWAP"
  UNIQUE(asset_id, exchange)
);

-- 전략 카탈로그
CREATE TABLE v2_strategies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id     text NOT NULL UNIQUE,  -- "btc_ema_crossover"
  name            text NOT NULL,
  description     text,
  asset_class     asset_class NOT NULL,
  timeframe       text NOT NULL,         -- "4h", "1h"
  exchange        text NOT NULL,         -- "upbit", "okx"
  direction       text NOT NULL DEFAULT 'both',  -- "long", "short", "both"
  default_params  jsonb NOT NULL DEFAULT '{}',
  status          strategy_status NOT NULL DEFAULT 'research_only',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 전략 파라미터 세트 (연구 루프에서 탐색한 파라미터)
CREATE TABLE v2_strategy_parameters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id   uuid NOT NULL REFERENCES v2_strategies(id),
  param_set     jsonb NOT NULL,
  source        text NOT NULL DEFAULT 'manual', -- "manual", "research_loop"
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 3. 시계열 데이터
-- ═══════════════════════════════════════════════════════════

-- OHLCV 캔들
CREATE TABLE v2_candles (
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

CREATE INDEX idx_v2_candles_lookup ON v2_candles(asset_key, exchange, timeframe, open_time DESC);

-- 레짐 스냅샷
CREATE TABLE v2_regime_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regime        regime_state NOT NULL,
  btc_price     numeric NOT NULL,
  ema200        numeric,
  rsi14         numeric,
  atr_pct       numeric,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_v2_regime_time ON v2_regime_snapshots(recorded_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 4. 연구 루프
-- ═══════════════════════════════════════════════════════════

CREATE TABLE v2_research_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id     uuid NOT NULL REFERENCES v2_strategies(id),
  param_set_id    uuid REFERENCES v2_strategy_parameters(id),
  market_scope    text NOT NULL,         -- "BTC-USDT-SWAP", "upbit_top20"
  parameter_set   jsonb NOT NULL,
  status          research_run_status NOT NULL DEFAULT 'queued',
  promotion_status promotion_status NOT NULL DEFAULT 'not_evaluated',
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE v2_research_run_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id uuid NOT NULL REFERENCES v2_research_runs(id) ON DELETE CASCADE,
  total_return    numeric,
  max_drawdown    numeric,
  win_rate        numeric,
  sharpe          numeric,
  profit_factor   numeric,
  trade_count     integer,
  avg_hold_hours  numeric,
  cost_ratio      numeric,
  equity_curve    jsonb,               -- [{t, equity}]
  trades          jsonb,               -- [BacktestTrade]
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 승격 이력
CREATE TABLE v2_research_promotions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id uuid NOT NULL REFERENCES v2_research_runs(id),
  from_status     strategy_status NOT NULL,
  to_status       strategy_status NOT NULL,
  reason          text,
  promoted_at     timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 5. 오케스트레이터
-- ═══════════════════════════════════════════════════════════

-- 자산별 전략 슬롯
CREATE TABLE v2_orchestrator_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key       text NOT NULL,
  slot_type       text NOT NULL DEFAULT 'primary', -- "primary", "shadow"
  strategy_id     uuid REFERENCES v2_strategies(id),
  allocation_pct  numeric NOT NULL DEFAULT 0,      -- 자본 배분 비율
  regime          regime_state,
  status          text NOT NULL DEFAULT 'empty',   -- "empty", "active", "cooldown", "flat"
  cooldown_until  timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 오케스트레이터 판단 로그
CREATE TABLE v2_orchestrator_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         uuid REFERENCES v2_orchestrator_slots(id),
  decision_type   decision_type NOT NULL,
  status          decision_status NOT NULL DEFAULT 'pending',
  from_strategy_id uuid REFERENCES v2_strategies(id),
  to_strategy_id  uuid REFERENCES v2_strategies(id),
  regime          regime_state NOT NULL,
  reason_summary  text NOT NULL,
  score_snapshot  jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  executed_at     timestamptz
);

CREATE INDEX idx_v2_decisions_time ON v2_orchestrator_decisions(created_at DESC);

-- 후보 전략 랭킹 (매 사이클마다 갱신)
CREATE TABLE v2_orchestrator_candidate_rankings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id     uuid NOT NULL REFERENCES v2_strategies(id),
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

CREATE TABLE v2_paper_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,                -- Stage 3 멀티유저용 예약
  strategy_id     uuid NOT NULL REFERENCES v2_strategies(id),
  asset_slot      text,
  status          session_status NOT NULL DEFAULT 'draft',
  initial_capital numeric NOT NULL DEFAULT 10000,
  current_equity  numeric NOT NULL DEFAULT 10000,
  current_drawdown numeric NOT NULL DEFAULT 0,
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE v2_paper_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES v2_paper_sessions(id) ON DELETE CASCADE,
  asset_key       text NOT NULL,
  side            order_side NOT NULL,
  position_side   position_side,
  order_type      text NOT NULL DEFAULT 'market', -- "market", "limit", "stop_market"
  requested_qty   numeric NOT NULL,
  requested_price numeric,
  status          order_status NOT NULL DEFAULT 'pending_validation',
  submitted_at    timestamptz,
  filled_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE v2_paper_fills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES v2_paper_orders(id) ON DELETE CASCADE,
  fill_qty        numeric NOT NULL,
  fill_price      numeric NOT NULL,
  fill_fee        numeric NOT NULL DEFAULT 0,
  slippage_bps    numeric NOT NULL DEFAULT 0,
  filled_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE v2_paper_positions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES v2_paper_sessions(id) ON DELETE CASCADE,
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
  status          text NOT NULL DEFAULT 'open' -- "open", "closed", "liquidated"
);

-- 에퀴티 스냅샷 (Proof Chart 데이터)
CREATE TABLE v2_equity_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL,         -- "paper:{session_id}", "live"
  total_equity    numeric NOT NULL,
  regime          regime_state NOT NULL,
  active_strategies jsonb NOT NULL DEFAULT '[]',
  unrealized_pnl  numeric NOT NULL DEFAULT 0,
  realized_pnl    numeric NOT NULL DEFAULT 0,
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_v2_equity_time ON v2_equity_snapshots(source, recorded_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 7. 리스크 / 승인 / 알림
-- ═══════════════════════════════════════════════════════════

CREATE TABLE v2_risk_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      risk_event_type NOT NULL,
  severity        notification_priority NOT NULL DEFAULT 'warning',
  details         jsonb NOT NULL DEFAULT '{}',
  resolved        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE TABLE v2_approval_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  target_type     text NOT NULL,         -- "strategy_promotion", "live_deploy"
  target_id       uuid NOT NULL,
  reason_summary  text NOT NULL,
  status          text NOT NULL DEFAULT 'pending', -- "pending", "approved", "rejected"
  requested_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE TABLE v2_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  event_type      text NOT NULL,
  priority        notification_priority NOT NULL DEFAULT 'info',
  channel         notification_channel NOT NULL DEFAULT 'in_app',
  target_ref      text,                  -- 참조 ID
  message_summary text NOT NULL,
  message_detail  text,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

-- ═══════════════════════════════════════════════════════════
-- 8. 사용자 플랫폼 (Stage 3 예약, 컬럼만 정의)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE v2_user_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id         uuid UNIQUE,           -- Supabase Auth UID
  display_name    text,
  risk_profile    text DEFAULT 'moderate',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 9. 실전 매매 (Phase 7)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE v2_live_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id     uuid REFERENCES v2_orchestrator_decisions(id),
  asset_key       text NOT NULL,
  exchange        text NOT NULL,
  side            order_side NOT NULL,
  position_side   position_side,
  order_type      text NOT NULL,
  requested_qty   numeric NOT NULL,
  requested_price numeric,
  exchange_order_id text,              -- 거래소 주문 ID
  status          order_status NOT NULL DEFAULT 'pending_validation',
  submitted_at    timestamptz,
  filled_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE v2_live_fills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES v2_live_orders(id) ON DELETE CASCADE,
  fill_qty        numeric NOT NULL,
  fill_price      numeric NOT NULL,
  fill_fee        numeric NOT NULL DEFAULT 0,
  exchange_fill_id text,
  filled_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE v2_live_positions (
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
  stop_order_id   text,                -- 거래소 손절 주문 ID
  leverage        integer NOT NULL DEFAULT 1,
  margin_mode     text NOT NULL DEFAULT 'isolated',
  entry_time      timestamptz NOT NULL DEFAULT now(),
  exit_time       timestamptz,
  exit_reason     text,
  status          text NOT NULL DEFAULT 'open'
);
