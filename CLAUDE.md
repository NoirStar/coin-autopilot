# CLAUDE.md — Coin Autopilot 메인 가이드

> 프로젝트 루트 기준 작업 가이드. 제품 기준은 `PRD/`, `PLAN.md`, `DESIGN.md`, `HANDOFF.md`를 따른다.

## 프로젝트 개요

Coin Autopilot은 전략 추가 가능 구조를 전제로 한 자동매매 오케스트레이션 플랫폼이다.
핵심은 "어떤 전략을 언제 신뢰할지 자동으로 판단하는 시스템"이며, 연구 루프와 오케스트레이터가 중심이다.

현재 우선순위:

- 암호화폐 중심 운영 화면 완성
- 서버 orchestration API 연결
- mock 제거 및 실시간 반영

장기 확장:

- 한국주식
- 멀티유저/로그인 플랫폼화

## 응답 규칙

- 모든 응답은 한글
- 커밋 메시지, 주석, 문서도 기본적으로 한글
- 변수명, 함수명, 타입명은 영어

## 외부 요청 / 실행 제약

- 사용자 허락 없이 외부 API 호출, HTTP 요청, 웹훅 호출 금지
- 실제 거래소/브로커 연결 금지
- 네트워크 의존 검증 금지
- 코드 구현과 타입/빌드 확인까지 우선
- 외부 서비스 테스트가 필요하면 mock으로 대체

## 기술 스택

```text
Backend:   Node.js + Hono
Database:  Supabase PostgreSQL
Schedule:  node-cron
Frontend:  React + Vite + Tailwind CSS + Zustand
```

## 코드 원칙

- 컴포넌트는 함수형
- 전역 상태는 Zustand 우선
- 스타일은 Tailwind CSS와 토큰 기반
- 타입은 strict 유지, `any` 금지
- 에러 처리는 사용자 친화적 메시지 포함
- 테스트는 Vitest 기반

## 디자인 작업 규칙

UI 작업 전 `DESIGN.md`를 반드시 읽는다.

핵심 규칙:

- opacity 트릭 금지
- glass, cosmic, glow 계열 장식 금지
- 이모지 금지, Lucide 아이콘만 사용
- 한글 최소 12px 규칙 준수
- 액센트 컬러 사용 범위 제한
- 대시보드 정보구조는 `System Strip`, `Hero Strip`, `Deployment Matrix`, `Operator Queue`, `Decision Ledger` 중심

## 문서 우선순위

문서 간 충돌 시 아래 순서로 판단한다.

1. `PRD/`
2. `PLAN.md`
3. `DESIGN.md`
4. `HANDOFF.md`
5. 그 외 보조 문서

## 참고

- 현재 루트 기준으로 별도 하위 `CLAUDE.md`는 없다
- 낡은 문서가 보이면 삭제보다 현재 기준 문서에 맞게 갱신을 우선한다
