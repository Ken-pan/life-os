/**
 * Life OS PWA debug — single source of truth for all apps.
 * Used by: playwright, mobile-scroll-qa, ios-sim scripts, healthcheck, docs.
 *
 * Scroll selectors: @life-os/theme shell.js (getScrollRootSelectorForShell)
 */

import {
  LIFE_OS_SHELL as LIFE_OS_SHELL_REFERENCE,
  getScrollRootSelectorForShell,
  getScrollRootSelectorsForShell,
} from '../../packages/theme/src/shell.js'

/** @typedef {import('@life-os/theme').LifeOsShellType} LifeOsShellType */

/**
 * @typedef {object} PwaRoute
 * @property {string} path
 * @property {string} name
 */

/**
 * @typedef {object} PwaAppConfig
 * @property {string} id
 * @property {string} name
 * @property {string} workspace npm workspace name
 * @property {number} port default preview port
 * @property {LifeOsShellType} shellType
 * @property {string} waitSelector
 * @property {string} scrollSelector primary scroll container(s) — comma string for docs
 * @property {readonly string[]} scrollSelectors ordered list for resolveScrollRoot()
 * @property {string} mainQuery element for metrics (first match)
 * @property {boolean} nestedWrapInMain true if .wrap is inside #main-content (clip guard)
 * @property {PwaRoute[]} routes pages for viewport tests
 * @property {string[]} [clipPaths] extra paths for scroll-qa clip checks
 * @property {string} scrollQaPath default path for life-os-mobile-scroll-qa
 * @property {string} [moreButton]
 * @property {string} [moreClose]
 * @property {boolean} [authGate] may show login instead of .app-shell
 * @property {boolean} [production] deployed to Netlify
 * @property {boolean} [pwaTestEnabled] include in playwright projects
 */

/** @param {LifeOsShellType} shellType */
function scrollSelectorsFor(shellType) {
  const scrollSelectors = getScrollRootSelectorsForShell(shellType)
  const scrollSelector = getScrollRootSelectorForShell(shellType)
  return { scrollSelector, scrollSelectors, mainQuery: scrollSelector }
}

/** @type {Record<string, PwaAppConfig>} */
export const PWA_APPS = {
  planner: {
    id: 'planner',
    name: 'Planner.OS',
    workspace: 'planner-os',
    port: 5188,
    shellType: 'main-col-wrap',
    waitSelector: '.app-shell',
    ...scrollSelectorsFor('main-col-wrap'),
    nestedWrapInMain: false,
    routes: [
      { path: '/', name: 'today' },
      { path: '/settings', name: 'settings' },
      { path: '/calendar', name: 'calendar' },
    ],
    clipPaths: ['/'],
    scrollQaPath: '/settings',
    moreButton:
      '.nav button[aria-label="更多"], .mobile-tabbar button[aria-label="更多"]',
    moreClose: '.mobile-more-close, .sheet-bg',
    production: true,
    pwaTestEnabled: true,
  },
  fitness: {
    id: 'fitness',
    name: 'Fitness.OS',
    workspace: 'fitness-os',
    port: 4173,
    shellType: 'main-wrap-main',
    waitSelector: '.app-shell',
    ...scrollSelectorsFor('main-wrap-main'),
    nestedWrapInMain: true,
    routes: [
      { path: '/', name: 'today' },
      { path: '/program', name: 'program' },
      { path: '/discover', name: 'discover' },
      { path: '/settings', name: 'settings' },
    ],
    clipPaths: ['/discover', '/program', '/'],
    scrollQaPath: '/settings',
    moreButton: '.mobile-tabbar button[aria-label="更多"]',
    moreClose: '.mobile-more-close',
    production: true,
    pwaTestEnabled: true,
  },
  music: {
    id: 'music',
    name: 'Music.OS',
    workspace: 'music-os',
    port: 5191,
    shellType: 'main-wrap-main',
    waitSelector: '.app-shell',
    ...scrollSelectorsFor('main-wrap-main'),
    nestedWrapInMain: true,
    routes: [
      { path: '/', name: 'home' },
      { path: '/library', name: 'library' },
      { path: '/settings', name: 'settings' },
    ],
    clipPaths: ['/'],
    scrollQaPath: '/settings',
    moreButton: '.mobile-tabbar button[aria-label="更多"]',
    moreClose: '.mobile-more-close',
    production: true,
    pwaTestEnabled: true,
  },
  finance: {
    id: 'finance',
    name: 'Finance.OS',
    workspace: 'finance-os',
    port: 5180,
    shellType: 'main-wrap-content',
    waitSelector: '.app-shell, .auth-screen',
    ...scrollSelectorsFor('main-wrap-content'),
    mainQuery: '.main-wrap > .content, .auth-screen',
    nestedWrapInMain: false,
    routes: [
      { path: '/home/today', name: 'home' },
      { path: '/settings/app', name: 'settings' },
    ],
    scrollQaPath: '/home/today',
    moreButton: '.mobile-tabbar button[aria-label="更多"]',
    moreClose: '.mobile-more-close',
    authGate: true,
    production: true,
    pwaTestEnabled: true,
  },
  portal: {
    id: 'portal',
    name: 'Life OS Portal',
    workspace: 'portal',
    port: 5195,
    shellType: 'main-col-wrap',
    waitSelector: '.app-shell, .portal-loading',
    ...scrollSelectorsFor('main-col-wrap'),
    nestedWrapInMain: false,
    routes: [{ path: '/', name: 'home' }],
    scrollQaPath: '/',
    production: false,
    pwaTestEnabled: true,
  },
  home: {
    id: 'home',
    name: 'HOME.OS',
    workspace: 'home-os',
    port: 5196,
    shellType: 'main-col-wrap',
    waitSelector: '.app-shell',
    ...scrollSelectorsFor('main-col-wrap'),
    nestedWrapInMain: false,
    routes: [
      { path: '/', name: 'overview' },
      { path: '/plan', name: 'plan' },
      { path: '/storage', name: 'storage' },
      { path: '/settings', name: 'settings' },
    ],
    clipPaths: ['/settings'],
    scrollQaPath: '/settings',
    production: true,
    pwaTestEnabled: false,
  },
  starter: {
    id: 'starter',
    name: 'STARTER.OS',
    workspace: 'starter-os',
    port: 5875,
    shellType: 'main-wrap-main',
    waitSelector: '.app-shell',
    ...scrollSelectorsFor('main-wrap-main'),
    nestedWrapInMain: true,
    routes: [
      { path: '/', name: 'home' },
      { path: '/settings', name: 'settings' },
    ],
    clipPaths: ['/'],
    scrollQaPath: '/settings',
    production: false,
    pwaTestEnabled: false,
  },
}

/** @param {string} id */
export function getApp(id) {
  const app = PWA_APPS[id]
  if (!app) throw new Error(`Unknown PWA app: ${id}`)
  return app
}

/**
 * @param {{ productionOnly?: boolean, testEnabledOnly?: boolean, ids?: string[] }} [opts]
 */
export function getAppList(opts = {}) {
  let list = Object.values(PWA_APPS)
  if (opts.productionOnly) list = list.filter((a) => a.production)
  if (opts.testEnabledOnly !== false)
    list = list.filter((a) => a.pwaTestEnabled !== false)
  if (opts.ids?.length) list = list.filter((a) => opts.ids.includes(a.id))
  return list
}

/** @param {PwaAppConfig} app */
export function appBaseUrl(app) {
  return `http://127.0.0.1:${app.port}`
}

/** @param {string} [filter] comma-separated app ids */
export function resolveAppFilter(filter) {
  const ids = filter
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return getAppList(ids?.length ? { ids } : {})
}

/** Shell layout reference for docs / rules — re-export from @life-os/theme */
export { LIFE_OS_SHELL_REFERENCE as PWA_SHELL_REFERENCE }
