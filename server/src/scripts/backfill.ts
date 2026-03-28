/**
 * 히스토리 캔들 일괄 수집 (backfill)
 *
 * 사용법:
 *   전체:    npx tsx --env-file=.env src/scripts/backfill.ts
 *   업비트만: npx tsx --env-file=.env src/scripts/backfill.ts upbit
 *   OKX만:   npx tsx --env-file=.env src/scripts/backfill.ts okx
 */

import { backfillCandles } from '../data/candle-collector.js'

const UPBIT_SYMBOLS = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'ATOM']
const OKX_SYMBOLS = ['BTC', 'ETH']
const MONTHS = 6

async function backfillUpbit() {
  console.log(`\n=== 업비트 ${MONTHS}개월치 4H 캔들 Backfill ===\n`)
  for (const symbol of UPBIT_SYMBOLS) {
    console.log(`[업비트] ${symbol} 수집 중...`)
    const count = await backfillCandles('upbit', symbol, '4h', MONTHS)
    console.log(`  → ${count}개 저장\n`)
  }

  // 업비트 1H 캔들 (탐지용)
  console.log(`\n=== 업비트 ${MONTHS}개월치 1H 캔들 (탐지용) ===\n`)
  for (const symbol of UPBIT_SYMBOLS) {
    console.log(`[업비트 1H] ${symbol} 수집 중...`)
    const count = await backfillCandles('upbit', symbol, '1h', MONTHS)
    console.log(`  → ${count}개 저장\n`)
  }
}

async function backfillOkx() {
  console.log(`\n=== OKX ${MONTHS}개월치 4H 선물 캔들 Backfill ===\n`)
  for (const symbol of OKX_SYMBOLS) {
    console.log(`[OKX] ${symbol} 수집 중...`)
    const count = await backfillCandles('okx', symbol, '4h', MONTHS)
    console.log(`  → ${count}개 저장\n`)
  }

  // OKX 1H 캔들 (중레버리지 전략용)
  console.log(`\n=== OKX ${MONTHS}개월치 1H 선물 캔들 ===\n`)
  for (const symbol of OKX_SYMBOLS) {
    console.log(`[OKX 1H] ${symbol} 수집 중...`)
    const count = await backfillCandles('okx', symbol, '1h', MONTHS)
    console.log(`  → ${count}개 저장\n`)
  }
}

async function main() {
  const target = process.argv[2] // 'upbit', 'okx', 또는 없음 (전체)

  console.log(`=== Backfill 시작 (${target ?? '전체'}) ===`)
  console.log(`기간: ${MONTHS}개월`)

  if (!target || target === 'upbit') await backfillUpbit()
  if (!target || target === 'okx') await backfillOkx()

  console.log('\n=== Backfill 완료 ===')
}

main().catch(console.error)
