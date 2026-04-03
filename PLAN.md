# PLAN.md — PRD 기반 새 제품 구축

> 이 문서는 PRD 목표 시스템을 새로 구축하기 위한 실행 계획.
> 기존 코드 유지보수가 아니라 전면 재설계+재구축.

## 현재 상태 (2026-04-03)

### 버릴 것
- 기존 페이지 구조 전체 (DashboardPage, DetectionPage, ResearchPage, ComparisonPage, PortfolioPage)
- 기존 레이아웃 (Header의 BTC 가격 중심, Sidebar의 레거시 네비게이션)
- 기존 Zustand 스토어 (dashboard-store, strategy-store, backtest-store 등 — PRD 모델과 불일치)
- 기존 타입 시스템 (trading.ts — 오케스트레이션 모델 미반영)
- 기존 index.css의 레거시 테마 (oklch, glass-panel 등)

### 참고만 할 것
- API 서비스 레이어 패턴 (request 함수, auth 헤더)
- Supabase 인증 훅 (useAuth)
- 유틸 함수 (formatKRW, formatUSD, formatPercent, cn)
- lib/supabase.ts, lib/constants.ts (일부)

### 새로 만들 것
- **전체 페이지 구조** — PRD 07 기준
- **전체 컴포넌트** — DESIGN.md 4대 프리미티브 기반
- **전체 타입 시스템** — 오케스트레이션 모델 기반
- **전체 Zustand 스토어** — PRD 데이터 모델 기반
- **전체 CSS** — Terminal Craft Evolved 토큰

## 구현 범위

### Phase 1: 기반 (우선순위 1)
1. **CSS 토큰 시스템** — DESIGN.md의 모든 토큰을 index.css에 정의
2. **타입 시스템** — 오케스트레이션 모델 타입 (AssetSlot, Strategy, Decision, Approval, Research 등)
3. **레이아웃 쉘** — AppLayout 재구축 (SystemStrip + Sidebar + main content)
4. **라우팅** — 새 페이지 구조에 맞는 라우터 설정

### Phase 2: 트레이딩 대시보드 (우선순위 1)
PRD 07 "대시보드의 4가지 질문"에 답하는 핵심 화면.

5. **SystemStrip** — 시스템 연결 상태, DB, 거래소, 마지막 수집 시간
6. **HeroStrip** — EDGE 스코어 + LIVE/PAPER 수 + 총 자산 + 오늘 PnL + 승인 대기
7. **DeploymentMatrix** — 자산별 전략 배치 테이블 (행 = 자산, 2줄 구조)
8. **OperatorQueue** — 승인/리스크/AI 액션 큐
9. **DecisionLedger** — 시간순 머신 로그
10. **ResearchStatus** — 연구 루프 현황 패널

### Phase 3: 세부 페이지 (우선순위 2)
11. **전략 상세** — 전략별 성과, 백테스트 결과, 페이퍼 세션
12. **자산 상세** — 자산별 시장 상태, 배치된 전략, 포지션
13. **연구 상세** — 연구 큐, 백테스트 결과 테이블, 후보 랭킹

### Phase 4: 운영 (우선순위 2)
14. **설정 페이지** — API 키, 리스크 한도, 알림 설정
15. **포트폴리오** — 자산 잔액, 거래 내역

### Phase 5: 스토어 + API (우선순위 1, Phase 2와 병행)
16. **orchestration-store** — asset slots, strategies, edge scores, decisions
17. **risk-store** — MDD, daily loss, circuit breaker, warnings
18. **research-store** — research queue, candidates, rankings
19. **approval-store** — pending approvals, history
20. **API 서비스** — 새 엔드포인트에 맞게 재구성

## 구현 순서

```
Day 1 (오늘, 외부 작업):
  ✅ DESIGN.md 재작성
  → Phase 1: CSS 토큰 + 타입 + 레이아웃 쉘 + 라우팅
  → Phase 2: 트레이딩 대시보드 컴포넌트 (mock 데이터)

Day 2 (집에서 이어서):
  → Phase 2 마무리: 대시보드 컴포넌트 연결
  → Phase 5: 스토어 + API 연결
  → Phase 3: 전략/자산/연구 상세 페이지

Day 3+:
  → Phase 4: 설정, 포트폴리오
  → 전체 QA + 디자인 리뷰
```

## 핵심 설계 결정

| 결정 | 이유 |
|------|------|
| Mock 데이터로 먼저 UI 구축 | API 없이도 화면 완성 가능. 집에서 API 연결. |
| 기존 파일 삭제 대신 새 파일 생성 | 기존 코드 참고 가능. 정리는 나중에. |
| 컴포넌트를 domain 단위로 구성 | `components/dashboard/`, `components/trading/` 등 |
| EDGE 스코어는 mock으로 | 실제 계산 로직은 서버에서. UI는 숫자만 표시. |

## 파일 구조 (목표)

```
web/src/
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx        # 새 레이아웃 쉘
│   │   ├── SystemStrip.tsx      # 시스템 상태 바
│   │   ├── Sidebar.tsx          # 새 네비게이션
│   │   └── HeroStrip.tsx        # EDGE + 요약 스트립
│   ├── dashboard/
│   │   ├── DeploymentMatrix.tsx  # 전략 배치 매트릭스
│   │   ├── OperatorQueue.tsx     # 승인/리스크 큐
│   │   ├── DecisionLedger.tsx    # 판단 로그
│   │   └── ResearchStatus.tsx    # 연구 현황
│   ├── auth/
│   │   ├── AuthGuard.tsx         # 유지
│   │   └── LoginModal.tsx        # 유지
│   └── ui/
│       ├── Badge.tsx             # 시맨틱 배지
│       ├── Button.tsx            # 버튼 variants
│       └── DataTable.tsx         # 데이터 테이블
├── pages/
│   ├── TradingDashboard.tsx      # 트레이딩 대시보드 (메인)
│   ├── StrategyDetail.tsx        # 전략 상세
│   ├── AssetDetail.tsx           # 자산 상세
│   ├── ResearchPage.tsx          # 연구 상세
│   ├── PortfolioPage.tsx         # 포트폴리오
│   └── SettingsPage.tsx          # 설정
├── stores/
│   ├── orchestration-store.ts    # 오케스트레이션 상태
│   ├── risk-store.ts             # 리스크 상태
│   ├── research-store.ts         # 연구 상태
│   └── approval-store.ts         # 승인 상태
├── types/
│   └── orchestration.ts          # 새 타입 시스템
├── mocks/
│   └── dashboard-data.ts         # Mock 데이터
├── services/
│   └── api.ts                    # API 클라이언트 (재구성)
├── hooks/
│   └── useAuth.ts                # 유지
├── lib/
│   ├── supabase.ts               # 유지
│   ├── constants.ts              # 업데이트
│   └── utils.ts                  # 유지 + 확장
└── index.css                     # Terminal Craft Evolved 토큰
```

## 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| API 엔드포인트 미정의 | 데이터 연결 불가 | Mock 데이터로 UI 먼저 완성 |
| EDGE 스코어 계산 로직 미정의 | 히어로 숫자 의미 불명확 | Mock 72로 시작, 서버 로직은 별도 정의 |
| 서버 크론/오케스트레이터 미구현 | 실시간 데이터 없음 | Static mock → WebSocket 전환 |
| 기존 DetectionPage 사용자 | 공개 페이지 깨짐 | 라우팅 리다이렉트 유지 |
