/**
 * Life OS app shell + mobile scroll surface contract (SSOT).
 *
 * CSS: scroll-shell.css (imported via design-system.css)
 * QA: scripts/pwa/apps.config.mjs → getScrollRootSelectorForShell()
 */

/** @typedef {'main-wrap-main' | 'main-wrap-content' | 'main-col-wrap'} LifeOsShellType */

export const LIFE_OS_SHELL = {
  /** Explicit scroll container — prefer on the one element that scrolls in PWA */
  scrollSurfaceClass: 'life-os-scroll-surface',
  /** Planner / Portal / Home column (no nested .main-wrap) */
  shellColumnClass: 'life-os-shell-column',
  /** Grid / split page workspace; scrolls when direct child of shell column */
  pageWorkspaceClass: 'life-os-page-workspace',
  types: {
    mainWrapMain: 'main-wrap-main',
    mainWrapContent: 'main-wrap-content',
    mainColWrap: 'main-col-wrap',
  },
}

/** Shell column selector for CSS :is() compounds */
export const LIFE_OS_SHELL_COLUMN_IS =
  ':is(.life-os-shell-column, .main-col:not(:has(.main-wrap)))'

/** Scroll surfaces inside .main-wrap (Fitness / Music / Finance) */
export const LIFE_OS_MAIN_WRAP_SCROLL_SELECTORS = [
  '.main-wrap > .life-os-scroll-surface',
  '.main-wrap > #main-content',
  '.main-wrap > .content',
  '.main-wrap > .wrap',
]

/** Scroll surfaces inside shell column — expanded (Playwright-safe, no :is()) */
export const LIFE_OS_SHELL_COLUMN_SCROLL_SELECTORS = [
  '.life-os-shell-column > .life-os-scroll-surface',
  '.life-os-shell-column > .life-os-page-workspace',
  '.life-os-shell-column > .wrap',
  '.life-os-shell-column > .auth-wrap',
  '.main-col:not(:has(.main-wrap)) > .life-os-scroll-surface',
  '.main-col:not(:has(.main-wrap)) > .life-os-page-workspace',
  '.main-col:not(:has(.main-wrap)) > .wrap',
  '.main-col:not(:has(.main-wrap)) > .auth-wrap',
]

/** All scroll roots — priority order for resolveScrollRoot() */
export const LIFE_OS_SCROLL_ROOT_SELECTORS = [
  '.life-os-scroll-surface',
  ...LIFE_OS_MAIN_WRAP_SCROLL_SELECTORS,
  ...LIFE_OS_SHELL_COLUMN_SCROLL_SELECTORS,
]

/** @type {Record<LifeOsShellType, readonly string[]>} */
export const LIFE_OS_SCROLL_ROOT_SELECTORS_BY_SHELL = {
  'main-wrap-main': [
    '.main-wrap > #main-content',
    '.main-wrap > .life-os-scroll-surface',
  ],
  'main-wrap-content': [
    '.main-wrap > .content',
    '.main-wrap > .life-os-scroll-surface',
  ],
  'main-col-wrap': LIFE_OS_SHELL_COLUMN_SCROLL_SELECTORS,
}

/** @type {Record<LifeOsShellType, string>} */
export const LIFE_OS_SHELL_REFERENCE = {
  'main-wrap-main':
    'Fitness / Music — `.main-wrap > #main-content` scrolls; nested `.wrap` must stay `height: auto`',
  'main-wrap-content': 'Finance — `.main-wrap > .content` scrolls',
  'main-col-wrap':
    'Planner / Portal / Home — shell column direct child (`.life-os-page-workspace` / `.wrap` / `.life-os-scroll-surface`) scrolls',
}

/**
 * @param {LifeOsShellType} shellType
 * @returns {readonly string[]}
 */
export function getScrollRootSelectorsForShell(shellType) {
  return (
    LIFE_OS_SCROLL_ROOT_SELECTORS_BY_SHELL[shellType] ??
    LIFE_OS_SCROLL_ROOT_SELECTORS
  )
}

/**
 * @param {LifeOsShellType} shellType
 * @returns {string}
 */
export function getScrollRootSelectorForShell(shellType) {
  return getScrollRootSelectorsForShell(shellType).join(', ')
}

/** @returns {string} */
export function getScrollRootSelector() {
  return LIFE_OS_SCROLL_ROOT_SELECTORS.join(', ')
}

/**
 * @param {Document} doc
 * @param {readonly string[]} selectors
 * @returns {{ node: HTMLElement, selector: string } | null}
 */
export function resolveScrollRoot(doc, selectors) {
  for (const selector of selectors) {
    for (const el of doc.querySelectorAll(selector)) {
      if (!(el instanceof HTMLElement)) continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (el.scrollHeight > el.clientHeight + 1) {
        return { node: el, selector }
      }
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        return { node: el, selector }
      }
    }
  }

  for (const selector of selectors) {
    const el = doc.querySelector(selector)
    if (el instanceof HTMLElement) return { node: el, selector }
  }

  return null
}

/**
 * @param {Document | undefined} doc
 * @param {readonly string[]} [selectors]
 * @returns {HTMLElement | null}
 */
export function findActiveScrollRoot(
  doc = typeof document !== 'undefined' ? document : undefined,
  selectors = LIFE_OS_SCROLL_ROOT_SELECTORS,
) {
  if (!doc) return null
  return resolveScrollRoot(doc, selectors)?.node ?? null
}
