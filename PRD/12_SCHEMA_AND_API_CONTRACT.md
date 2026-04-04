# 12 Schema And API Contract

## 1. 문서 목적

- PRD 문서들에서 정의한 상태와 엔티티를 실제 DB/서버 계약으로 연결하기 위한 기준을 정리한다.
- 이 문서는 구현 handoff용 계약 문서이며, 초기 구현 시 최소한 어떤 엔티티와 API가 있어야 하는지 정의한다.

## 2. 한 줄 정의

- 이 문서는 `오케스트레이터`, `연구 루프`, `페이퍼트레이딩`, `리스크`, `알림`, `사용자 플랫폼`이 공통으로 참조하는 최소 스키마와 API 계약의 기준점이다.

## 3. 계약 원칙

- 실제 구현은 점진적으로 가더라도 엔티티 이름과 책임은 초기에 고정한다.
- 상태값은 가능한 한 enum 또는 제한된 문자열 집합으로 고정한다.
- 사용자 전용 데이터와 공용 데이터는 분리한다.
- 전략, 연구 run, 세션, 승인, 알림은 서로 추적 가능해야 한다.

## 4. 핵심 엔티티

### 4.1 공용 마스터 데이터

- `assets`
  - 내부 공통 심볼 키 기준 자산 마스터
- `asset_mappings`
  - 거래소/브로커 원본 심볼 매핑
- `strategies`
  - 전략 카탈로그
- `strategy_parameters`
  - 전략별 기본 파라미터 정의

### 4.2 시계열 데이터

- `market_ohlcv`
- `market_trades`
- `market_orderbook_events`
- `market_derivatives_metrics`
- `market_regime_snapshots`
- `market_event_flags`

### 4.3 연구 루프

- `research_runs`
- `research_run_metrics`
- `research_run_segments`
- `research_promotions`

### 4.4 오케스트레이터

- `orchestrator_slots`
- `orchestrator_allocations`
- `orchestrator_decisions`
- `orchestrator_candidate_rankings`

### 4.5 페이퍼트레이딩

- `paper_sessions`
- `paper_orders`
- `paper_fills`
- `paper_positions`
- `paper_equity_snapshots`

### 4.6 리스크/승인/알림

- `risk_events`
- `approval_requests`
- `notifications`

### 4.7 사용자 플랫폼

- `user_profiles`
- `user_strategy_preferences`
- `user_risk_settings`
- `user_notification_settings`
- `user_dashboard_preferences`

## 5. 핵심 상태값 계약

### 5.1 Strategy Lifecycle

- `research_only`
- `backtest_running`
- `backtest_completed`
- `validated_candidate`
- `paper_candidate`
- `paper_running`
- `paper_verified`
- `live_candidate`
- `approval_pending`
- `live_running`
- `retired`

### 5.2 Session State

- `draft`
- `approval_pending`
- `ready`
- `running`
- `paused`
- `stop_requested`
- `stopped`
- `failed`
- `completed`

### 5.3 Order State

- `pending_validation`
- `pending_approval`
- `approved`
- `rejected`
- `queued`
- `submitted`
- `partially_filled`
- `filled`
- `cancel_requested`
- `cancelled`
- `replaced`
- `failed`

### 5.4 Notification Priority

- `info`
- `warning`
- `critical`

## 6. 최소 테이블 계약

### 6.1 assets

필수 컬럼:

- `id`
- `asset_key`
- `asset_class`
- `base_currency`
- `quote_currency`
- `market_type`
- `status`

### 6.2 strategies

필수 컬럼:

- `id`
- `strategy_id`
- `name`
- `asset_class`
- `deployment_type`
- `direction`
- `supported_markets`
- `required_data`
- `risk_profile`
- `cost_sensitivity`
- `status`

### 6.3 research_runs

필수 컬럼:

- `id`
- `strategy_id`
- `market_scope`
- `parameter_set`
- `status`
- `started_at`
- `ended_at`
- `promotion_status`

### 6.4 research_run_metrics

필수 컬럼:

- `research_run_id`
- `expected_value`
- `total_return`
- `max_drawdown`
- `win_rate`
- `profit_factor`
- `sharpe`
- `trade_count`
- `cost_ratio`

### 6.5 paper_sessions

필수 컬럼:

- `id`
- `user_id`
- `strategy_id`
- `asset_slot`
- `deployment_mode`
- `status`
- `initial_capital`
- `current_equity`
- `current_drawdown`
- `approval_status`

### 6.6 paper_orders

필수 컬럼:

- `id`
- `paper_session_id`
- `asset_key`
- `side`
- `order_type`
- `requested_qty`
- `requested_price`
- `status`
- `submitted_at`

### 6.7 paper_fills

필수 컬럼:

- `id`
- `paper_order_id`
- `fill_qty`
- `fill_price`
- `fill_fee`
- `slippage_bps`
- `filled_at`

### 6.8 orchestrator_decisions

필수 컬럼:

- `id`
- `slot_id`
- `decision_type`
- `reason_summary`
- `score_snapshot`
- `ai_review_id`
- `created_at`

### 6.9 approval_requests

필수 컬럼:

- `id`
- `user_id`
- `target_type`
- `target_id`
- `reason_summary`
- `status`
- `requested_at`
- `resolved_at`

### 6.10 notifications

필수 컬럼:

- `id`
- `user_id`
- `event_type`
- `priority`
- `channel`
- `target_ref`
- `message_summary`
- `message_detail`
- `sent_at`
- `acknowledged_at`

## 7. API 그룹 계약

### 7.1 Market Data API

목적:

- 대시보드와 연구 루프가 공용 시세/시장 상태를 조회

예시:

- `GET /api/market/assets`
- `GET /api/market/ohlcv`
- `GET /api/market/regime`
- `GET /api/market/derivatives`

### 7.2 Strategy Catalog API

목적:

- 전략 카탈로그 조회
- 사용자 전략 선택/활성화

예시:

- `GET /api/strategies`
- `GET /api/strategies/:strategyId`
- `POST /api/user/strategies/select`

### 7.3 Research API

목적:

- 연구 작업 조회
- 상위 후보 조회
- 승격 상태 조회

예시:

- `GET /api/research/runs`
- `GET /api/research/runs/:id`
- `GET /api/research/candidates`

### 7.4 Orchestrator API

목적:

- 슬롯 상태와 전략 배치 상태 조회
- 최근 의사결정 조회

예시:

- `GET /api/orchestrator/slots`
- `GET /api/orchestrator/decisions`
- `GET /api/orchestrator/candidates`

### 7.5 Paper Trading API

목적:

- 페이퍼 세션 생성/조회/중지
- 주문/포지션/성과 확인

예시:

- `POST /api/paper/sessions`
- `GET /api/paper/sessions`
- `GET /api/paper/sessions/:id`
- `POST /api/paper/sessions/:id/pause`
- `POST /api/paper/sessions/:id/stop`

### 7.6 Risk API

목적:

- 현재 리스크 상태 조회
- 최근 리스크 이벤트 조회

예시:

- `GET /api/risk/status`
- `GET /api/risk/events`

### 7.7 Approval API

목적:

- 승인 요청 조회
- 승인/거절 처리

예시:

- `GET /api/approvals`
- `POST /api/approvals/:id/approve`
- `POST /api/approvals/:id/reject`

### 7.8 Notification API

목적:

- 인앱 알림 조회
- 읽음 처리

예시:

- `GET /api/notifications`
- `POST /api/notifications/:id/ack`

## 8. 최소 구현 우선순위

1차에서 우선 구현해야 하는 엔티티는 아래다.

1. `assets`
2. `asset_mappings`
3. `strategies`
4. `research_runs`
5. `research_run_metrics`
6. `paper_sessions`
7. `paper_orders`
8. `paper_fills`
9. `paper_positions`
10. `orchestrator_slots`
11. `orchestrator_decisions`
12. `approval_requests`
13. `notifications`

## 9. 추후 확장 엔티티

- user broker credentials
- live execution orders/fills
- strategy marketplace metadata
- social/reputation metadata
- audit trail 고도화 테이블

## 10. 오픈 항목

- 실제 DB는 단일 스키마로 갈지, 도메인별 네임스페이스로 나눌지
- JSONB 중심으로 빠르게 갈지, 초반부터 정규화 비중을 높일지
- event sourcing 수준까지 갈지

## 11. 관련 문서

- [02_ORCHESTRATOR_SPEC.md](/root/work/coin-autopilot/PRD/02_ORCHESTRATOR_SPEC.md)
- [03_DATA_ARCHITECTURE.md](/root/work/coin-autopilot/PRD/03_DATA_ARCHITECTURE.md)
- [04_RESEARCH_LOOP_SPEC.md](/root/work/coin-autopilot/PRD/04_RESEARCH_LOOP_SPEC.md)
- [05_PAPER_TRADING_SPEC.md](/root/work/coin-autopilot/PRD/05_PAPER_TRADING_SPEC.md)
- [10_EXECUTION_ENGINE_SPEC.md](/root/work/coin-autopilot/PRD/10_EXECUTION_ENGINE_SPEC.md)
- [11_USER_PLATFORM_SPEC.md](/root/work/coin-autopilot/PRD/11_USER_PLATFORM_SPEC.md)
