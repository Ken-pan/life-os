import { APPS, MODES, VIEWPORTS, SHOWCASE_IDS } from './catalogNav.js'

/**
 * @param {URLSearchParams} params
 */
export function readCatalogParams(params) {
  const showcase = params.get('showcase') || 'tokens'
  const app = params.get('app') || 'planner'
  const mode = params.get('mode') || 'light'
  const viewport = params.get('viewport') || 'desktop'
  const view = params.get('view') === 'matrix' ? 'matrix' : 'detail'
  const embed = params.get('embed') === '1'
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
    view: /** @type {'detail' | 'matrix'} */ (view),
    embed,
  }
}

/**
 * @param {{ showcase: string, app: string, mode: string, viewport?: string, view?: string, embed?: boolean }} state
 */
export function buildCatalogSearchParams(state) {
  const params = new URLSearchParams()
  params.set('showcase', state.showcase)
  params.set('app', state.app)
  params.set('mode', state.mode)
  params.set('viewport', state.viewport ?? 'desktop')
  if (state.view === 'matrix') params.set('view', 'matrix')
  if (state.embed) params.set('embed', '1')
  return params
}

/**
 * @param {{ showcase: string, app: string, mode: string, viewport?: string, view?: string, embed?: boolean }} state
 */
export function catalogUrlFromState(state) {
  return `/?${buildCatalogSearchParams(state).toString()}`
}

/**
 * @param {{ showcase: string, app: string, mode: string, viewport: string, view?: string, embed?: boolean }} state
 */
export function writeCatalogParams(state) {
  const url = new URL(window.location.href)
  const params = buildCatalogSearchParams({
    ...state,
    view: state.view ?? 'detail',
    embed: state.embed ?? false,
  })
  url.search = params.toString()
  history.replaceState(null, '', url)
}

/**
 * @param {string} showcase
 */
export function showcasePath(showcase) {
  return `/?showcase=${showcase}`
}

/**
 * @param {string} showcase
 * @param {string} app
 * @param {string} mode
 */
export function matrixEmbedUrl(showcase, app, mode) {
  return catalogUrlFromState({
    showcase,
    app,
    mode,
    viewport: 'desktop',
    embed: true,
  })
}

export { APPS, MODES, VIEWPORTS } from './catalogNav.js'

/** @type {Record<string, { width: number, label: string }>} */
export const VIEWPORT_SIZES = {
  desktop: { width: 1440, label: 'Desktop 1440' },
  tablet: { width: 768, label: 'Tablet 768' },
  mobile: { width: 390, label: 'Mobile 390' },
}
