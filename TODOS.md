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

- [x] 접근성 보강 — ARIA labels, role="switch", htmlFor+id 연결, aria-live 토스트, aria-labelledby 모달, 메뉴 버튼 aria-expanded

- [x] 펀딩비/OI/김프/롱숏비율 수집 (`market-summary.ts`, OKX+Upbit API)

## 검증 / 운영 준비

- [x] DB 인덱스 성능 검증 — research_runs, orchestrator_slots, paper_sessions, live_positions, strategies 등 8개 인덱스 추가
- [x] 실전 전환 전 리스크 파라미터 확정 — 동시 포지션 한도(3), 포지션 크기 상한($5K), 레버리지 상한(3x) 추가. 환경변수로 조정 가능.

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
- [ ] WebSocket 실시간 (polling으로 충분한 동안 이연)
