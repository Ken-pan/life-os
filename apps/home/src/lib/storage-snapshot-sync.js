import { browser } from '$app/environment'
import { auth } from './auth.svelte.js'
import { supabase, isSupabaseConfigured } from './supabase.js'
import { slimStorageZonesForSnapshot } from './spatial/where-is.js'

/** @type {ReturnType<typeof setTimeout> | null} */
let timer = null
let lastKey = ''
const DEBOUNCE_MS = 2500

/**
 * 防抖上推储藏清单快照（HOME.MCP.13）。登录且配置了 Supabase 才写。
 * @param {string} projectId
 * @param {import('./spatial/types.js').SpatialStorageZone[] | null | undefined} storageZones
 */
export function scheduleStorageSnapshotSync(projectId, storageZones) {
  if (!browser || !isSupabaseConfigured || !auth.user) return
  const zones = slimStorageZonesForSnapshot(storageZones)
  const key = `${projectId}:${zones.length}:${zones.reduce((n, z) => n + (z.items?.length ?? 0), 0)}`
  // 即便条数不变（改名/改标签），也要推；用 JSON 指纹兜底
  const fingerprint = `${key}:${JSON.stringify(zones)}`
  if (fingerprint === lastKey) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    pushStorageSnapshot(projectId, zones)
      .then(() => {
        lastKey = fingerprint
      })
      .catch(() => {})
  }, DEBOUNCE_MS)
}

/**
 * @param {string} projectId
 * @param {ReturnType<typeof slimStorageZonesForSnapshot>} zones
 */
export async function pushStorageSnapshot(projectId, zones) {
  if (!auth.user?.id) return
  const { error } = await supabase.schema('home').from('storage_snapshots').upsert(
    {
      user_id: auth.user.id,
      project_id: projectId,
      storage_zones: zones,
      updated_at: Date.now(),
    },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}
