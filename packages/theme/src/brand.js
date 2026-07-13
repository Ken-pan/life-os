/**
 * PLAT.GEN.4：wordmark base / asset prefix / accent 数据由
 * scripts/build-app-registry.mjs 从各 app.manifest.json 生成；
 * 本文件只保留行为函数与展示常量。
 */
import { LIFE_OS_SITE_META } from './siteMeta.js'
import {
  LIFE_OS_APP_WORDMARK_ACCENT,
  LIFE_OS_BRAND_ASSET_PREFIX,
  LIFE_OS_WORDMARK_BASE,
} from './generated/appRegistry.js'

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
  const assetPrefix = LIFE_OS_BRAND_ASSET_PREFIX[appId] ?? ''
  return {
    appId,
    wordmarkBase: LIFE_OS_WORDMARK_BASE[appId] ?? meta.shortName,
    wordmarkAccent: 'OS',
    fullName: meta.name,
    assetPrefix,
    ...getBrandIconPaths(assetPrefix),
  }
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
