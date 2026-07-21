/**
 * Domain deep-link resume helpers for Kenos shell (no Writer / flags).
 * Domains open in their real apps; Kenos remembers resume for Continue.
 *
 * Origins SSOT: @life-os/theme LIFE_OS_APP_ORIGINS (production).
 * Localhost ports are also accepted for resume validation when Owner runs a full local stack.
 */
import { LIFE_OS_APP_ORIGINS } from '@life-os/theme'

/** @typedef {'plan' | 'money' | 'training' | 'music' | 'home' | 'knowledge'} DomainId */

/** @type {Record<DomainId, keyof typeof LIFE_OS_APP_ORIGINS>} */
export const DOMAIN_APP_IDS = Object.freeze({
  plan: 'planner',
  money: 'finance',
  training: 'fitness',
  music: 'music',
  home: 'home',
  knowledge: 'knowledge',
})

/**
 * Production origins for domain deep links (Preview → live Life OS apps).
 * @type {Readonly<Record<DomainId, string>>}
 */
export const DOMAIN_ORIGINS = Object.freeze({
  plan: LIFE_OS_APP_ORIGINS.planner.production,
  money: LIFE_OS_APP_ORIGINS.finance.production,
  training: LIFE_OS_APP_ORIGINS.fitness.production,
  music: LIFE_OS_APP_ORIGINS.music.production,
  home: LIFE_OS_APP_ORIGINS.home.production,
  knowledge: LIFE_OS_APP_ORIGINS.knowledge.production,
})

/** Stable local Personal Daily Beta AIOS port (see scripts/kenos-daily-beta). */
export const LOCAL_DAILY_BETA_AIOS_ORIGIN = 'http://127.0.0.1:5219'

/**
 * Host for local daily-beta deep links.
 * On iPhone WKWebView, window.location.hostname is the Mac LAN IP — never hardcode
 * 127.0.0.1 (unreachable on device).
 * @returns {string}
 */
export function localDailyBetaHost() {
  if (typeof window !== 'undefined') {
    const host = String(window.location?.hostname || '').trim()
    if (host && host !== 'localhost') return host
    if (host === 'localhost') return '127.0.0.1'
  }
  return '127.0.0.1'
}

/**
 * Rewrite loopback / localhost origin to the current page host (LAN-safe on phone).
 * @param {string} href
 * @returns {string}
 */
export function rewriteLoopbackToPageHost(href) {
  const raw = String(href || '').trim()
  if (!raw) return raw
  try {
    const url = new URL(raw)
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return raw
    if (typeof window === 'undefined') return raw
    const host = localDailyBetaHost()
    if (!host || host === '127.0.0.1') return raw
    url.hostname = host
    return url.toString()
  } catch {
    return raw
  }
}

/**
 * Build-time Personal Daily Beta: deep links target local Planner/Fitness ports
 * instead of production. Does not change descriptor schema.
 * @param {{ VITE_KENOS_LOCAL_DAILY_BETA?: string }} [env]
 */
export function isLocalDailyBeta(env = import.meta.env) {
  return String(env?.VITE_KENOS_LOCAL_DAILY_BETA || '') === '1'
}

/**
 * @param {DomainId | string} domainId
 * @param {{ VITE_KENOS_LOCAL_DAILY_BETA?: string }} [env]
 */
export function resolveDomainOrigin(domainId, env = import.meta.env) {
  const id = /** @type {DomainId} */ (domainId)
  const appId = DOMAIN_APP_IDS[id]
  const cfg = appId ? LIFE_OS_APP_ORIGINS[appId] : null
  if (isLocalDailyBeta(env) && cfg?.devPort) {
    return `http://${localDailyBetaHost()}:${cfg.devPort}`
  }
  return DOMAIN_ORIGINS[id] || null
}

/**
 * Rewrite a production domain URL to the matching local daily-beta origin.
 * @param {string} href
 * @param {{ VITE_KENOS_LOCAL_DAILY_BETA?: string }} [env]
 */
export function rewriteDomainHrefForLocalDailyBeta(href, env = import.meta.env) {
  if (!isLocalDailyBeta(env)) return href
  try {
    const url = new URL(String(href || '').trim())
    for (const [domainId, appId] of Object.entries(DOMAIN_APP_IDS)) {
      const cfg = LIFE_OS_APP_ORIGINS[appId]
      if (!cfg) continue
      const prod = new URL(cfg.production).origin
      if (url.origin === prod) {
        url.protocol = 'http:'
        url.host = `${localDailyBetaHost()}:${cfg.devPort}`
        return url.toString()
      }
    }
  } catch {
    /* ignore */
  }
  return rewriteLoopbackToPageHost(href)
}

/**
 * True when host is loopback or private LAN (phone Daily Beta).
 * @param {string} hostname
 */
export function isPrivateOrLoopbackHost(hostname) {
  const h = String(hostname || '')
  if (h === '127.0.0.1' || h === 'localhost') return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  return false
}

/**
 * Origins allowed for Continue resume (production + local Vite / daily-beta ports).
 * LAN hosts are accepted via port match in listKeyForDomainHref / isKnownDomainResume.
 * @returns {string[]}
 */
export function knownDomainOrigins() {
  /** @type {string[]} */
  const origins = []
  for (const appId of Object.values(DOMAIN_APP_IDS)) {
    const cfg = LIFE_OS_APP_ORIGINS[appId]
    if (!cfg) continue
    origins.push(cfg.production)
    origins.push(`http://127.0.0.1:${cfg.devPort}`)
    origins.push(`http://localhost:${cfg.devPort}`)
  }
  return origins
}

/**
 * Map a production (or local / LAN) domain URL to hosted listKey for resume.
 * @param {string} href
 * @returns {string | null}
 */
export function listKeyForDomainHref(href) {
  try {
    const url = new URL(String(href || '').trim())
    for (const [domainId, appId] of Object.entries(DOMAIN_APP_IDS)) {
      const cfg = LIFE_OS_APP_ORIGINS[appId]
      if (!cfg) continue
      const prodOrigin = new URL(cfg.production).origin
      if (url.origin === prodOrigin) return `hosted:${domainId}`
      if (
        isPrivateOrLoopbackHost(url.hostname) &&
        Number(url.port || (url.protocol === 'http:' ? 80 : 0)) === Number(cfg.devPort)
      ) {
        return `hosted:${domainId}`
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Demo / default resume paths keyed by hosted listKeys. */
export const DOMAIN_RESUME_DEFAULTS = Object.freeze({
  'hosted:plan': {
    lastRoute: `${DOMAIN_ORIGINS.plan}/upcoming`,
    filter: 'Upcoming · 3 overdue',
  },
  'hosted:training': {
    lastRoute: DOMAIN_ORIGINS.training,
    filter: '今日计划 · Push Day',
  },
  'hosted:money': {
    lastRoute: `${DOMAIN_ORIGINS.money}/home/today`,
    filter: 'Today · 待确认 2 笔',
  },
  'hosted:home': {
    lastRoute: `${DOMAIN_ORIGINS.home}/storage`,
    filter: 'Storage · 最近更新',
  },
  'hosted:music': {
    lastRoute: DOMAIN_ORIGINS.music,
    filter: 'Library · 继续播放',
  },
  'hosted:knowledge': {
    lastRoute: DOMAIN_ORIGINS.knowledge,
    filter: 'Notes · 最近打开',
  },
  'hosted:work': {
    lastRoute: '/work',
    filter: '项目与交付',
  },
})

/** Extra Fitness active-workout resume used by Continue demo story */
export const FITNESS_ACTIVE_RESUME = Object.freeze({
  listKey: 'hosted:training',
  lastRoute: `${DOMAIN_ORIGINS.training}/day/chest/focus?kenosEx=c_fly&kenosSet=2`,
  filter: 'Cable fly · Set 2 of 4',
})

/**
 * @param {DomainId | string} domainId
 * @param {string} [path] absolute path or full URL
 * @param {{ VITE_KENOS_LOCAL_DAILY_BETA?: string }} [env]
 */
export function domainDeepLink(domainId, path = '/', env = import.meta.env) {
  const origin = resolveDomainOrigin(domainId, env)
  if (!origin) return path
  if (/^https?:\/\//i.test(path)) {
    return rewriteDomainHrefForLocalDailyBeta(path, env)
  }
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${origin}${normalized === '/' ? '' : normalized}`
}
