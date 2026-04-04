import { createMiddleware } from 'hono/factory'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || ''

/** 검증 완료된 토큰 캐시 (token → { userId, expiresAt }) */
const tokenCache = new Map<string, { userId: string; expiresAt: number }>()

/** 캐시 TTL: 5분 — JWT 만료보다 훨씬 짧아서 무효화된 토큰이 오래 살지 않음 */
const CACHE_TTL_MS = 5 * 60 * 1000

/** 오래된 캐시 엔트리 정리 (1000개 초과 시) */
function pruneCache(): void {
  if (tokenCache.size <= 1000) return
  const now = Date.now()
  for (const [key, val] of tokenCache) {
    if (val.expiresAt <= now) tokenCache.delete(key)
  }
}

/**
 * Hono 미들웨어: Authorization Bearer 토큰에서 Supabase JWT를 검증하고
 * c.set('userId', ...) 에 사용자 ID를 저장한다.
 *
 * - 동일 토큰은 5분간 캐싱하여 Supabase 원격 호출 생략
 * - 사용법: app.use('/api/protected/*', authMiddleware)
 * - 라우트에서: const userId = c.get('userId')
 */
export const authMiddleware = createMiddleware<{
  Variables: { userId: string }
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: '인증이 필요합니다' }, 401)
  }

  const token = authHeader.slice(7)
  const now = Date.now()

  // 캐시 히트 — Supabase 호출 생략
  const cached = tokenCache.get(token)
  if (cached && cached.expiresAt > now) {
    c.set('userId', cached.userId)
    await next()
    return
  }

  // 캐시 미스 ��� Supabase에서 검증
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    tokenCache.delete(token)
    return c.json({ error: '유효하지 않은 인증 토큰입니다' }, 401)
  }

  // 캐시에 저��
  tokenCache.set(token, { userId: user.id, expiresAt: now + CACHE_TTL_MS })
  pruneCache()

  c.set('userId', user.id)
  await next()
})
