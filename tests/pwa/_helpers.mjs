/**
 * @param {{ mainQuery: string, nestedWrapInMain: boolean }} opts
 */
export function collectShellMetricsInBrowser(opts) {
  const { mainQuery, nestedWrapInMain } = opts
  const pick = (sel) => {
    for (const part of sel.split(',').map((s) => s.trim())) {
      const el = document.querySelector(part)
      if (el instanceof HTMLElement) return el
    }
    return null
  }

  const main = pick(mainQuery)
  const wrap = nestedWrapInMain ? main?.querySelector('.wrap') : null
  const body = getComputedStyle(document.body)
  const mainCs = main ? getComputedStyle(main) : null
  const wrapCs = wrap ? getComputedStyle(wrap) : null
  const hasAppShell = !!document.querySelector('.app-shell')
  const hasAuthScreen = !!document.querySelector('.auth-screen')

  return {
    hasAppShell,
    hasAuthScreen,
    bodyDisplay: body.display,
    bodyOverflowY: body.overflowY,
    innerHeight: window.innerHeight,
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
    mainTag: main?.tagName ?? null,
    mainId: main?.id || null,
    mainClassName: main?.className ?? null,
    mainClientHeight: main?.clientHeight ?? null,
    mainScrollHeight: main?.scrollHeight ?? null,
    mainOverflowY: mainCs?.overflowY ?? null,
    mainHeight: mainCs?.height ?? null,
    wrapHeight: wrapCs?.height ?? null,
    wrapOverflowY: wrapCs?.overflowY ?? null,
    wrapOffsetHeight: wrap?.offsetHeight ?? 0,
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('../pwa/apps.config.mjs').PwaAppConfig} app
 * @param {boolean} standalone
 */
export async function readShellMetrics(page, app, standalone = false) {
  await page.waitForLoadState('networkidle').catch(() => {})
  if (standalone) {
    await page.evaluate(() => {
      document.documentElement.classList.add('standalone-pwa')
      document.documentElement.style.setProperty('--app-vh', '100vh')
      document.documentElement.style.setProperty('--safe-top-effective', '59px')
      document.documentElement.style.setProperty('--safe-bottom-effective', '34px')
      document.documentElement.style.setProperty('--mobile-tabbar-safe-padding', '34px')
    })
    await page.waitForFunction(
      () =>
        document.documentElement.classList.contains('standalone-pwa') &&
        getComputedStyle(document.body).display === 'flex',
      undefined,
      { timeout: 8_000 },
    )
    await page.waitForTimeout(200)
  }
  return page.evaluate(collectShellMetricsInBrowser, {
    mainQuery: app.mainQuery,
    nestedWrapInMain: app.nestedWrapInMain,
  })
}
