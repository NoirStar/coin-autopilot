/**
 * 전략이 CandleMap에서 캔들을 조회할 때 사용하는 asset_key 헬퍼.
 *
 * 심볼 키 통일 원칙 (2단계 TODO, Codex #7 해결):
 * - 연구 루프, 페이퍼 엔진, 전략 내부 모두 candles 테이블의 `asset_key`
 *   컬럼과 동일한 포맷을 사용한다.
 * - OKX 선물: `BTC-USDT`, `ETH-USDT`
 * - Upbit 현물: `BTC-KRW`, `ETH-KRW`, ...
 *
 * 이렇게 통일하면 train/serve skew가 사라지고, 연구에서 승격된 파라미터가
 * 운용에서 같은 심볼로 평가된다.
 *
 * 주의: 실전 거래용 OKX instrument 식별자(`BTC-USDT-SWAP`)는 execution-engine
 * 내부 변환이며, 여기서 다루지 않는다.
 */

/** 주어진 exchange의 BTC 캔들 키 */
export function getBtcKey(exchange: string): string {
  return exchange === 'okx' ? 'BTC-USDT' : 'BTC-KRW'
}

/**
 * BTC + ETH 양대 자산 키 (선물 전략 기본 유니버스)
 * OKX 선물 전략은 BTC/ETH 두 자산에 동일 로직을 적용한다.
 * Upbit 현물 전략이 이 헬퍼를 쓰면 안 된다 (알트 전략은 동적 유니버스를 사용).
 */
export function getBtcEthKeys(exchange: string): string[] {
  return exchange === 'okx'
    ? ['BTC-USDT', 'ETH-USDT']
    : ['BTC-KRW', 'ETH-KRW']
}
