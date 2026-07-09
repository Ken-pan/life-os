import { getLifeOsBrand } from './brand.js'

/** @typedef {import('./siteMeta.js').LifeOsAppId} LifeOsAppId */

/** @type {Record<LifeOsAppId, { production: string; devPort: number }>} */
export const LIFE_OS_APP_ORIGINS = {
  portal: { production: 'https://portal.kenos.space', devPort: 5195 },
  planner: { production: 'https://planner.kenos.space', devPort: 5188 },
  finance: { production: 'https://finance.kenos.space', devPort: 5180 },
  fitness: { production: 'https://fitness.kenos.space', devPort: 5190 },
  music: { production: 'https://music.kenos.space', devPort: 5189 },
  home: { production: 'https://home.kenos.space', devPort: 5196 },
}

/**
 * Sidebar switcher order (product apps only — Portal is the launcher hub, not listed here).
 * @type {Array<{ id: LifeOsAppId; experimental?: boolean }>}
 */
export const LIFE_OS_SWITCHER_APPS = [
  { id: 'planner' },
  { id: 'finance' },
  { id: 'fitness' },
  { id: 'music' },
  { id: 'home', experimental: true },
]

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
