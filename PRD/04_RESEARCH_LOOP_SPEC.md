# 04 Research Loop Spec

## 1. 문서 목적

- 자동 백테스트 연구 루프가 무엇을 탐색하고, 어떤 기준으로 결과를 평가하며, 언제 전략 후보를 승격/폐기하는지 정의한다.
- 이 문서는 구현 지시용 PRD이며, 대화 과정은 남기지 않고 `합의된 정책`만 기록한다.

## 2. 한 줄 정의

- 연구 루프는 전략, 지표, 파라미터, 자산군 조합을 자동으로 탐색하고 검증 데이터를 축적하여, 오케스트레이터가 사용할 수 있는 `신뢰 가능한 전략 후보 집합`을 지속적으로 생성하는 시스템이다.

## 3. 범위

### 포함

- 전략 후보 생성
- 파라미터 탐색
- 자동 백테스트 실행
- 워크포워드 및 아웃오브샘플 검증
- 결과 랭킹
- 페이퍼 후보 승격 판단
- 전략 폐기 및 재탐색
- AI 기반 재분석/파라미터 제안

### 제외

- 실전 주문 실행 로직
- UI 상세 구성
- 사용자 인증 구조
- 브로커/거래소 API 상세 명세

## 4. 연구 루프의 역할

연구 루프는 단순히 "백테스트 버튼을 자동으로 눌러주는 기능"이 아니다.

- 전략별 가능한 탐색 범위를 정의한다.
- 자산군과 시장 구조에 맞는 전략 후보를 만든다.
- 파라미터를 자동으로 바꿔가며 백테스트를 수행한다.
- 과최적화 위험을 줄이기 위해 검증 구간을 분리한다.
- 통과한 결과만 `paper_candidate`로 올린다.
- 성과가 무너진 전략은 다시 연구 상태로 되돌린다.

## 5. 핵심 원칙

- 백테스트 없는 전략은 페이퍼 승격 금지
- 비용 반영 없는 성과는 신뢰하지 않음
- 기대값, 총수익, MDD를 승률보다 우선 평가
- 인샘플 성과보다 아웃오브샘플과 워크포워드 일관성을 중시
- 한 번 잘 나온 조합보다 반복적으로 견디는 조합을 우선
- 고빈도/호가 전략은 후순위로 두고, 중저빈도 전략부터 검증
- 연구 루프 결과는 오케스트레이터 입력으로만 쓰며, 자동 실전 배치로 직결하지 않음

## 6. V2 연구 대상 범위

### 6.1 1차 우선 전략군

#### BTC 선물

- `btc_ema_crossover`
- `btc_ema_dual_cross_atr`
- `btc_donchian_breakout_v2`
- `btc_tsmom_vol_scaled`
- `btc_funding_extreme_reversal`

#### Upbit 알트 현물

- `alt_mean_reversion` 개선판
- `alt_liquidity_ema_trend`
- `alt_cross_sectional_momentum`
- `alt_warning_risk_filter`

### 6.2 후순위 고급 전략군

#### BTC 선물

- `btc_liquidation_sniper`
- `btc_overnight_seasonality_max10`
- `btc_bollinger_squeeze_breakout`
- `btc_vwap_zscore_reversion`

#### Upbit 알트 현물

- `upbit_kst_0900_breakout`
- `upbit_kimchi_premium_regime_filter`
- `upbit_accumulation_volume_anomaly`
- `upbit_spoofing_iceberg_detector`
- `upbit_twap_vwap_execution`

### 6.3 한국주식

- V2에서는 구조만 준비하고, 실제 자동 연구 대상은 좁은 종목군과 전략군에서 시작한다.
- 초반에는 대형주, 거래대금 충분한 종목, 중저빈도 전략 위주로 제한한다.

## 7. 연구 입력 데이터

연구 루프는 [03_DATA_ARCHITECTURE.md](/root/work/coin-autopilot/PRD/03_DATA_ARCHITECTURE.md)의 데이터 계층을 기반으로 동작한다.

### 7.1 공통 입력

- OHLCV
- trade tick
- 변동성
- 거래량
- 유동성 지표
- warning/caution 상태

### 7.2 선물 특화 입력

- funding rate
- open interest
- long/short ratio
- premium index
- liquidation proxy

### 7.3 업비트 특화 입력

- 김치 프리미엄
- 역김치 프리미엄 상태
- warning/caution
- KRW 마켓 유동성

### 7.4 운영 입력

- 데이터 결측률
- 슬리피지 가정
- 수수료 모델
- 백테스트 실패 로그

## 8. 연구 단위

연구 루프는 아래 단위를 기준으로 실행한다.

### 8.1 Strategy Template

- 전략의 기본 논리
- 예:
  - EMA 크로스
  - 돈치안 돌파
  - 평균회귀
  - 크로스섹션 모멘텀

### 8.2 Parameter Set

- 전략 내 조정 가능한 수치 집합
- 예:
  - EMA fast / slow
  - RSI threshold
  - ATR multiplier
  - lookback period
  - rebalance frequency

### 8.3 Market Scope

- 적용 대상 자산군 또는 유니버스
- 예:
  - BTC only
  - BTC/ETH
  - Upbit alt top N
  - 대형주 basket

### 8.4 Research Run

- 하나의 전략 템플릿 + 하나의 파라미터 세트 + 하나의 시장 범위 + 하나의 검증 기간 조합

## 9. 연구 파이프라인

### 9.1 후보 생성

- 전략 레지스트리에서 연구 가능 전략을 불러온다.
- 자산군과 시장 범위에 맞지 않는 전략은 제외한다.
- 필요한 데이터가 없는 전략은 제외한다.

### 9.2 파라미터 탐색

- 전략별 허용 파라미터 범위를 기반으로 탐색 세트를 만든다.
- 초기에는 과도한 탐색보다 `제한된 합리적 범위`를 우선 사용한다.

### 9.3 백테스트 실행

- 수수료, 슬리피지, 펀딩비 등 현실 비용을 반영한다.
- 표준화된 데이터 기준으로 전략을 실행한다.

### 9.4 검증 실행

- 인샘플과 아웃오브샘플을 분리한다.
- 필요 시 워크포워드 검증을 수행한다.
- 고빈도 전략은 체결/호가 모델링 수준이 확보되기 전까지 후보 승격을 제한한다.

### 9.5 결과 점수화

- 기대값
- 총수익
- MDD
- 손익비
- 샤프 및 보정 지표
- 거래 수
- 비용 비중
- 검증 일관성

### 9.6 결과 저장

- 개별 run 결과
- 파라미터 세트
- 검증 구간별 결과
- 승격 여부
- 폐기 여부

### 9.7 승격 또는 폐기

- 기준 통과 시 `paper_candidate`
- 기준 미달 시 `rejected` 또는 `research_only`
- 애매한 경우 `needs_review`

## 10. 파라미터 탐색 정책

### 10.1 V2 기본 원칙

- 처음부터 무제한 탐색하지 않는다.
- 전략별로 `의미 있는 범위`만 탐색한다.
- 파라미터 공간이 커질수록 과최적화 위험이 커지므로, V2에서는 좁고 해석 가능한 범위를 우선한다.

### 10.2 탐색 순서

1. 제한된 그리드 탐색
2. 상위 후보에 대한 추가 세분화
3. 필요 시 AI가 재탐색 범위를 제안

### 10.3 탐색 대상 예시

- EMA fast / slow 조합
- RSI 상하단 임계값
- ATR 손절/트레일링 배수
- lookback length
- rebalance frequency
- volatility filter threshold
- warning filter on/off

### 10.4 V2에서 피할 것

- 소수점 단위까지 지나치게 세밀한 곡선 맞춤
- 데이터 구간 하나에만 맞춘 파라미터
- 설명 불가능한 파라미터 조합 대량 생성

## 11. 검증 체계

### 11.1 기본 검증 구조

- in-sample
- out-of-sample
- walk-forward

### 11.2 기본 원칙

- 인샘플 성과만 좋고 아웃오브샘플이 무너지면 통과시키지 않는다.
- 워크포워드에서 반복적으로 무너지는 전략은 페이퍼 후보로 올리지 않는다.
- 기대값이 음수면 승률이 높아도 통과시키지 않는다.

### 11.3 권장 고급 검증

- PBO 또는 유사 과최적화 검증
- DSR / PSR / 보정 샤프 계열 지표

## 12. 성과 평가 기준

### 12.1 우선순위

1. 비용 반영 후 기대값
2. 비용 반영 후 총수익
3. 최대 낙폭 MDD
4. 검증 구간 일관성
5. 거래 수와 재현성
6. 승률

### 12.2 기본 측정 항목

- total return
- CAGR
- max drawdown
- expected value per trade
- win rate
- profit factor
- Sharpe
- cost ratio
- number of trades
- average holding time

### 12.3 경고 항목

- 승률은 높지만 기대값이 낮음
- 총수익은 높지만 MDD 과도
- 거래 수가 너무 적어 통계 신뢰도 낮음
- 비용 비중이 과도하게 높음
- 특정 기간 성과에만 의존

## 13. 페이퍼 후보 승격 기준

연구 루프는 아래를 만족해야 `paper_candidate`로 올린다.

- 백테스트 완료
- 아웃오브샘플 또는 워크포워드 검증 포함
- 비용 반영 후 기대값이 양수
- 비용 반영 후 총수익이 양수
- 전략별 허용 MDD 이하
- 최소 표본 충족

### 최소 표본 기준

#### 저빈도 전략

- 최소 180일 백테스트
- 최소 30회 청산 완료 거래

#### 중빈도 전략

- 최소 90일 백테스트
- 최소 50회 청산 완료 거래

#### 고빈도 전략

- 최소 30일 고해상도 백테스트
- 최소 200회 청산 완료 거래

### 추가 조건

- 필요한 데이터 소스가 안정적으로 수집 가능해야 한다.
- 전략 설명과 메타데이터가 등록되어 있어야 한다.

## 14. 연구 결과 상태

- `research_only`
- `backtest_running`
- `backtest_completed`
- `validated_candidate`
- `paper_candidate`
- `needs_review`
- `rejected`
- `retired`

## 15. AI 개입 역할

AI는 연구 루프에서 상시 탐색 엔진이 아니라 `보조 분석자` 역할을 한다.

### 15.1 AI 개입 조건

- 상위 후보가 많아 비교 판단이 애매함
- 특정 전략군 성과가 갑자기 붕괴
- 파라미터 재탐색 범위를 좁힐 필요가 있음
- 기대값은 양수지만 MDD가 과도함
- 신규 시장 구조에 맞는 필터 조정 필요

### 15.2 AI가 할 수 있는 일

- 파라미터 탐색 범위 재제안
- 특정 전략군 제외 또는 우선순위 변경 제안
- 결과 요약과 해석
- 재탐색 필요 전략군 추천

### 15.3 AI가 하지 않는 일

- 실전 배치 자동 승인
- 백테스트 결과를 무시한 승격
- 근거 없는 전략 생성

## 16. 리소스 운용 원칙

- 연구 루프는 상시 모든 전략을 무제한으로 돌리지 않는다.
- 우선순위가 높은 전략군부터 순차적으로 실행한다.
- 데이터가 부족한 전략은 먼저 수집 상태를 점검한다.
- 실패한 run은 로그와 함께 재시도 정책을 가진다.
- 고비용 AI 호출은 이벤트 기반으로 제한한다.

### 16.1 초기 동시 실행 정책

- V2 초기 기본 동시 실행 작업 수는 `4~8개`로 둔다.
- 이 범위 안에서 서버 리소스, 데이터 수집 부하, 백테스트 실행 시간에 따라 조정한다.

### 이유

- 1~2개는 연구 속도가 너무 느리다.
- 반대로 너무 많은 동시 실행은 로컬 서버 환경에서 수집/연구/페이퍼 작업이 서로 간섭할 수 있다.
- `4~8개`는 V2 초기 환경에서 현실적인 중간값이다.

## 17. 저장 결과

연구 루프는 아래 정보를 저장해야 한다.

- strategy_id
- parameter_set_id
- market_scope
- timeframe
- in-sample result
- out-of-sample result
- walk-forward result
- expectation
- total return
- MDD
- cost assumptions
- trade count
- validation status
- promotion decision
- rejection reason
- ai_review_summary

## 18. 오케스트레이터와의 연결

- 오케스트레이터는 연구 루프 결과 중 `validated_candidate` 이상만 본다.
- `paper_candidate`는 오케스트레이터가 페이퍼 배치 대상으로 고려할 수 있다.
- `needs_review` 상태는 자동 배치 대상이 아니다.
- `rejected` 상태는 자동 후보군에서 제외한다.

## 19. 대시보드 노출 항목

- 현재 실행 중인 연구 작업 수
- 전략군별 진행 상황
- 최근 완료된 run
- 상위 후보 전략
- 승격 대기 전략
- 실패/재시도 작업
- AI 리뷰 필요 항목

## 20. V2 성공 기준

- 전략/지표/파라미터 탐색이 자동으로 수행된다.
- 비용 반영 백테스트와 검증 결과가 일관된 포맷으로 저장된다.
- 통과 전략만 `paper_candidate`로 승격된다.
- 과최적화 가능성이 큰 결과를 자동으로 경고할 수 있다.
- 오케스트레이터가 연구 루프 결과를 직접 읽어 전략 후보를 정렬할 수 있다.

## 21. V2 확정 방향

### 21.1 동시 실행 작업 수

- 초기 동시 실행 작업 수는 `4~8개`

### 21.2 고빈도 전략 연구 범위

- V2에서는 `후순위로 소량만 포함`
- 즉, 고빈도/호가 기반 전략은 구조와 데이터 파이프라인을 준비하되 핵심 연구 대상은 아니다.

### 21.3 한국주식 1차 전략군

- `추세추종 + 브레이크아웃`부터 시작한다.
- 평균회귀, 로테이션, 고급 이벤트 전략은 후순위로 둔다.

## 22. 오픈 질문

- 초기 동시 실행 작업 수를 몇 개까지 둘지
- 전략군별 기본 파라미터 범위를 어디까지 열지
- AI 재탐색 호출 횟수 제한을 어떻게 둘지
- 한국주식에서 첫 유니버스를 어떤 종목군으로 시작할지

## 23. 관련 문서

- 제품 비전: [01_PRODUCT_VISION.md](/root/work/coin-autopilot/PRD/01_PRODUCT_VISION.md)
- 오케스트레이터: [02_ORCHESTRATOR_SPEC.md](/root/work/coin-autopilot/PRD/02_ORCHESTRATOR_SPEC.md)
- 데이터 구조: [03_DATA_ARCHITECTURE.md](/root/work/coin-autopilot/PRD/03_DATA_ARCHITECTURE.md)
- 페이퍼트레이딩: [05_PAPER_TRADING_SPEC.md](/root/work/coin-autopilot/PRD/05_PAPER_TRADING_SPEC.md)
- 전략 리서치: [STRATEGY_RESEARCH.md](/root/work/coin-autopilot/PRD/STRATEGY_RESEARCH.md)
