# HANDOFF.md — 2026-04-08 집에서 이어서 할 작업

## 이 프로젝트를 한 줄로

`coin-autopilot`은 단일 전략 봇이 아니라, 백테스트와 페이퍼 운용 데이터를 계속 쌓아 "어떤 전략을 언제 신뢰할지" 판단하는 전략 오케스트레이션 운영실이다.

지금 우선 범위:

- `BTC OKX 선물`
- `Upbit 알트 현물`
- 한국주식과 멀티유저는 후순위

## 이번 리뷰 결론

현재 구조는 PRD 방향과 완전히 어긋난 것은 아니다. 연구 루프, 페이퍼 엔진, 오케스트레이터, 대시보드 집계 API까지 꽤 많이 구현되어 있다.

다만 지금 위험한 부분은 "기능이 없다"보다 "화면이 실제보다 더 완성된 것처럼 보이는 것"이다. 특히 설정 페이지, 승인 흐름, 알트 슬롯 운영은 바로 손봐야 한다.

## 추가 전체 감사에서 더 확인된 P0/P1

- **쓰기 API 인증 구멍**: `/api/dash/decisions/:id/approve`, `/api/dash/decisions/:id/reject`, `/api/dash/risk/events/:id/resolve`는 쓰기 작업인데 현재 라우트에 `authMiddleware`가 없다. 프론트는 POST에 토큰을 붙이지만 서버가 강제하지 않는다. 외부 노출 전에 반드시 막아야 한다.
- **승인 상태 enum 불일치**: DB `decision_status` enum에는 `approved/rejected`가 없는데 approve/reject 라우트가 해당 값을 쓴다. 인증을 붙이기 전에 상태 머신부터 고쳐야 한다.
- **포트폴리오 청산가 계약 오류**: `live_positions`에는 `exit_price` 컬럼이 없는데 `/api/portfolio/trades`는 `p.exit_price`를 읽는다. 거래 내역 청산가가 0 또는 빈값으로 표시될 수 있다.
- **대시보드 집계 비용**: `/api/dash/operator/home`은 30초 캐시가 있지만 캐시 미스 때 많은 DB 쿼리와 `getCircuitBreakerStatus()`를 호출한다. 이 함수는 대시보드 조회 중에도 OKX 잔고 조회를 시도한다. 거래소가 느리거나 키가 없으면 홈 응답이 느려질 수 있다.
- **탐지 스캔 공개 고비용**: `/api/detection/scan`, `/api/detection/refresh`, `/api/detection/scan/stream`이 전체 Upbit KRW 심볼을 순차 스캔한다. 각 심볼마다 sleep + 캔들 + 오더북 요청이 들어가므로 인증/운영자 토큰/쿨다운 없이 공개로 두면 쉽게 부하가 걸린다.
- **프론트 타입 계약 불일치**: 서버의 circuit breaker DTO는 `currentLossPct/limitPct/triggered`인데 프론트 타입은 `dailyLossPct`를 기대한다. 지금은 크게 쓰이지 않지만 DTO 기준을 맞춰야 한다.
- **연구 CPU 비용**: 백테스트 엔진은 slice 비용은 줄였지만, 전략 내부가 매 캔들마다 close/high/low 배열을 만들고 EMA/ADX 등을 재계산한다. 워커 풀만으로 해결된 상태는 아니다. 지표 캐시 또는 증분 지표 계산이 다음 최적화다.
- **웹 lint 실패**: build/test는 통과하지만 `npm run lint`가 4건 실패한다. SettingsPage의 effect 안 동기 setState는 작은 성능 냄새라 같이 정리한다.
- **감사 취약점**: server audit은 `hono`, `@hono/node-server`, transitive `vite`에서 2 moderate + 1 high. web audit은 `vite` high 1건. dev-server 계열이라도 외부 노출 개발 서버를 피하고 업데이트를 검토한다.

## 1. AI 오케스트레이션 상태

의도한 구조와 맞는 점:

- AI가 매번 매매 판단을 직접 내리는 구조가 아니다.
- 연구 파이프라인에서 이벤트 기반으로만 AI를 부른다.
- `AI_COOLDOWN_H`, `AI_DAILY_TOKEN_BUDGET`, 동일 트리거 중복 방지로 토큰을 아끼는 장치가 있다.
- AI는 파라미터 재탐색 범위, 실패 분석, 후보 비교를 제안하고, 최종 승격은 백테스트/검증 데이터가 통과해야 한다.

아직 부족한 점:

- AI는 현재 연구 리뷰에 가깝고, 운영 중 "사람처럼 대응"하는 액션 센터까지는 아니다.
- AI 리뷰 결과가 ResearchPage에만 보이고, OperatorQueue/DecisionLedger에는 연결이 약하다.
- 실전 배치 승인이나 리스크 대응은 AI가 아니라 룰 기반 오케스트레이터/리스크 매니저가 처리한다.

추천 방향:

- 이 구조는 유지한다. AI를 상시 호출하는 쪽으로 바꾸지 말 것.
- 대신 AI 리뷰가 나온 이유와 추천 행동을 운영 큐에 요약 노출한다.

## 2. 백테스트/연구 파이프라인

좋은 점:

- `RESEARCH_MODE=pipeline` 기본값으로 파라미터 그리드 탐색을 돈다.
- 스크리닝 → IS/OOS 70/30 → 3-fold WF 검증 → 승격 전 AI 리뷰 → `paper_candidate` 승격 흐름이 있다.
- 백테스트 엔진은 레짐 사전 계산과 증분 candle map으로 이전 O(n²) slice 비용을 줄였다.
- Worker Thread 풀을 써서 CPU 작업을 메인 이벤트 루프 밖으로 보낸다.

주의할 점:

- 서버 시작 3초 뒤 `ensureMinimumCandles()`가 30개월 backfill을 확인하고, 이후 전체 연구 루프가 자동 실행된다.
- 전략별 grid가 최대 100개이고, 검증 단계에서 후보별 IS/OOS/WF 세그먼트를 다시 돌리므로 VPS 자원 사용량이 커질 수 있다.
- 워커 풀 크기가 `max(2, cpu - 2)`라 고코어 머신에서는 생각보다 많은 워커가 뜰 수 있다.
- 알트 연구 대상은 `ETH/XRP/SOL/DOGE` 고정 목록 위주다. 실제 Upbit 알트 유니버스 운용과는 아직 거리가 있다.

집에서 먼저 할 일:

- `BACKTEST_WORKER_POOL_SIZE` 같은 env 상한 추가
- `RUN_PIPELINE_ON_START=false` 또는 `RUN_CRON_ON_START=false` 같은 시작 보호 플래그 검토
- 알트 유니버스를 설정값/DB로 빼기

## 3. 오케스트레이터/페이퍼/실전

현재 상태:

- 오케스트레이터는 최근 연구 결과를 레짐/방향 기준으로 점수화한다.
- `strategy_assign`, `strategy_switch`, `go_flat`, `rebalance` 판단을 만들 수 있다.
- 전략 배치/교체는 페이퍼 세션 생성/종료로 이어진다.
- 실전 엔진은 `LIVE_TRADING=true`일 때만 OKX 주문을 실행한다.

큰 갭:

- `initialAssignment()`가 아직 `BTC-USDT` 단일 슬롯을 만든다.
- 후보 랭킹이 `asset_class`, `exchange`, `market_scope`별로 분리되지 않아 OKX 선물 전략과 Upbit 알트 전략이 같은 후보 풀에 섞일 수 있다.
- 실전 엔진은 Phase 7 초기 구현 그대로 BTC 단일 진입에 가깝다. 알트 실전은 범위 밖이고, 지금은 페이퍼 중심으로 봐야 한다.
- 승인 API가 DB enum과 안 맞을 가능성이 높다. `decision_status` enum에는 `approved/rejected`가 없는데 라우트는 해당 값을 업데이트한다.
- 승인/거부/리스크 해결 쓰기 라우트에 인증 미들웨어가 없다.

최우선 수정:

1. `decision_status` enum 수정 또는 approve/reject 라우트 수정
2. 슬롯을 `BTC-OKX-SWAP`, `ETH-OKX-SWAP`, `UPBIT_ALT_TOP*`로 분리
3. 랭킹 쿼리에 `asset_class`, `exchange`, `market_scope` 조건 추가
4. 알트 전략은 Upbit 알트 슬롯에만 배치되게 제한

## 4. 대시보드 리뷰

좋은 점:

- 첫 화면이 실제 트레이딩 대시보드다.
- `SystemStrip`, `HeroStrip`, `DeploymentMatrix`, `OperatorQueue`, `PositionPanel`, `MarketPanel`, `DecisionLedger`, `ResearchStatus` 구성이 PRD 07과 잘 맞는다.
- `/api/dash/operator/home` + 30초 polling으로 mock 중심 상태는 벗어났다.
- 실전/모의 포지션을 구분하고, 승인 큐와 리스크 큐를 한곳에 모으는 방향도 좋다.

보강할 점:

- `orchestration-store`에 TODO가 남아 있다: 거래소 연결 상태, venue, 슬롯별 EDGE, 포지션 매핑.
- `PositionPanel`은 현재가를 `peak_price`로 대체하고, `unrealizedPnlPct`는 0으로 둔다.
- `DeploymentMatrix`의 `rationale`이 비어 있고, `rationaleDetail`도 "배분/레짐" 정도라 사용자가 "왜?"를 충분히 이해하기 어렵다.
- `ResearchStatus` 후보의 asset이 빈 문자열이다.
- OperatorQueue 폭 260px은 길어진 전략명/근거가 들어오면 답답할 수 있다.
- 현재 대시보드는 30초 polling만 사용한다. 사용자 화면에서 자주 바뀌는 값은 WebSocket 또는 SSE 후보로 올리는 게 좋다.

추천:

- 서버 DTO를 먼저 보강하고 프론트 TODO 매핑 제거
- 포지션 현재가/PnL%는 서버에서 계산해 내려주기
- 대시보드 하단은 지금 구조를 유지하되, AI 리뷰 요약과 stale 데이터 경고를 추가
- 실시간 업데이트는 하이브리드로 간다. `operator/home`은 최초 스냅샷과 fallback polling으로 유지하고, 포지션 현재가/PnL, 거래소 연결 상태, 승인 큐, 리스크 이벤트, DecisionLedger 신규 로그는 WS/SSE로 push한다.

### WebSocket/SSE 적용 기준

WS/SSE로 우선 보낼 것:

- 포지션 현재가, 미실현 PnL, PnL%
- 거래소 연결 상태와 데이터 수집 stale 경고
- 승인 큐 신규 항목과 승인/거부 상태 변경
- 리스크 이벤트 신규 발생/해결
- DecisionLedger 신규 로그
- AI 리뷰 완료 알림 요약

API/polling으로 남길 것:

- 연구 실행 이력 전체 테이블
- 전략 후보 랭킹 전체 조회
- 설정 페이지
- 포트폴리오 거래 내역
- 긴 히스토리/리포트성 데이터

구현 방향:

- 서버에는 `/api/dash/operator/home` 스냅샷을 유지한다.
- 새 실시간 채널은 `GET /api/dash/stream` SSE 또는 `WS /api/dash/ws` 중 하나로 시작한다. 단방향 대시보드 업데이트만 필요하면 SSE가 단순하다.
- 클라이언트는 연결 성공 시 push 이벤트로 store를 patch하고, 연결 끊김/백그라운드 복귀 시 30초 polling으로 fallback한다.
- 실전 주문/승인 같은 쓰기 명령은 WS로 받지 말고 기존 POST API + 인증을 사용한다.

## 5. 설정 페이지 리뷰

가장 조심해야 한다.

현재 설정 페이지에서 보이는 것:

- Upbit/OKX API 키 등록
- 리스크 파라미터
- Telegram/Discord 알림 토글
- 서버 상태
- 데이터 관리 위험 영역

실제 코드 기준:

- 읽기는 무인증으로 된다.
- 쓰기는 `authMiddleware`가 필요하다. 로그인/토큰이 없으면 저장이 401로 실패할 수 있다.
- API 키는 `user_settings`에 저장되지만, OKX/Upbit 클라이언트와 포트폴리오 조회는 `.env` 키를 읽는다.
- Telegram/Discord도 DB 설정이 아니라 `.env`를 읽는다.
- 리스크 매니저는 설정 페이지 값이 아니라 `DAILY_LOSS_LIMIT_PCT`, `CIRCUIT_BREAKER_PCT`, `MAX_*` 환경변수를 읽는다.
- "API 키는 서버에 암호화되어 저장됩니다"라는 문구는 현재 코드 기준으로 사실이라고 보기 어렵다. 평문 컬럼 저장으로 보인다.
- DangerZone의 삭제 버튼은 실제 삭제 API 없이 확인 UI만 있다.

추천:

- 설정 페이지를 "런타임 적용 설정"과 "저장만 되는 설정"으로 나눠라.
- API 키 저장 정책은 `.env only`로 갈지, DB 암호화 저장으로 갈지 먼저 결정.
- 1인 사용이면 쓰기 API도 운영자 토큰 방식으로 단순화하거나, 프론트 로그인 흐름을 다시 붙여라.
- 암호화 문구는 구현 전까지 제거하거나 "저장 정책 확정 전"으로 바꿔라.

## 6. 검증 결과

이번 세션에서 실행한 것:

- `server`: `npm ci` 후 `npm run build` 통과
- `server`: `npm test` 통과, 8 files / 78 tests
- `web`: `npm run build` 통과
- `web`: 기본 `npm test`는 `VITE_SUPABASE_URL` 미설정으로 실패
- `web`: `VITE_SUPABASE_URL=http://localhost VITE_SUPABASE_ANON_KEY=test npm test` 통과, 3 files / 15 tests

추가 메모:

- server `npm ci`에서 취약점 3개가 보고됐다: 2 moderate, 1 high.
- web build는 559KB chunk warning이 있다. 당장 치명적이지는 않지만 코드 스플리팅 후보.
- web `npm run lint`는 실패한다. `Toast.tsx`, `PortfolioPage.tsx`, `SettingsPage.tsx`, `api.ts` 4건.
- `npm audit --json` 기준 server는 `hono`, `@hono/node-server`, transitive `vite`, web은 `vite` 취약점이 남아 있다.

## 7. 집에서 바로 열 파일

우선순위대로:

1. `supabase/migrations/20260404_schema.sql`
2. `server/src/routes/api.ts`
3. `server/src/orchestrator/orchestrator.ts`
4. `server/src/paper/paper-engine.ts`
5. `server/src/execution/execution-engine.ts`
6. `server/src/routes/settings.ts`
7. `server/src/risk/risk-manager.ts`
8. `web/src/stores/orchestration-store.ts`
9. `web/src/pages/SettingsPage.tsx`
10. `web/src/components/dashboard/PositionPanel.tsx`

## 8. 지금 하지 말 것

- 한국주식 붙이기
- 멀티유저 다시 설계하기
- 실전 알트 자동매매 확장하기
- AI를 상시 판단 루프로 바꾸기
- 전략 종류만 더 늘리기

지금은 `BTC 선물 + Upbit 알트 페이퍼` 흐름을 실제로 신뢰 가능하게 만드는 게 먼저다.
