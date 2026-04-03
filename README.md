# Coin Autopilot

BTC 흐름 기반 현물/선물 암호화폐 자동매매 플랫폼.
시스템이 자동으로 전략을 연구하고, 검증하고, 배치하는 self-auditing 트레이딩 엔진.

## 핵심 컨셉

"어떤 전략을 언제 신뢰할지 스스로 학습하는 시스템"

- 6개 전략이 항상 그림자로 돌고, 레짐별 성과를 기준으로 연속 재평가
- 검증된 챔피언에게만 자본 배치
- 모든 판단에 이유가 기록되고, 에퀴티 커브와 판단 타임라인이 함께 보임

## 구성

| 모듈 | 설명 | 기술 |
|------|------|------|
| `server/` | 트레이딩 서버 (24시간 실행) | Node.js, Hono, Supabase, node-cron |
| `web/` | 운영실 대시보드 | React 19, Vite, Tailwind CSS, React Query |
| `supabase/` | DB 스키마 + 마이그레이션 | PostgreSQL |
| `PRD/` | 제품 요구사항 문서 (13개) | Markdown |

## 아키텍처

```
거래소 (Upbit/OKX)
       │
       ▼
┌─────────────────────────────────────────────────┐
│  Trading Server (Node.js + Hono, 로컬 PC 24시간) │
│                                                  │
│  Data Pipeline → Research Loop → Orchestrator    │
│       │              │                │          │
│       ▼              ▼                ▼          │
│  캔들 수집      자동 백테스트    전략 배치/교체    │
│  레짐 감지      검증 + 승격     롱/숏 결정       │
│                                     │           │
│                    ┌────────────────┤           │
│                    ▼                ▼           │
│              Paper Engine    Live Engine        │
│              (전략 검증)     (실전 매매)         │
│                    │                │           │
│                    ▼                ▼           │
│              Risk Manager ──→ Circuit Breaker   │
│              Notifier ──→ Telegram/Discord      │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
              Supabase (PostgreSQL)
                      │
                      ▼
         Web Dashboard (Vercel)
         운영실 홈 · 연구 큐 · 전략 비교
```

## 거래소

| 거래소 | 용도 | 마켓 |
|--------|------|------|
| **업비트** | 현물 (알트코인 탐지 + 평균회귀) | KRW 마켓 |
| **OKX** | 선물 (BTC/ETH 롱/숏) | USDT 무기한 |

## 전략 (6개)

| 전략 | 거래소 | 타임프레임 | 방향 |
|------|--------|-----------|------|
| BTC EMA 크로스오버 | OKX 선물 | 4H | 롱/숏 |
| BTC 볼린저 평균회귀 | OKX 선물 | 4H | 롱/숏 |
| BTC MACD 모멘텀 | OKX 선물 | 1H | 롱/숏 |
| BTC 돈치안 브레이크아웃 | OKX 선물 | 1H | 롱/숏 |
| 알트 평균회귀 | 업비트 현물 | 4H | 롱 |
| 알트 탐지 | 업비트 현물 | 1H | 롱 |

## BTC 레짐 필터

모든 전략 위에 BTC 시장 상태 필터가 작동:
- **Risk-On**: BTC > EMA200, RSI 52~70, ATR% <= 4.5 → 롱 전략 우선
- **Risk-Off**: BTC < EMA200 또는 ATR% >= 6.5 또는 RSI <= 45 → 숏 전략 우선
- **Neutral**: 경계 구간 → Risk-Off로 폴백 (보수적)

## 서버 모듈

```
server/src/
  core/           # 타입, enum, 크론
  data/           # 캔들 수집, 레짐 감지
  strategy/       # 전략 인터페이스, 6개 전략, 레지스트리
  research/       # 자동 백테스트, 연구 루프
  paper/          # 페이퍼트레이딩 엔진
  orchestrator/   # 전략 배치/교체/판단 로그
  execution/      # OKX 실전 매매
  risk/           # 서킷 브레이커, 일일 손실 한도
  notification/   # 텔레그램, 디스코드, 인앱 알림
  routes/         # API (14개 엔드포인트)
```

## 운영 대시보드

- **운영실 홈**: 에퀴티 커브(Proof Chart) + 레짐 밴드 + 커맨드 레일
- **연구 큐**: 자동 백테스트 진행 현황 + 후보 랭킹
- **전략 비교**: 백테스트 vs 페이퍼 vs 실전 성과 테이블

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

```
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

# 실전 매매 (이 값이 true일 때만 실전 주문 실행)
LIVE_TRADING=false

# 리스크 한도 (기본값: 3%, 10%)
DAILY_LOSS_LIMIT_PCT=3
CIRCUIT_BREAKER_PCT=10
```

## 라이선스

Private — All Rights Reserved
