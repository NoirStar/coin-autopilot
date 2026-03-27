# Design System — Coin Autopilot

## Product Context
- **What this is:** BTC 흐름 기반 알트코인 자동매매 플랫폼 (공개 시그널 페이지 + 개인 대시보드)
- **Who it's for:** 개인 트레이더 (한국 시장, 업비트/OKX)
- **Space/industry:** 암호화폐 트레이딩 툴 (TradingView, 3Commas, Bitget 등과 같은 카테고리)
- **Project type:** 트레이딩 대시보드 (데이터 밀도 높은 앱 UI)

## Aesthetic Direction
- **Direction:** Terminal Ink — Industrial/Utilitarian
- **Decoration level:** Minimal (장식 제로, 타이포그래피와 데이터가 모든 것을 함)
- **Mood:** Bloomberg Terminal의 현대화. 차갑고 깨끗하며 숫자가 또렷하게 읽히는 인터페이스. 트레이더가 신뢰할 수 있는 절제된 전문성.
- **Anti-patterns:** 글래스모피즘, 코스믹/스페이스 배경, 노이즈 오버레이, 보라색 그라데이션, 3-column 아이콘 그리드, 장식적 그림자/블러 전부 금지

## Typography
- **Display/Hero:** Geist 700 — 기하학적 산세리프, 날카롭고 현대적. 한글과 잘 어울림
- **Body:** Geist 400/500 — 가독성 우수, 작은 사이즈에서도 선명
- **UI/Labels:** Geist 600 11px uppercase, letter-spacing 0.08em
- **Data/Tables:** JetBrains Mono 400~600 (tabular-nums 필수) — 숫자 정렬, 코드 미학
- **Code:** JetBrains Mono
- **Loading:** Google Fonts CDN (`https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700`)
- **Scale:**
  - 2xs: 10px — 캡션, 타임스탬프
  - xs: 11px — UI 레이블, 배지
  - sm: 12px — 보조 텍스트, 테이블 헤더
  - base: 13px — 테이블 데이터, 본문
  - md: 14px — 본문, 설명
  - lg: 18px — 페이지 제목
  - xl: 24px — 큰 숫자 (KPI 카드)
  - 2xl: 32px — 히어로 숫자
  - hero: 48px — 랜딩 히어로 (사용 드뭄)

## Color
- **Approach:** Restrained — 컬러는 데이터 의미(수익/손실/경고)에만 사용. 장식적 색상 금지.
- **Dark mode only** (트레이딩 UI 표준)

### Neutrals (cool zinc 계열)
| Token | Hex | 용도 |
|-------|-----|------|
| `--background` | `#0a0a0c` | 페이지 배경 |
| `--surface` | `#111114` | 카드, 패널 |
| `--surface-hover` | `#18181b` | 카드 호버 |
| `--border` | `#27272a` | 주요 보더 |
| `--border-subtle` | `#1e1e22` | 미세 보더, 구분선 |
| `--text-primary` | `#e4e4e7` | 주요 텍스트 (opacity 트릭 금지) |
| `--text-secondary` | `#a1a1aa` | 보조 텍스트 |
| `--text-muted` | `#71717a` | 뮤트 텍스트, 레이블 |
| `--text-faint` | `#52525b` | placeholder, 비활성 |

### Semantic
| Token | Hex | 용도 |
|-------|-----|------|
| `--profit` | `#2dd4a8` | 수익, Risk-On, 긍정 |
| `--loss` | `#f87171` | 손실, Risk-Off, 부정 |
| `--warning` | `#fbbf24` | 경고 (MDD 초과 등) |
| `--info` | `#60a5fa` | 정보성 알림 |
| `--accent` | `#a78bfa` | 브랜드 액센트 (제한적 사용: 포커스 링, 선택 상태) |

### Semantic Background (8-digit hex alpha)
> **주의:** 이것은 CSS `opacity` 프로퍼티와 다름. 8-digit hex(`#RRGGBBAA`)로 정의된 고정 색상이며, 런타임 opacity 조작이 아님.
> `opacity: 0.3` 또는 `text-muted-foreground/30` 같은 Tailwind opacity modifier는 금지. 배경색은 아래 토큰만 사용.

| Token | Value | 용도 |
|-------|-------|------|
| `--profit-bg` | `#2dd4a812` | 수익 배지/알림 배경 |
| `--loss-bg` | `#f8717112` | 손실 배지/알림 배경 |
| `--warning-bg` | `#fbbf2410` | 경고 배경 |
| `--info-bg` | `#60a5fa10` | 정보 배경 |
| `--accent-bg` | `#a78bfa10` | 액센트 배경 |

## Spacing
- **Base unit:** 4px
- **Density:** Compact (트레이딩 UI는 정보 밀도가 생명)
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(12px) lg(16px) xl(20px) 2xl(24px) 3xl(32px) 4xl(48px) 5xl(64px)
- **카드 내부 패딩:** 16~20px
- **카드 간 간격:** 12px
- **섹션 간 간격:** 20~24px

## Layout
- **Approach:** Grid-disciplined (엄격한 정렬, 예측 가능한 구조)
- **Grid:** 1col(mobile) → 2col(sm:640px) → 4col(lg:1024px)
- **Max content width:** 1200px (대시보드), 896px (시그널 페이지)
- **Sidebar:** 240px 고정폭 (대시보드 레이아웃)
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

## Component Rules

### 카드
- `background: var(--surface)` + `border: 1px solid var(--border-subtle)`
- 호버: `background: var(--surface-hover)` + `border-color: var(--border)`
- glass-panel, cosmic-surface, backdrop-filter 사용 금지

### 텍스트
- opacity 트릭 금지. `text-muted-foreground/30` 같은 패턴 사용 금지
- 대신 실제 색상 토큰 사용: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-faint`
- 최저 가독성: `--text-faint` (#52525b) — 이보다 연한 텍스트 금지

### 데이터 테이블
- 헤더: 11px uppercase, letter-spacing 0.08em, `--text-muted` 색상
- 셀: 13px, JetBrains Mono (숫자), Geist (텍스트)
- 행 호버: `var(--surface)`
- 구분선: `1px solid var(--border-subtle)`

### 배지/상태
- 레짐 배지: pill shape (border-radius: full), 10% opacity 배경 + 시맨틱 색상 텍스트
- 매수/매도: 4px radius, 10% opacity 배경

### 빈 상태
- 중앙 정렬, dashed border (`1px dashed var(--border)`)
- 아이콘 + 주요 메시지 (13px, `--text-secondary`) + 보조 메시지 (11px, `--text-muted`)
- 이모지 금지. Lucide 아이콘 사용

### 아이콘
- Lucide React 전용 (이모지 사용 절대 금지)
- 사이즈: 3~3.5 (UI 인라인), 4 (카드 아이콘), 8 (빈 상태)

## Number Formatting
| 데이터 | 포맷 | 예시 |
|--------|------|------|
| KRW 가격 | `#,###원` (1만↑ `#.##만`, 1억↑ `#.##억`) | `1,380원`, `1.01억` |
| USD 가격 | `$#,###.##` | `$97,432.10` |
| 퍼센트 | `±#.##%` (부호 항상 표시) | `+3.42%`, `-1.23%` |
| z-score | `±#.##` (소수점 2자리) | `-1.23` |
| RSI | `##.#` (소수점 1자리) | `58.3` |

**색상:** 양수 → `--profit`, 음수 → `--loss`, 0 → `--text-secondary`. 모든 숫자는 JetBrains Mono + `tabular-nums` + 우측 정렬.

## CSS Migration Note
> **현재 `index.css`는 Cosmic Obsidian 테마(oklch, glass-panel, cosmic-surface, noise-overlay)를 포함.**
> DESIGN.md의 Terminal Ink 시스템으로 전환 필요. 마이그레이션 시:
> 1. oklch 색상 → hex 토큰으로 교체 (위 Neutrals/Semantic 테이블 참조)
> 2. `.glass-panel`, `.cosmic-surface`, `.cosmic-bg`, `.noise-overlay` 클래스 삭제
> 3. Outfit 폰트 → Geist 교체
> 4. `backdrop-filter` 사용 전면 제거

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-27 | Terminal Ink 디자인 시스템 생성 | Cosmic Obsidian(보라 글래스모피즘)에서 데이터 중심 미니멀 다크 UI로 전환. 숫자 가독성과 차별화가 핵심 동기. /design-consultation 기반. |
| 2026-03-27 | Geist 본문 폰트 채택 | Outfit 대체. 기하학적 산세리프로 작은 사이즈에서 선명하고 한글과 조화 좋음 |
| 2026-03-27 | opacity 트릭 금지 정책 | text-muted-foreground/30 등 패턴이 가독성을 심각하게 저해. 실제 색상 토큰만 사용 |
| 2026-03-27 | 장식적 요소 전면 제거 | glass-panel, cosmic-bg, noise-overlay, 그라데이션 배경 모두 제거. 데이터가 유일한 주인공 |
| 2026-03-28 | Semantic-bg 명확화 | 8-digit hex alpha는 CSS opacity 트릭이 아님을 명시. opacity modifier 금지 규칙과 혼동 방지 |
| 2026-03-28 | 숫자 포매팅 규칙 추가 | KRW/USD/퍼센트/z-score 등 전체 포매팅 통일 |
| 2026-03-28 | CSS 마이그레이션 노트 추가 | index.css Cosmic Obsidian → Terminal Ink 전환 방법 문서화 |
