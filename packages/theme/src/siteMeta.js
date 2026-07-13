/**
 * Life OS 三端统一的浏览器 / PWA / 社交分享 metadata。
 * PLAT.GEN.4：数据源是各 app 的 app.manifest.json，经
 * scripts/build-app-registry.mjs 生成 ./generated/appRegistry.js；
 * 本文件只保留行为函数与站点级常量。
 */
/** @typedef {import('./generated/appRegistry.js').LifeOsAppId} LifeOsAppId */
export { LIFE_OS_SITE_META } from './generated/appRegistry.js'
import { LIFE_OS_SITE_META } from './generated/appRegistry.js'

/** 个人工具类 PWA：默认不对搜索引擎索引 */
export const LIFE_OS_ROBOTS = 'noindex, nofollow'

export const LIFE_OS_REFERRER = 'strict-origin-when-cross-origin'

/**
 * @param {string | null | undefined} pageTitle
 * @param {string} appName
 */
export function formatDocumentTitle(pageTitle, appName) {
  const page = pageTitle?.trim()
  if (!page || page === appName) return appName
  return `${page} · ${appName}`
}

/**
 * @param {LifeOsAppId} appId
 * @param {'zh' | 'en' | string} [locale]
 */
export function getSiteDescription(appId, locale = 'zh') {
  const meta = LIFE_OS_SITE_META[appId]
  return locale === 'en' ? meta.description.en : meta.description.zh
}

/**
 * @param {string | null | undefined} origin
 * @param {string} path
 */
export function absoluteUrl(origin, path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!origin) return normalizedPath
  return `${origin.replace(/\/$/, '')}${normalizedPath}`
}

/**
 * @param {LifeOsAppId} appId
 * @param {'zh' | 'en' | string} [locale]
 */
export function getOgLocale(locale = 'zh') {
  return locale === 'en' ? 'en_US' : 'zh_CN'
}
