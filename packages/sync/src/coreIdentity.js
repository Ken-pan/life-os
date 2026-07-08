import { AUTH_SYNC_EVENTS } from './constants.js'

/** @typedef {'finance'|'fitness'|'planner'|'music'|'portal'} LifeOsAppId */

const CORE_PROFILES = 'core_profiles'
const CORE_USER_APP_SETTINGS = 'core_user_app_settings'

/** core 表在 public schema；Fitness/Music client 默认 schema 非 public */
function coreDb(supabase) {
  return supabase.schema('public')
}

/**
 * 确保 core_profiles 存在（注册触发器遗漏时的客户端兜底）。
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ id: string; email?: string | null; user_metadata?: Record<string, unknown> }} user
 */
export async function ensureCoreProfile(supabase, user) {
  const displayName =
    user.user_metadata?.display_name ||
    (user.email ? user.email.split('@')[0] : null)

  const { error } = await coreDb(supabase).from(CORE_PROFILES).upsert(
    {
      id: user.id,
      display_name: displayName,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )

  if (error && error.code !== '23505') throw error
}

/**
 * 记录用户在某 App 的最后打开时间。
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {LifeOsAppId} appId
 */
export async function touchAppLastOpened(supabase, userId, appId) {
  const { error } = await coreDb(supabase).from(CORE_USER_APP_SETTINGS).upsert(
    {
      user_id: userId,
      app_id: appId,
      last_opened_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,app_id' },
  )

  if (error) throw error
}

/**
 * Auth 事件时引导 core 身份（profile + last_opened_at）。
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {LifeOsAppId} appId
 */
export function createCoreIdentityHandler(supabase, appId) {
  return async (event, session) => {
    if (!session?.user || !AUTH_SYNC_EVENTS.includes(event)) return
    try {
      await ensureCoreProfile(supabase, session.user)
      await touchAppLastOpened(supabase, session.user.id, appId)
    } catch {
      // 非阻塞：P0 仍以 DB 触发器为主
    }
  }
}
