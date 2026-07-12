import { browser } from '$app/environment'
import { syncHomePortalSummary } from '@life-os/sync'
import { auth } from './auth.svelte.js'
import { supabase, isSupabaseConfigured } from './supabase.js'

let lastSyncAt = 0
let lastCount = -1
const MIN_INTERVAL_MS = 30_000

/**
 * 将当前储藏区数上报 core_user_app_settings（HOME.PROJ.6a）。
 * @param {number} storageZoneCount
 */
export function scheduleHomePortalMetadataSync(storageZoneCount) {
  if (!browser || !isSupabaseConfigured || !auth.user) return

  const count = Math.max(0, Math.floor(Number(storageZoneCount) || 0))
  const now = Date.now()
  if (count === lastCount && now - lastSyncAt < MIN_INTERVAL_MS) return

  lastCount = count
  lastSyncAt = now

  syncHomePortalSummary(supabase, auth.user.id, { storageZoneCount: count }).catch(
    () => {},
  )
}
