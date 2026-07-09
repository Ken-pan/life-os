/**
 * Paste CONSOLE_SNIPPET into Safari Web Inspector Console (Simulator or device).
 * CLI: node scripts/pwa/collect-viewport-metrics.js
 */
import { fileURLToPath } from 'node:url'

export function collectViewportMetrics() {
  const scrollSelectors = [
    '.life-os-scroll-surface',
    '.main-wrap > #main-content',
    '.main-wrap > .content',
    '.life-os-shell-column > .life-os-page-workspace',
    '.life-os-shell-column > .wrap',
    '.main-col:not(:has(.main-wrap)) > .life-os-page-workspace',
    '.main-col:not(:has(.main-wrap)) > .wrap',
  ]

  let main = null
  for (const selector of scrollSelectors) {
    const el = document.querySelector(selector)
    if (el instanceof HTMLElement) {
      main = el
      break
    }
  }

  if (!main) {
    main =
      document.querySelector('[data-app-main]') ||
      document.querySelector('main') ||
      document.scrollingElement
  }

  const tabbar =
    document.querySelector('[data-bottom-tabbar]') ||
    document.querySelector('.bottom-nav') ||
    document.querySelector('nav.nav') ||
    document.querySelector('.mobile-tabbar') ||
    document.querySelector('.bottom-shell .nav')

  const wrap = main?.querySelector('.wrap')

  const data = {
    displayModeStandalone: window.matchMedia('(display-mode: standalone)')
      .matches,
    navigatorStandalone: window.navigator.standalone === true,
    htmlStandaloneClass:
      document.documentElement.classList.contains('standalone-pwa'),
    innerHeight: window.innerHeight,
    outerHeight: window.outerHeight,
    documentClientHeight: document.documentElement.clientHeight,
    bodyClientHeight: document.body?.clientHeight,
    visualViewportHeight: window.visualViewport?.height,
    visualViewportOffsetTop: window.visualViewport?.offsetTop,
    appVh: getComputedStyle(document.documentElement)
      .getPropertyValue('--app-vh')
      .trim(),
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    main: main
      ? {
          tag: main.tagName,
          id: main.id || null,
          className: main.className,
          clientHeight: main.clientHeight,
          scrollHeight: main.scrollHeight,
          scrollTop: main.scrollTop,
          overflowY: getComputedStyle(main).overflowY,
          height: getComputedStyle(main).height,
          minHeight: getComputedStyle(main).minHeight,
          paddingBottom: getComputedStyle(main).paddingBottom,
        }
      : null,
    wrap: wrap
      ? {
          clientHeight: wrap.clientHeight,
          scrollHeight: wrap.scrollHeight,
          overflowY: getComputedStyle(wrap).overflowY,
          height: getComputedStyle(wrap).height,
          minHeight: getComputedStyle(wrap).minHeight,
        }
      : null,
    tabbar: tabbar
      ? {
          tag: tabbar.tagName,
          className: tabbar.className,
          clientHeight: tabbar.clientHeight,
          position: getComputedStyle(tabbar).position,
          bottom: getComputedStyle(tabbar).bottom,
          height: getComputedStyle(tabbar).height,
          paddingBottom: getComputedStyle(tabbar).paddingBottom,
        }
      : null,
  }

  console.table(data)
  console.log(JSON.stringify(data, null, 2))
  return data
}

/** Browser Console one-liner */
export const CONSOLE_SNIPPET = `(${collectViewportMetrics.toString()})()`

const isCli = process.argv[1] === fileURLToPath(import.meta.url)
if (isCli) {
  console.log('# iOS PWA viewport metrics\n')
  console.log('## Usage\n')
  console.log('1. Mac Safari → Develop → [Simulator/Device] → [page]')
  console.log('2. Paste the snippet below into Console\n')
  console.log('## Snippet\n')
  console.log(CONSOLE_SNIPPET)
}
