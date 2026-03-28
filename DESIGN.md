# Design System — Coin Autopilot

## Product Context
- **What this is:** BTC 흐름 기반 자동매매 플랫폼 (OKX 선물 + 업비트 알트 탐지 + 공개 시그널 페이지)
- **Who it's for:** 한국 개인 트레이더 (업비트/OKX)
- **Space/industry:** 암호화폐 트레이딩 툴 (TradingView, Bybit, Bitget, 3Commas 등)
- **Project type:** 데이터 밀도 높은 트레이딩 대시보드 + 공개 시그널 페이지

## Aesthetic Direction
- **Direction:** Terminal Craft — Industrial/Utilitarian
- **Decoration level:** Minimal (타이포그래피와 데이터가 전부. 장식 제로.)
- **Mood:** 차갑고 정밀한 터미널 미학, 하지만 크림 골드 액센트로 '손으로 만든 도구'의 온기가 있다. 기업 제품이 아닌, 트레이더가 직접 만든 도구.
- **Reference sites:** TradingView (차트 UI), Bloomberg Terminal (정보 밀도), Coinbase (초보 친화 UX)
- **Anti-patterns:** 글래스모피즘, 코스믹/스페이스 배경, 노이즈 오버레이, 보라색 그라데이션, 3-column 아이콘 그리드, 장식적 그림자/블러, backdrop-filter 전부 금지

## Typography
- **Display/Hero:** Geist 700 — 기하학적 산세리프, 날카롭고 현대적
- **Body:** Geist 400/500 — 가독성 우수, 작은 사이즈에서도 선명
- **UI/Labels (영문):** Geist 600 12px uppercase, letter-spacing 0.08em
- **UI/Labels (한글):** Geist 600 12px, 일반 letter-spacing — 한글에 uppercase/letter-spacing 확대 금지
- **Data/Tables:** JetBrains Mono 400~600 (tabular-nums 필수) — 숫자 정렬, 코드 미학
- **Code:** JetBrains Mono
- **Loading:** Google Fonts CDN (`https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700`)
- **Scale:**
  - 2xs: 11px — 캡션, 타임스탬프 (최소 가독성 한계)
  - xs: 12px — UI 레이블, 배지
  - sm: 12px — 보조 텍스트, 테이블 헤더
  - base: 13px — 테이블 데이터, 본문
  - md: 14px — 본문, 설명
  - lg: 18px — 페이지 제목
  - xl: 24px — 큰 숫자 (KPI 카드)
  - 2xl: 32px — 히어로 숫자
  - hero: 48px — 랜딩 히어로 (사용 드뭄)

### 한글 타이포 규칙
- **최소 폰트 사이즈: 11px** — 10px 이하 한글 텍스트 전면 금지
- **uppercase + letter-spacing 확대는 영문 전용** (RESET, FLOW, PnL 등)
- 한글 레이블은 12px, 600 weight, 일반 letter-spacing 사용
- 한영 혼용 시 영문 부분만 uppercase 적용, 한글은 그대로

## Color
- **Approach:** Restrained — 컬러는 데이터 의미(수익/손실/경고)와 브랜드 시그널에만 사용. 장식적 색상 금지.
- **Dark mode only** (트레이딩 UI 표준)

### Neutrals (zinc 계열)
| Token | Hex | 용도 |
|-------|-----|------|
| `--background` | `#0A0A0B` | 페이지 배경 |
| `--surface` | `#111113` | 카드, 패널 |
| `--surface-hover` | `#18181B` | 카드 호버 |
| `--border` | `#27272A` | 주요 보더 |
| `--border-subtle` | `#1C1C1F` | 미세 보더, 구분선 |
| `--text-primary` | `#FAFAFA` | 주요 텍스트 (opacity 트��� 금지) |
| `--text-secondary` | `#A1A1AA` | 보조 텍스트 |
| `--text-muted` | `#71717A` | 뮤트 텍스트, 레이블 |
| `--text-faint` | `#52525B` | placeholder, 비활성 |

### Semantic
| Token | Hex | 용도 |
|-------|-----|------|
| `--profit` | `#4ADE80` | 수익, Risk-On, 긍정 |
| `--loss` | `#F87171` | 손실, Risk-Off, 부정 |
| `--warning` | `#FBBF24` | 경고 (MDD 초과 등) |
| `--info` | `#60A5FA` | 정보성 알림 |
| `--accent` | `#E8D5B0` | 크림 골드 — 브랜드 액센트 (제한적 사용) |

### 액센트 사용 규칙
`--accent` (#E8D5B0 크림 골드)는 **딱 3곳**에만 사용:
1. 활성 전략 상태 인디케이터 (작은 점)
2. 공개 시그널 페이지 히어로 숫자 (시장 레짐 등)
3. 로고/브랜드 마크 (헤더의 골드 닷)

버튼 배경색, 링크 색상, 일반 UI 요소에는 사용 금지. 이 컬러가 뜨면 "이것이 중요하다"는 신호.

### Semantic Background (8-digit hex alpha)
> **주의:** 이것은 CSS `opacity` 프로퍼티와 다름. 8-digit hex(`#RRGGBBAA`)로 정의된 고정 색상.
> `opacity: 0.3` 또는 `text-muted-foreground/30` 같은 Tailwind opacity modifier는 금지.

| Token | Value | 용도 |
|-------|-------|------|
| `--profit-bg` | `#4ADE8012` | 수익 배지/알림 배경 |
| `--loss-bg` | `#F8717112` | 손실 배지/알림 배경 |
| `--warning-bg` | `#FBBF2410` | 경고 배경 |
| `--info-bg` | `#60A5FA10` | ���보 배경 |
| `--accent-bg` | `#E8D5B010` | 액센트 배경 |

## Spacing
- **Base unit:** 4px
- **Density:** Compact (트레이딩 UI는 정보 밀도가 생명)
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(12px) lg(16px) xl(20px) 2xl(24px) 3xl(32px) 4xl(48px) 5xl(64px)
- **카드 내부 패딩:** 16~20px
- **카드 간 간격:** 12px
- **섹션 ��� 간격:** 20~24px

## Layout
- **Approach:** Grid-disciplined + 1px 격자선 구조 노출
- **Grid:** 1col(mobile) → 2col(sm:640px) → 4col(lg:1024px)
- **Max content width:** 1200px (대시보드), 896px (시그널 페이지)
- **Sidebar:** 240px 고정폭 (대시보드 레이아웃)
- **격자선 규칙:** 라운드 코너 카드 그리드 대신 border-b/border-r로 구조 노출 (Bloomberg 스타일). 데이터 테이블, 스탯 카드 행, 탐지 리스트에 적용.
- **모듈별 밴드:** 각 모듈이 고유한 영역 소유
  - OKX 선물: 넓은 차트 영역, 우측 커맨드 컬럼
  - 업비트 탐지: 밀도 높은 테이블, 빠른 스캔용 compact 행
  - 공개 시그널: 여백 15-20% 넓히고, 가독성 우선
- **Border radius:**
  - sm: 4px — 배지, 인라인 요소
  - md: 6px — 카드, 인풋, 버튼 (기본값)
  - lg: 8px — 모달, 큰 컨테이너
  - full: 9999px — 레짐 배지, 상태 표시기

## Motion
- **Approach:** Minimal-functional (이해를 돕는 트랜지션만)
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:**
  - micro: 100ms — 호버, 포커스
  - short: 150ms — 버튼 상태, 토글
  - medium: 200ms — 패널 열기/닫기
  - long: 300ms — 페이지 전환 (사용 드뭄)
- **금지:** 스크롤 애니메이션, 파티클, 펄스 글로우, 장식적 모션
- **허용:** 틱 움직임, 스캔 스위프, 로그 업데이트, 카운트다운 압박 등 기능적 모션

## Signature Elements

### 9시 리셋 카운트다운
- 업비트 일봉 KST 09:00 기준. 제품 정의 UI 오브젝트.
- 항상 헤더에 표시. JetBrains Mono, warning 색상.
- 포맷: `RESET 04:32:17`

### 골드 닷 브랜드마크
- 헤더 좌측 "Coin Autopilot" 텍스트 옆 8px 원형 `--accent` 색상 닷.
- 활성 전략이 동작 중일 때만 표시 (비활성 시 숨김 또는 `--text-faint`).

## Component Rules

### 카드
- `background: var(--surface)` + `border: 1px solid var(--border-subtle)`
- 호버: `background: var(--surface-hover)` + `border-color: var(--border)`
- glass-panel, cosmic-surface, backdrop-filter 사용 금지

### 텍스트
- opacity 트릭 금지. `text-muted-foreground/30` 같은 패턴 사용 금지
- 실제 색상 토큰 사용: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-faint`
- 최저 가독성: `--text-faint` (#52525B) — 이보다 연한 텍스트 금지
- 최소 폰트 사이즈: 11px — 10px 이하 금지

### 데이터 테이블
- 헤더 (영문): 12px uppercase, letter-spacing 0.08em, `--text-muted` 색상
- 헤더 (한글): 12px, 600 weight, 일반 letter-spacing, `--text-muted` 색상
- 셀: 13px, JetBrains Mono (숫자), Geist (텍스트)
- 행 호버: `var(--surface)`
- 구분선: `1px solid var(--border-subtle)`

### 배지/상태
- 레짐 배지: pill shape (border-radius: full), semantic-bg 배경 + 시맨틱 색상 텍스트
- 매수/매도: 4px radius, semantic-bg 배경

### 빈 상태
- 중앙 정렬, dashed border (`1px dashed var(--border)`)
- 아이콘 + 주요 메시지 (13px, `--text-secondary`) + 보조 메시�� (12px, `--text-muted`)
- 이모지 금지. Lucide 아이콘 사용

### 아이콘
- Lucide React 전용 (이모지 사용 절대 금지)
- 사이즈: 3~3.5 (UI 인라인), 4 (카드 아이콘), 8 (빈 상태)

## Number Formatting
| 데이터 | 포맷 | 예시 |
|--------|------|------|
| KRW 가격 | `#,###원` (1만 이상 `#.##만`, 1억 이상 `#.##억`) | `1,380원`, `1.01억` |
| USD 가격 | `$#,###.##` | `$97,432.10` |
| 퍼센트 | `+-#.##%` (부호 항상 표시) | `+3.42%`, `-1.23%` |
| z-score | `+-#.##` (소수점 2자리) | `-1.23` |
| RSI | `##.#` (소수점 1자리) | `58.3` |

**색상:** 양수 → `--profit`, 음수 → `--loss`, 0 → `--text-secondary`. 모든 숫자는 JetBrains Mono + `tabular-nums` + 우측 정렬.

## CSS Migration Note
> **현재 `index.css`는 이전 테마(oklch, glass-panel, cosmic-surface, noise-overlay)를 포함할 수 있음.**
> Terminal Craft 시스템으로 전환 시:
> 1. oklch 색상 → hex 토큰으로 교체 (위 Neutrals/Semantic 테이블 참조)
> 2. `.glass-panel`, `.cosmic-surface`, `.cosmic-bg`, `.noise-overlay` 클래스 삭���
> 3. 이전 폰트 → Geist + JetBrains Mono 교체
> 4. `backdrop-filter` 사용 전면 제거

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-28 | Terminal Craft v2 디자인 시스템 생성 | /design-consultation 리서치 + Codex + Claude subagent 3자 합의. zinc + 크림 골드 방향 확정. |
| 2026-03-28 | 크림 골드 액센트 (#E8D5B0) 채택 | 트레이딩 카테고리에서 골드를 쓰는 플랫폼이 거의 없음. 3곳 제한 사용으로 브랜드 시그널. |
| 2026-03-28 | 1px 격자선 레이아웃 채택 | 라운드 코너 카드 그리드 대신 Bloomberg 스타일 구조 노출. 데이터 테이블/리스트에 적용. |
| 2026-03-28 | profit 색상 #4ADE80으로 변경 | 이전 #2dd4a8(틸 톤)에서 선명한 그린으로. 형광기 없이 가독성 확보. |
| 2026-03-28 | 최소 폰트 11px, 한글 타이포 규칙 추가 | 한글은 획이 많아 10px에서 가독성 급락. uppercase/letter-spacing 확대는 영문 전용으로 제한. |
| 2026-03-28 | 9시 리셋 카운트다운 시그니처 요소 | 업비트 9시 리셋이 제품 차별화 핵심. 헤더 상시 표시. |
| 2026-03-28 | 액센트 3곳 제한 규칙 | 액센트 남용 방지. 전략 인디케이터, 시그널 히어로, 브랜드마크만. |
