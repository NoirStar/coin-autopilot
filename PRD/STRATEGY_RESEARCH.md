# Strategy Research

## 목적

이 문서는 `coin-autopilot`에서 사용하는 전략 정보를 한곳에 모으는 전략 라이브러리다.

- 현재 코드베이스에 이미 구현된 전략
- 외부 리서치로 검토 중인 전략
- 향후 자동 연구 루프에서 탐색할 전략 후보
- 자산군별 전략 적용 범위와 구현 난이도
- 추가로 들어오는 전략 조사 데이터를 누적 기록

기존 구현 현황 분석은 [CURRENT_IMPLEMENTATION_AUDIT.md](/root/work/coin-autopilot/PRD/CURRENT_IMPLEMENTATION_AUDIT.md)를 참고하고, 제품 방향은 [FEATURE_SPEC_V2.md](/root/work/coin-autopilot/PRD/FEATURE_SPEC_V2.md)를 기준으로 본 문서를 계속 확장한다.

## 상태 태그

- `legacy_implemented`: 기존 프로젝트에 이미 구현되어 있음
- `research_candidate`: 리서치로 확보했지만 아직 구현되지 않음
- `paper_first`: 우선 페이퍼트레이딩부터 검증 권장
- `needs_market_data`: 체결/호가/파생 데이터 등 추가 수집이 필요함
- `high_risk`: 비용, 슬리피지, 상장폐지, 청산 위험이 큼
- `orchestration_signal`: 오케스트레이터의 판단 입력으로도 사용 가능

## 1. 기존 프로젝트 구현 전략

아래는 현재 코드베이스에서 확인된 전략들이다.

| strategy_id | 이름 | 자산군 | 거래소 | 방향 | 상태 | 메모 |
|---|---|---|---|---|---|---|
| `alt_mean_reversion` | Alt Mean Reversion | 암호화폐 알트 현물 | Upbit | Long only | `legacy_implemented` | 기존 업비트 알트 전략. V2에서는 유동성/경보 필터 결합 필요 |
| `btc_ema_crossover` | BTC EMA Crossover | BTC 선물 | OKX | Long/Short | `legacy_implemented` | 4H 기반 EMA 추세 전략 |
| `btc_bollinger_reversion` | BTC Bollinger Reversion | BTC 선물 | OKX | Long/Short | `legacy_implemented` | 평균회귀 성격 |
| `btc_macd_momentum` | BTC MACD Momentum | BTC 선물 | OKX | Long/Short | `legacy_implemented` | 1H 모멘텀 전략 |
| `btc_donchian_breakout` | BTC Donchian Breakout | BTC 선물 | OKX | Long/Short | `legacy_implemented` | 추세 돌파형 |
| `alt_detection` | Alt Detection Strategy | 암호화폐 알트 스캔 | Upbit | 탐지 | `legacy_implemented` | 직접 매매 전략보다 탐지 엔진 성격이 강함 |
| `btc_regime_filter` | BTC Regime Filter | 시장 필터 | BTC | 필터 | `legacy_implemented`, `orchestration_signal` | 기존 앱의 핵심 시장 상태 판별기 |

## 2. 기존 전략의 V2 해석

현재 구현 전략을 V2 관점에서 다시 보면 다음과 같다.

| 기존 전략 | V2에서의 역할 | 비고 |
|---|---|---|
| `btc_ema_crossover` | 선물 추세 후보 전략 | 유지 가치 높음 |
| `btc_donchian_breakout` | 선물 추세 후보 전략 | 유지 가치 높음 |
| `btc_macd_momentum` | 선물 모멘텀 후보 전략 | 재검증 필요 |
| `btc_bollinger_reversion` | 선물 평균회귀 후보 전략 | 국면 제한 필요 |
| `alt_mean_reversion` | 알트 눌림/평균회귀 계열의 출발점 | 유동성/경보 필터 결합 필요 |
| `alt_detection` | 오케스트레이터 입력용 탐지 모듈 | 직접 매매보다 관측/랭킹 엔진 쪽으로 재정의 필요 |
| `btc_regime_filter` | 단일 BTC 레짐 필터 | V2에서는 멀티자산 시장 구조 엔진으로 확장 필요 |

## 3. 리서치 입력 001

출처: 사용자 제공 리서치

주제:

- BTC 선물 자동매매 전략
- 업비트 알트 현물 자동매매 전략
- 백테스트/페이퍼트레이딩 설계
- 파생 데이터, 운영 리스크, 한국시장 특화 신호

### 3.1 BTC 선물 전략 후보

| 전략 키 | 전략명 | 분류 | 상태 | 우선순위 | 메모 |
|---|---|---|---|---|---|
| `btc_ema_dual_cross_atr` | EMA 듀얼크로스 + ATR 트레일 | 추세추종 | `research_candidate`, `paper_first` | 1 | 기존 `btc_ema_crossover`의 확장형으로 흡수 가능 |
| `btc_donchian_breakout_v2` | Donchian 돌파 + 변동성 필터 | 추세추종 | `research_candidate`, `paper_first` | 2 | 기존 `btc_donchian_breakout`과 연결 가능 |
| `btc_tsmom_vol_scaled` | TSMOM + 변동성 스케일링 | 중기 모멘텀 | `research_candidate`, `paper_first` | 3 | 자동 연구 루프에서 매우 유력 |
| `btc_funding_extreme_reversal` | 펀딩 극단 컨트라리언 | 파생 특화 평균회귀 | `research_candidate`, `paper_first`, `needs_market_data`, `orchestration_signal` | 4 | 펀딩, 프리미엄 인덱스 필요 |
| `btc_bollinger_squeeze_breakout` | 볼린저 스퀴즈 돌파 | 변동성 돌파 | `research_candidate`, `paper_first` | 5 | 비용 민감 |
| `btc_vwap_zscore_reversion` | VWAP/Z-score 평균회귀 | 단기 평균회귀 | `research_candidate`, `paper_first`, `needs_market_data`, `high_risk` | 6 | 체결/VWAP 기반 |
| `btc_kst_0900_event` | 09:00 KST 이벤트 전략 | 이벤트 드리븐 | `research_candidate`, `paper_first`, `needs_market_data` | 7 | 이벤트 스터디 선행 필요 |
| `btc_orderbook_obi_ofi_scalping` | OBI/OFI 스캘핑 | 호가 기반 초단기 | `research_candidate`, `needs_market_data`, `high_risk` | 8 | 가장 마지막 단계 |

### 3.2 업비트 알트 현물 전략 후보

| 전략 키 | 전략명 | 분류 | 상태 | 우선순위 | 메모 |
|---|---|---|---|---|---|
| `alt_liquidity_ema_trend` | 유동성 필터 + EMA 추세추종 | 롱 온리 추세 | `research_candidate`, `paper_first` | 1 | V2 알트 1순위 후보 |
| `alt_cross_sectional_momentum` | 크로스섹션 모멘텀 로테이션 | 상대강도 | `research_candidate`, `paper_first`, `orchestration_signal` | 2 | 자산별 전략 배치와 잘 맞음 |
| `alt_trend_pullback` | 추세 내 눌림매수 | 추세 속 평균회귀 | `research_candidate`, `paper_first` | 3 | 기존 `alt_mean_reversion` 확장 방향 |
| `alt_warning_risk_filter` | 경보/유의 기반 회피 로직 | 리스크 필터 | `research_candidate`, `paper_first`, `orchestration_signal` | 4 | 업비트 특화 핵심 |
| `alt_volatility_breakout` | 변동성 돌파 + 거래대금 필터 | 브레이크아웃 | `research_candidate`, `paper_first`, `high_risk` | 5 | 급등/휩쏘 주의 |
| `alt_orderbook_microstructure` | 호가잔량 기반 단기 매매 | 호가 기반 초단기 | `research_candidate`, `needs_market_data`, `high_risk` | 6 | 실시간 데이터 축적 후 검토 |
| `alt_delisting_event_response` | 거래지원 종료/유의 이벤트 대응 | 운영 리스크 관리 | `research_candidate`, `paper_first`, `orchestration_signal` | 7 | 직접 수익보다 생존 전략 |
| `alt_krw_orderbook_liquidity_filter` | KRW 호가 깊이 기반 유동성 체크 | 비용/리스크 필터 | `research_candidate`, `paper_first`, `orchestration_signal` | 8 | 업비트 KRW 특화 |

## 4. 리서치 입력 002

출처: 사용자 제공 장문 심층 보고서

주제:

- 암호화폐 시장 미시구조 기반 퀀트 자동매매
- BTC 선물의 양방향 고급 전략
- 업비트 알트 현물의 한국 시장 특화 전략
- 백테스트 함정, 페이퍼트레이딩, 리스크 관리 프레임워크

### 4.1 핵심 시사점

- BTC 선물과 업비트 알트 현물은 같은 암호화폐라도 완전히 다른 시장으로 취급해야 한다.
- BTC 선물은 가격 예측 자체보다 `청산`, `펀딩`, `미결제약정`, `기관 자금 시간대`, `레버리지 리스크`를 함께 다뤄야 한다.
- 업비트 알트는 추세 지표만으로는 부족하고 `9시 초기화`, `김치 프리미엄`, `세력 매집`, `스푸핑`, `개인투자자 심리` 같은 한국 시장 특화 신호가 중요하다.
- 백테스트는 전략 가능성을 거르는 1차 필터일 뿐이며, 실제 배치 전에는 실시간 페이퍼트레이딩과 전진 분석이 필수다.
- 리스크 관리 모듈은 전략 부가 기능이 아니라 시스템의 핵심 엔진으로 다뤄야 한다.

### 4.2 BTC 선물 고급 전략 후보

| 전략 키 | 전략명 | 분류 | 상태 | 우선순위 | 메모 |
|---|---|---|---|---|---|
| `btc_multiframe_indicator_fusion` | 다중 지표 추세/평균회귀 융합 | 추세+모멘텀+변동성 | `research_candidate`, `paper_first` | 중 | EMA, RSI, MACD, Bollinger를 다층 필터로 결합 |
| `btc_liquidation_sniper` | 청산 맵 기반 스퀴즈 스나이퍼 | 청산 이벤트 드리븐 | `research_candidate`, `needs_market_data`, `high_risk`, `orchestration_signal` | 중상 | 강제 청산 집중 구간 반등/되돌림을 공략 |
| `btc_funding_delta_neutral_arb` | 펀딩비 차익거래 델타 뉴트럴 | 차익거래 | `research_candidate`, `needs_market_data`, `paper_first` | 중상 | 현물 롱 + 선물 숏 또는 거래소 간 차익 구조 |
| `btc_cross_exchange_funding_arb` | 거래소 간 펀딩 스프레드 차익 | 차익거래 | `research_candidate`, `needs_market_data`, `high_risk` | 하 | 다중 거래소 인프라와 잔고 관리 필요 |
| `btc_overnight_seasonality_max10` | 오버나이트 계절성 MAX(10) | 시간대 계절성 | `research_candidate`, `paper_first`, `orchestration_signal` | 중 | 기관화 이후 야간 세션 수익률 편향 가설 |
| `btc_weekend_gap_regime` | 주말 갭/요일 효과 전략 | 시간대 계절성 | `research_candidate`, `paper_first`, `orchestration_signal` | 하중 | 주말 효과와 요일 효과를 레짐 신호로 활용 |

### 4.3 업비트 알트 현물 특화 전략 후보

| 전략 키 | 전략명 | 분류 | 상태 | 우선순위 | 메모 |
|---|---|---|---|---|---|
| `upbit_kst_0900_breakout` | 오전 9시 초기화 변동성 돌파 | 이벤트 드리븐 스캘핑 | `research_candidate`, `paper_first`, `needs_market_data`, `high_risk` | 중상 | 업비트 특화 대표 전략 후보 |
| `upbit_kimchi_premium_regime_filter` | 김프/역김프 레짐 필터 | 거시 심리 필터 | `research_candidate`, `paper_first`, `orchestration_signal` | 중 | 직접 매매보다 전략 on/off 판단에 유용 |
| `upbit_accumulation_volume_anomaly` | 가격 정체 구간 거래량 이상 탐지 | 세력 매집 탐지 | `research_candidate`, `paper_first`, `orchestration_signal` | 중 | 가격 상승 없는 거래량 폭증을 관찰 |
| `upbit_spoofing_iceberg_detector` | 스푸핑/아이스버그 탐지 | 오더북 미시구조 | `research_candidate`, `needs_market_data`, `high_risk`, `orchestration_signal` | 하중 | 호가 보충 패턴과 체결 괴리 분석 필요 |
| `upbit_spot_grid` | 현물 그리드 트레이딩 | 박스권 수익화 | `research_candidate`, `paper_first` | 중 | 횡보장에서 유효하나 하방 이탈 위험 큼 |
| `upbit_smart_dca` | 스마트 DCA | 장기 누적 매수 | `research_candidate`, `paper_first` | 중 | RSI, 시장 구조와 결합한 분할매수 |
| `upbit_spot_mean_reversion_range` | 현물 평균회귀 박스권 전략 | 박스권 평균회귀 | `research_candidate`, `paper_first` | 중 | 횡보 자산에만 선택 적용 필요 |
| `upbit_twap_vwap_execution` | TWAP/VWAP 집행 알고리즘 | 실행 엔진 | `research_candidate`, `needs_market_data`, `orchestration_signal` | 중 | 전략 자체보다 체결 품질 개선 모듈 |

### 4.4 검증 및 운영 원칙

이번 리서치에서 추가로 중요한 원칙은 아래와 같다.

- 백테스트는 1차 필터이며 결과를 그대로 신뢰하면 안 된다.
- 과최적화 방지를 위해 전략 논리와 파라미터 탐색 범위를 분리해야 한다.
- 실시간 페이퍼트레이딩과 전진 분석을 최소 수 주 이상 수행해야 한다.
- 초단타 전략은 `레이턴시`, `부분 체결`, `API Rate Limit`, `호가 공백`을 반드시 반영해야 한다.
- 최대 낙폭, 샤프 지수, 포지션 사이징, 서킷 브레이커는 전략별 공통 리스크 규칙으로 설계해야 한다.

### 4.5 포트폴리오 아키텍처 아이디어

장기적으로는 아래와 같은 하이브리드 구조도 연구 가치가 있다.

- BTC 선물의 상대적으로 구조화된 전략에서 기본 현금흐름 확보
- 업비트 알트 현물의 고위험 이벤트 전략에는 제한된 자본만 배정
- 오케스트레이터가 자산군별로 전략 성격과 위험도를 다르게 관리

## 5. 오케스트레이터 입력 신호 후보

아래 신호들은 단일 전략 자체라기보다 오케스트레이터가 자산별 전략을 배치하거나 교체할 때 참고하는 입력값으로 본다.

### 5.1 공통 시장 구조 신호

- 가격 추세
- 거래량 변화
- 변동성 수준
- 전략별 최근 성과 악화 여부
- 전략별 승률, 손익비, MDD
- 자산별 유동성 수준

### 5.2 암호화폐 파생 특화 신호

- 롱/숏 비율
- Open Interest
- 펀딩비
- 프리미엄 인덱스
- 청산 이벤트 급증
- 청산 히트맵 밀집도
- 증거금 위험도
- 오더북 불균형

### 5.3 업비트 알트 특화 신호

- market_event warning/caution
- 김치 프리미엄 / 역김치 프리미엄
- 거래량 급등
- 입금량 급등
- 글로벌 가격 차이
- 소수 계정 집중
- 가격 정체 구간 거래량 이상치
- 스푸핑 의심 매도벽
- 아이스버그 보충 패턴
- KRW 마켓 깊이와 스프레드

### 5.4 향후 한국주식 특화 신호

- 섹터 강도
- 거래대금 급증
- 장 초반/장 마감 이벤트
- 변동성 완화/확대
- 수급 주체 프록시

## 6. V2 1차 자동 연구 루프 후보

V2에서는 모든 전략을 한 번에 구현하지 않고, 자동 연구 루프에 먼저 태울 후보를 좁혀서 시작하는 것이 현실적이다.

### 6.1 BTC 선물

1. `btc_ema_crossover` 또는 `btc_ema_dual_cross_atr`
2. `btc_donchian_breakout_v2`
3. `btc_tsmom_vol_scaled`
4. `btc_funding_extreme_reversal`

### 6.2 업비트 알트 현물

1. `alt_mean_reversion` 개선판
2. `alt_liquidity_ema_trend`
3. `alt_cross_sectional_momentum`
4. `alt_warning_risk_filter`

추가로 아래 전략들은 `고급 후순위 트랙`으로 별도 연구한다.

- `btc_liquidation_sniper`
- `btc_funding_delta_neutral_arb`
- `btc_overnight_seasonality_max10`
- `upbit_kst_0900_breakout`
- `upbit_kimchi_premium_regime_filter`
- `upbit_accumulation_volume_anomaly`
- `upbit_spoofing_iceberg_detector`
- `upbit_twap_vwap_execution`

## 7. 전략 저장 형식 제안

향후 전략은 아래 메타데이터를 공통 포맷으로 관리하는 것이 좋다.

| 필드 | 설명 |
|---|---|
| `strategy_id` | 고유 식별자 |
| `name` | 표시 이름 |
| `asset_class` | crypto_futures, crypto_spot, korean_stock 등 |
| `market_scope` | BTC only, multi-asset, alt universe 등 |
| `direction` | long_only, long_short |
| `timeframe` | 1m, 15m, 1h, 4h, 1d 등 |
| `signal_family` | trend, momentum, mean_reversion, volatility, event, orderbook |
| `required_data` | ohlcv, funding, oi, orderbook, warning flags 등 |
| `cost_sensitivity` | low, medium, high |
| `automation_stage` | research, backtest, paper, live_candidate |
| `orchestration_role` | direct_strategy, filter, risk_guard, ranking_signal |

## 8. 앞으로 계속 누적할 항목

이 문서에는 앞으로 아래 자료들을 계속 추가한다.

- 사용자 제공 전략 조사 리포트
- 특정 거래소 API 제약 정리
- 한국주식 전략 아이디어
- 백테스트 검증 기준
- 폐기할 전략과 유지할 전략 판단 근거

## 9. 다음에 추가할 리서치 템플릿

향후 사용자가 전략 조사 데이터를 줄 때는 아래 형식으로 누적한다.

### Research Input XXX

- 주제:
- 자산군:
- 핵심 전략:
- 필요한 데이터:
- 자동화 난이도:
- 백테스트 난이도:
- 페이퍼 우선 여부:
- 오케스트레이터 입력으로도 쓸 수 있는지:
- 기존 전략과의 관계:
- 메모:
