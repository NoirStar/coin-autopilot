import { createMiddleware } from 'hono/factory'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || ''

/**
 * Hono 미들웨어: Authorization Bearer 토큰에서 Supabase JWT를 검증하고
 * c.set('userId', ...) 에 사용자 ID를 저장한다.
 *
 * 사용법: app.use('/api/protected/*', authMiddleware)
 * 라우트에서: const userId = c.get('userId')
 */
export const authMiddleware = createMiddleware<{
  Variables: { userId: string }
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: '인증이 필요합니다' }, 401)
  }

  const token = authHeader.slice(7)

  // Supabase anon 클라이언트에 토큰을 주입해서 getUser() 로 검증
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return c.json({ error: '유효하지 않은 인증 토큰입니다' }, 401)
  }

  c.set('userId', user.id)
  await next()
})
