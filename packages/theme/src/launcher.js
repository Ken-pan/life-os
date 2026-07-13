/**
 * PLAT.GEN.4：LIFE_OS_APP_ORIGINS / LIFE_OS_SWITCHER_APPS 由
 * scripts/build-app-registry.mjs 从各 app.manifest.json 生成；
 * 本文件只保留行为函数。
 */
import { getLifeOsBrand } from './brand.js'
import { LIFE_OS_APP_ORIGINS } from './generated/appRegistry.js'

export { LIFE_OS_APP_ORIGINS, LIFE_OS_SWITCHER_APPS } from './generated/appRegistry.js'

/** @typedef {import('./siteMeta.js').LifeOsAppId} LifeOsAppId */

/**
 * @param {LifeOsAppId} appId
 */
export function getLifeOsAppOrigin(appId) {
  const cfg = LIFE_OS_APP_ORIGINS[appId]
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://127.0.0.1:${cfg.devPort}`
    }
  }
  return cfg.production
}

/**
 * Production origin for static brand marks (works in local dev when other apps aren't running).
 * @param {LifeOsAppId} appId
 */
export function getLifeOsAppBrandOrigin(appId) {
  return LIFE_OS_APP_ORIGINS[appId].production
}

/**
 * @param {LifeOsAppId} appId
 * @param {'light' | 'dark'} [theme]
 */
export function getLifeOsAppBrandIconUrl(appId, theme = 'light') {
  const brand = getLifeOsBrand(appId)
  const origin = getLifeOsAppBrandOrigin(appId)
  return `${origin}${theme === 'dark' ? brand.dark : brand.light}`
}

/**
 * @param {LifeOsAppId} appId
 */
export function getLifeOsAppBrandMark(appId) {
  const brand = getLifeOsBrand(appId)
  const origin = getLifeOsAppBrandOrigin(appId)
  const joinSrcSet = (srcSet) =>
    srcSet
      .split(', ')
      .map((part) => {
        const [path, scale] = part.split(' ')
        return `${origin}${path} ${scale}`
      })
      .join(', ')

  return {
    light: `${origin}${brand.light}`,
    dark: `${origin}${brand.dark}`,
    lightSrcSet: joinSrcSet(brand.lightSrcSet),
    darkSrcSet: joinSrcSet(brand.darkSrcSet),
  }
}
