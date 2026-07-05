/** Life OS 三端（Finance / Fitness / Planner）共享常量 */

/** Supabase Auth localStorage 键 — 三端必须一致 */
export const LIFE_OS_AUTH_STORAGE_KEY = 'life_os_auth';

export const SYNC_DEFAULTS = {
  /** 同一账号两次完整双向同步的最小间隔 */
  cooldownMs: 4000,
  /** 回到前台 / 编辑后 debounce 上传 */
  debounceMs: 800
};

/** @param {'finance'|'fitness'|'planner'} appId */
export function syncMetaStorageKey(appId) {
  const map = {
    finance: 'fos_sync_v1',
    fitness: 'fitos_sync_v1',
    planner: 'planos_sync_v1'
  };
  return map[appId] ?? `${appId}_sync_v1`;
}

/** @param {'finance'|'fitness'|'planner'} appId */
export function readSyncMeta(appId) {
  if (typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(syncMetaStorageKey(appId)) ?? 'null');
  } catch {
    return null;
  }
}

/** @param {'finance'|'fitness'|'planner'} appId @param {string} userId */
export function writeSyncMeta(appId, userId) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    syncMetaStorageKey(appId),
    JSON.stringify({ userId, lastSyncAt: new Date().toISOString() })
  );
}

/** Auth 事件：应在这些事件上触发双向同步 */
export const AUTH_SYNC_EVENTS = ['INITIAL_SESSION', 'SIGNED_IN'];
