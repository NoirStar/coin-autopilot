# TODOS

기준 문서는 `PRD/`, `PLAN.md`, `DESIGN.md`, `HANDOFF.md`.
이 파일은 현재 남은 실행 작업만 짧게 모아두는 보조 문서다.

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

- [ ] 접근성 보강

- [x] 펀딩비/OI/김프/롱숏비율 수집 (`market-summary.ts`, OKX+Upbit API)

## 검증 / 운영 준비

- [ ] DB 인덱스 성능 검증
- [ ] 실전 전환 전 리스크/승인 파라미터 재확정

## 연구 파이프라인 (2단계, /plan-eng-review 2026-04-05에서 스코프 축소됨)

- [ ] **연구 파이프라인 재설계** — param-explorer + validation-engine + research-orchestrator. IS/OOS/WF 3-fold 검증. 이전 디자인 문서: `~/.gstack/projects/NoirStar-coin-autopilot/namwoo-main-design-20260405-001026.md`. 의존: 1단계 폐루프 구축 + 운용에서 param_set 사용 확인.
- [ ] **백테스트 엔진 O(n²) → O(n) 최적화** — backtest-engine.ts:88-94가 매 캔들마다 슬라이스를 새로 만들고 지표를 재계산하는 구조. 스트리밍 지표 계산으로 전환. 2단계 그리드 탐색의 전제. Codex #3.
- [ ] **심볼 키 완전 통일** — 연구/페이퍼/실전 엔진의 심볼 키 형식 통일 (`BTC` vs `BTC-USDT` vs `BTC-KRW`). 기존 전략 6개 모두 심볼 접근 코드 수정 필요. Codex #7. 1단계에서 부분 완화된 상태.
- [ ] **Expected Value 단위 통일** — BacktestResult에서 `pnlPct`(%) 와 `fees`(통화)가 섞여 있어서 EV 계산이 spot/futures 간 비교 의미 없음. `feePct`로 저장 통일. 2단계 시작 전 필수. Codex #8.

## 나중으로 이연

- [ ] 한국주식 브로커 확정
- [ ] 브로커/API 키 암호화 저장 정책 확정
- [ ] 멀티유저/로그인 재도입 범위 확정
- [ ] 공용 전략 성과 노출 범위 결정
- [ ] WebSocket 실시간 (polling으로 충분한 동안 이연)
