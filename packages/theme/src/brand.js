import { LIFE_OS_SITE_META } from './siteMeta.js'

/** @typedef {import('./siteMeta.js').LifeOsAppId} LifeOsAppId */
/** @typedef {'sidebar' | 'appbar' | 'header' | 'auth'} LifeOsBrandVariant */

/** @type {Record<LifeOsBrandVariant, number>} */
export const LIFE_OS_BRAND_MARK_SIZE = {
  sidebar: 28,
  appbar: 24,
  header: 24,
  auth: 48,
}

/**
 * Display base for `XXX` + accent `OS` (no dot). Finance keeps title case.
 * @type {Partial<Record<LifeOsAppId, string>>}
 */
const WORDMARK_BASE = {
  finance: 'Finance',
  portal: 'PORTAL',
}

/** @type {Partial<Record<LifeOsAppId, string>>} */
const BRAND_ASSET_PREFIX = {
  finance: '/assets/brand',
}

/**
 * @param {string} [assetPrefix]
 */
export function getBrandIconPaths(assetPrefix = '') {
  const prefix = assetPrefix.replace(/\/$/, '')
  const join = (file) => (prefix ? `${prefix}/${file}` : `/${file}`)
  return {
    light: join('brand-circle-light-96.png'),
    dark: join('brand-circle-dark-96.png'),
    lightSrcSet: `${join('brand-circle-light-48.png')} 1x, ${join('brand-circle-light-96.png')} 2x`,
    darkSrcSet: `${join('brand-circle-dark-48.png')} 1x, ${join('brand-circle-dark-96.png')} 2x`,
  }
}

/**
 * @param {LifeOsAppId} appId
 */
export function getLifeOsBrand(appId) {
  const meta = LIFE_OS_SITE_META[appId]
  const assetPrefix = BRAND_ASSET_PREFIX[appId] ?? ''
  return {
    appId,
    wordmarkBase: WORDMARK_BASE[appId] ?? meta.shortName,
    wordmarkAccent: 'OS',
    fullName: meta.name,
    assetPrefix,
    ...getBrandIconPaths(assetPrefix),
  }
}

/**
 * Wordmark accent (`OS`) colors per app — aligned with brand sidebar-primary tokens.
 * @type {Record<LifeOsAppId, { light: string; dark: string }>}
 */
const LIFE_OS_APP_WORDMARK_ACCENT = {
  portal: { light: '#3d9ed6', dark: '#5cb8ea' },
  planner: { light: '#e9a832', dark: '#f5b83d' },
  finance: { light: '#c6f43d', dark: '#b2dc37' },
  fitness: { light: '#c42f0a', dark: '#ff4d2e' },
  music: { light: '#ff4d6d', dark: '#ff4d6d' },
  home: { light: '#7d93a8', dark: '#7d93a8' },
}

/**
 * @param {LifeOsAppId} appId
 * @param {'light' | 'dark'} [theme='dark']
 */
export function getLifeOsAppWordmarkAccent(appId, theme = 'dark') {
  const tones = LIFE_OS_APP_WORDMARK_ACCENT[appId]
  if (!tones) return '#888888'
  return theme === 'light' ? tones.light : tones.dark
}

/**
 * @param {LifeOsAppId} appId
 * @param {LifeOsBrandVariant} [variant='sidebar']
 */
export function getLifeOsBrandMarkSize(appId, variant = 'sidebar') {
  void appId
  return LIFE_OS_BRAND_MARK_SIZE[variant] ?? LIFE_OS_BRAND_MARK_SIZE.sidebar
}
