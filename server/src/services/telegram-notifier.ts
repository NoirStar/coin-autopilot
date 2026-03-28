import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Telegram 알림 서비스
 *
 * 강력 매수 시그널 (score >= 0.8) 발생 시 Telegram 메시지 전송
 * 환경변수: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 * 중복 방지: 같은 코인에 대해 4시간 내 재알림 금지
 * 쿨다운 기록은 파일에 저장하여 서버 재시작 시에도 유지
 */

const TELEGRAM_API = 'https://api.telegram.org'
const COOLDOWN_MS = 4 * 60 * 60 * 1000 // 4시간
const COOLDOWN_FILE = join(process.cwd(), '.telegram-cooldowns.json')

/** 쿨다운 기록 로드 (파일 기반, 서버 재시작 시에도 유지) */
function loadCooldowns(): Map<string, number> {
  try {
    if (existsSync(COOLDOWN_FILE)) {
      const raw = readFileSync(COOLDOWN_FILE, 'utf-8')
      const entries = JSON.parse(raw) as Array<[string, number]>
      return new Map(entries)
    }
  } catch {
    // 파일 손상 시 빈 맵으로 시작
  }
  return new Map()
}

/** 쿨다운 기록 저장 */
function saveCooldowns(map: Map<string, number>): void {
  try {
    writeFileSync(COOLDOWN_FILE, JSON.stringify([...map]), 'utf-8')
  } catch {
    // 저장 실패 시 무시 (다음 사이클에서 재시도)
  }
}

// 최근 알림 기록 (symbol → timestamp) — 파일에서 복원
const recentAlerts = loadCooldowns()

interface AlertCoin {
  symbol: string
  koreanName: string
  score: number
  price: number
  changePct: number
}

/**
 * Telegram 메시지 전송
 */
async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    return false
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[텔레그램] 메시지 전송 실패: ${res.status} ${body}`)
      return false
    }

    return true
  } catch (err) {
    console.error('[텔레그램] 메시지 전송 오류:', err)
    return false
  }
}

/**
 * 강력 매수 시그널 알림 전송
 * score >= 0.8인 코인들에 대해 알림
 */
export async function notifyStrongBuySignals(coins: AlertCoin[]): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    return // 환경변수 미설정 시 조용히 스킵
  }

  const now = Date.now()
  const alertCoins = coins.filter((c) => {
    // score >= 0.8인 코인만
    if (c.score < 0.8) return false
    // 4시간 쿨다운 체크
    const lastAlert = recentAlerts.get(c.symbol)
    if (lastAlert && now - lastAlert < COOLDOWN_MS) return false
    return true
  })

  if (alertCoins.length === 0) return

  // 메시지 구성
  const lines = alertCoins.map((c) => {
    const scorePercent = Math.round(c.score * 100)
    const changeSign = c.changePct >= 0 ? '+' : ''
    return `<b>${c.koreanName}</b> (${c.symbol}) — ${scorePercent}점\n  ${c.price.toLocaleString('ko-KR')}원 (${changeSign}${c.changePct.toFixed(2)}%)`
  })

  const message = [
    '🔔 <b>강력 매수 시그널</b>',
    '',
    ...lines,
    '',
    `📊 ${alertCoins.length}개 코인 감지`,
  ].join('\n')

  const sent = await sendTelegramMessage(message)

  if (sent) {
    // 쿨다운 기록
    for (const c of alertCoins) {
      recentAlerts.set(c.symbol, now)
    }
    console.log(`[텔레그램] 강력 매수 알림 전송: ${alertCoins.map((c) => c.symbol).join(', ')}`)
  }

  // 오래된 쿨다운 기록 정리 (24시간 이상)
  for (const [symbol, ts] of recentAlerts) {
    if (now - ts > 24 * 60 * 60 * 1000) {
      recentAlerts.delete(symbol)
    }
  }

  // 파일에 저장 (서버 재시작 대비)
  saveCooldowns(recentAlerts)
}
