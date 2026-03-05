# Coin Autopilot — 현물·선물 암호화폐 자동매매 플랫폼

## 1. 프로젝트 개요

### 1.1 비전

BTC(비트코인) 흐름을 선행 신호로 활용하여 알트코인에서 수익을 추구하는 **자동매매 플랫폼**. 현물(업비트)과 선물(OKX)을 동시에 운용하며, 백테스팅·가상매매·실전매매를 단계적으로 전환할 수 있는 통합 시스템을 구축한다.

### 1.2 핵심 목표

| 목표 | 설명 |
|------|------|
| **안전 우선** | MDD 제한, 레짐 필터, 포지션 사이징으로 "잃지 않는" 방향 |
| **전략 검증** | 백테스팅 → 가상매매(페이퍼) → 실전 3단계 파이프라인 |
| **고속 체결** | C++ 에이전트로 지연 최소화 (WebSocket + REST) |
| **실시간 모니터링** | 웹 대시보드에서 자산·손익·전략 상태 실시간 확인 |
| **다중 전략 비교** | 여러 전략을 동시 가상매매하여 최적 전략 선별 |

### 1.3 거래소

| 거래소 | 용도 | 마켓 | 비고 |
|--------|------|------|------|
| **업비트(Upbit)** | 현물 매매 | KRW 마켓 | JWT 인증, 초당 8회 제한 |
| **OKX** | 선물(무기한) 매매 | USDT 페어 | HMAC-SHA256, 초당 20회 |

---

## 2. 아키텍처

### 2.1 시스템 구성도

```
┌──────────────────────────────────────────────────────────────┐
│                        Web Dashboard                         │
│          React 19 · Vite · shadcn/ui · TailwindCSS           │
│    ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│    │대시보드   │백테스팅   │가상매매   │전략설정   │포트폴리오│  │
│    └──────────┴──────────┴──────────┴──────────┴──────────┘  │
│                          ▲ WebSocket + REST                  │
└──────────────────────────┼───────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────┐
│                    Monitoring Server                          │
│            Node.js · Hono · Supabase · Socket.IO             │
│    ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│    │REST API  │WebSocket │백테스트   │DB 관리    │알림      │  │
│    │          │브릿지     │엔진(서버) │          │(Telegram)│  │
│    └──────────┴──────────┴──────────┴──────────┴──────────┘  │
│                          ▲ gRPC / WebSocket                  │
└──────────────────────────┼───────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────┐
│                    C++ Trading Agent                          │
│         Boost.Beast · simdjson · spdlog · gRPC               │
│    ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│    │시장 데이터│전략 엔진  │주문 관리  │리스크 관리│상태 보고 │  │
│    │(WS수신)  │          │(REST발신) │          │(gRPC)   │  │
│    └──────────┴──────────┴──────────┴──────────┴──────────┘  │
│         ▲ WebSocket              ▲ REST API                  │
└─────────┼──────────────────────────┼─────────────────────────┘
          │                          │
    ┌─────┴─────┐              ┌─────┴─────┐
    │  Upbit    │              │   OKX     │
    │  (현물)   │              │  (선물)   │
    └───────────┘              └───────────┘
```

### 2.2 컴포넌트 역할

#### C++ Trading Agent (`/agent`)

| 모듈 | 역할 |
|------|------|
| `MarketDataManager` | 거래소 WebSocket 스트림 구독 (OHLCV, 호가, 체결) |
| `IndicatorEngine` | 기술지표 계산 (EMA, RSI, ATR, Bollinger, MACD, z-score) |
| `StrategyEngine` | 전략 로직 실행, 진입/청산 신호 생성 |
| `OrderManager` | 주문 생성·전송·추적·체결 확인 (Upbit REST, OKX REST) |
| `RiskManager` | 포지션 사이징, 손절, MDD 모니터링, 레짐 스톱 |
| `StateReporter` | gRPC로 모니터링 서버에 실시간 상태 전송 |
| `ConfigLoader` | YAML 설정 파일 로드 (전략 파라미터, API 키, 리스크 한도) |

#### Monitoring Server (`/server`)

| 모듈 | 역할 |
|------|------|
| `AgentBridge` | gRPC 서버로 에이전트 상태 수신 |
| `REST API` | 웹 대시보드용 데이터 엔드포인트 |
| `WebSocket Hub` | 실시간 데이터를 웹 클라이언트에 브로드캐스트 |
| `BacktestEngine` | 서버사이드 백테스팅 (히스토리 데이터 + 전략 시뮬레이션) |
| `PaperTradingManager` | 가상매매 세션 관리 (다중 전략 동시 실행) |
| `AlertService` | Telegram/Discord 알림 전송 |
| `DBService` | Supabase CRUD (거래 기록, 전략 설정, 성과 지표) |

#### Web Dashboard (`/web`)

| 페이지 | 역할 |
|--------|------|
| `Dashboard` | 총 자산, 일/주/월 손익, 실시간 포지션, 주요 KPI |
| `Portfolio` | 자산 배분, 거래소별 잔고, 코인별 비중 |
| `Strategy` | 전략 목록, 파라미터 수정, 투자 성향 선택 (안전/중립/공격) |
| `Backtest` | 전략별 백테스팅 실행 및 결과 시각화 |
| `PaperTrading` | 가상매매 대시보드, 다중 전략 비교, 성과 랭킹 |
| `TradeHistory` | 체결 내역, 필터링, 수익률 분석 |
| `Settings` | API 키 관리, 알림 설정, 리스크 파라미터 |

### 2.3 기술 스택

| 레이어 | 기술 | 선택 이유 |
|--------|------|-----------|
| **에이전트** | C++20, CMake, vcpkg | 최소 지연 체결, 메모리 제어 |
| | Boost.Beast | HTTP/WebSocket 클라이언트 |
| | simdjson | 초고속 JSON 파싱 (거래소 응답) |
| | spdlog | 비동기 로깅 |
| | gRPC (protobuf) | 서버 통신 (양방향 스트리밍) |
| | OpenSSL | HMAC-SHA256/SHA512 서명 |
| | yaml-cpp | 설정 파일 파싱 |
| **서버** | Node.js, TypeScript | 웹 생태계 호환, 빠른 개발 |
| | Hono | 경량 고성능 HTTP 프레임워크 |
| | @grpc/grpc-js | gRPC 클라이언트/서버 |
| | Socket.IO | 웹 클라이언트 실시간 통신 |
| | Supabase (PostgreSQL) | 데이터 영속화, 인증 |
| | Bull/BullMQ (Redis) | 백테스트 작업 큐 |
| **웹** | React 19, Vite, TypeScript | 기존 프로젝트 일관성 |
| | shadcn/ui, Radix UI | 접근성 기반 컴포넌트 |
| | Tailwind CSS 4 | 유틸리티 기반 스타일링 |
| | Lightweight Charts (TradingView) | 캔들스틱 차트 |
| | Recharts, D3 | 성과/통계 차트 |
| | Zustand | 클라이언트 상태 관리 |
| | TanStack Query | 서버 상태 관리 |
| | Socket.IO Client | 실시간 데이터 수신 |

### 2.4 디자인 시스템

**IBM Carbon** + **Microsoft Fluent Design** + **GitHub Primer** 조합을 채택한다.

| 디자인 시스템 | 적용 영역 | 이유 |
|--------------|-----------|------|
| **IBM Carbon** | 데이터 테이블, 메트릭 카드, 전체 레이아웃 | 데이터 밀도가 높은 대시보드에 최적화 |
| **Fluent Design** | 카드 깊이, 글래스모피즘, 다크 테마 | 트레이딩 플랫폼에 어울리는 공간감과 깊이 |
| **GitHub Primer** | 네비게이션, 상태 표시, 코드 블록 | 개발자 친화적 구조, 가독성 |

**구현**: shadcn/ui 커스텀 테마로 위 3가지 디자인 철학을 반영한 다크 테마 중심 UI 구현.

컬러 팔레트 (다크 모드 기본):
- **Background**: `oklch(0.13 0.02 260)` — 딥 네이비
- **Card Surface**: `oklch(0.17 0.02 260)` — 글래스 패널  
- **Primary**: `oklch(0.65 0.19 145)` — 수익 그린
- **Destructive**: `oklch(0.60 0.22 25)` — 손실 레드
- **Accent**: `oklch(0.70 0.16 255)` — 인포 블루
- **Warning**: `oklch(0.80 0.18 85)` — 경고 옐로우

---

## 3. 매매 전략

### 3.1 전략 개요 (딥리서치 기반)

BTC는 암호화폐 시장에서 **정보 반영의 선행 지표**로 작동하며, BTC의 지연 수익률이 알트코인 수익률을 예측하는 **크로스-암호화폐 예측 가능성**이 학술 연구에서 확인되었다. 이를 기반으로 5개 전략군을 구현한다.

### 3.2 전략 목록

#### 전략 1: BTC 레짐 필터 + 알트 평균회귀 (★ 스타터 추천)

> BTC가 리스크-온을 확인해준 뒤, 알트가 BTC 대비 눌린 상태를 매수

**BTC 레짐 판단 (4H 기준)**
```
Risk-On 조건 (모두 충족):
  ① BTC Close > EMA(200, 4H)
  ② BTC RSI(14, 4H) ∈ [52, 70]
  ③ BTC ATR%(14, 4H) ≤ 4.5%

Risk-Off 조건 (하나라도 충족):
  ① BTC Close < EMA(200, 4H)
  ② BTC ATR%(14, 4H) ≥ 6.5%
  ③ BTC RSI(14, 4H) ≤ 45
```

**알트 진입/청산**
```
비율:    R_i = ln(ALT_i / BTC)
z-score: z_i = (R_i − SMA_20(R_i)) / STD_20(R_i)

진입 (Risk-On + 모두 충족):
  ① z_i ≤ −1.0
  ② ALT RSI(14, 4H) ≤ 78
  ③ 스프레드 ≤ 15bp
  ④ 동시 보유 ≤ 5종목

청산 (우선순위):
  0. 손절: 진입가 − 2.7 × ATR(14, 4H) 이탈 → 즉시
     레짐 스톱: BTC Risk-Off → 전체 포지션 청산
  1. 이익 실현: z_i ≥ 0.0
  2. 시간 청산: 8캔들(32시간) 경과
```

#### 전략 2: BTC 도미넌스 로테이션

> BTC.D 하락 + USDT.D 하락 = 알트 시즌 포착

```
진입 조건:
  ① BTC.D < MA(20, 1D) AND BTC.D < MA(50, 1D)  [하향]
  ② USDT.D RSI(14, 1D) < 50                      [현금 이탈]
  ③ BTC ATR%(14, 4H) < 4.0%                       [변동성 둔화]
  → 알트 포트폴리오 매수 (시총 상위, 유동성 충분)

청산 조건:
  ① BTC.D > MA(20, 1D)   [도미넌스 반등]
  ② BTC 급등/급락 (±5%)
```

#### 전략 3: BTC 변동성 타이밍 (레짐 필터)

> 변동성 낮고 추세 양호 → 알트 익스포저 확대

```
진입: BTC ATR%(14, 4H) ≤ 3.0% AND BTC > MA(200, 1D) → 알트 비중 ↑
청산: BTC ATR%(14, 4H) ≥ 5.5% OR BTC < MA(200, 1D)  → 알트 비중 ↓
```

#### 전략 4: 펀딩비 차익 (OKX 선물 전용)

> 펀딩비 극단 시 델타중립 포지션

```
진입: 연율 환산 펀딩비 > +30% → 숏 (과열)
      연율 환산 펀딩비 < -30% → 롱 (과매도)
헤지: 현물 반대 포지션으로 델타중립
청산: 펀딩비 정상화 (0% 수렴)
```

#### 전략 5: 김프(한국 프리미엄) 모니터링

> 업비트-OKX 간 가격 괴리 추적 (차익거래 참고)

```
모니터링: 김프(%) = (업비트KRW가격/환율 − OKX_USDT가격) / OKX_USDT가격 × 100
경고: 김프 > 3% 또는 < -2% 시 알림
활용: 레짐 필터 보조 지표 (김프 급등 = 투기 과열 경고)
```

### 3.3 투자 성향 프로필

| 프로필 | 레버리지 | 동시 보유 | MDD 한도 | ATR 손절 | 전략 |
|--------|----------|-----------|----------|----------|------|
| **안전 (Conservative)** | 1x (현물만) | 3종목 | 10% | 2.0×ATR | 전략1 단독 |
| **중립 (Moderate)** | 1~2x | 5종목 | 15% | 2.7×ATR | 전략1 + 전략3 |
| **공격 (Aggressive)** | 2~3x | 8종목 | 25% | 3.5×ATR | 전략1~4 조합 |

### 3.4 포지션 사이징 & 리스크 관리

```
일일 최대 손실   = Equity × 2%
단일 포지션 손실 = Equity × 0.30%
수량 계산        = (Equity × 0.003) / (STOP_ATR_MULT × ATR)

MDD 15% 초과 → 리스크 50% 축소
MDD 25% 초과 → 매매 중단 + 원인 분석

선물 추가 규칙:
  - 마진 모드: 격리(Isolated)
  - 지갑 증거금 사용률 < 35%
  - 모든 청산 주문: reduce-only
  - 레버리지 상한: 프로필별 1~3x
```

### 3.5 알트코인 유니버스 선정

```
필수 조건:
  - 30일 평균 일거래대금 ≥ 50억 KRW (업비트) / $10M (OKX)
  - 스프레드 ≤ 20bp
  - 스테이블코인·랩드·레버리지 토큰 제외
  - 신규 상장 14일 이내 제외
  
분산:
  - 시총 대형(Top 20): 60%
  - 시총 중형(Top 50): 30%
  - 시총 소형(Top 100): 10%
```

---

## 4. 백테스팅 시스템

### 4.1 설계 원칙

| 원칙 | 구현 |
|------|------|
| **생존편향 제거** | 과거 각 시점의 "거래 가능 유니버스" 재구성 (상장폐지 반영) |
| **현실적 비용** | 수수료 + 슬리피지 + 스프레드 모델링 |
| **체결 모사** | 캔들 종료 → 다음 캔들 시가 ± 슬리피지 |
| **워크포워드** | 70% 학습 / 30% 검증, 롤링 윈도우 |

### 4.2 데이터 소스

| 데이터 | 소스 | 기간 |
|--------|------|------|
| OHLCV (현물) | 업비트 REST API, CryptoDataDownload | 2020~ |
| OHLCV (선물) | OKX REST API, DataDownload | 2021~ |
| 펀딩비 | OKX API (히스토리) | 2021~ |
| BTC.D / USDT.D | CoinGecko, TradingView export | 2020~ |
| 환율 (KRW/USD) | 한국은행 ECOS API | 2020~ |

### 4.3 성과 지표

```
수익 지표: CAGR, 총수익률, 월평균수익률
리스크 지표: MDD, 변동성(σ), VaR(95%), CVaR(95%)
효율 지표: Sharpe Ratio, Sortino Ratio, Calmar Ratio
거래 지표: 승률, 평균손익비(R:R), 최대 연패수, 평균 보유시간
벤치마크: BTC Buy&Hold, ETH Buy&Hold 대비 초과수익
```

### 4.4 스트레스 테스트

```
시나리오:
  - 2021.05 차이나 크래시 (-50% BTC)
  - 2022.05 LUNA 폭락
  - 2022.11 FTX 파산
  - 2024.08 엔캐리 청산
  - 거래소 API 장애 1시간
  - 연쇄 청산 (알트 -30% 급락)
```

---

## 5. 가상 매매 (Paper Trading)

### 5.1 개요

실전 투입 전 **실시간 시장 데이터**로 전략을 검증한다. 여러 전략을 **동시에** 실행하여 성과를 비교하고, 최적 전략을 선별한다.

### 5.2 기능

| 기능 | 설명 |
|------|------|
| **다중 세션** | 최대 10개 전략을 동시 실행 |
| **실시간 체결** | 현재 호가 기반 가상 체결 (슬리피지 모델 적용) |
| **성과 추적** | 각 세션별 수익률, MDD, Sharpe 실시간 계산 |
| **비교 대시보드** | 전략 간 성과 비교 차트, 랭킹 테이블 |
| **전략 승격** | 가상매매 → 실전매매 원클릭 전환 |
| **기간 설정** | 1주~6개월 가상매매 기간 설정 |

### 5.3 운영 흐름

```
1. 전략 설정 (파라미터, 유니버스, 리스크 프로필)
2. 가상매매 세션 시작 (에이전트에서 실행, 실제 주문 미발생)
3. 실시간 모니터링 (웹 대시보드)
4. 기간 종료 → 성과 리포트 자동 생성
5. 최적 전략 선택 → 실전 전환
```

---

## 6. 프로젝트 구조

```
coin-autopilot/
├── PLAN.md
├── README.md
├── .gitignore
│
├── agent/                          # C++ Trading Agent
│   ├── CMakeLists.txt
│   ├── vcpkg.json
│   ├── src/
│   │   ├── main.cpp
│   │   ├── core/
│   │   │   ├── engine.hpp / engine.cpp
│   │   │   ├── config.hpp / config.cpp
│   │   │   └── types.hpp
│   │   ├── exchange/
│   │   │   ├── exchange_base.hpp
│   │   │   ├── upbit/
│   │   │   │   ├── upbit_client.hpp / .cpp
│   │   │   │   ├── upbit_ws.hpp / .cpp
│   │   │   │   └── upbit_auth.hpp / .cpp
│   │   │   └── okx/
│   │   │       ├── okx_client.hpp / .cpp
│   │   │       ├── okx_ws.hpp / .cpp
│   │   │       └── okx_auth.hpp / .cpp
│   │   ├── strategy/
│   │   │   ├── strategy_base.hpp
│   │   │   ├── btc_regime_filter.hpp / .cpp
│   │   │   ├── alt_mean_reversion.hpp / .cpp
│   │   │   ├── dominance_rotation.hpp / .cpp
│   │   │   ├── volatility_timing.hpp / .cpp
│   │   │   └── funding_arbitrage.hpp / .cpp
│   │   ├── indicator/
│   │   │   ├── indicator_engine.hpp / .cpp
│   │   │   ├── ema.hpp / rsi.hpp / atr.hpp
│   │   │   ├── bollinger.hpp / macd.hpp
│   │   │   └── zscore.hpp
│   │   ├── risk/
│   │   │   ├── risk_manager.hpp / .cpp
│   │   │   └── position_sizer.hpp / .cpp
│   │   ├── order/
│   │   │   ├── order_manager.hpp / .cpp
│   │   │   └── order_types.hpp
│   │   ├── data/
│   │   │   ├── market_data.hpp / .cpp
│   │   │   └── candle_store.hpp / .cpp
│   │   └── comm/
│   │       ├── grpc_reporter.hpp / .cpp
│   │       └── proto/
│   ├── tests/
│   │   ├── test_indicators.cpp
│   │   ├── test_strategies.cpp
│   │   └── test_risk.cpp
│   └── config/
│       └── config.example.yaml
│
├── server/                         # Monitoring Server (Node.js)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── dashboard.ts
│   │   │   ├── strategy.ts
│   │   │   ├── backtest.ts
│   │   │   ├── paper-trading.ts
│   │   │   ├── portfolio.ts
│   │   │   └── settings.ts
│   │   ├── services/
│   │   │   ├── agent-bridge.ts
│   │   │   ├── backtest-engine.ts
│   │   │   ├── paper-trading-manager.ts
│   │   │   ├── market-data.ts
│   │   │   ├── alert.ts
│   │   │   └── kimchi-premium.ts
│   │   ├── websocket/
│   │   │   └── hub.ts
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   ├── client.ts
│   │   │   └── migrations/
│   │   ├── proto/
│   │   │   └── autopilot.ts
│   │   └── types/
│   │       └── index.ts
│   └── tests/
│
├── web/                            # React Dashboard
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── vitest.config.ts
│   ├── eslint.config.js
│   ├── components.json
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.css
│   │   ├── components/
│   │   │   ├── dashboard/
│   │   │   │   ├── AssetOverview.tsx
│   │   │   │   ├── PnLChart.tsx
│   │   │   │   ├── ActivePositions.tsx
│   │   │   │   ├── KpiCards.tsx
│   │   │   │   └── MarketStatus.tsx
│   │   │   ├── charts/
│   │   │   │   ├── CandlestickChart.tsx
│   │   │   │   ├── PerformanceChart.tsx
│   │   │   │   └── CorrelationHeatmap.tsx
│   │   │   ├── strategy/
│   │   │   │   ├── StrategyList.tsx
│   │   │   │   ├── StrategyConfig.tsx
│   │   │   │   ├── RiskProfileSelector.tsx
│   │   │   │   └── ParameterEditor.tsx
│   │   │   ├── backtest/
│   │   │   │   ├── BacktestRunner.tsx
│   │   │   │   ├── BacktestResults.tsx
│   │   │   │   └── EquityCurve.tsx
│   │   │   ├── paper-trading/
│   │   │   │   ├── PaperTradingDashboard.tsx
│   │   │   │   ├── SessionManager.tsx
│   │   │   │   ├── StrategyComparison.tsx
│   │   │   │   └── SessionDetail.tsx
│   │   │   ├── portfolio/
│   │   │   │   ├── AssetAllocation.tsx
│   │   │   │   ├── ExchangeBalance.tsx
│   │   │   │   └── TradeHistory.tsx
│   │   │   ├── layout/
│   │   │   │   ├── AppLayout.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── StatusBar.tsx
│   │   │   ├── settings/
│   │   │   │   ├── ApiKeyManager.tsx
│   │   │   │   ├── AlertSettings.tsx
│   │   │   │   └── RiskSettings.tsx
│   │   │   └── ui/                # shadcn/ui 컴포넌트
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── StrategyPage.tsx
│   │   │   ├── BacktestPage.tsx
│   │   │   ├── PaperTradingPage.tsx
│   │   │   ├── PortfolioPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── stores/
│   │   │   ├── dashboard-store.ts
│   │   │   ├── strategy-store.ts
│   │   │   ├── backtest-store.ts
│   │   │   ├── paper-trading-store.ts
│   │   │   └── settings-store.ts
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   └── websocket.ts
│   │   ├── hooks/
│   │   │   ├── useRealTimeData.ts
│   │   │   ├── useBacktest.ts
│   │   │   └── usePaperTrading.ts
│   │   ├── types/
│   │   │   ├── trading.ts
│   │   │   ├── strategy.ts
│   │   │   ├── backtest.ts
│   │   │   └── api.ts
│   │   └── lib/
│   │       ├── utils.ts
│   │       └── constants.ts
│   └── tests/
│
├── proto/                          # Shared gRPC Definitions
│   └── autopilot.proto
│
└── docs/
    ├── architecture.md
    ├── strategies.md
    └── exchange-api.md
```

---

## 7. 데이터베이스 스키마

```sql
-- 거래소 계정
CREATE TABLE exchange_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL CHECK (exchange IN ('upbit', 'okx')),
  label TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  passphrase_encrypted TEXT,          -- OKX용
  permissions TEXT[] DEFAULT '{}',
  ip_whitelist TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 전략 설정
CREATE TABLE strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,                  -- regime_mean_reversion, dominance_rotation, etc.
  params JSONB NOT NULL,               -- 전략 파라미터 전체
  risk_profile TEXT NOT NULL CHECK (risk_profile IN ('conservative', 'moderate', 'aggressive')),
  is_active BOOLEAN DEFAULT false,
  mode TEXT NOT NULL CHECK (mode IN ('live', 'paper', 'backtest')),
  exchange TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 거래 기록
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES strategies(id),
  session_id UUID,                     -- 가상매매 세션 ID (null = 실거래)
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  type TEXT NOT NULL,                  -- market, limit, stop
  qty NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  fee NUMERIC DEFAULT 0,
  pnl NUMERIC,
  pnl_pct NUMERIC,
  reason TEXT,                         -- entry_signal, stop_loss, take_profit, time_exit, regime_stop
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 포지션 (현재)
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES strategies(id),
  session_id UUID,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  qty NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  current_price NUMERIC,
  unrealized_pnl NUMERIC,
  stop_price NUMERIC,
  leverage NUMERIC DEFAULT 1,
  margin_mode TEXT DEFAULT 'isolated',
  opened_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 자산 스냅샷 (시계열)
CREATE TABLE equity_snapshots (
  id BIGSERIAL PRIMARY KEY,
  total_equity_krw NUMERIC NOT NULL,
  total_equity_usd NUMERIC NOT NULL,
  upbit_balance_krw NUMERIC DEFAULT 0,
  okx_balance_usd NUMERIC DEFAULT 0,
  btc_price_krw NUMERIC,
  btc_price_usd NUMERIC,
  snapshot_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 백테스트 결과
CREATE TABLE backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES strategies(id),
  params JSONB NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_return NUMERIC,
  cagr NUMERIC,
  sharpe_ratio NUMERIC,
  sortino_ratio NUMERIC,
  calmar_ratio NUMERIC,
  max_drawdown NUMERIC,
  win_rate NUMERIC,
  avg_rr NUMERIC,
  total_trades INTEGER,
  avg_hold_hours NUMERIC,
  equity_curve JSONB,                  -- [{t, equity}, ...]
  trades JSONB,                        -- [{...trade}, ...]
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 가상매매 세션
CREATE TABLE paper_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES strategies(id),
  name TEXT NOT NULL,
  initial_capital NUMERIC NOT NULL,
  current_equity NUMERIC NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  performance JSONB,                   -- 실시간 성과 지표
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 시장 데이터 캐시 (백테스트용)
CREATE TABLE market_data_cache (
  id BIGSERIAL PRIMARY KEY,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,             -- 1m, 5m, 15m, 1h, 4h, 1d
  open_time TIMESTAMPTZ NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  UNIQUE (exchange, symbol, timeframe, open_time)
);

-- 펀딩비 히스토리
CREATE TABLE funding_rates (
  id BIGSERIAL PRIMARY KEY,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  funding_rate NUMERIC NOT NULL,
  funding_time TIMESTAMPTZ NOT NULL,
  UNIQUE (exchange, symbol, funding_time)
);

-- 알림 로그
CREATE TABLE alert_logs (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,                  -- trade, risk, system, regime_change
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  sent_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_trades_strategy ON trades(strategy_id, executed_at DESC);
CREATE INDEX idx_trades_session ON trades(session_id, executed_at DESC);
CREATE INDEX idx_positions_strategy ON positions(strategy_id);
CREATE INDEX idx_equity_time ON equity_snapshots(snapshot_at DESC);
CREATE INDEX idx_market_data ON market_data_cache(exchange, symbol, timeframe, open_time);
CREATE INDEX idx_funding_rates ON funding_rates(exchange, symbol, funding_time DESC);
```

---

## 8. API 설계

### 8.1 REST API (Server → Web)

```
GET    /api/dashboard/summary          총 자산, 일손익, 활성 전략/포지션 수
GET    /api/dashboard/equity-history    자산 시계열 데이터
GET    /api/portfolio/balance           거래소별 잔고
GET    /api/portfolio/positions         현재 포지션 목록
GET    /api/portfolio/trades            거래 내역 (필터: 날짜, 전략, 종목)

GET    /api/strategy                    전략 목록
POST   /api/strategy                    전략 생성
PUT    /api/strategy/:id                전략 수정
PUT    /api/strategy/:id/activate       전략 활성화
PUT    /api/strategy/:id/deactivate     전략 비활성화
DELETE /api/strategy/:id                전략 삭제

POST   /api/backtest/run                백테스트 실행 (비동기, 작업 ID 반환)
GET    /api/backtest/status/:jobId      백테스트 진행 상태
GET    /api/backtest/results            백테스트 결과 목록
GET    /api/backtest/results/:id        백테스트 결과 상세

POST   /api/paper-trading/session       세션 시작
PUT    /api/paper-trading/session/:id   세션 일시정지/재개/종료
GET    /api/paper-trading/sessions      세션 목록 + 실시간 성과
GET    /api/paper-trading/session/:id   특정 세션 상세
GET    /api/paper-trading/compare       다중 세션 비교 데이터

PUT    /api/settings/risk-profile       리스크 프로필 변경
PUT    /api/settings/alerts             알림 설정 변경
GET    /api/settings/agent-status       에이전트 연결 상태
```

### 8.2 WebSocket Events (Server → Web)

```
[실시간 → 클라이언트]
price:update         실시간 가격
position:update      포지션 변경
trade:executed       체결 알림
equity:update        자산 업데이트
regime:change        BTC 레짐 변경
strategy:signal      전략 신호 발생
agent:status         에이전트 상태
alert:new            알림 이벤트
paper:update         가상매매 상태 업데이트

[클라이언트 → 서버]
subscribe:symbol     종목 구독
strategy:command     전략 제어 (시작/중지)
```

### 8.3 gRPC (Agent ↔ Server)

```protobuf
service AutopilotAgent {
  // 에이전트 → 서버 (스트리밍)
  rpc StreamStatus (stream AgentStatus) returns (Ack);
  rpc ReportTrade (TradeReport) returns (Ack);
  rpc StreamPositions (stream PositionSnapshot) returns (Ack);
  rpc StreamMarketData (stream MarketTick) returns (Ack);
  
  // 서버 → 에이전트 (명령)
  rpc UpdateStrategy (StrategyConfig) returns (Ack);
  rpc ControlAgent (AgentCommand) returns (Ack);     // start, stop, pause
  rpc UpdateRiskProfile (RiskProfile) returns (Ack);
}
```

---

## 9. 보안

| 항목 | 구현 |
|------|------|
| **API 키 저장** | AES-256-GCM 암호화 후 DB 저장, 복호화는 서버 메모리에서만 |
| **API 키 권한** | 거래/조회만 허용, 출금 비활성화 |
| **IP 화이트리스트** | 에이전트 서버 IP만 거래소에 등록 |
| **출금 화이트리스트** | 거래소에서 출금 주소 화이트리스트 설정 |
| **gRPC 통신** | mTLS (상호 TLS) 인증 |
| **웹 인증** | Supabase Auth (이메일/패스워드 + 2FA) |
| **환경 변수** | .env 파일 (Git 제외), 프로덕션은 Vault 또는 KMS |

---

## 10. 개발 로드맵

### Phase 0: 프로젝트 세팅 (1주)
- [x] 모노레포 구조 생성
- [ ] C++ 빌드 환경 (CMake + vcpkg)
- [ ] Node.js 서버 프로젝트 초기화
- [ ] React 웹 프로젝트 초기화 (shadcn/ui + 다크 테마)
- [ ] gRPC proto 정의
- [ ] Supabase 데이터베이스 스키마 적용
- [ ] CI/CD 기본 설정

### Phase 1: 데이터 파이프라인 (2주)
- [ ] 업비트 REST/WebSocket 클라이언트 (C++)
- [ ] OKX REST/WebSocket 클라이언트 (C++)
- [ ] 기술지표 엔진 (EMA, RSI, ATR, z-score)
- [ ] OHLCV 데이터 수집 + DB 저장
- [ ] 펀딩비 데이터 수집 (OKX)
- [ ] 환율 데이터 수집 (KRW/USD)
- [ ] BTC.D / USDT.D 데이터 수집

### Phase 2: 전략 엔진 + 백테스팅 (3주)
- [ ] BTC 레짐 필터 구현
- [ ] 전략 1: BTC 레짐 + 알트 평균회귀
- [ ] 전략 2: 도미넌스 로테이션
- [ ] 전략 3: 변동성 타이밍
- [ ] 전략 4: 펀딩비 차익
- [ ] 리스크 매니저 + 포지션 사이저
- [ ] 서버: 백테스팅 엔진
- [ ] 웹: 백테스팅 UI + 결과 시각화
- [ ] 히스토리컬 데이터 백필

### Phase 3: 가상매매 (2주)
- [ ] 에이전트: 페이퍼 트레이딩 모드
- [ ] 서버: 가상매매 세션 관리
- [ ] 웹: 가상매매 대시보드
- [ ] 다중 전략 동시 실행
- [ ] 전략 비교 랭킹 UI
- [ ] 가상매매 → 실전 전환 플로우

### Phase 4: 모니터링 대시보드 (2주)
- [ ] gRPC 양방향 통신 구현
- [ ] 웹: 실시간 대시보드 (자산, 포지션, 손익)
- [ ] 웹: 캔들스틱 차트 + 전략 시그널 오버레이
- [ ] 웹: 투자 성향 프로필 선택
- [ ] 웹: 거래 내역 + 분석
- [ ] Telegram/Discord 알림

### Phase 5: 실전 매매 (2주)
- [ ] 주문 관리 시스템 (주문 생성·추적·체결 확인)
- [ ] 업비트 현물 매매 통합
- [ ] OKX 선물 매매 통합 (격리마진, reduce-only)
- [ ] 장애 복구 (재접속, 주문 재조회, 포지션 검증)
- [ ] 레이트리밋 핸들링
- [ ] 보안 하드닝 (IP 화이트리스트, 출금 차단)

### Phase 6: 고도화 (지속)
- [ ] 김프 모니터링 + 차익거래 보조
- [ ] 머신러닝 기반 레짐 분류 (선택사항)
- [ ] 모바일 알림 PWA
- [ ] 전략 성과 자동 리포트 (주간/월간)
- [ ] A/B 테스트 프레임워크 (전략 vs 전략)

---

## 11. 운영 체크리스트

### 실전 투입 전 필수

- [ ] 최소 2개월 가상매매 안정 운영
- [ ] 3년 이상 백테스트에서 Sharpe > 1.0
- [ ] 모든 스트레스 시나리오에서 MDD < 프로필 한도
- [ ] 거래소 API 장애 시나리오 테스트 통과
- [ ] API 키 보안 감사 (권한, IP, 출금 제한)
- [ ] 알림 시스템 동작 확인
- [ ] 장애 복구 플로우 테스트

### 일일 운영

```
매일 확인:
  - 에이전트 프로세스 정상 여부
  - WebSocket 연결 상태
  - 오늘 체결 건수 및 손익
  - 레짐 상태 (Risk-On / Risk-Off)
  - 거래소 잔고 정합성 (DB vs 실제)
  
주간 확인:
  - 주간 성과 리포트
  - 전략 파라미터 드리프트 점검
  - 유니버스 변경 (신규/폐지 종목)
  - 로그 아카이브
```

---

## 12. 참고 자료

### 학술 근거
- BTC → 알트코인 수익률 선행(lead-lag) 예측 가능성 연구
- BTC ↔ 알트코인 수익률·변동성 spillover/connectedness 연구
- 암호화폐 시장의 레짐 변화(regime change)와 전이 증폭 연구
- 암호화폐 이상현상(anomalies)과 거래 제약이 수익성에 미치는 영향

### 거래소 API 문서
- [업비트 API](https://docs.upbit.com) — JWT 인증, REST API
- [OKX API](https://www.okx.com/docs-v5/) — REST/WebSocket, 펀딩비, 선물
- 펀딩비 메커니즘: 현물-선물 괴리를 줄이기 위한 구조적 장치

### 기술 지표 정의
- EMA(N): 지수이동평균
- RSI(N): 상대강도지수
- ATR(N): 평균진정범위, ATR% = ATR/Close
- z-score: (값 − 평균) / 표준편차
- BTC.D: 전체 시총 대비 BTC 시총 비율 (TradingView 기준)
- USDT.D: 전체 시총 대비 USDT 시총 비율
