const KENOS_APP_ID = 'aios'

/** Production Kenos Today host (www primary; Netlify canary fallback). */
export const KENOS_TODAY_ORIGIN = 'https://www.kenos.space'

/** @param {string} hostname */
function localHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost')
}

/**
 * Default Off. A production-like host needs an explicit build flag; local QA may
 * use ?kenos=1 / ?kenos=0 without changing a persisted preference.
 */
export function resolveKenosExperimentFlag({
  search = '',
  hostname = '',
  environmentFlag = '',
} = {}) {
  if (environmentFlag === '1') return true
  if (!localHostname(hostname)) return false
  const query = new URLSearchParams(search)
  if (query.get('kenos') === '1') return true
  if (query.get('kenos') === '0') return false
  return false
}

/**
 * Soft-redirect Portal `/today` → Kenos Today. Default Off.
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isPortalTodayRedirectEnabled(env = import.meta.env) {
  return env?.VITE_KENOS_PORTAL_TODAY_REDIRECT === '1'
}

/**
 * Owner cohort for Portal Today soft-redirect. Empty allow-list = deny-all when flag On.
 * @param {string | null | undefined} email
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isPortalTodayRedirectCohortMember(email, env = import.meta.env) {
  const raw = String(env?.VITE_KENOS_PORTAL_TODAY_REDIRECT_OWNER_EMAILS || '').trim()
  if (!raw) return false
  if (!email) return false
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(String(email).trim().toLowerCase())
}

/**
 * Preserve query + hash when soft-redirecting Portal Today → Kenos Today.
 * @param {{ search?: string, hash?: string, origin?: string }} input
 */
export function buildPortalTodayRedirectUrl({
  search = '',
  hash = '',
  origin = KENOS_TODAY_ORIGIN,
} = {}) {
  const url = new URL('/', String(origin || KENOS_TODAY_ORIGIN))
  if (search && search !== '?') {
    url.search = search.startsWith('?') ? search.slice(1) : search
  }
  if (hash && hash !== '#') {
    url.hash = hash.startsWith('#') ? hash.slice(1) : hash
  }
  return url.toString()
}

/** @param {string[]} allowedAppKeys @param {boolean} enabled */
export function filterKenosExperimentalAccess(allowedAppKeys = [], enabled = false) {
  return allowedAppKeys.filter((key) => key !== KENOS_APP_ID || enabled)
}

export function buildKenosStranglerRouteMatrix(enabled = false) {
  return [
    { source: 'portal_home', flag: enabled, destination: 'portal_home', visible: true },
    {
      source: 'portal_experimental_entry',
      flag: enabled,
      destination: `${KENOS_TODAY_ORIGIN}/`,
      visible: enabled,
    },
    { source: 'kenos_today', flag: enabled, destination: '/', visible: true },
    { source: 'kenos_assistant', flag: enabled, destination: '/assistant', visible: true },
    { source: 'legacy_assistant', flag: enabled, destination: '/assistant', visible: true },
    { source: 'invalid_kenos_route', flag: enabled, destination: '/404-safe-fallback', visible: true },
    {
      source: 'portal_today_soft_redirect',
      flag: enabled,
      destination: `${KENOS_TODAY_ORIGIN}/`,
      visible: enabled,
    },
  ]
}

export const KENOS_STRANGLER_DEFAULT_ENABLED = false
