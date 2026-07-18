import type { SupabaseClient } from '@supabase/supabase-js'

/** 从请求的 Authorization 头取 Bearer JWT（无则空串）。 */
export function jwtFromRequest(request: Request): string

/** 造一个作用于用户 JWT 的 Life OS Supabase 客户端（RLS 逐用户鉴权，无状态）。 */
export function lifeOsClient(
  jwt: string,
  options?: { schema?: string },
): SupabaseClient

/** 取当前 JWT 对应的 user_id（无用户则空串）。 */
export function userIdOf(supabase: SupabaseClient): Promise<string>

/** 统一的「未登录」提示（appLabel 如 'Home' / 'Planner'）。 */
export function needLogin(appLabel?: string): string
