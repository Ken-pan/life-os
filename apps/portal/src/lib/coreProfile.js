import { supabase } from './supabase.js'
import { PORTAL_APPS, PORTAL_PRODUCTION_APPS } from './apps.js'
import { countPortalActionBadge } from './portalActionBadge.js'

/** @typedef {import('./apps.js').LauncherAppId} LauncherAppId */

const LAUNCHER_IDS = new Set(PORTAL_APPS.map((app) => app.id))
const PRODUCTION_LAUNCHER_IDS = new Set(
  PORTAL_PRODUCTION_APPS.map((app) => app.id),
)

/**
 * @param {string} userId
 * @returns {Promise<LauncherAppId | null>}
 */
export async function fetchLastOpenedLauncherApp(userId) {
  const { data, error } = await supabase
    .from('core_user_app_settings')
    .select('app_id, last_opened_at')
    .eq('user_id', userId)
    .not('last_opened_at', 'is', null)
    .order('last_opened_at', { ascending: false })
    .limit(10)

  if (error) throw error
  const match = (data ?? []).find((row) =>
    LAUNCHER_IDS.has(/** @type {LauncherAppId} */ (row.app_id)),
  )
  return match ? /** @type {LauncherAppId} */ (match.app_id) : null
}

/**
 * @param {string} userId
 * @returns {Promise<{ defaultApp: LauncherAppId | null, skipAutoRedirect: boolean }>}
 */
export async function fetchPortalPreferences(userId) {
  const [profileRes, portalSettingsRes] = await Promise.all([
    supabase
      .from('core_profiles')
      .select('default_app')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('core_user_app_settings')
      .select('settings')
      .eq('user_id', userId)
      .eq('app_id', 'portal')
      .maybeSingle(),
  ])

  if (profileRes.error) throw profileRes.error
  if (portalSettingsRes.error) throw portalSettingsRes.error

  const defaultRaw = profileRes.data?.default_app
  const defaultApp =
    defaultRaw && PRODUCTION_LAUNCHER_IDS.has(/** @type {LauncherAppId} */ (defaultRaw))
      ? /** @type {LauncherAppId} */ (defaultRaw)
      : null

  const settings = portalSettingsRes.data?.settings
  const skipAutoRedirect =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? Boolean(
          /** @type {{ skip_auto_redirect?: boolean }} */ (settings)
            .skip_auto_redirect,
        )
      : false

  return { defaultApp, skipAutoRedirect }
}

/**
 * @param {string} userId
 * @param {LauncherAppId | null} defaultApp
 */
export async function updateDefaultApp(userId, defaultApp) {
  const { error } = await supabase
    .from('core_profiles')
    .update({ default_app: defaultApp })
    .eq('id', userId)
  if (error) throw error
}

/**
 * @param {string} userId
 * @param {boolean} skipAutoRedirect
 */
export async function updateSkipAutoRedirect(userId, skipAutoRedirect) {
  const { data: existing, error: readErr } = await supabase
    .from('core_user_app_settings')
    .select('settings')
    .eq('user_id', userId)
    .eq('app_id', 'portal')
    .maybeSingle()
  if (readErr) throw readErr

  const prior =
    existing?.settings &&
    typeof existing.settings === 'object' &&
    !Array.isArray(existing.settings)
      ? /** @type {Record<string, unknown>} */ (existing.settings)
      : {}

  const { error } = await supabase.from('core_user_app_settings').upsert(
    {
      user_id: userId,
      app_id: 'portal',
      settings: { ...prior, skip_auto_redirect: skipAutoRedirect },
    },
    { onConflict: 'user_id,app_id' },
  )
  if (error) throw error
}

/**
 * Portal 顶栏「待处理」角标（FINC.GROWTH.4）。
 * 含：pending life_events + 已消费但未完成的 finance 账单任务。
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function fetchPendingLifeEventsCount(userId) {
  const [pendingRes, tasksRes] = await Promise.all([
    supabase
      .from('life_events')
      .select('id, type')
      .eq('user_id', userId)
      .eq('status', 'pending'),
    supabase.from('planner_tasks').select('data').eq('user_id', userId),
  ])

  if (pendingRes.error) throw pendingRes.error
  if (tasksRes.error) throw tasksRes.error

  return countPortalActionBadge(pendingRes.data, tasksRes.data)
}
