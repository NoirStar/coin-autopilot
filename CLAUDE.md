# CLAUDE.md — TechPulse 메인 가이드

> 이 파일은 프로젝트 전체의 메인 가이드. 각 디렉토리별 세부 가이드는 해당 디렉토리의 CLAUDE.md를 참조.

## 프로젝트 개요

BTC 흐름 기반 현물·선물 암호화폐 자동매매 플랫폼.

## 응답 규칙

- **모든 응답은 한글**로 작성
- 커밋 메시지, 주석, 문서 모두 한글
- 코드 변수명/함수명은 영어

## 보안 & 외부 요청 금지

- **사용자 허락없이 외부 API 호출, HTTP 요청, 웹훅 등 절대 금지** (작업 중 실행하지 않음)
- 코드는 작성만 하고, 실제 동작은 GitHub push 후 Vercel 배포에서만 실행
- API 키, 시크릿은 코드에 하드코딩 금지 — 환경변수(`process.env`)로만 참조
- 테스트 시 외부 서비스는 반드시 mock 처리

## 기술 스택

```
Backend:   Vercel Serverless Functions
Database:  Supabase (PostgreSQL)
Schedule:  Vercel Cron
Deploy:    Vercel
```

## 코드 원칙

- 컴포넌트: 함수형 + 화살표 함수
- 상태: Zustand (전역), React state (로컬)
- 스타일: Tailwind CSS 유틸리티 클래스 — CSS 파일 최소화
- 타입: strict mode, `any` 사용 금지
- 에러 처리: try-catch + 사용자 친화적 메시지
- 테스트: Vitest + React Testing Library

## gstack

- 모든 웹 브라우징은 `/browse` 스킬을 사용. `mcp__claude-in-chrome__*` 도구는 절대 사용 금지.
- 사용 가능한 스킬 목록:
  - `/office-hours` — 아이디어 브레인스토밍, YC 오피스아워
  - `/plan-ceo-review` — CEO/창업자 모드 플랜 리뷰
  - `/plan-eng-review` — 엔지니어링 매니저 모드 플랜 리뷰
  - `/plan-design-review` — 디자인 관점 플랜 리뷰
  - `/design-consultation` — 디자인 시스템 컨설팅
  - `/review` — PR 코드 리뷰
  - `/ship` — PR 생성 및 배포 워크플로우
  - `/land-and-deploy` — PR 머지 및 배포 검증
  - `/canary` — 배포 후 카나리 모니터링
  - `/benchmark` — 성능 벤치마크
  - `/browse` — 헤드리스 브라우저 QA/테스트
  - `/qa` — QA 테스트 + 버그 수정
  - `/qa-only` — QA 테스트 (리포트만)
  - `/design-review` — 비주얼 디자인 QA
  - `/setup-browser-cookies` — 브라우저 쿠키 임포트
  - `/setup-deploy` — 배포 설정 구성
  - `/retro` — 주간 엔지니어링 회고
  - `/investigate` — 체계적 디버깅/근본원인 분석
  - `/document-release` — 배포 후 문서 업데이트
  - `/codex` — OpenAI Codex 세컨드 오피니언
  - `/cso` — 보안 감사
  - `/autoplan` — 자동 리뷰 파이프라인
  - `/careful` — 위험 명령어 안전 가드
  - `/freeze` — 디렉토리 범위 편집 제한
  - `/guard` — 전체 안전 모드
  - `/unfreeze` — freeze 해제
  - `/gstack-upgrade` — gstack 업그레이드

## 서브 가이드 참조

| 경로 | 내용 |
|------|------|
| `src/CLAUDE.md` | 프론트엔드 컴포넌트, 서비스, 스토어 규칙 |
| `supabase/CLAUDE.md` | DB 스키마, RLS 정책, 마이그레이션 규칙 |
| `api/CLAUDE.md` | Serverless 함수, 크론 수집 로직 규칙 |
