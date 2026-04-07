-- ────────────────────────────────────────────────────────────
-- user_settings 테이블 생성
--
-- settings.ts 라우트가 user_settings를 읽고 쓰지만
-- 기본 마이그레이션(20260404_schema.sql)에는 user_profiles만 존재.
-- fresh DB에서 설정 저장이 깨지는 문제를 해결한다.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID UNIQUE,

  -- 리스크 프로필
  risk_profile          TEXT NOT NULL DEFAULT 'moderate',
  daily_max_loss_pct    NUMERIC(5,2) NOT NULL DEFAULT 2.0,
  position_max_loss_pct NUMERIC(5,2) NOT NULL DEFAULT 0.30,
  mdd_warning_pct       NUMERIC(5,2) NOT NULL DEFAULT 15.0,
  mdd_stop_pct          NUMERIC(5,2) NOT NULL DEFAULT 25.0,

  -- 거래소 연결 (DB 저장 키 — .env보다 후순위)
  upbit_configured      BOOLEAN NOT NULL DEFAULT false,
  upbit_access_key      TEXT,
  upbit_secret_key      TEXT,
  okx_configured        BOOLEAN NOT NULL DEFAULT false,
  okx_access_key        TEXT,
  okx_secret_key        TEXT,
  okx_passphrase        TEXT,

  -- 알림 설정
  telegram_enabled      BOOLEAN NOT NULL DEFAULT false,
  telegram_bot_token    TEXT,
  telegram_chat_id      TEXT,
  discord_enabled       BOOLEAN NOT NULL DEFAULT false,
  discord_webhook_url   TEXT,
  alert_on_signal       BOOLEAN NOT NULL DEFAULT true,
  alert_on_mdd          BOOLEAN NOT NULL DEFAULT true,
  alert_on_regime       BOOLEAN NOT NULL DEFAULT true,
  alert_on_execution    BOOLEAN NOT NULL DEFAULT false,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1인 사용 단계에서는 user_id 없이 첫 행만 사용
-- 멀티유저 확장 시 user_id에 FK 연결
