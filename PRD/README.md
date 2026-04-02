# PRD

## 목적

이 폴더는 `coin-autopilot`의 제품 요구사항 문서(PRD)와 기능 명세서를 모아두는 공간이다.

- 제품 방향
- 기능 명세
- 데이터 구조
- 오케스트레이터 규칙
- 백테스트/페이퍼트레이딩 규칙
- UI 정보구조
- 리스크 관리

이후 상세 논의는 가능한 한 이 폴더 안에서 문서별로 분리해서 관리한다.

## 문서 원칙

- 한 문서에 모든 내용을 몰아넣지 않는다.
- `주제별 문서`로 나눈다.
- 구현 전에 `목적`, `입력`, `출력`, `예외`, `성공 기준`까지 적는다.
- 전략 리서치 문서와 실제 제품 명세 문서는 구분한다.

## 추천 문서 구조

1. `01_PRODUCT_VISION.md`
2. `02_ORCHESTRATOR_SPEC.md`
3. `03_DATA_ARCHITECTURE.md`
4. `04_RESEARCH_LOOP_SPEC.md`
5. `05_PAPER_TRADING_SPEC.md`
6. `06_RISK_MANAGEMENT_SPEC.md`
7. `07_DASHBOARD_SPEC.md`
8. `08_ALERTS_AND_NOTIFICATIONS.md`
9. `09_KOREAN_STOCK_SPEC.md`
10. `10_EXECUTION_ENGINE_SPEC.md`
11. `11_USER_PLATFORM_SPEC.md`
12. `12_SCHEMA_AND_API_CONTRACT.md`
13. `13_IMPLEMENTATION_ROADMAP.md`

## 현재 참조 문서

- 제품 방향 초안: [FEATURE_SPEC_V2.md](/root/work/coin-autopilot/PRD/FEATURE_SPEC_V2.md)
- 전략 리서치 문서: [STRATEGY_RESEARCH.md](/root/work/coin-autopilot/PRD/STRATEGY_RESEARCH.md)
- 현재 구현 분석: [CURRENT_IMPLEMENTATION_AUDIT.md](/root/work/coin-autopilot/PRD/CURRENT_IMPLEMENTATION_AUDIT.md)

## 구현 Handoff 읽기 순서

1. [01_PRODUCT_VISION.md](/root/work/coin-autopilot/PRD/01_PRODUCT_VISION.md)
2. [02_ORCHESTRATOR_SPEC.md](/root/work/coin-autopilot/PRD/02_ORCHESTRATOR_SPEC.md)
3. [03_DATA_ARCHITECTURE.md](/root/work/coin-autopilot/PRD/03_DATA_ARCHITECTURE.md)
4. [04_RESEARCH_LOOP_SPEC.md](/root/work/coin-autopilot/PRD/04_RESEARCH_LOOP_SPEC.md)
5. [05_PAPER_TRADING_SPEC.md](/root/work/coin-autopilot/PRD/05_PAPER_TRADING_SPEC.md)
6. [06_RISK_MANAGEMENT_SPEC.md](/root/work/coin-autopilot/PRD/06_RISK_MANAGEMENT_SPEC.md)
7. [10_EXECUTION_ENGINE_SPEC.md](/root/work/coin-autopilot/PRD/10_EXECUTION_ENGINE_SPEC.md)
8. [12_SCHEMA_AND_API_CONTRACT.md](/root/work/coin-autopilot/PRD/12_SCHEMA_AND_API_CONTRACT.md)
9. [13_IMPLEMENTATION_ROADMAP.md](/root/work/coin-autopilot/PRD/13_IMPLEMENTATION_ROADMAP.md)

## 작성 방식

새 문서를 만들 때는 [FEATURE_TEMPLATE.md](/root/work/coin-autopilot/PRD/FEATURE_TEMPLATE.md) 템플릿을 복사해서 시작한다.

## 현재 문서 구성

### 제품 방향

- [01_PRODUCT_VISION.md](/root/work/coin-autopilot/PRD/01_PRODUCT_VISION.md)
- [FEATURE_SPEC_V2.md](/root/work/coin-autopilot/PRD/FEATURE_SPEC_V2.md)

### 전략 / 연구

- [STRATEGY_RESEARCH.md](/root/work/coin-autopilot/PRD/STRATEGY_RESEARCH.md)
- [04_RESEARCH_LOOP_SPEC.md](/root/work/coin-autopilot/PRD/04_RESEARCH_LOOP_SPEC.md)

### 엔진 / 운영

- [02_ORCHESTRATOR_SPEC.md](/root/work/coin-autopilot/PRD/02_ORCHESTRATOR_SPEC.md)
- [05_PAPER_TRADING_SPEC.md](/root/work/coin-autopilot/PRD/05_PAPER_TRADING_SPEC.md)
- [06_RISK_MANAGEMENT_SPEC.md](/root/work/coin-autopilot/PRD/06_RISK_MANAGEMENT_SPEC.md)
- [10_EXECUTION_ENGINE_SPEC.md](/root/work/coin-autopilot/PRD/10_EXECUTION_ENGINE_SPEC.md)

### 데이터 / 계약

- [03_DATA_ARCHITECTURE.md](/root/work/coin-autopilot/PRD/03_DATA_ARCHITECTURE.md)
- [12_SCHEMA_AND_API_CONTRACT.md](/root/work/coin-autopilot/PRD/12_SCHEMA_AND_API_CONTRACT.md)

### UI / 사용자

- [07_DASHBOARD_SPEC.md](/root/work/coin-autopilot/PRD/07_DASHBOARD_SPEC.md)
- [08_ALERTS_AND_NOTIFICATIONS.md](/root/work/coin-autopilot/PRD/08_ALERTS_AND_NOTIFICATIONS.md)
- [09_KOREAN_STOCK_SPEC.md](/root/work/coin-autopilot/PRD/09_KOREAN_STOCK_SPEC.md)
- [11_USER_PLATFORM_SPEC.md](/root/work/coin-autopilot/PRD/11_USER_PLATFORM_SPEC.md)

### 로드맵 / 참고

- [13_IMPLEMENTATION_ROADMAP.md](/root/work/coin-autopilot/PRD/13_IMPLEMENTATION_ROADMAP.md)
- [CURRENT_IMPLEMENTATION_AUDIT.md](/root/work/coin-autopilot/PRD/CURRENT_IMPLEMENTATION_AUDIT.md)

- [CURRENT_IMPLEMENTATION_AUDIT.md](/root/work/coin-autopilot/PRD/CURRENT_IMPLEMENTATION_AUDIT.md): 현재 코드 구현 분석
- [FEATURE_SPEC_V2.md](/root/work/coin-autopilot/PRD/FEATURE_SPEC_V2.md): 대화 기반 제품/기능 초안
- [STRATEGY_RESEARCH.md](/root/work/coin-autopilot/PRD/STRATEGY_RESEARCH.md): 전략 리서치 누적 문서
- [01_PRODUCT_VISION.md](/root/work/coin-autopilot/PRD/01_PRODUCT_VISION.md): 정리된 제품 비전 문서
- [11_USER_PLATFORM_SPEC.md](/root/work/coin-autopilot/PRD/11_USER_PLATFORM_SPEC.md): 장기 멀티유저/로그인/전략 선택 플랫폼 명세
- [12_SCHEMA_AND_API_CONTRACT.md](/root/work/coin-autopilot/PRD/12_SCHEMA_AND_API_CONTRACT.md): 구현 계약 문서
- [13_IMPLEMENTATION_ROADMAP.md](/root/work/coin-autopilot/PRD/13_IMPLEMENTATION_ROADMAP.md): 구현 순서/마일스톤 문서

## 현재 결론

- 이 PRD 묶음은 `고정 전략 앱`이 아니라 `전략 추가 가능 구조`를 전제로 한다.
- 전략은 메타데이터와 검증 경로만 맞추면 연구 루프에 편입할 수 있다.
- 연구 루프 결과에 따라 파라미터와 우선순위가 계속 조정될 수 있다.
- 초기 V2는 `백테스트 -> 페이퍼트레이딩 -> 승인 기반 운용` 흐름이 중심이다.
- 실전 자동매매는 구조를 준비하되, V2 핵심 범위는 아니다.

## 남은 오픈 질문

구현 막힘 가능성이 있는 주요 오픈 질문만 추렸다.

- 첫 한국주식 브로커를 어느 증권사로 확정할지
- 브로커/API 키 암호화 저장 정책을 어떻게 둘지
- 실행 엔진의 승인 만료 시간, 재호가 횟수, 재검증 유효 시간
- 공용 전략 성과를 사용자에게 어디까지 노출할지
- 초기 로그인 방식을 이메일 기반으로만 갈지
