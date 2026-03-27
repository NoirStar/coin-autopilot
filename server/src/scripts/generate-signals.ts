/**
 * 시그널 생성 수동 실행
 * npx tsx --env-file=.env src/scripts/generate-signals.ts
 */
import { generateSignals } from '../services/signal-generator.js'

generateSignals().catch(console.error)
