import {
  applyThemeFromPreference,
  bindSystemThemeChange,
  LIFE_OS_SITE_META,
} from '@life-os/theme'

const STORAGE_KEY = LIFE_OS_SITE_META.portal.storageKey

/** @typedef {'light' | 'dark' | 'auto'} ThemePreference */

/** @type {{ preference: ThemePreference }} */
export const portalTheme = $state({
  preference: 'auto',
})

/** @returns {ThemePreference} */
function readThemePreference() {
  if (typeof localStorage === 'undefined') return 'auto'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return 'auto'
    const parsed = JSON.parse(raw)
    const pref = parsed?.settings?.theme
    return pref === 'light' || pref === 'dark' || pref === 'auto' ? pref : 'auto'
  } catch {
    return 'auto'
  }
}

/** @param {ThemePreference} preference */
function writeThemePreference(preference) {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed.settings || typeof parsed.settings !== 'object') {
      parsed.settings = {}
    }
    parsed.settings.theme = preference
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    /* ignore quota */
  }
}

function applyPortalTheme() {
  const meta = LIFE_OS_SITE_META.portal
  applyThemeFromPreference(
    () => portalTheme.preference,
    {
      themeColorMetaId: 'theme-color-meta',
      themeColorFallback: meta.themeColor,
    },
    meta.defaultTheme,
  )
}

/** @returns {() => void} */
export function initPortalTheme() {
  portalTheme.preference = readThemePreference()
  applyPortalTheme()
  return bindSystemThemeChange(() => portalTheme.preference, () => applyPortalTheme(), 'auto')
}

/** @param {ThemePreference} preference */
export function setThemePreference(preference) {
  portalTheme.preference = preference
  writeThemePreference(preference)
  applyPortalTheme()
}

const THEME_CYCLE = /** @type {const} */ (['light', 'dark', 'auto'])

/** @returns {ThemePreference} */
export function cycleThemePreference() {
  const current = portalTheme.preference
  const idx = THEME_CYCLE.indexOf(current)
  const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
  setThemePreference(next)
  return next
}

/** @param {ThemePreference} preference */
export function themePreferenceLabel(preference) {
  if (preference === 'light') return '浅色'
  if (preference === 'dark') return '深色'
  return '跟随系统'
}
