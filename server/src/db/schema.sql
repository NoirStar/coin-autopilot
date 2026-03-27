-- Coin Autopilot — Supabase 스키마
-- Supabase 대시보드의 SQL Editor에서 실행

-- 캔들 데이터
create table if not exists candles (
  id bigint generated always as identity primary key,
  exchange text not null,
  symbol text not null,
  timeframe text not null,
  open_time timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null,
  created_at timestamptz default now(),
  unique(exchange, symbol, timeframe, open_time)
);

create index if not exists idx_candles_lookup
  on candles (exchange, symbol, timeframe, open_time desc);

-- BTC 레짐 상태
create table if not exists regime_states (
  id bigint generated always as identity primary key,
  timestamp timestamptz not null,
  regime text not null,
  btc_close numeric,
  ema_200 numeric,
  rsi_14 numeric,
  atr_pct numeric,
  created_at timestamptz default now()
);

create index if not exists idx_regime_latest
  on regime_states (timestamp desc);

-- 시그널
create table if not exists signals (
  id bigint generated always as identity primary key,
  strategy text not null,
  symbol text not null,
  direction text not null,
  created_at timestamptz default now(),
  z_score numeric,
  rsi numeric,
  btc_regime text,
  reasoning jsonb,
  backtest_sharpe numeric,
  is_active boolean default true
);

create index if not exists idx_signals_latest
  on signals (created_at desc);

create index if not exists idx_signals_active
  on signals (is_active) where is_active = true;

-- 백테스트 결과
create table if not exists backtest_results (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users,
  strategy text not null,
  params jsonb not null,
  timeframe text not null default '4h',
  period_start date,
  period_end date,
  total_return numeric,
  cagr numeric,
  sharpe_ratio numeric,
  sortino_ratio numeric,
  max_drawdown numeric,
  win_rate numeric,
  total_trades int,
  avg_hold_hours numeric,
  equity_curve jsonb,
  created_at timestamptz default now()
);

-- 포지션 (가상매매/실전)
create table if not exists positions (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users,
  session_type text not null,
  strategy text not null,
  symbol text not null,
  direction text not null,
  entry_price numeric,
  exit_price numeric,
  quantity numeric,
  pnl numeric,
  pnl_pct numeric,
  status text default 'open',
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz default now()
);

-- RLS 정책

-- 공개 테이블: 누구나 읽기 가능
alter table candles enable row level security;
create policy "공개 읽기: candles" on candles for select using (true);

alter table signals enable row level security;
create policy "공개 읽기: signals" on signals for select using (true);

alter table regime_states enable row level security;
create policy "공개 읽기: regime_states" on regime_states for select using (true);

-- 개인 테이블: 본인 데이터만 읽기
alter table backtest_results enable row level security;
create policy "본인 읽기: backtest_results" on backtest_results
  for select using (auth.uid() = user_id);

alter table positions enable row level security;
create policy "본인 읽기: positions" on positions
  for select using (auth.uid() = user_id);
