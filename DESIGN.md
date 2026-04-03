# Design System — Coin Autopilot

## Product Context
- **What this is:** 멀티자산 전략 오케스트레이션 자동매매 플랫폼 (트레이딩 대시보드 + 연구 루프 + 페이퍼/실전 엔진)
- **Who it's for:** 한국 개인 트레이더 (업비트/OKX). 1차 사용자는 본인, 장기적으로 멀티유저 플랫폼 확장.
- **Space/industry:** 암호화폐 + 한국주식 트레이딩 툴 (TradingView, Bybit, 3Commas 등)
- **Project type:** 데이터 밀도 높은 전략 오케스트레이션 대시보드
- **도메인:** 프론트 `noirstar.cloud` / API `api.noirstar.cloud`

## Aesthetic Direction
- **Direction:** Terminal Craft Evolved — Industrial/Utilitarian
- **Decoration level:** Minimal (타이포그래피와 데이터가 전부. 장식 제로.)
- **Mood:** 차갑고 정밀한 터미널 미학. 크림 골드 액센트로 '내가 만든 도구'의 온기. 기업 제품이 아닌, 트레이더가 직접 만든 도구처럼 보여야 한다.
- **Reference:** Bloomberg Terminal (정보 밀도), TradingView (차트 UI 참고)
- **Anti-patterns:** 글래스모피즘, 코스믹/스페이스 배경, 노이즈 오버레이, 보라색 그라데이션, 3-column 아이콘 그리드, 장식적 그림자/블러, backdrop-filter, neon clutter 전부 금지
- **Design-first:** Desktop-first 설계. 모바일은 축소 적용.

## Information Architecture — 4대 프리미티브

대시보드는 4개의 제품 고유 프리미티브로 구성된다. 일반 카드 그리드 금지.

### 1. System Strip
- 페이지 최상단 28px 수평 바
- 시스템 연결 상태, DB, 거래소 연결, 마지막 수집 시간, 현재 시각 표시
- `font: 11px/400 JetBrains Mono, color: --text-muted`
- 이 바의 시간이 살아있으면 전체 화면이 "실시간으로 작동 중"

### 2. Deployment Matrix
- 대시보드 본체의 좌측 65%. **핵심 구역.**
- 행 = 자산, 열 = 전략명 / 자산 / 상태 / 엣지 스코어 / 판단 이유
- 각 행은 2줄 구조: 메인 정보 + 보조 상세 (entry, sl, target, conf)
- 좌측 2px border로 상태 표시: LIVE = `--profit`, PAPER = `--text-faint`, 경고 = `--warning`
- "어떤 자산에 어떤 전략이 왜 배치됐는가"를 한 스캔으로 답한다.

### 3. Operator Queue
- 대시보드 본체의 우측 35%
- 승인 요청, 리스크 경고, 전략 교체 제안, 실패 세션 등
- 각 항목에 [승인/거부] 또는 [적용/무시] 인라인 액션 버튼
- 토스트/모달이 아닌 **상시 노출 큐**. 놓치지 않는다.

### 4. Decision Ledger
- 대시보드 하단 좌측
- 시간순 머신 로그: `14:21 BTC/MA_X HOLD conf:0.82 regime:ok`
- `font: 11px/400 JetBrains Mono`
- "왜 그런 판단이 나왔는가"를 행 레벨에서 바로 보여준다.

### Hero Strip
- System Strip 아래, Deployment Matrix 위
- 핵심 숫자: **EDGE 스코어** (28px, 크림 골드) + LIVE/PAPER 수 + 총 자산 + 오늘 PnL + 승인 대기
- EDGE 스코어 = 현재 시장 조건이 내 전략에 얼마나 유리한지 (0-100)
- **PnL이 아닌 EDGE가 히어로**. 경쟁사와의 핵심 차별점.

### 레이아웃 흐름
```
┌─ System Strip (28px) ──────────────────────────────┐
├─ Hero Strip (EDGE + PnL + 요약) ───────────────────┤
├─ Deployment Matrix (65%) ──┬─ Operator Queue (35%) ─┤
│  STRAT  ASSET  STATE  EDGE │  PENDING (2)           │
│  MA_X   BTC    ● LIVE  82  │  ▶ 승인 필요           │
│   └ RSI 과매도 + 거래량↑   │    [승인] [거부]       │
├────────────────────────────┴─────────────────────────┤
├─ Decision Ledger (50%) ─┬─ Research Status (50%) ────┤
│  14:21 BTC HOLD ...      │  실행중 2  대기 3         │
└──────────────────────────┴───────────────────────────┘
```

## Typography
- **Display/Hero KPI:** JetBrains Mono 700, 28px — EDGE 스코어, 히어로 숫자
- **KPI Large:** JetBrains Mono 600, 24px — 총 자산, 큰 수치
- **Page Title:** Geist 700, 20px — 트레이딩 대시보드, 전략 상세 등
- **Section Anchor:** Geist 600, 15px — 섹션 제목, 중요 행 타이틀
- **Body:** Geist 400/500, 13px — 본문, 설명, 테이블 데이터 (텍스트)
- **UI Labels (한글):** Geist 600, 12px, letter-spacing: 0 또는 -0.01em
- **UI Labels (영문):** JetBrains Mono 600, 12px, uppercase, letter-spacing: 0.08em
- **Data/Tables:** JetBrains Mono 400~600, 13px, tabular-nums 필수 — 숫자 정렬
- **Machine Log:** JetBrains Mono 400, 11px — Decision Ledger, 이벤트 스트림
- **Section Header:** JetBrains Mono 600, 10px, uppercase, letter-spacing: 0.1em, `--text-faint`
- **Timestamp/Caption:** JetBrains Mono 400, 11px, `--text-faint` — 영문/숫자 전용
- **Code:** JetBrains Mono
- **Loading:** Google Fonts CDN
- **Scale:** 10px(섹션헤더) / 11px(타임스탬프,머신로그) / 12px(레이블,배지) / 13px(본문,데이터) / 15px(섹션앵커) / 20px(페이지타이틀) / 24px(KPI) / 28px(히어로)

### 한글 타이포 규칙
- **최소 폰트 사이즈: 12px** — 11px 이하 한글 텍스트 금지 (영문/숫자 11px은 허용)
- **uppercase + letter-spacing 확대는 영문 전용** (STRATEGY, EDGE, PNL 등)
- 한글 레이블: 12px, 600 weight, letter-spacing: 0 또는 -0.01em
- 한영 혼용 시 영문 부분만 uppercase 적용, 한글은 그대로

### 숫자 폰트 2계층 분리
- 실시간 데이터 (가격, PnL, 타임스탬프, 스코어): **JetBrains Mono** — 고정폭, 레이아웃 안정
- UI 레이블, 설명, 전략 이름: **Geist** — 가독성

## Color
- **Approach:** Restrained — 컬러는 데이터 의미(수익/손실/경고)와 브랜드 시그널에만 사용. 장식적 색상 금지.
- **Dark mode only** (트레이딩 UI 표준)

### Neutrals (zinc 계열)
| Token | Hex | 용도 |
|-------|-----|------|
| `--background` | `#0A0A0B` | 페이지 배경 |
| `--surface` | `#111113` | 카드, 패널 |
| `--surface-hover` | `#18181B` | 호버 상태 |
| `--border` | `#27272A` | 주요 보더 |
| `--border-subtle` | `#1C1C1F` | 미세 보더, 구분선 |
| `--text-primary` | `#FAFAFA` | 주요 텍스트 (opacity 트릭 금지) |
| `--text-secondary` | `#A1A1AA` | 보조 텍스트 |
| `--text-muted` | `#71717A` | 뮤트 텍스트, 레이블 |
| `--text-faint` | `#52525B` | placeholder, 비활성, 최저 가독성 한계 |

### Semantic
| Token | Hex | 용도 |
|-------|-----|------|
| `--profit` | `#4ADE80` | 수익, Risk-On, 긍정, LIVE 상태 |
| `--loss` | `#F87171` | 손실, Risk-Off, 부정 |
| `--warning` | `#FBBF24` | 경고 (MDD 초과 등) |
| `--info` | `#60A5FA` | 정보성 알림, 페이퍼 상태 |
| `--accent` | `#E8D5B0` | 크림 골드 — 브랜드 액센트 (제한적 사용) |

### 액센트 사용 규칙
`--accent` (#E8D5B0 크림 골드)는 **딱 3곳**에만 사용:
1. 히어로 EDGE 스코어 숫자
2. 챔피언 전략 배지 (Deployment Matrix에서 최고 성과 전략)
3. 로고/브랜드 마크 (헤더의 골드 닷)

버튼 배경색, 링크 색상, 네비게이션 활성 상태, 일반 UI 요소에는 사용 금지. 이 컬러가 뜨면 "이것이 중요하다"는 신호.

### Semantic Background (8-digit hex alpha)
| Token | Value | 용도 |
|-------|-------|------|
| `--profit-bg` | `#4ADE8012` | 수익 배지/알림 배경 |
| `--loss-bg` | `#F8717112` | 손실 배지/알림 배경 |
| `--warning-bg` | `#FBBF2410` | 경고 배경 |
| `--info-bg` | `#60A5FA10` | 정보 배경 |
| `--accent-bg` | `#E8D5B010` | 액센트 배경 |

## Spacing
- **Base unit:** 4px
- **Density:** Compact (트레이딩 UI는 정보 밀도가 생명)
- **Scale:** 2xs(2px) xs(4px) sm-(6px) sm(8px) md(12px) lg(16px) xl(20px) 2xl(24px) 3xl(32px) 4xl(48px) 5xl(64px)
- **6px 토큰:** 고밀도 테이블용 추가 토큰 (기존 4/8 사이 갭 해결)
- **카드 내부 패딩:** 비대칭 `10px 16px 12px` (상/좌우/하). 열린 느낌 확보.
- **카드 간 간격:** 12px
- **섹션 간 간격:** 20~24px

## Layout
- **Approach:** Grid-disciplined + 1px 격자선 구조 노출 + 비대칭 분할
- **핵심 분할:** 좌 65-70% (오케스트레이션) + 우 30-35% (액션/리스크)
- **Grid:** 1col(mobile) → 2col(sm:640px) → 비대칭 2col(lg:1024px)
- **Max content width:** 1200px (대시보드)
- **Sidebar:** 240px 고정폭 (데스크톱 레이아웃)
- **격자선 규칙:** 라운드 코너 카드 그리드 대신 border-b/border-r로 구조 노출 (Bloomberg 스타일). 데이터 테이블, Deployment Matrix, Decision Ledger에 적용.
- **이유(rationale) 가시성:** 전략 상태가 나타나는 모든 곳에 1줄 판단 이유가 행 레벨에서 보여야 한다. 툴팁이나 드로어 뒤에 숨기지 않는다.
- **Border radius:**
  - sm: 4px — 배지, 인라인 요소, 버튼 (기본 인터랙티브)
  - md: 6px — 카드, 인풋, 컨테이너 (기본값)
  - lg: 8px — 모달, 큰 컨테이너
  - full: 9999px — 레짐 배지, 상태 인디케이터
  - Terminal Craft는 milled, not soft. 과도한 라운딩 금지.

## Motion
- **Approach:** Minimal-functional (이해를 돕는 트랜지션만)
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:**
  - micro: 100ms — 호버, 포커스
  - short: 150ms — 버튼 상태, 토글
  - medium: 200ms — 패널 열기/닫기
  - long: 300ms — 페이지 전환 (사용 드뭄)
- **허용:** 타임스탬프 틱커 (1초 간격 텍스트 교체), 상태 변경 시 border-left 컬러 전환, 큐 항목 추가/제거
- **금지:** 스크롤 애니메이션, 파티클, 펄스 글로우, 장식적 모션, CSS keyframe 루프

## Signature Elements

### 골드 닷 브랜드마크
- 헤더 좌측 "Coin Autopilot" 텍스트 옆 8px 원형 `--accent` 색상 닷.
- 활성 전략이 동작 중일 때만 표시 (비활성 시 숨김 또는 `--text-faint`).

### 시장 적합도 (EDGE 스코어)
- 한국어 표기: "시장 적합도". 영문 내부명: EDGE.
- 현재 시장이 내 전략 포트폴리오에 얼마나 유리한지 0-100으로 표현
- HeroStrip에서 20px JetBrains Mono 700으로 표시. `/100` 스케일 함께 표시.
- 0-30: `--loss` (불리), 31-60: `--text-secondary` (보통), 61-100: `--profit` (유리)
- 전략 0개일 때: "—" + "전략이 배치되면 계산됩니다"
- **위치:** HeroStrip의 마지막 지표. 총 자산/오늘 손익 뒤.
- 경쟁사가 PnL을 히어로로 쓸 때, 이 제품은 행동이 필요한 것(승인/위험도)을 먼저 보여준다.

### Machine Log Voice
- Decision Ledger에서 사용하는 1급 UI 레이어
- 간결한 모노스페이스 이벤트 스트림: `BTC/MA_X / HOLD / regime:ok / vol_contraction:fail`
- 챗 버블이 아닌 append-only 로그. 자체적이고 기억에 남는 UI.

### 상태 보더 인디케이터
- 각 Deployment Matrix 행의 좌측 `border-left: 2px solid`
- LIVE = `--profit`, PAPER = `--text-faint`, 경고 = `--warning`
- 12px 닷 배지보다 강한 시각적 신호. 행 전체가 상태를 표현.

## Component Rules

### System Strip
- `height: 28px`, `background: var(--surface)`, `border-bottom: 1px solid var(--border-subtle)`
- `font: 11px/400 JetBrains Mono`, `color: var(--text-muted)`
- 연결 상태 닷: `width: 6px, height: 6px, border-radius: 50%`, OK = `--profit`, FAIL = `--loss`

### Deployment Matrix Row
- 메인 행: `height: auto`, `padding: 8px 16px`, `border-bottom: 1px solid var(--border-subtle)`
- 보조 행 (이유): `padding: 0 16px 8px 32px`, `font: 11px, color: --text-muted`
- 호버: `background: var(--surface-hover)`
- 좌측 상태 보더: `border-left: 2px solid [상태색]`

### Operator Queue Item
- `padding: 10px 16px 12px`, `border-bottom: 1px solid var(--border-subtle)`
- 제목: 12px 600 `--text-secondary`
- 설명: 11px `--text-muted`
- 인라인 액션 버튼: 11px, semantic-bg 배경

### 텍스트
- opacity 트릭 금지. `text-muted-foreground/30` 같은 Tailwind opacity modifier 금지
- 실제 색상 토큰 사용: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-faint`
- 최저 가독성: `--text-faint` (#52525B) — 이보다 연한 텍스트 금지

### 데이터 테이블
- 헤더 (영문): JetBrains Mono 10px uppercase, letter-spacing 0.08em, `--text-faint`
- 헤더 (한글): Geist 12px, 600 weight, 일반 letter-spacing, `--text-muted`
- 셀: 13px, JetBrains Mono (숫자), Geist (텍스트)
- 행 호버: `var(--surface)`
- 구분선: `1px solid var(--border-subtle)`
- 숫자 정렬: `font-variant-numeric: tabular-nums`, 우측 정렬

### 배지/상태
- 레짐 배지: pill shape (border-radius: full), semantic-bg 배경 + 시맨틱 색상 텍스트
- 매수/매도: 4px radius, semantic-bg 배경

### 빈 상태
- 중앙 정렬, dashed border (`1px dashed var(--border)`)
- 아이콘 + 주요 메시지 (13px, `--text-secondary`) + 보조 메시지 (12px, `--text-muted`)
- 이모지 금지. Lucide 아이콘 사용

### 아이콘
- Lucide React 전용 (이모지 사용 절대 금지)
- 사이즈: 3~3.5 (UI 인라인), 4 (카드 아이콘), 8 (빈 상태)

### 알림/알럿
- 토스트/모달이 아닌 Operator Queue에 상시 노출
- 알럿 컴포넌트: `border-left: 2px solid [시맨틱색]`, semantic-bg 배경
- 인라인 액션 버튼 포함

## Number Formatting
| 데이터 | 포맷 | 예시 |
|--------|------|------|
| KRW 가격 | `#,###원` (1만 이상 `#.##만`, 1억 이상 `#.##억`) | `1,380원`, `1.01억` |
| USD 가격 | `$#,###.##` | `$97,432.10` |
| 퍼센트 | `+-#.##%` (부호 항상 표시) | `+3.42%`, `-1.23%` |
| z-score | `+-#.##` (소수점 2자리) | `-1.23` |
| RSI | `##.#` (소수점 1자리) | `58.3` |
| EDGE 스코어 | `##` (정수) | `72` |

**색상:** 양수 → `--profit`, 음수 → `--loss`, 0 → `--text-secondary`. 모든 숫자는 JetBrains Mono + `tabular-nums` + 우측 정렬.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-28 | Terminal Craft 디자인 시스템 초안 | /design-consultation 리서치 + Codex + Claude subagent 3자 합의 |
| 2026-04-03 | Terminal Craft Evolved v2 재작성 | PRD 기반 새 제품 구축. 기존 미학 유지, UX/정보구조 전면 재설계 |
| 2026-04-03 | 4대 프리미티브 확정 | System Strip, Deployment Matrix, Decision Ledger, Operator Queue. Codex + Claude subagent 수렴 |
| 2026-04-03 | EDGE 히어로 채택 | PnL 대신 전략 적합도 스코어를 히어로로. 경쟁사 차별화. Claude subagent 제안 |
| 2026-04-03 | 비대칭 레이아웃 65/35 | 좌측 오케스트레이션 + 우측 액션 큐. Codex 제안 |
| 2026-04-03 | Operator Queue (토스트 대신) | 승인/리스크를 상시 노출 큐로. 토스트는 놓친다. Codex + Claude subagent 수렴 |
| 2026-04-03 | 페이지 타이틀 20px, 히어로 28px | 기존 18px/24px에서 상향. 정보 위계 강화. Codex 제안 |
| 2026-04-03 | 6px 스페이싱 토큰 추가 | 고밀도 테이블용. 4/8 사이 갭 해결. Codex 제안 |
| 2026-04-03 | 컨테이너 radius 6px (기존 대비 축소) | Terminal Craft는 milled, not soft. Codex 제안 |
| 2026-04-03 | RESET 관련 요소 제거 | PRD에 정의되지 않은 기능. PRD 기준 준수 |
| 2026-04-03 | "트레이딩 대시보드" 명칭 확정 | "운영실 홈" 대신 사용자 지정 |
| 2026-04-03 | 비대칭 패딩 10/16/12 | 상/좌우/하 차등. 제네릭 대시보드와 차별화. Claude subagent 제안 |
| 2026-04-03 | Machine Log Voice | Decision Ledger의 append-only 모노 로그. 자체 UI 언어. Codex + Claude subagent 수렴 |
| 2026-04-03 | HeroStrip 순서 재정렬 | 승인대기→위험도→총자산→손익→시장적합도. 행동 필요한 것 먼저. |
| 2026-04-03 | 초보자 UX 계층 추가 | 한국어 섹션명, 승인 변경점 명시, DecisionLedger 한글 요약, 위험도 배지 |
| 2026-04-03 | EDGE → 시장 적합도 | 한국어 표기 변경. 20px 축소. 경쟁사 차별점은 유지하되 초보자 이해도 우선 |
| 2026-04-03 | AuthGuard 제거 | 1인 사용 단계. 모든 페이지 접근 자유. 멀티유저 시 재도입. |

## 초보자 UX 원칙

PRD 목표 사용자가 자동매매 초보이므로, 전문가 밀도와 초보자 이해 사이의 균형이 필요.

### 정보 우선순위 (초보자 기준)
1. **행동 필요한 것** — 승인 대기, 위험 경고 (가장 먼저)
2. **내 돈 상태** — 총 자산, 오늘 손익
3. **무엇이 배치되어 있는지** — 전략 배치 현황
4. **왜 그런 판단인지** — 판단 이유, 시장 적합도
5. **세부 데이터** — 머신 로그, 연구 현황

### 용어 계층
- **UI 표시:** 한국어 (전략 배치 현황, 확인 필요, 시스템 판단 기록, 시장 적합도)
- **내부/코드:** 영문 (DeploymentMatrix, OperatorQueue, DecisionLedger, EDGE)
- **전문 용어:** 첫 등장 시 한 줄 설명 필요 (MDD, 펀딩비, 볼린저 밴드 등)

### 승인 카드 필수 정보
1. 왜 요청됐는지 (전략명 + 자산 + 요청 유형)
2. 승인 시 무엇이 바뀌는지
3. 거부 시 무엇이 유지되는지
4. 만료 시간
5. 관련 리스크 수치 (해당 시)

### 빈 상태 원칙
- "데이터 없음"이 아닌 "아직 시작 전" 느낌
- 다음 액션 안내 포함
- 공포가 아닌 안내
