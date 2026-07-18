import { PORTAL_APPS, PORTAL_PRODUCTION_APPS } from './apps.js'
import {
  fetchLastOpenedLauncherApp,
  fetchPendingLifeEventsCount,
  fetchPortalPreferences,
  updateDefaultApp,
  updateSkipAutoRedirect,
} from './coreProfile.js'

/** @typedef {import('./apps.js').LauncherAppId} LauncherAppId */

/** @type {{
 *   pendingEvents: number | null,
 *   defaultApp: LauncherAppId | null,
 *   skipAutoRedirect: boolean,
 *   prefsReady: boolean,
 * }} */
export const portalPreferences = $state({
  pendingEvents: null,
  defaultApp: null,
  skipAutoRedirect: false,
  prefsReady: false,
})

/**
 * @param {string} userId
 * @returns {Promise<LauncherAppId | null>}
 */
export async function hydratePortalFromCore(userId) {
  try {
    const [lastApp, prefs, pendingCount] = await Promise.all([
      fetchLastOpenedLauncherApp(userId),
      fetchPortalPreferences(userId),
      fetchPendingLifeEventsCount(userId),
    ])

    portalPreferences.defaultApp = prefs.defaultApp
    portalPreferences.skipAutoRedirect = prefs.skipAutoRedirect
    portalPreferences.pendingEvents = pendingCount
    portalPreferences.prefsReady = true

    return lastApp
  } catch {
    portalPreferences.prefsReady = true
    return null
  }
}

/**
 * 刷新 Portal 角标（从 Planner 返回时调用，避免陈旧计数）。
 * @param {string} userId
 */
export async function refreshPendingBadge(userId) {
  try {
    portalPreferences.pendingEvents = await fetchPendingLifeEventsCount(userId)
  } catch {
    /* keep prior */
  }
}

/**
 * @param {string} userId
 * @param {LauncherAppId | null} appId
 */
export async function saveDefaultApp(userId, appId) {
  await updateDefaultApp(userId, appId)
  portalPreferences.defaultApp = appId
}

/**
 * @param {string} userId
 * @param {boolean} skip
 */
export async function saveSkipAutoRedirect(userId, skip) {
  await updateSkipAutoRedirect(userId, skip)
  portalPreferences.skipAutoRedirect = skip
}

/**
 * @param {LauncherAppId | null} defaultApp
 * @param {boolean} skipAutoRedirect
 * @returns {boolean}
 */
export function shouldAutoRedirect(defaultApp, skipAutoRedirect) {
  if (!defaultApp || skipAutoRedirect) return false
  if (typeof sessionStorage === 'undefined') return false
  if (sessionStorage.getItem('portal_stay_on_launcher') === '1') return false
  return PORTAL_PRODUCTION_APPS.some((app) => app.id === defaultApp)
}

/**
 * @param {LauncherAppId} defaultApp
 */
export function redirectToDefaultApp(defaultApp) {
  const target = PORTAL_APPS.find((app) => app.id === defaultApp)
  if (!target) return
  window.location.href = target.url
}
