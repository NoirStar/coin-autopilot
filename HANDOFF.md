# HANDOFF.md — 2026-04-03 외부 작업 핸드오프

## Next Step
**Phase 2 마무리 + API 연결.** 트레이딩 대시보드 UI 골격은 완성됨 (mock 데이터). 다음 세션에서:
1. `mocks/dashboard-data.ts`의 mock을 실제 API 호출로 교체
2. Zustand 스토어 (`orchestration-store`, `risk-store`, `research-store`, `approval-store`) 생성
3. 전략 상세 / 자산 상세 / 연구 상세 페이지 구현

## 오늘 한 일

### 1. DESIGN.md 전면 재작성
- Terminal Craft Evolved v2. 기존 미학 유지, UX/정보구조 전면 재설계.
- Codex (gpt-5.4) + Claude subagent 외부 디자인 의견 수렴.
- 4대 프리미티브 확정: System Strip, Deployment Matrix, Decision Ledger, Operator Queue.
- EDGE 스코어를 히어로로 (PnL 대신). 비대칭 레이아웃 65/35.
- 프리뷰 HTML 페이지 생성: `/tmp/design-consultation-preview-*.html`

### 2. 트레이딩 대시보드 UI 구현 (mock 데이터)
새로 생성한 파일:
- `web/src/types/orchestration.ts` — 오케스트레이션 모델 전체 타입 시스템
- `web/src/mocks/dashboard-data.ts` — 대시보드 mock 데이터
- `web/src/components/layout/SystemStrip.tsx` — 시스템 상태 바 (28px, 실시간 시계)
- `web/src/components/layout/HeroStrip.tsx` — EDGE + PnL + 요약
- `web/src/components/dashboard/DeploymentMatrix.tsx` — 전략 배치 매트릭스
- `web/src/components/dashboard/OperatorQueue.tsx` — 승인/리스크 큐
- `web/src/components/dashboard/DecisionLedger.tsx` — 판단 로그
- `web/src/components/dashboard/ResearchStatus.tsx` — 연구 현황
- `web/src/pages/TradingDashboard.tsx` — 메인 대시보드 페이지

수정한 파일:
- `web/src/App.tsx` — 라우터 재구성 (새 페이지 구조)
- `web/src/components/layout/AppLayout.tsx` — Header/StatusBar 제거, 패딩 없는 풀 레이아웃
- `web/src/components/layout/Sidebar.tsx` — 새 네비게이션 (대시보드/운용/시스템)
- `web/src/index.css` — text-muted/text-faint 토큰 DESIGN.md v2 기준으로 수정
- `CLAUDE.md` — 프로젝트 개요 업데이트
- `DESIGN.md` — 전면 재작성
- `PLAN.md` — 신규 생성

### 3. 빌드 검증
- `npx vite build` 성공. TS 에러 없음.

## 핵심 UX 결정

| 결정 | 이유 |
|------|------|
| "트레이딩 대시보드" 명칭 | 사용자 지정. "운영실 홈" 대신. |
| EDGE 스코어 히어로 | PnL 대신 전략 적합도를 최상위로. 경쟁사 차별화. |
| 비대칭 65/35 레이아웃 | 좌측 오케스트레이션 + 우측 액션 큐. Codex + Claude 수렴. |
| 토스트 대신 Operator Queue | 승인/리스크를 상시 노출. 놓치지 않는다. |
| 행 레벨 rationale | 전략 판단 이유가 툴팁이 아닌 2줄 구조로 바로 보임. |
| Header/StatusBar 제거 | SystemStrip이 대체. 더 밀도 높은 정보 표현. |
| 활성 네비 = border-left (골드 아님) | 액센트 3곳 제한 규칙 준수. Codex 제안. |
| RESET 관련 요소 미포함 | PRD에 정의되지 않은 기능. |

## 남은 작업

### 우선순위 1 (다음 세션)
- [ ] Zustand 스토어 4개 생성 (orchestration, risk, research, approval)
- [ ] API 엔드포인트 정의 + mock → 실제 API 전환
- [ ] EDGE 스코어 계산 로직 서버 구현 (또는 정의)
- [ ] 전략 상세 페이지
- [ ] 연구 & 백테스트 페이지 재구축

### 우선순위 2
- [ ] 자산 상세 페이지
- [ ] 포트폴리오 페이지 재구축
- [ ] 설정 페이지 업데이트
- [ ] 반응형 (모바일) 대시보드 최적화

### 우선순위 3
- [ ] 기존 레거시 페이지/컴포넌트 정리 (DashboardPage, DetectionPage, ComparisonPage 등)
- [ ] 기존 스토어 정리 (dashboard-store, strategy-store 등)
- [ ] QA + 디자인 리뷰 (/design-review)

## 리스크
- **EDGE 스코어 정의 미확정**: 현재 mock 72. 실제 계산 방법 결정 필요.
- **기존 페이지 아직 남아있음**: App.tsx에서 ResearchPage, PortfolioPage, SettingsPage는 기존 파일 그대로 import 중. 새로 만들어야 함.
- **API 엔드포인트 미정의**: 서버에 오케스트레이션 관련 API가 아직 없을 수 있음.
