/**
 * 시그널 파이프라인 수동 테스트
 * 실행: npx tsx --env-file=.env src/scripts/test-pipeline.ts
 */

import { collectLatestCandles, loadCandles } from '../data/candle-collector.js'
import { evaluateRegime } from '../strategy/btc-regime-filter.js'
import { AltMeanReversionStrategy } from '../strategy/alt-mean-reversion.js'
import type { CandleMap } from '../strategy/strategy-base.js'

const SYMBOLS = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE']

async function main() {
  console.log('=== 시그널 파이프라인 테스트 ===\n')

  // 1. 캔들 수집
  console.log('1. 업비트 캔들 수집 중...')
  const saved = await collectLatestCandles('upbit', SYMBOLS, '4h')
  console.log(`   ${saved}개 캔들 저장/업데이트\n`)

  // 2. DB에서 로드
  console.log('2. DB에서 캔들 로드 중...')
  const candleMap: CandleMap = new Map()
  for (const symbol of SYMBOLS) {
    const candles = await loadCandles('upbit', symbol, '4h', 500)
    candleMap.set(symbol, candles)
    console.log(`   ${symbol}: ${candles.length}개 캔들`)
  }
  console.log()

  // 3. BTC 레짐 판단
  const btcCandles = candleMap.get('BTC')!
  if (btcCandles.length < 201) {
    console.log('3. BTC 캔들이 부족합니다 (최소 201개 필요). 먼저 backfill을 실행하세요.')
    console.log(`   현재: ${btcCandles.length}개`)
    console.log('\n   backfill 명령: npx tsx --env-file=.env src/scripts/backfill.ts')
    return
  }

  const regime = evaluateRegime(btcCandles)
  console.log(`3. BTC 레짐: ${regime.regime}`)
  console.log(`   BTC: ${regime.btcClose.toLocaleString()}원`)
  console.log(`   EMA(200): ${regime.ema200.toLocaleString()}원`)
  console.log(`   RSI(14): ${regime.rsi14.toFixed(1)}`)
  console.log(`   ATR%: ${regime.atrPct.toFixed(2)}%\n`)

  // 4. 전략 시그널
  const strategy = new AltMeanReversionStrategy()
  const signals = strategy.evaluate(candleMap, regime.regime)
  console.log(`4. ${strategy.config.name}: ${signals.length}개 시그널`)
  for (const sig of signals) {
    console.log(`   ${sig.direction.toUpperCase()} ${sig.symbol} — z: ${sig.reasoning.z_score}, RSI: ${sig.reasoning.rsi}`)
  }

  console.log('\n=== 완료 ===')
}

main().catch(console.error)
