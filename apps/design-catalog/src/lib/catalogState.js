import { APPS, MODES, VIEWPORTS, SHOWCASE_IDS } from './catalogNav.js'

/**
 * @param {URLSearchParams} params
 */
export function readCatalogParams(params) {
  const showcase = params.get('showcase') || 'tokens'
  const app = params.get('app') || 'planner'
  const mode = params.get('mode') || 'light'
  const viewport = params.get('viewport') || 'desktop'
  return {
    showcase:
      /** @type {import('./catalogNav.js').CATALOG_SECTIONS[number]['id']} */ (
        SHOWCASE_IDS.includes(showcase) ? showcase : 'tokens'
      ),
    app: /** @type {(typeof APPS)[number]} */ (
      APPS.includes(/** @type {any} */ (app)) ? app : 'planner'
    ),
    mode: /** @type {(typeof MODES)[number]} */ (
      MODES.includes(/** @type {any} */ (mode)) ? mode : 'light'
    ),
    viewport: /** @type {(typeof VIEWPORTS)[number]} */ (
      VIEWPORTS.includes(/** @type {any} */ (viewport)) ? viewport : 'desktop'
    ),
  }
}

/**
 * @param {{ showcase: string, app: string, mode: string, viewport: string }} state
 */
export function writeCatalogParams(state) {
  const url = new URL(window.location.href)
  url.searchParams.set('showcase', state.showcase)
  url.searchParams.set('app', state.app)
  url.searchParams.set('mode', state.mode)
  url.searchParams.set('viewport', state.viewport)
  history.replaceState(null, '', url)
}

/**
 * @param {string} showcase
 */
export function showcasePath(showcase) {
  return `/?showcase=${showcase}`
}

export { APPS, MODES, VIEWPORTS } from './catalogNav.js'

/** @type {Record<string, { width: number, label: string }>} */
export const VIEWPORT_SIZES = {
  desktop: { width: 1440, label: 'Desktop 1440' },
  tablet: { width: 768, label: 'Tablet 768' },
  mobile: { width: 390, label: 'Mobile 390' },
}
