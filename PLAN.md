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

## 네비게이션 플로우

```
트레이딩 대시보드 (/)
  ├── DeploymentMatrix 행 클릭 → /strategy/:slotId
  ├── OperatorQueue 항목 → 해당 전략/자산 상세
  ├── ResearchStatus 행 → /operator/research
  └── Sidebar → 연구, 포트폴리오, 설정

전략 상세 (/strategy/:slotId)
  ├── ← 뒤로 → 대시보드
  └── 관련 연구 결과 링크 → /operator/research

연구 (/operator/research)
  └── 후보 행 클릭 → 전략 상세
```

## 인터랙션 상태 정의

| 컴포넌트 | LOADING | EMPTY | ERROR | SUCCESS | PARTIAL |
|----------|---------|-------|-------|---------|---------|
| **SystemStrip** | 연결 상태 닷 = 회색 깜빡임 | N/A (항상 표시) | 연결 실패 닷 = 빨간색 + "연결 끊김" 텍스트 | 모든 닷 초록 | 일부 거래소만 연결 (닷 개별 표시) |
| **HeroStrip** | EDGE "—", 숫자 skeleton shimmer | EDGE 0, "전략 미배치" 배지 | "데이터 로드 실패" + 재시도 버튼 | 숫자 표시 (현재 구현) | EDGE만 있고 PnL 미수신 → PnL "—" |
| **DeploymentMatrix** | 3행 skeleton shimmer | 빈 상태: Lucide Target 아이콘 + "배치된 전략이 없습니다" + "연구 루프에서 전략이 검증되면 여기에 표시됩니다" + [연구 페이지로 이동] 버튼 | "전략 상태를 불러올 수 없습니다" + [재시도] | 현재 구현 (행 표시) | 일부 슬롯만 로드 → 로드된 행만 표시 + "일부 데이터 로딩중" 안내 |
| **OperatorQueue** | skeleton shimmer 2항목 | "대기 항목 없음" (현재 구현) + CheckCircle 아이콘 + "모든 항목이 처리되었습니다" | "승인 큐를 불러올 수 없습니다" | 항목 승인/거부 시 행이 fade-out으로 사라짐 | N/A |
| **DecisionLedger** | "판단 기록 로딩중..." | "아직 판단 기록이 없습니다. 전략이 배치되면 여기에 실시간 로그가 쌓입니다." | "판단 기록을 불러올 수 없습니다" | 새 로그 추가 시 상단에 fade-in | N/A |
| **ResearchStatus** | "연구 현황 로딩중..." | "진행 중인 연구가 없습니다. 연구 루프가 시작되면 여기에 표시됩니다." | "연구 데이터를 불러올 수 없습니다" | 숫자 + 최근 완료 행 | running만 있고 completed 미로드 → running 표시 + completed "—" |
| **StrategyDetail** | 전체 페이지 skeleton | 슬롯 미발견: "전략 슬롯을 찾을 수 없습니다" + 대시보드 링크 | "전략 데이터를 불러올 수 없습니다" + [재시도] | 현재 구현 | 포지션만 null → 포지션 섹션 "대기 중" 표시 |
| **ResearchPage** | skeleton 테이블 | 현재 구현 (아이콘 + 메시지 + 안내) | "연구 데이터를 불러올 수 없습니다" + [재시도] | 테이블 표시 | runs만 로드, candidates 로딩중 → 각각 독립 로딩 |

### 유저 저니 — 감정 곡선

| 단계 | 사용자 행동 | 감정 | 지원하는 UI |
|------|------------|------|------------|
| 1. 첫 방문 | 앱 열기 | 호기심 + 약간의 불안 | SystemStrip 초록 닷 = "시스템이 살아있다". 빈 상태가 공포가 아닌 안내. |
| 2. 설정 | API 키 입력 | 긴장 (내 돈과 연결) | 설정 페이지의 "출금 권한 금지" 경고. 연결 성공 시 즉시 초록 배지. |
| 3. 첫 데이터 | 연구 루프 시작 | 기대감 | ResearchStatus에서 "실행중 1" 숫자가 올라감. DecisionLedger에 첫 로그 등장. |
| 4. 첫 전략 배치 | DeploymentMatrix 행 등장 | 흥분 + 약간의 두려움 | PAPER 상태로 먼저 배치. 좌측 border가 회색 = "아직 안전". |
| 5. 일상 확인 | 매일 대시보드 열기 | 통제감 | 3초 안에 4가지 질문에 답. EDGE 스코어로 "오늘 시장이 나에게 유리한지" 즉시 파악. |
| 6. 승인 필요 | OperatorQueue에 항목 등장 | 책임감 | 승인 대기 배지 (히어로 스트립) + 큐에 구체적 이유 + [승인/거부] 인라인 액션. |
| 7. 위기 | MDD 경고, 서킷 브레이커 | 긴장 → 안도 | 경고 색상(--warning) + 구체적 수치 + 임계값 대비 %. "시스템이 보호하고 있다" 느낌. |

### 첫 방문 (온보딩) 시나리오
- 전략 0개, 연구 0개, 포지션 0개 상태
- DeploymentMatrix → 빈 상태 + "연구 루프에서 전략 배치" 안내
- HeroStrip → EDGE 0 + "전략 미배치" 배지
- OperatorQueue → "대기 항목 없음"
- DecisionLedger → "아직 판단 기록이 없습니다"
- ResearchStatus → "진행 중인 연구가 없습니다"
- 전체적으로 "시스템이 준비되었지만 아직 전략이 없다"는 느낌. 공포감 아닌 안내감.

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

## 접근성 TODO (디자인 리뷰 결과)
- [ ] DeploymentMatrix 행: `role="button"` + `tabIndex={0}` + Enter/Space 키 이벤트
- [ ] OperatorQueue 버튼: 최소 44px 터치 타겟 보장
- [ ] Sidebar: `nav` 랜드마크 + `aria-current="page"` 활성 항목
- [ ] 전체 페이지: `<main>` 랜드마크
- [ ] 숫자 색상: 수익/손실 표시에 색상 외 부호(+/-)도 항상 표시 (현재 구현됨 ✓)

## 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| API 엔드포인트 미정의 | 데이터 연결 불가 | Mock 데이터로 UI 먼저 완성 |
| EDGE 스코어 계산 로직 미정의 | 히어로 숫자 의미 불명확 | Mock 72로 시작, 서버 로직은 별도 정의 |
| 서버 크론/오케스트레이터 미구현 | 실시간 데이터 없음 | Static mock → WebSocket 전환 |
| 기존 DetectionPage 사용자 | 공개 페이지 깨짐 | 라우팅 리다이렉트 유지 |
