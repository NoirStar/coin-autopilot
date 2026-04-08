# PLAN.md — PRD 기반 새 제품 구축

> 이 문서는 PRD 목표 시스템을 새로 구축하기 위한 실행 계획.
> 기존 코드 유지보수가 아니라 전면 재설계+재구축.
> **최종 업데이트: 2026-04-08 구현 리뷰 반영**

## 2026-04-08 우선순위 리셋

현재 개발 초점은 `BTC OKX 선물 + Upbit 알트 현물`이다. 한국주식과 멀티유저 플랫폼은 PRD상 장기 방향으로 유지하되, 지금은 구현 범위에서 밀어낸다.

이번 리뷰 결론:

- AI 오케스트레이션은 방향이 맞다. 현재 AI는 매 캔들/매 주문마다 호출되는 구조가 아니라 연구 파이프라인에서 이벤트 기반 리뷰어로 동작한다.
- 연구 파이프라인은 `param-explorer` + `validation-engine` + 워커 풀 + 조건부 AI 리뷰까지 들어와 있어 PRD의 "백테스트 → 검증 → 페이퍼 후보" 흐름에 가깝다.
- 오케스트레이터는 아직 자산별 배치기가 아니라 BTC 중심 후보 랭킹기에 가깝다. `initialAssignment()`가 `BTC-USDT` 단일 슬롯을 만든다.
- 알트는 탐지/전략/백테스트/페이퍼 평가 경로에는 있지만, `UPBIT_ALT_*` 슬롯이나 알트 바스켓 운영 단위가 부족하다.
- 대시보드는 mock이 아니라 `/api/dash/operator/home` 실데이터 polling으로 전환됐다. 다만 venue, 전략 설명, 슬롯별 EDGE, 포지션 현재가/수익률 매핑은 아직 얇다.
- 설정 페이지는 보이는 값과 실제 런타임 연결이 다르다. API 키/알림은 DB에 저장돼도 실제 클라이언트는 `.env`를 읽고, 리스크 설정도 대부분 환경변수 기반이다.
- 운영 승인 API는 DB enum과 충돌할 수 있다. `orchestrator_decisions.status` enum에는 `approved/rejected`가 없는데 라우트는 그 값을 쓰려고 한다.

### 다음 구현 순서

1. DB 계약 수정: `decision_status`에 `approved`, `rejected` 추가 또는 라우트를 기존 enum에 맞게 수정.
2. 설정 정합성 수정: 설정 페이지에서 실제로 런타임에 반영되는 값과 단순 저장값을 분리 표시.
3. 자산 슬롯 고도화: `BTC-OKX-SWAP`, `ETH-OKX-SWAP`, `UPBIT_ALT_TOP*` 슬롯을 분리하고 전략 후보를 asset_class/exchange/market_scope별로 랭킹.
4. 알트 페이퍼 운영: `alt_mean_reversion`, `alt_detection`이 오케스트레이터에 의해 Upbit 알트 슬롯으로 페이퍼 세션 생성되게 연결.
5. 대시보드 매핑 보강: 서버 DTO에 venue, strategyName, rationale, per-slot edge, currentPrice, pnlPct를 추가.
6. 사용자 화면 실시간 채널 설계: 포지션/PnL, 승인 큐, 리스크 이벤트, DecisionLedger 신규 로그는 WS/SSE로 push하고 `operator/home` polling은 fallback으로 유지.
7. 연구 자원 상한: 워커 풀 크기 환경변수, backfill 수동 모드, 파이프라인 동시 실행 제한을 추가.
8. AI 액션 표시: AI 리뷰 결과를 ResearchPage뿐 아니라 OperatorQueue/DecisionLedger에도 요약 노출.

## 진행 상태

### 완료
- [x] Phase 1: CSS 토큰 + 타입 시스템 + 레이아웃 쉘 + 라우팅
- [x] Phase 2: 트레이딩 대시보드 4대 프리미티브 (mock 데이터)
- [x] Phase 5: Zustand 스토어 3개 (orchestration, approval, research)
- [x] 전략 상세 페이지
- [x] 연구 페이지 재구축
- [x] 포트폴리오/설정 레이아웃 업데이트
- [x] AuthGuard 제거 (1인 사용 단계)
- [x] 모바일 반응형 (DeploymentMatrix 카드형, SystemStrip/HeroStrip 축약)
- [x] 초보자 UX 개선 (한국어 헤더, 승인 근거, 위험도 표시)
- [x] 레거시 11개 파일 삭제

### 최근 완료/연결됨
- [x] **포지션/세션 패널** — PRD 07 §7.4 ✓
- [x] **시장 상황 패널** — PRD 07 §7.5 ✓
- [x] EDGE 스코어 계산 로직 서버 구현 (`calculateEdgeScore()`)
- [x] mock → 실제 API 전환 (`/api/dash/operator/home` + 30초 polling)
- [x] 실시간 업데이트 (30초 polling)
- [x] 전략 상세 페이지 (store 연결)
- [x] 스토어 테스트 15개 추가
- [x] 접근성 보강
- [x] 펀딩비/OI/김프/롱숏비율 서버 수집

### 남은 핵심 작업
- [ ] 승인 API와 DB enum 불일치 수정
- [ ] 설정 페이지 값과 실제 런타임 적용 경로 정리
- [ ] BTC/ETH OKX 선물 슬롯과 Upbit 알트 슬롯 분리
- [ ] 후보 랭킹을 asset_class/exchange/market_scope별로 분리
- [ ] 대시보드 DTO/프론트 매핑 보강
- [ ] WS/SSE 실시간 채널 설계와 polling fallback 구현
- [ ] 연구 루프 자원 상한 추가

## 현재 파일 구조

```
web/src/
├── App.tsx                  # 라우터 (/, /strategy/:slotId, /research, /portfolio, /settings)
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx     # Sidebar + main (패딩 없음, 각 페이지 자체 레이아웃)
│   │   ├── SystemStrip.tsx   # 28px 시스템 상태 바 (SYS/DB/거래소/시간)
│   │   ├── Sidebar.tsx       # 플랫 네비게이션 (인증 없음)
│   │   └── HeroStrip.tsx     # 승인+위험도 → 총자산 → 손익 → 실전/모의 → 시장적합도
│   ├── dashboard/
│   │   ├── DeploymentMatrix.tsx  # 전략 배치 현황 (데스크톱 테이블 + 모바일 카드)
│   │   ├── OperatorQueue.tsx     # 확인 필요 큐 (승인 근거 + 변경점 + 진행바)
│   │   ├── DecisionLedger.tsx    # 시스템 판단 기록 (한글 요약 + 머신 로그)
│   │   └── ResearchStatus.tsx    # 연구 현황
│   └── auth/, ui/
├── pages/
│   ├── TradingDashboard.tsx  # 메인 대시보드
│   ├── StrategyDetail.tsx    # 전략 상세 (포지션, 판단이유, 결정이력)
│   ├── ResearchPage.tsx      # 연구 & 백테스트
│   ├── PortfolioPage.tsx     # 포트폴리오
│   └── SettingsPage.tsx      # 설정
├── stores/ (orchestration, approval, research, settings)
├── types/orchestration.ts
├── services/api.ts
└── index.css                # Terminal Craft Evolved 토큰
```

## 라우팅

| 경로 | 페이지 | 인증 |
|------|--------|------|
| `/` | TradingDashboard | 불필요 (1인 사용) |
| `/strategy/:slotId` | StrategyDetail | 불필요 |
| `/research` | ResearchPage | 불필요 |
| `/portfolio` | PortfolioPage | 불필요 |
| `/settings` | SettingsPage | 불필요 |

레거시 `/operator/*` 경로는 모두 새 경로로 리다이렉트.

## 네비게이션 플로우

```
트레이딩 대시보드 (/)
  ├── DeploymentMatrix 행 클릭 → /strategy/:slotId
  ├── OperatorQueue 항목 → 해당 전략/자산 상세
  ├── ResearchStatus 행 → /research
  └── Sidebar → 연구, 포트폴리오, 설정

전략 상세 (/strategy/:slotId)
  ├── ← 뒤로 → 대시보드
  └── 관련 연구 결과 링크 → /research

연구 (/research)
  └── 후보 행 클릭 → 전략 상세
```

## 트레이딩 대시보드 레이아웃 (현재 구현)

```
┌─ SystemStrip (28px) ─────────────────────────────────────┐
│ SYS ● DB ● 수집 4s  OKX ● UPBIT ●        14:22:07      │
├─ HeroStrip (bg-surface) ────────────────────────────────┤
│ [승인 대기 2건] [위험도: 안전]                            │
│ 총 자산 ₩12,048,200  오늘 +₩48,200  실전 2  모의 1     │
│                                      시장적합도 72/100   │
├─ 전략 배치 현황 (65%) ────┬─ 확인 필요 (35%, 320px) ────┤
│ STRAT  ASSET  STATE  EDGE │ [세션 승격] BB_REV/ETH      │
│ MA_X   BTC    ● LIVE  82  │  승인 시 → 포지션 진입      │
│  RSI 과매도 + 거래량↑     │  거부 시 → 현재 유지        │
│ GRID_K 005930 ● LIVE  71  │  [승인] [거부]   2시간 남음  │
│  박스권 상단 돌파          │────────────────────────────│
│ BB_REV ETH   ○ PAPER  —   │ [리스크] MDD 경고           │
│  대기 — 트리거 미달        │  ███████░ 56% (한도 -5%)    │
├─ 시스템 판단 기록 (50%) ──┬─ 연구 현황 (50%) ───────────┤
│ 14:21 BTC · 유지           │ ● 실행중 2  대기 3  완료 12 │
│   regime filter passed     │ 13:30 MOMENTUM_4H 승률 68% │
│ 14:15 ETH · 대기 중        │ 13:15 MEAN_REV 승률 52%    │
│   trigger pending          │ 12:50 BREAKOUT 승률 41%탈락│
└────────────────────────────┴─────────────────────────────┘
```

## Phase 2.5: 포지션/시장 패널

PRD 07에 명시된 2개 패널은 현재 구현되어 있다. 다음 우선순위는 패널 존재 여부가 아니라 `정확한 실데이터 매핑`이다.

### 2.5a. 포지션/세션 패널

PRD 07 §7.4: "실전 포지션과 페이퍼 포지션은 시각적으로 분리"

**위치:** 대시보드 본체, DeploymentMatrix 아래 또는 사이드 패널 확장
**내용:**
- 현재 열린 포지션 목록 (자산, 방향, 진입 전략, 현재 손익, 보유 시간, 리스크 상태)
- 실전과 페이퍼 시각적 분리 (좌측 border: 실전=profit, 페이퍼=text-faint)
- 각 포지션의 진입가, 손절가, 목표가
- **초보자 UX:** "이 포지션은 모의 운용입니다. 실제 자금이 사용되지 않습니다." 같은 라벨

**상태 정의:**
- LOADING: skeleton 행 3개
- EMPTY: "열린 포지션이 없습니다. 전략이 신호를 감지하면 자동으로 진입합니다."
- ERROR: "포지션 데이터를 불러올 수 없습니다" + [재시도]

### 2.5b. 시장 상황 패널

PRD 07 §7.5: "오케스트레이터 판단 배경을 사용자가 이해할 수 있게"

**위치:** 대시보드 하단, DecisionLedger/ResearchStatus와 같은 높이 또는 별도 탭
**내용:**
- 암호화폐: 변동성 상태, 펀딩비, OI, 롱/숏 비율, 김치 프리미엄
- 한국주식: 시장 추세, 거래대금
- **초보자 UX:** 각 지표 옆에 한 줄 설명. "펀딩비 +0.03%: 롱 포지션 비용이 높은 상태"

**상태 정의:**
- LOADING: skeleton 카드
- ERROR: "시장 데이터를 불러올 수 없습니다"
- 데이터가 오래된 경우: "마지막 업데이트: 5분 전" 경고

**레이아웃 옵션:**
```
옵션 A: 하단 3분할
┌─ 판단 기록 (33%) ─┬─ 연구 현황 (33%) ─┬─ 시장 상황 (33%) ─┐

옵션 B: 하단 2행
┌─ 판단 기록 (50%) ─────┬─ 연구 현황 (50%) ────────────────┐
├─ 포지션 현황 (50%) ───┬─ 시장 상황 (50%) ────────────────┤

옵션 C: 탭 방식 (하단 패널을 탭으로)
[판단 기록] [연구 현황] [포지션] [시장 상황]
```

현재 구현은 옵션 B에 가깝다. 운영 데이터가 늘어나면 하단 2행 구조를 유지하되, 포지션 현재가/수익률/전략명과 시장 데이터 stale 상태를 먼저 보강한다.

## EDGE 스코어 정의 (초안)

"현재 시장 조건이 내 전략 포트폴리오에 얼마나 유리한지"를 0-100으로 표현.

### 계산 방식 (서버에서)
```
EDGE = weighted_average(
  각 활성 전략의 (전략 적합도 × 시장 적합도)
)

전략 적합도 = 최근 N일 승률/수익률/MDD 기반 점수 (0-100)
시장 적합도 = 현재 시장 레짐이 해당 전략의 최적 레짐과 얼마나 일치하는지 (0-100)
```

### UI에서 표시
- 0-30: 빨간색 (`--loss`), "시장이 불리합니다"
- 31-60: 회색 (`--text-secondary`), "보통"
- 61-100: 초록색 (`--profit`), "시장이 유리합니다"
- 전략이 0개일 때: "—" 표시, "전략이 배치되면 계산됩니다"

### 사용자에게 보이는 문구
- "시장 적합도 72/100 — 현재 시장이 내 전략에 유리한 상태"
- 터치/호버 시 세부 분해: 각 전략별 적합도

## 인터랙션 상태 정의

| 컴포넌트 | LOADING | EMPTY | ERROR | SUCCESS | PARTIAL |
|----------|---------|-------|-------|---------|---------|
| **SystemStrip** | 연결 상태 닷 = 회색 깜빡임 | N/A (항상 표시) | 연결 실패 닷 = 빨간색 + "연결 끊김" | 모든 닷 초록 | 일부 거래소만 연결 |
| **HeroStrip** | 숫자 skeleton shimmer | 시장적합도 "—" + "전략 미배치" 배지 | "데이터 로드 실패" + 재시도 | 현재 구현 | 시장적합도만 있고 PnL 미수신 → PnL "—" |
| **DeploymentMatrix** | 3행 skeleton | "배치된 전략이 없습니다" + "연구 루프에서 전략이 검증되면 여기에 표시됩니다" | "불러올 수 없습니다" + [재시도] | 행 표시 | 일부만 로드 → 부분 표시 + 안내 |
| **OperatorQueue** | skeleton 2항목 | "모든 항목 처리 완료" | "불러올 수 없습니다" | 승인/거부 시 fade-out | N/A |
| **DecisionLedger** | "로딩중..." | "아직 판단 기록이 없습니다" | "불러올 수 없습니다" | 새 로그 상단 fade-in | N/A |
| **ResearchStatus** | "로딩중..." | "진행 중인 연구가 없습니다" | "불러올 수 없습니다" | 숫자 + 완료 행 | running만 표시 |
| **PositionPanel** (신규) | skeleton 3행 | "열린 포지션이 없습니다" | "불러올 수 없습니다" | 포지션 목록 | N/A |
| **MarketPanel** (신규) | skeleton 카드 | N/A (항상 데이터) | "불러올 수 없습니다" | 지표 표시 | 일부 지표 미수신 → "—" |

### 유저 저니 — 감정 곡선

| 단계 | 사용자 행동 | 감정 | 지원하는 UI |
|------|------------|------|------------|
| 1. 첫 방문 | 앱 열기 | 호기심 + 약간의 불안 | SystemStrip 초록 닷. 빈 상태가 안내. |
| 2. 설정 | API 키 입력 | 긴장 (내 돈) | "출금 권한 금지" 경고. 연결 즉시 초록 배지. |
| 3. 첫 데이터 | 연구 시작 | 기대감 | ResearchStatus "실행중 1". DecisionLedger 첫 로그. |
| 4. 첫 배치 | Matrix 행 등장 | 흥분 + 두려움 | PAPER 먼저. border 회색 = "아직 안전". |
| 5. 일상 확인 | 매일 열기 | 통제감 | 3초 안에 5가지 질문 답. 시장적합도로 상황 파악. |
| 6. 승인 | Queue 항목 | 책임감 | 변경점 명시. "승인 시 → / 거부 시 →". 만료 시간. |
| 7. 위기 | MDD 경고 | 긴장 → 안도 | 진행바 + 구체 수치 + "시스템이 보호 중". |

### 첫 방문 (온보딩) 시나리오
- 전략 0개, 연구 0개, 포지션 0개
- 모든 패널이 빈 상태이되 "시스템 준비됨, 전략 없음" 느낌
- HeroStrip: 시장적합도 "—", "전략 미배치"
- DeploymentMatrix: 빈 상태 + 안내 메시지
- OperatorQueue: "모든 항목 처리 완료"

## 핵심 설계 결정

| 결정 | 이유 |
|------|------|
| HeroStrip 순서: 승인→위험도→자산→손익→시장적합도 | 행동 필요한 것이 먼저. 초보자 기준 우선순위. |
| EDGE → "시장 적합도" 한국어화 | 초보자가 의미 즉시 이해. /100 스케일. |
| OperatorQueue: 승인/거부 시 변경점 명시 | "이걸 누르면 뭐가 바뀌는가"가 버튼보다 먼저. |
| DecisionLedger: 한글 요약 + 머신 로그 2줄 | 초보자는 한글, 파워유저는 로그. |
| 모든 섹션 한국어 헤더 | 영문 전용은 진입장벽. 내부명 영문은 유지하되 UI는 한국어. |
| AuthGuard 제거 | 1인 사용 단계. 멀티유저 시 재도입. |
| 집계 API → 스토어 → 대시보드 | 현재는 `/api/dash/operator/home` 스냅샷을 30초 polling. |

## 접근성 TODO

- [x] DeploymentMatrix 행: `role="button"` + `tabIndex={0}` + Enter/Space 키 이벤트 ✓
- [x] OperatorQueue 버튼: 44px 터치 타겟 (py-1.5 + flex-1 적용) ✓
- [x] Sidebar: `<nav aria-label>` 랜드마크 ✓
- [x] 전체 페이지: `<main>` 랜드마크 (TradingDashboard) ✓
- [x] 숫자 색상: 부호(+/-)도 항상 표시 ✓

## 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 승인 API와 DB enum 불일치 | approve/reject 런타임 실패 가능 | `decision_status` 마이그레이션 또는 라우트 상태값 수정 |
| 설정 페이지와 런타임 불일치 | 사용자가 저장한 값이 실제 엔진에 반영됐다고 오해 | env 기반/DB 저장 기반 설정을 UI에서 분리하고 서버 적용 경로 확정 |
| 오케스트레이터 BTC 단일 슬롯 | 알트 전략이 자산별로 배치되지 않음 | asset_class/exchange/market_scope 기준 슬롯/랭킹 분리 |
| 대시보드 매핑 얇음 | 전략 이유, 포지션 손익률, 거래소 상태가 빈값으로 보임 | operator/home DTO 확장 |
| 실시간 데이터 polling 의존 | 포지션/PnL/승인/리스크 반응이 늦거나 불필요한 집계 API 호출이 반복됨 | WS/SSE push 채널 + 30초 polling fallback |
| 연구 루프 자원 사용량 | 서버 시작 시 backfill+검증이 과도해질 수 있음 | 워커 수 env 상한, backfill 수동화, 연구 쿨다운/큐 고도화 |
