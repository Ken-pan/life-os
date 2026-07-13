/**
 * Life OS PWA debug — 派生自 app 注册表（PLAT.GEN.4）。
 * Used by: playwright, mobile-scroll-qa, ios-sim scripts, healthcheck, docs.
 *
 * 数据源：apps/<id>/app.manifest.json → packages/theme/src/generated/appRegistry.js
 * （npm run build:app-registry）。本文件负责按 shellType 计算 scroll selector，
 * 并手工保留 starter 模板的调试条目（starter 不进注册表）。
 *
 * Scroll selectors: @life-os/theme shell.js (getScrollRootSelectorForShell)
 */

import {
  LIFE_OS_SHELL as LIFE_OS_SHELL_REFERENCE,
  getScrollRootSelectorForShell,
  getScrollRootSelectorsForShell,
} from '../../packages/theme/src/shell.js'
import { LIFE_OS_PWA_APPS } from '../../packages/theme/src/generated/appRegistry.js'

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

/** 注册表原始条目 → 完整 PwaAppConfig（补 scroll selector，mainQuery 覆盖优先） */
function hydrate(raw) {
  const { mainQuery, ...rest } = raw
  return {
    ...rest,
    ...scrollSelectorsFor(raw.shellType),
    ...(mainQuery != null ? { mainQuery } : {}),
  }
}

/** @type {Record<string, PwaAppConfig>} */
export const PWA_APPS = {
  ...Object.fromEntries(Object.entries(LIFE_OS_PWA_APPS).map(([id, raw]) => [id, hydrate(raw)])),
  // starter 是模板本体，不进 app 注册表；调试条目手工维护
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
