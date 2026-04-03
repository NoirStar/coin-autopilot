# TODOS

기준 문서는 `PRD/`, `PLAN.md`, `DESIGN.md`, `HANDOFF.md`.
이 파일은 현재 남은 실행 작업만 짧게 모아두는 보조 문서다.

## 현재 최우선

- [ ] 서버 오케스트레이션 API 엔드포인트 추가
  - 예: `/api/v2/orchestration/status`, `/api/v2/orchestration/slots`
  - 목적: 프론트 mock 데이터 제거의 전제

- [ ] 웹 스토어를 mock 기반에서 실제 API 호출 기반으로 전환
  - 대상: `orchestration-store`, `approval-store`, `research-store`
  - 목적: 대시보드 실데이터 연결

- [ ] EDGE 스코어 계산 로직 서버 구현
  - 정의 기준: `PLAN.md`의 초안
  - 목적: Hero Strip 시장 적합도 실값 반영

- [ ] 실시간 업데이트 연결
  - 옵션: polling 또는 WebSocket
  - 목적: System Strip, Queue, Ledger, Research 상태 실시간 반영

## 다음 작업

- [ ] 자산 상세 페이지 추가
- [ ] 접근성 보강
- [ ] `types/trading.ts` 정리 여부 결정
- [ ] 운영 API 계약과 프론트 타입 차이 점검

## 검증 / 운영 준비

- [ ] 프론트 주요 페이지 테스트 추가
- [ ] API 실패 및 복구 시나리오 테스트
- [ ] DB 인덱스 성능 검증
- [ ] 실전 전환 전 리스크/승인 파라미터 재확정

## 나중으로 이연

- [ ] 한국주식 브로커 확정
- [ ] 브로커/API 키 암호화 저장 정책 확정
- [ ] 멀티유저/로그인 재도입 범위 확정
- [ ] 공용 전략 성과 노출 범위 결정
