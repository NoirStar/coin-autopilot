# Coin Autopilot

전략 추가 가능 구조를 전제로 한 자동매매 오케스트레이션 플랫폼.
시스템이 전략을 연구하고, 검증하고, 페이퍼로 관찰한 뒤, 조건이 맞을 때만 실전 배치까지 이어지는 구조를 목표로 한다.

## 핵심 컨셉

"어떤 전략을 언제 신뢰할지 자동으로 판단하는 시스템"

- 전략은 고정 1회성 구현이 아니라 카탈로그에 계속 추가 가능한 구조
- 연구 루프가 백테스트 결과를 누적하고 승격 후보를 만든다
- 오케스트레이터가 현재 시장 레짐과 전략 적합도를 바탕으로 배치/유지/교체를 판단한다
- 모든 판단은 운영 화면에서 이유와 함께 추적 가능해야 한다

## 현재 기준 문서

아래 문서를 현재 제품 기준으로 본다.

- `PRD/`
- `PLAN.md`
- `DESIGN.md`
- `HANDOFF.md`

이 README는 위 문서의 요약본이다. 충돌 시 위 문서를 우선한다.

## 현재 구현 범위

코드베이스에는 PRD 기준 Phase 0~7에 대응하는 서버/프론트 구조가 들어와 있다. 다만 현재 운영 화면은 mock 데이터 기반이며, 다음 작업의 우선순위는 서버 API 연결과 실시간 업데이트다.

- 서버: 데이터 파이프라인, 연구 루프, 페이퍼 엔진, 오케스트레이터, 리스크, 실행 엔진의 V2 구조 존재
- 웹: 트레이딩 대시보드, 전략 상세, 연구, 포트폴리오, 설정 페이지 구현
- 남은 핵심 작업: orchestration API 연결, EDGE 스코어 서버 계산, mock 제거, polling 또는 WebSocket 연결

## 저장소 구성

| 경로 | 설명 |
|------|------|
| `server/` | V2 트레이딩 서버. 데이터 수집, 연구 루프, 페이퍼, 오케스트레이터, 리스크, 실행 |
| `web/` | 운영 대시보드. 현재는 mock 기반 UI까지 정리된 상태 |
| `supabase/` | 스키마 및 마이그레이션 |
| `PRD/` | 제품 요구사항, 계약, 로드맵 문서 |

## 운영 대시보드 정보구조

현재 UI 기준 핵심 프리미티브는 아래와 같다.

- `System Strip`: 시스템, DB, 거래소 연결 상태와 현재 시각
- `Hero Strip`: 승인 대기, 위험도, 총 자산, 오늘 손익, 시장 적합도
- `Deployment Matrix`: 어떤 전략이 어떤 자산에 왜 배치됐는지
- `Operator Queue`: 승인 요청, 리스크 경고, 교체 제안
- `Decision Ledger`: 시간순 판단 로그
- `Research Status`: 연구 진행 상태와 최근 결과

라우팅은 아래 기준이다.

- `/` : 트레이딩 대시보드
- `/strategy/:slotId` : 전략 상세
- `/research` : 연구
- `/portfolio` : 포트폴리오
- `/settings` : 설정

## 서버 구조

```
server/src/
  core/           # 공통 타입, 인증, 스케줄링
  data/           # 캔들 수집, 시장 상태 판별
  strategy/       # 전략 구현과 레지스트리
  research/       # 백테스트, 연구 루프
  paper/          # 페이퍼트레이딩 엔진
  orchestrator/   # 전략 배치/유지/교체 판단
  execution/      # 실전 주문 실행
  risk/           # 리스크 보호 로직
  notification/   # 알림 전송
  routes/         # 운영 API
```

## 웹 구조

```
web/src/
  components/layout/      # AppLayout, SystemStrip, HeroStrip, Sidebar
  components/dashboard/   # DeploymentMatrix, OperatorQueue, DecisionLedger, ResearchStatus, PositionPanel, MarketPanel
  pages/                  # TradingDashboard, StrategyDetail, ResearchPage, PortfolioPage, SettingsPage
  stores/                 # orchestration, approval, research, settings
  mocks/                  # mock 데이터
  services/api.ts         # API 클라이언트
  types/                  # orchestration 타입 등
```

## 개발 메모

- 현재 단계는 1인 사용 기준이며 인증은 필수 흐름이 아니다
- 한국주식과 멀티유저는 장기 확장 범위로 문서화되어 있으나 현재 우선순위는 아니다
- 실제 거래소 연동 검증이나 외부 네트워크 의존 검증은 별도 단계에서 수행한다

## 개발 환경

### Server
```bash
cd server
npm install
npm run dev
```

### Web
```bash
cd web
npm install
npm run dev
```

## 환경변수

```bash
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# OKX
OKX_API_KEY=
OKX_SECRET_KEY=
OKX_PASSPHRASE=

# 알림
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=

# 실전 매매 보호 플래그
LIVE_TRADING=false

# 리스크 한도
DAILY_LOSS_LIMIT_PCT=3
CIRCUIT_BREAKER_PCT=10
```

## 라이선스

Private — All Rights Reserved
