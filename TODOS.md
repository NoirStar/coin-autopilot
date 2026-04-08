# TODOS

기준 문서는 `PRD/`, `PLAN.md`, `DESIGN.md`, `HANDOFF.md`.
이 파일은 현재 남은 실행 작업만 짧게 모아두는 보조 문서다.

## 2026-04-08 구현 리뷰 후 최우선

- [ ] **승인 API 런타임 오류 가능성 수정** — `orchestrator_decisions.status` DB enum에는 `approved/rejected`가 없는데 `/api/dash/decisions/:id/approve|reject`가 해당 값을 쓴다. 마이그레이션으로 enum을 확장하거나, 라우트를 기존 enum 상태 머신에 맞춘다.
- [ ] **쓰기 API 인증 보강** — `/api/dash/decisions/:id/approve`, `/api/dash/decisions/:id/reject`, `/api/dash/risk/events/:id/resolve`에 `authMiddleware` 또는 운영자 토큰 검증을 적용한다.
- [ ] **설정 페이지 진짜 동작 범위 정리** — API 키/알림은 DB에 저장되지만 OKX/Upbit/Telegram/Discord 클라이언트는 `.env`를 읽는다. 화면에서 "저장됨"과 "실제 런타임 적용됨"을 분리한다.
- [ ] **리스크 설정 적용 경로 연결** — 설정 페이지의 `daily_max_loss_pct`, `position_max_loss_pct`, `mdd_warning_pct`, `mdd_stop_pct`는 현재 리스크 엔진의 `DAILY_LOSS_LIMIT_PCT`, `CIRCUIT_BREAKER_PCT`, `MAX_*` 환경변수와 분리되어 있다. 어느 값을 실제 권위로 쓸지 결정하고 코드 연결.
- [ ] **알트 오케스트레이션 1급 슬롯화** — `UPBIT_ALT_TOP*` 또는 `KRW-ALT basket` 슬롯을 만들고 `alt_mean_reversion`, `alt_detection`이 BTC 단일 슬롯이 아니라 Upbit 알트 슬롯에 배치되게 한다.
- [ ] **후보 랭킹을 자산군별로 분리** — 현재 후보 랭킹은 레짐/방향 중심이라 OKX 선물과 Upbit 알트가 같은 풀에서 섞일 수 있다. `asset_class`, `exchange`, `market_scope` 필터를 추가한다.
- [ ] **대시보드 DTO 보강** — `/api/dash/operator/home`에 `venue`, `strategyName`, `strategyShortName`, `slotEdgeScore`, `rationale`, `currentPrice`, `unrealizedPnlPct`, 거래소 연결 상태를 추가하고 프론트 TODO 매핑 제거.
- [ ] **사용자 화면 WebSocket/SSE 스트리밍 설계** — 포지션 현재가, PnL, 거래소 연결 상태, 승인 큐, 리스크 이벤트, DecisionLedger 신규 로그처럼 자주 바뀌는 데이터는 WS/SSE로 밀어주고, 연구 이력/설정/히스토리는 API polling으로 유지한다. 끊김 시 `/api/dash/operator/home` 30초 polling fallback.
- [ ] **포지션 패널 현재가/수익률 계산 수정** — 프론트는 현재가를 `peak_price`로 대체하고 수익률은 0으로 둔다. 서버에서 현재가와 PnL%를 내려주거나 프론트 변환을 보강한다.
- [ ] **포트폴리오 거래 내역 청산가 수정** — `live_positions`에는 `exit_price`가 없는데 `/api/portfolio/trades`가 `p.exit_price`를 읽는다. `exit_price` 컬럼을 추가하거나 `live_fills`에서 청산 체결가를 조인/집계한다.
- [ ] **대시보드 집계 API 비용 줄이기** — `/api/dash/operator/home` 캐시 미스 때 DB 쿼리 수가 많고 `getCircuitBreakerStatus()`가 OKX 잔고 조회를 시도한다. dashboard read는 DB snapshot 기반으로 만들고 거래소 호출과 분리한다.
- [ ] **탐지 스캔 API 보호** — `/api/detection/scan`, `/api/detection/refresh`, `/api/detection/scan/stream`은 전체 KRW 심볼을 순차 스캔한다. 운영자 인증, 쿨다운, 중복 실행 lock, 캐시 우선 응답을 추가한다.
- [ ] **circuit breaker DTO 타입 정합성** — 서버는 `currentLossPct/limitPct/triggered`, 프론트 타입은 `dailyLossPct`를 기대한다. DTO 이름과 타입을 통일한다.
- [ ] **연구 루프 자원 상한 추가** — 워커 풀 크기를 `BACKTEST_WORKER_POOL_SIZE` 같은 환경변수로 제한하고, 서버 시작 시 30개월 backfill + 전체 연구 루프가 자동으로 도는 정책을 로컬/VPS별로 분리한다.
- [ ] **백테스트 지표 계산 최적화** — slice 비용은 줄었지만 전략 내부에서 매 캔들마다 지표 배열을 재계산한다. 전략별 indicator cache 또는 증분 계산으로 CPU 사용량을 줄인다.
- [ ] **Supabase env 이름 통일** — 서버는 `SUPABASE_SERVICE_ROLE_KEY`를 읽는다. `.env`, 배포 설정, 문서가 `SUPABASE_SERVICE_KEY` 등 다른 이름을 쓰지 않게 정리한다.
- [ ] **AI 리뷰 운영 화면 반영** — AI 리뷰는 ResearchPage에만 보인다. 성과 붕괴, 검증 전멸, high MDD 리뷰 요약을 OperatorQueue/DecisionLedger에도 노출한다.
- [ ] **테스트 환경 변수 기본값 보강** — `web` 테스트는 `VITE_SUPABASE_URL` 없으면 실패한다. vitest setup에서 테스트용 Supabase URL/anon key fallback을 넣는다.
- [ ] **웹 lint 실패 수정** — `Toast.tsx` fast-refresh export, `PortfolioPage.tsx` 미사용 `_currency`, `SettingsPage.tsx` effect 안 동기 setState, `api.ts` 미사용 `_signal` 정리.

## 완료

- [x] 서버 오케스트레이션 API 엔드포인트 추가 (`/api/dash/operator/home`)
- [x] 웹 스토어를 mock 기반에서 실제 API 호출 기반으로 전환
- [x] EDGE 스코어 계산 로직 서버 구현 (`calculateEdgeScore()`)
- [x] 실시간 업데이트 연결 (30초 polling)
- [x] v2 명칭 전면 제거 (파일명, 테이블명, API 경로, 문서)
- [x] StrategyDetail mock 제거 (store 연결)
- [x] mock 데이터 파일 삭제 (`dashboard-data.ts`)
- [x] 미사용 `types/trading.ts` 삭제
- [x] 프론트 주요 스토어 테스트 추가 (15개)
- [x] 인증 읽기/쓰기 분리 (GET 무인증, POST 인증)
- [x] 서버 캐시 추가 (30초 TTL)
- [x] API 라우트 네임스페이스 분리 (`/api/dash/*`)
- [x] Supabase 스키마 적용 (`20260404_schema.sql`)
- [x] 서버 API 테스트 추가 (9개 endpoint 테스트)
- [x] API 실패 시 에러 UI (로딩/에러/에러배너 3단계)
- [x] 미사용 파일 정리 (`types/trading.ts`, `backtest-engine.test.ts`)
- [x] 기존 테스트 v2 경로 수정

## 다음 작업

- [x] 접근성 보강 — ARIA labels, role="switch", htmlFor+id 연결, aria-live 토스트, aria-labelledby 모달, 메뉴 버튼 aria-expanded

- [x] 펀딩비/OI/김프/롱숏비율 수집 (`market-summary.ts`, OKX+Upbit API)

## 검증 / 운영 준비

- [x] DB 인덱스 성능 검증 — research_runs, orchestrator_slots, paper_sessions, live_positions, strategies 등 8개 인덱스 추가
- [x] 실전 전환 전 리스크 파라미터 확정 — 동시 포지션 한도(3), 포지션 크기 상한($5K), 레버리지 상한(3x) 추가. 환경변수로 조정 가능.
- [ ] 서버 시작 시 cron 자동 실행 정책 점검 — `startCronJobs()`가 3초 뒤 `ensureMinimumCandles()`와 전체 파이프라인을 실행한다. 운영 전 `RUN_CRON_ON_START` 같은 보호 플래그 검토.
- [ ] `npm audit` 검토 — server `npm ci` 기준 취약점 3개(2 moderate, 1 high)가 보고됨. 자동 `npm audit fix` 전에 영향 범위 확인.

## 연구 파이프라인 (2단계, /plan-eng-review 2026-04-05에서 스코프 축소됨)

- [x] **연구 파이프라인 재설계** — param-explorer + validation-engine + research-orchestrator 구현. IS/OOS 70/30 + WF 3-fold 검증. RESEARCH_MODE=pipeline 환경변수로 활성화, legacy 모드 유지.
- [x] **백테스트 엔진 O(n²) → O(n) 최적화** — precomputeRegimes()로 레짐 사전 계산 + 증분 push 기반 캔들 맵으로 slice 제거. 전략 내부 지표 계산은 O(i)이지만 할당 비용 대폭 절감.
- [x] **심볼 키 완전 통일** — `getBtcKey()`/`getBtcEthKeys()` 헬퍼 도입, 전략 6개 + research-loop + backtest-engine 전체 통일. 76b0969.
- [x] **Expected Value 단위 통일** — `BacktestTrade.fees`(통화) → `feePct`(%)로 변경. pnlPct와 동일 단위로 spot/futures 비교 가능.

## 나중으로 이연

- [ ] 한국주식 브로커 확정
- [ ] 브로커/API 키 암호화 저장 정책 확정
- [ ] 멀티유저/로그인 재도입 범위 확정
- [ ] 공용 전략 성과 노출 범위 결정
- [ ] WebSocket/SSE 실시간 스트리밍 범위 확정
