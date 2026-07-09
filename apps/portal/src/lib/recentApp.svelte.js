import { PORTAL_APPS } from './apps.js'

const STORAGE_KEY = 'portalos_last_app_v1'

/** @typedef {import('./apps.js').LauncherAppId} LauncherAppId */

/** @type {{ id: LauncherAppId | null }} */
export const recentAppState = $state({
  id: null,
})

/** @returns {LauncherAppId | null} */
function readLastAppId() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return PORTAL_APPS.some((app) => app.id === raw)
      ? /** @type {LauncherAppId} */ (raw)
      : null
  } catch {
    return null
  }
}

/** @param {LauncherAppId | null} id */
function persistLastAppId(id) {
  if (typeof localStorage === 'undefined') return
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore quota */
  }
}

/** @returns {() => void} */
export function initRecentApp() {
  recentAppState.id = readLastAppId()
  return () => {}
}

/**
 * DB wins over localStorage when available (G-P1).
 * @param {LauncherAppId | null} dbAppId
 */
export function applyRecentAppFromDb(dbAppId) {
  if (dbAppId && PORTAL_APPS.some((app) => app.id === dbAppId)) {
    recentAppState.id = dbAppId
    persistLastAppId(dbAppId)
    return
  }
  recentAppState.id = readLastAppId()
}

/** @param {LauncherAppId} id */
export function rememberApp(id) {
  persistLastAppId(id)
  recentAppState.id = id
}

/** @returns {(typeof PORTAL_APPS)[number] | null} */
export function getLastApp() {
  const id = recentAppState.id
  if (!id) return null
  return PORTAL_APPS.find((app) => app.id === id) ?? null
}
