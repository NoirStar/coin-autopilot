# HANDOFF.md — 2026-04-03 외부 작업 핸드오프

## Next Step
**서버 API 연결.** 프론트엔드 UX 전체 완성 (mock 데이터). 다음 세션에서:
1. 서버에 오케스트레이션 API 엔드포인트 추가 (`/api/v2/orchestration/status`, `/api/v2/orchestration/slots` 등)
2. Zustand 스토어의 mock → API 호출로 교체
3. EDGE 스코어 계산 로직 서버 구현
4. WebSocket 또는 polling으로 실시간 업데이트

## 오늘 한 일

### DESIGN.md 전면 재작성
- Terminal Craft Evolved v2. Codex (gpt-5.4) + Claude subagent 3자 외부 의견 수렴
- 4대 프리미티브: System Strip, Deployment Matrix, Decision Ledger, Operator Queue
- EDGE 히어로, 비대칭 65/35, Machine Log Voice

### 전체 UX 구현 (mock 데이터)
- **트레이딩 대시보드** — System Strip, Hero Strip, Deployment Matrix (클릭→상세), Operator Queue (승인/거부 동작), Decision Ledger, Research Status
- **전략 상세 페이지** — 포지션 정보, 판단 이유, 결정 이력, 뒤로가기
- **연구 페이지** — 전면 재구축. 실행 이력 + 후보 랭킹 테이블
- **포트폴리오 페이지** — 새 레이아웃 + 섹션 헤더 통일
- **설정 페이지** — 새 레이아웃 + 섹션 헤더 통일
- **모바일 반응형** — 대시보드 세로 스택, 매트릭스 열 축소

### Zustand 스토어 3개
- `orchestration-store` — 시스템상태, 히어로, 슬롯, 판단로그
- `approval-store` — 승인/리스크 큐 (approve/reject/dismiss)
- `research-store` — 연구 요약

### 레거시 정리
삭제: DashboardPage, DetectionPage, ComparisonPage, dashboard-store, strategy-store, backtest-store, paper-trading-store, Header, StatusBar, PublicLayout, OnboardingChecklist (11개 파일)

### 빌드 검증
- `npx vite build` 성공. TS 에러 없음. CSS 30KB (레거시 제거 후 4KB 감소)

## 최종 파일 구조

```
web/src/
├── App.tsx                              # 라우터
├── main.tsx                             # 진입점
├── index.css                            # Terminal Craft Evolved 토큰
├── components/
│   ├── auth/AuthGuard.tsx               # 인증 가드
│   ├── auth/LoginModal.tsx              # 로그인 모달
│   ├── dashboard/
│   │   ├── DeploymentMatrix.tsx          # 전략 배치 매트릭스
│   │   ├── OperatorQueue.tsx             # 승인/리스크 큐
│   │   ├── DecisionLedger.tsx            # 판단 로그
│   │   └── ResearchStatus.tsx            # 연구 현황
│   ├── layout/
│   │   ├── AppLayout.tsx                 # 레이아웃 쉘
│   │   ├── SystemStrip.tsx               # 시스템 상태 바
│   │   ├── HeroStrip.tsx                 # EDGE + PnL 요약
│   │   └── Sidebar.tsx                   # 네비게이션
│   └── ui/
│       ├── term-tooltip.tsx              # 용어 툴팁
│       └── Toast.tsx                     # 토스트
├── pages/
│   ├── TradingDashboard.tsx              # 메인 대시보드
│   ├── StrategyDetail.tsx                # 전략 상세
│   ├── ResearchPage.tsx                  # 연구 & 백테스트
│   ├── PortfolioPage.tsx                 # 포트폴리오
│   └── SettingsPage.tsx                  # 설정
├── stores/
│   ├── orchestration-store.ts            # 오케스트레이션 상태
│   ├── approval-store.ts                 # 승인 상태
│   ├── research-store.ts                 # 연구 상태
│   └── settings-store.ts                 # 설정 상태
├── mocks/dashboard-data.ts               # Mock 데이터
├── types/
│   ├── orchestration.ts                  # 새 타입 시스템
│   └── trading.ts                        # 기존 타입 (참고용)
├── services/api.ts                       # API 클라이언트
├── hooks/useAuth.ts                      # 인증 훅
└── lib/
    ├── supabase.ts, constants.ts, utils.ts, transforms.ts
```

## 핵심 UX 결정

| 결정 | 이유 |
|------|------|
| EDGE 히어로 | PnL 대신 전략 적합도를 최상위로 |
| 비대칭 65/35 | 오케스트레이션 + 액션 큐 |
| Operator Queue | 토스트 대신 상시 노출 |
| 행 레벨 rationale | 판단 이유 즉시 가시 |
| Machine Log Voice | Decision Ledger의 mono 로그 |
| 행 클릭 → 전략 상세 | 드릴다운 네비게이션 |
| 모바일 세로 스택 | lg 브레이크포인트 기준 |

## 남은 작업

- [ ] 서버 API 엔드포인트 구현
- [ ] EDGE 스코어 계산 로직
- [ ] mock → 실제 API 전환
- [ ] 실시간 업데이트 (WebSocket/polling)
- [ ] types/trading.ts 정리 (새 orchestration.ts로 대체)
