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
    return PORTAL_APPS.some((app) => app.id === raw) ? /** @type {LauncherAppId} */ (raw) : null
  } catch {
    return null
  }
}

/** @returns {() => void} */
export function initRecentApp() {
  recentAppState.id = readLastAppId()
  return () => {}
}

/** @param {LauncherAppId} id */
export function rememberApp(id) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore quota */
  }
  recentAppState.id = id
}

/** @returns {(typeof PORTAL_APPS)[number] | null} */
export function getLastApp() {
  const id = recentAppState.id
  if (!id) return null
  return PORTAL_APPS.find((app) => app.id === id) ?? null
}
