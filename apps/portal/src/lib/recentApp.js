import { PORTAL_APPS } from './apps.js'

const STORAGE_KEY = 'portalos_last_app_v1'

/** @typedef {import('./apps.js').LauncherAppId} LauncherAppId */

/** @returns {LauncherAppId | null} */
export function getLastAppId() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return PORTAL_APPS.some((app) => app.id === raw) ? /** @type {LauncherAppId} */ (raw) : null
  } catch {
    return null
  }
}

/** @param {LauncherAppId} id */
export function rememberApp(id) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore quota */
  }
}

/** @returns {import('./apps.js').typeof PORTAL_APPS[number] | null} */
export function getLastApp() {
  const id = getLastAppId()
  if (!id) return null
  return PORTAL_APPS.find((app) => app.id === id) ?? null
}
