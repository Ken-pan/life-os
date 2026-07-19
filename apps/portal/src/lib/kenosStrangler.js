const KENOS_APP_ID = 'aios'

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

/** @param {string[]} allowedAppKeys @param {boolean} enabled */
export function filterKenosExperimentalAccess(allowedAppKeys = [], enabled = false) {
  return allowedAppKeys.filter((key) => key !== KENOS_APP_ID || enabled)
}

export function buildKenosStranglerRouteMatrix(enabled = false) {
  return [
    { source: 'portal_home', flag: enabled, destination: 'portal_home', visible: true },
    { source: 'portal_experimental_entry', flag: enabled, destination: 'https://aios.kenos.space/', visible: enabled },
    { source: 'kenos_today', flag: enabled, destination: '/', visible: true },
    { source: 'kenos_assistant', flag: enabled, destination: '/assistant', visible: true },
    { source: 'legacy_assistant', flag: enabled, destination: '/assistant', visible: true },
    { source: 'invalid_kenos_route', flag: enabled, destination: '/404-safe-fallback', visible: true },
  ]
}

export const KENOS_STRANGLER_DEFAULT_ENABLED = false
