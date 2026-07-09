const CORE_USER_APP_SETTINGS = 'core_user_app_settings'
const HOME_APP_ID = 'home'

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
function coreDb(supabase) {
  return supabase.schema('public')
}

/**
 * Home 轻量元数据上报 — Portal G-P4b-H 读 `settings.portal_summary`。
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ storageZoneCount: number }} payload
 */
export async function syncHomePortalSummary(supabase, userId, { storageZoneCount }) {
  const count = Math.max(0, Math.floor(Number(storageZoneCount) || 0))

  const { data: existing, error: readErr } = await coreDb(supabase)
    .from(CORE_USER_APP_SETTINGS)
    .select('settings')
    .eq('user_id', userId)
    .eq('app_id', HOME_APP_ID)
    .maybeSingle()

  if (readErr) throw readErr

  const prior =
    existing?.settings &&
    typeof existing.settings === 'object' &&
    !Array.isArray(existing.settings)
      ? /** @type {Record<string, unknown>} */ (existing.settings)
      : {}

  const { error } = await coreDb(supabase).from(CORE_USER_APP_SETTINGS).upsert(
    {
      user_id: userId,
      app_id: HOME_APP_ID,
      settings: {
        ...prior,
        portal_summary: {
          storage_zone_count: count,
          reported_at: new Date().toISOString(),
        },
      },
    },
    { onConflict: 'user_id,app_id' },
  )

  if (error) throw error
}
