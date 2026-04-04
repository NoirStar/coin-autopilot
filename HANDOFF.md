# HANDOFF.md — 2026-04-04 집에서 이어서 할 작업

## 이 프로젝트를 한 줄로

`coin-autopilot`은 단일 전략 봇이 아니라, 전략을 계속 연구하고 검증해서 "어떤 전략을 언제 신뢰할지"를 판단하는 전략 오케스트레이션 운영실이다.

핵심은 아래 3개다.

- 연구 루프: 전략 후보와 파라미터를 자동으로 검증
- 오케스트레이터: 현재 시장과 최근 성과를 보고 전략 배치/유지/교체 판단
- 운영실 홈: 지금 상태, 리스크, 승인 필요 항목을 한눈에 보여주는 UI

## 이번 세션 결론

- `PRD/`, `PLAN.md`, `DESIGN.md` 기준 제품 방향은 꽤 선명하다.
- 이 프로젝트는 **실현 가능**하다. 다만 `Stage 1`에 강하게 집중해야 한다.
- 현재 가장 큰 병목은 전략 로직 부족이 아니라 **프론트 mock 상태와 서버 실제 상태 사이의 연결 부재**다.
- 다음 세션 우선순위는 새 기능 추가가 아니라 **계약 정리 + 대시보드 실데이터 연결**이다.

## 내 평가

### 좋은 점

- 방향성이 분명하다. "좋은 전략 하나 찾기"가 아니라 "전략을 신뢰하는 시스템"을 만들려는 점이 차별점이다.
- 초보 운영자를 고려한 설계가 좋다. 수익률만이 아니라 승인, 리스크, 판단 이유를 전면에 둔 점이 좋다.
- 문서화가 꽤 잘 되어 있다. PRD, PLAN, DESIGN이 같은 방향을 보고 있다.
- 백엔드 코어는 생각보다 많이 와 있다. 연구 루프, 오케스트레이터, 리스크, 실행, API 골격이 이미 있다.

### 부족한 점

- 범위가 크다. 암호화폐 + 한국주식 + 멀티유저 + AI 재분석까지 한 번에 가면 쉽게 흐려진다.
- 검증 품질이 아직 충분히 강하지 않다. 현재 구현은 임계치 기반 승격이 중심이라 과최적화 리스크를 더 줄여야 한다.
- 프론트와 서버 계약이 아직 맞물리지 않는다. 화면은 좋아졌지만 실제 운영 상태를 반영하지 못한다.
- 인증 정책이 문서와 코드에서 어긋난다. UI는 1인 사용 무인증 방향인데 서버 `/api/*`는 인증을 요구한다.
- 실전 readiness는 아직 낮다. 구조는 있지만 "신뢰 가능한 운영 제품" 단계는 아니다.

### 체감 점수

- 제품 방향 선명도: `8/10`
- 문서 정합성: `8/10`
- 백엔드 코어 구현도: `7/10`
- 프론트 UX 구현도: `7/10`
- 프론트-백엔드 연결도: `4/10`
- 실전 투입 준비도: `2/10`

## 현재 구현 수준 — 코드 기준 솔직한 상태

### 1. 백엔드

- 크론 메인 파이프라인은 이미 존재한다.
  - `4시간`: 캔들 수집 → 연구 루프 → 오케스트레이터 → 페이퍼 → 실전 동기화 → 리스크 체크
  - `1시간`: 알트 탐지
  - 파일: `server/src/core/cron.ts`

- 연구 루프는 이미 돈다.
  - 등록 전략 순회
  - 캔들 로드
  - 백테스트 실행
  - `research_runs`, `research_run_metrics` 저장
  - 기준 통과 시 `paper_candidate` 승격
  - 파일: `server/src/research/research-loop.ts`

- 오케스트레이터 핵심도 있다.
  - 레짐 판정
  - 후보 랭킹
  - go_flat 판단
  - 슬롯별 배치/교체 판단
  - 슬롯 상태 조회 API용 함수 존재
  - 파일: `server/src/orchestrator/orchestrator.ts`

- V2 API도 이미 꽤 있다.
  - `/api/dashboard`
  - `/api/slots`
  - `/api/decisions`
  - `/api/research/runs`
  - `/api/research/candidates`
  - `/api/risk/status`
  - `/api/positions`
  - 파일: `server/src/routes/api.ts`

### 2. 프론트

- 운영실 홈 레이아웃과 UX는 많이 올라와 있다.
  - `SystemStrip`
  - `HeroStrip`
  - `DeploymentMatrix`
  - `OperatorQueue`
  - `PositionPanel`
  - `MarketPanel`
  - `DecisionLedger`
  - `ResearchStatus`

- 연구 페이지는 API 연결 시도를 이미 하고 있다.
  - 파일: `web/src/pages/ResearchPage.tsx`

- 포트폴리오 / 설정 페이지는 기존 API를 사용한다.
  - 파일: `web/src/pages/PortfolioPage.tsx`
  - 파일: `web/src/pages/SettingsPage.tsx`

### 3. 아직 mock 이거나 얇은 부분

- `TradingDashboard`는 아직 store + mock 데이터 중심이다.
  - `systemStatus`, `heroSummary`, `assetSlots`, `decisions`는 Zustand mock store
  - `positions`, `market`은 페이지에서 직접 mock import
  - 파일: `web/src/pages/TradingDashboard.tsx`

- `orchestration-store`, `approval-store`, `research-store`는 아직 mock 초기값만 쓴다.
  - 파일: `web/src/stores/orchestration-store.ts`
  - 파일: `web/src/stores/approval-store.ts`
  - 파일: `web/src/stores/research-store.ts`

- `StrategyDetail`은 완전 mock 기반이다.
  - 파일: `web/src/pages/StrategyDetail.tsx`

- 승인 큐는 서버 실데이터가 아니라 프론트 로컬 삭제만 된다.
  - 실제 approve/reject API 없음
  - 실제 pending decision / unresolved risk event 집계 endpoint 없음

- 시장 상황 패널용 API가 없다.
  - PRD상 필요한 펀딩비, OI, 롱숏 비율, 김프 요약 endpoint 부재

- EDGE 스코어는 문서상 중요하지만 서버 계산/노출이 아직 없다.

## 중요한 구현 차이 / 함정

### 1. "서버 API 없음"은 이제 정확한 표현이 아님

기존 HANDOFF는 "서버 API 엔드포인트 추가"라고 되어 있었는데, 지금은 **대시보드용 V2 API가 이미 일부 존재한다**.

정확한 표현은 아래다.

- API는 이미 부분적으로 있다
- 하지만 대시보드가 아직 그 API를 거의 사용하지 않는다
- 그리고 대시보드에 꼭 필요한 `queue`, `market summary`, `hero EDGE` 계약은 비어 있다

### 2. 인증 정책이 충돌한다

- 프론트 계획은 `1인 사용 단계`, `AuthGuard 제거`, `무인증 UX` 쪽이다
- 그런데 서버는 API 전체에 `authMiddleware`를 걸고 있다
- 파일: `server/src/index.ts`

이 상태면:

- 대시보드를 실데이터로 붙이면 인증이 걸려서 바로 안 맞을 수 있다
- 집에서 이어서 할 때 가장 먼저 **무인증 운영실로 갈지, 가벼운 인증을 유지할지** 결정해야 한다

### 3. ResearchPage는 "연결된 것처럼 보이지만" 계약이 아직 안 맞을 수 있다

- `web/src/pages/ResearchPage.tsx`는 배열 형태를 기대하고 있다
- `server/src/routes/api.ts`는 `{ data: ..., rankedAt: ... }` 형태를 반환한다
- 즉 프론트에서 응답 unwrap / transform이 필요하다

## 지금 프로젝트를 어디까지 현실적으로 볼지

### Stage 1은 현실적이다

지금 목표는 아래까지만 확실히 하면 된다.

- 암호화폐 중심
- 연구 루프 작동
- 오케스트레이터 작동
- 페이퍼 작동
- 운영실 홈에서 현재 상태를 실데이터로 보여줌
- 승인/리스크 흐름이 보임

### Stage 2부터는 난도가 확 오른다

- 한국주식
- 더 정교한 실행 정책
- 더 많은 전략군

### Stage 3는 사실상 다른 제품이다

- 멀티유저
- 사용자별 전략 선택
- 플랫폼화

지금은 여기에 신경 쓰지 말 것.

## 다음 세션 권장 순서

### 1. 인증 정책 먼저 결정

추천:

- `운영실 읽기 API`는 1인 사용 단계에서 무인증 또는 로컬 운영자 토큰 기반으로 단순화
- `설정 변경`, `실전 관련 쓰기 작업`만 인증 유지

이걸 먼저 결정하지 않으면 프론트 연결하다가 계속 막힌다.

대상 파일:

- `server/src/index.ts`
- `server/src/core/auth.ts`
- `web/src/services/api.ts`

### 2. 대시보드 DTO를 고정

추천 방향은 둘 중 하나:

- 기존 endpoint들을 조합해서 프론트에서 가공
- 또는 `GET /api/operator/home` 같은 집계 endpoint를 새로 만든다

내 추천은 **집계 endpoint 1개 추가**다.
이유:

- 대시보드가 원하는 정보가 동기화된 스냅샷 형태다
- 프론트 store가 단순해진다
- polling도 쉬워진다

최소 포함 필드:

- system strip 상태
- hero summary
- asset slots
- queue items
- open positions
- market summary
- recent decisions
- research summary

대상 파일:

- `server/src/routes/api.ts`
- `web/src/types/orchestration.ts`

### 3. TradingDashboard를 실데이터로 전환

순서:

1. `orchestration-store`에 fetch 액션 추가
2. `approval-store`에 queue fetch 액션 추가
3. `research-store`에 summary fetch 액션 추가
4. `TradingDashboard`에서 mock import 제거

대상 파일:

- `web/src/stores/orchestration-store.ts`
- `web/src/stores/approval-store.ts`
- `web/src/stores/research-store.ts`
- `web/src/pages/TradingDashboard.tsx`

### 4. StrategyDetail mock 제거

현재 이 페이지는 대시보드 drill-down 역할인데 가장 중요한데도 아직 mock이다.

최소 필요 데이터:

- slot 단건
- 관련 decision history
- 현재 open position
- rationale / score snapshot

대상 파일:

- `web/src/pages/StrategyDetail.tsx`
- `server/src/routes/api.ts`

### 5. ResearchPage 계약 수정

현재는 API는 불러도 shape가 안 맞을 가능성이 크다.

할 일:

- `api.request()` 응답에서 `data` unwrap
- 서버 응답 필드명과 UI 필드명 맞추기
- 필요하면 `select` 또는 transform 함수 추가

대상 파일:

- `web/src/pages/ResearchPage.tsx`
- `web/src/services/api.ts`

### 6. 마지막에 polling 붙이기

추천 주기:

- dashboard home: 15~30초
- research: 30~60초
- settings/portfolio: 수동 또는 느린 polling

WebSocket은 지금 바로 안 해도 된다. polling으로 먼저 끝내는 게 맞다.

## 서버에서 추가로 필요한 계약

아래 3개는 사실상 꼭 필요하다.

- `queue endpoint`
  - pending orchestrator decisions
  - unresolved risk events
  - 승인/거부에 필요한 최소 설명

- `market summary endpoint`
  - volatility
  - funding
  - OI
  - long/short ratio
  - kimchi premium
  - stale 여부

- `hero/edge summary`
  - 총 자산
  - 오늘 손익
  - live / paper count
  - pending approvals
  - EDGE score

## 지금 하지 말 것

- 한국주식 붙이기
- 멀티유저 다시 고민하기
- 전략 종류 더 늘리기
- AI 재분석 기능 확장하기
- 실전 자동화 범위 넓히기

지금은 "운영실 홈이 실데이터로 신뢰 가능하게 보이는가"가 최우선이다.

## 집에서 시작할 때 열 파일

우선순위대로:

1. `server/src/index.ts`
2. `server/src/routes/api.ts`
3. `web/src/services/api.ts`
4. `web/src/stores/orchestration-store.ts`
5. `web/src/stores/approval-store.ts`
6. `web/src/stores/research-store.ts`
7. `web/src/pages/TradingDashboard.tsx`
8. `web/src/pages/StrategyDetail.tsx`
9. `web/src/pages/ResearchPage.tsx`

## 이번 세션에서 바뀐 문서

- `README.md`
- `TODOS.md`
- `CLAUDE.md`
- `HANDOFF.md`

모두 **기준 문서(PRD / PLAN / DESIGN / HANDOFF)** 에 맞춰 정리했다.

## 아직 안 한 것

- 코드 변경 없음
- 테스트/빌드 재실행 안 함
- 문서 정리와 현재 구현 수준 리뷰만 수행

## 마지막 메모

이 프로젝트의 승부처는 "전략을 더 많이 추가하는 것"이 아니다.

승부처는 아래 3개다.

- 운영실 홈이 실데이터로 믿을 만하게 보이는가
- 연구 → 승격 → 배치 흐름이 문서와 코드에서 일치하는가
- 실전으로 가기 전에 어디서 멈춰야 하는지가 명확한가

다음 세션에서는 새 아이디어보다 **연결, 계약, 신뢰도**를 우선할 것.
