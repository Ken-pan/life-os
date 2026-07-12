/**
 * Life OS 移动端滚动 QA（浏览器 + PWA standalone）
 * Config: scripts/pwa/apps.config.mjs
 * Scroll resolution: @life-os/theme shell.js (resolveScrollRoot)
 *
 * Usage:
 *   npm run pwa:build
 *   npm run pwa:preview:planner &   # auto-builds if missing
 *   npm run qa:mobile-scroll
 *
 * Env:
 *   SCROLL_QA_APPS=planner,fitness
 *   SCROLL_QA_<APP>_URL=http://127.0.0.1:PORT  (override per app, uppercase id)
 */
import { chromium, devices } from 'playwright'
import { resolveScrollRoot } from '@life-os/theme'
import { appBaseUrl, resolveAppFilter } from './pwa/apps.config.mjs'

/** @param {import('./pwa/apps.config.mjs').PwaAppConfig} app */
function toScrollQaApp(app) {
  const envKey = `SCROLL_QA_${app.id.toUpperCase()}_URL`
  return {
    id: app.id,
    url: process.env[envKey] ?? appBaseUrl(app),
    path: app.scrollQaPath,
    waitSelector: app.waitSelector,
    scrollSelectors: app.scrollSelectors,
    shellType: app.shellType,
    moreButton: app.moreButton,
    moreClose: app.moreClose,
    clipPaths: app.clipPaths,
    authGate: app.authGate,
  }
}

const targets = resolveAppFilter(process.env.SCROLL_QA_APPS)
  .filter((a) => a.production)
  .map(toScrollQaApp)

/** @type {{ app: string, case: string, ok: boolean, detail?: string }[]} */
const results = []

function record(app, testCase, ok, detail = '') {
  results.push({ app, case: testCase, ok, detail })
  const mark = ok ? '✓' : '✗'
  console.log(`${mark} [${app}] ${testCase}${detail ? ` — ${detail}` : ''}`)
}

/** @param {import('playwright').Page} page */
async function pickScrollRoot(page, scrollSelectors) {
  return page.evaluate(
    ({ selectors, resolveScrollRootSource }) => {
      const resolveScrollRoot = new Function(
        `return (${resolveScrollRootSource})`,
      )()
      const hit = resolveScrollRoot(document, selectors)
      if (!hit) return null
      return { selector: hit.selector }
    },
    {
      selectors: scrollSelectors,
      resolveScrollRootSource: resolveScrollRoot.toString(),
    },
  )
}

/** @param {import('playwright').Page} page */
async function ensureScrollable(page, scrollSelectors) {
  return page.evaluate(
    ({ selectors, resolveScrollRootSource }) => {
      const resolveScrollRoot = new Function(
        `return (${resolveScrollRootSource})`,
      )()
      const hit = resolveScrollRoot(document, selectors)
      if (!hit) return { ok: false, reason: 'scroll root missing' }
      const root = hit.node
      let filler = document.getElementById('__scroll_qa_filler')
      if (!filler) {
        filler = document.createElement('div')
        filler.id = '__scroll_qa_filler'
        filler.style.height = '3200px'
        filler.style.pointerEvents = 'none'
        root.appendChild(filler)
      }
      return {
        ok: root.scrollHeight - root.clientHeight > 200,
        selector: hit.selector,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
      }
    },
    {
      selectors: scrollSelectors,
      resolveScrollRootSource: resolveScrollRoot.toString(),
    },
  )
}

async function checkPwaNestedWrap(page, appId, clipPath, baseUrl) {
  await page.goto(`${baseUrl}${clipPath}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  })
  await page.waitForSelector('.app-shell', { timeout: 30000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() =>
    document.documentElement.classList.add('standalone-pwa'),
  )

  const metrics = await page.evaluate(() => {
    const main = document.getElementById('main-content')
    const wrap = main?.querySelector('.wrap')
    const body = getComputedStyle(document.body)
    const mainCs = main ? getComputedStyle(main) : null
    const wrapCs = wrap ? getComputedStyle(wrap) : null

    if (!main) return { ok: false, reason: 'missing #main-content' }
    if (!wrap)
      return { ok: true, skip: true, reason: 'no nested .wrap on page' }

    const wrapOk =
      wrapCs.height !== '0px' &&
      wrapCs.overflowY === 'visible' &&
      wrap.offsetHeight > 80 &&
      wrap.scrollHeight >= wrap.offsetHeight - 4

    const shellOk =
      body.display === 'flex' &&
      mainCs.overflowY === 'auto' &&
      main.scrollHeight >= wrap.offsetHeight - 8

    return {
      ok: wrapOk && shellOk,
      bodyDisplay: body.display,
      mainOverflowY: mainCs.overflowY,
      mainClientHeight: main.clientHeight,
      mainScrollHeight: main.scrollHeight,
      wrapHeight: wrapCs.height,
      wrapOverflowY: wrapCs.overflowY,
      wrapOffsetHeight: wrap.offsetHeight,
      wrapScrollHeight: wrap.scrollHeight,
    }
  })

  record(
    appId,
    `pwa:clip${clipPath}`,
    metrics.ok,
    metrics.skip ? metrics.reason : JSON.stringify(metrics),
  )
}

async function checkPwaShellColumnWorkspace(page, appId, clipPath, baseUrl) {
  await page.goto(`${baseUrl}${clipPath}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  })
  await page.waitForSelector('.app-shell', { timeout: 30000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() =>
    document.documentElement.classList.add('standalone-pwa'),
  )

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('.life-os-shell-column')
    const surface =
      shell?.querySelector(':scope > .life-os-page-workspace') ??
      shell?.querySelector(':scope > .wrap')
    const wrap = surface?.querySelector('.wrap')
    const body = getComputedStyle(document.body)

    if (!shell) return { ok: false, reason: 'missing .life-os-shell-column' }
    if (!surface)
      return { ok: false, reason: 'missing shell column scroll surface' }

    let filler = document.getElementById('__scroll_qa_shell_filler')
    if (!filler) {
      filler = document.createElement('div')
      filler.id = '__scroll_qa_shell_filler'
      filler.style.height = '2400px'
      filler.style.pointerEvents = 'none'
      surface.appendChild(filler)
    }

    const surfaceCs = getComputedStyle(surface)
    const surfaceOk =
      surfaceCs.overflowY === 'auto' &&
      surface.scrollHeight > surface.clientHeight + 40

    if (!wrap) {
      return {
        ok: surfaceOk,
        skip: !wrap,
        reason: 'direct .wrap surface (no nested wrap)',
        surfaceOverflowY: surfaceCs.overflowY,
        surfaceScrollHeight: surface.scrollHeight,
        surfaceClientHeight: surface.clientHeight,
      }
    }

    const wrapCs = getComputedStyle(wrap)
    const wrapOk =
      wrapCs.height !== '0px' &&
      wrapCs.overflowY === 'visible' &&
      wrap.offsetHeight > 80

    return {
      ok: surfaceOk && wrapOk,
      bodyDisplay: body.display,
      surfaceOverflowY: surfaceCs.overflowY,
      surfaceScrollHeight: surface.scrollHeight,
      surfaceClientHeight: surface.clientHeight,
      wrapHeight: wrapCs.height,
      wrapOverflowY: wrapCs.overflowY,
      wrapOffsetHeight: wrap.offsetHeight,
    }
  })

  record(
    appId,
    `pwa:shell-col${clipPath}`,
    metrics.ok,
    metrics.skip ? metrics.reason : JSON.stringify(metrics),
  )
}

async function runApp(browser, app) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    hasTouch: true,
  })
  const page = await context.newPage()

  try {
    await page.goto(`${app.url}${app.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })
    await page.waitForSelector(app.waitSelector, { timeout: 30000 })
    await page.waitForLoadState('networkidle').catch(() => {})

    const hasShell = await page.evaluate(
      () => !!document.querySelector('.app-shell'),
    )
    if (!hasShell && app.authGate) {
      record(
        app.id,
        'prep:auth-gate',
        true,
        'auth screen — shell tests skipped',
      )
      return
    }

    await page.evaluate(() =>
      document.documentElement.classList.add('standalone-pwa'),
    )
    const prep = await ensureScrollable(page, app.scrollSelectors)
    record(app.id, 'prep:scroll-root', prep.ok, JSON.stringify(prep))

    await page.evaluate(() =>
      document.documentElement.classList.remove('standalone-pwa'),
    )
    const docBefore = await page.evaluate(() => window.scrollY)
    await page.evaluate(() => window.scrollTo(0, 1400))
    await page.waitForTimeout(120)
    const docAfter = await page.evaluate(() => ({
      scrollY: window.scrollY,
      bodyOverflow: getComputedStyle(document.body).overflowY,
      bodyPos: getComputedStyle(document.body).position,
    }))
    record(
      app.id,
      'scroll:document',
      docAfter.scrollY > docBefore + 200 || docAfter.scrollY > 400,
      JSON.stringify(docAfter),
    )

    await page.evaluate(() =>
      document.documentElement.classList.add('standalone-pwa'),
    )
    const scrollHit = await pickScrollRoot(page, app.scrollSelectors)
    if (scrollHit?.selector) {
      const before = await page.evaluate((selector) => {
        const el = document.querySelector(selector)
        return el instanceof HTMLElement ? el.scrollTop : 0
      }, scrollHit.selector)
      const after = await page.evaluate(
        ({ selector, delta }) => {
          const el = document.querySelector(selector)
          if (!(el instanceof HTMLElement)) {
            return { scrollTop: 0, overflow: '' }
          }
          el.scrollTop = Math.min(
            el.scrollHeight - el.clientHeight,
            el.scrollTop + delta,
          )
          return {
            scrollTop: el.scrollTop,
            overflow: getComputedStyle(el).overflowY,
          }
        },
        { selector: scrollHit.selector, delta: 420 },
      )
      record(
        app.id,
        'scroll:pwa-surface',
        after.scrollTop > before + 80,
        JSON.stringify({ selector: scrollHit.selector, before, after }),
      )
    } else {
      record(app.id, 'scroll:pwa-surface', false, 'scroll root not found')
    }

    await page.evaluate(() =>
      document.documentElement.classList.add('standalone-pwa'),
    )
    const pwa = await page.evaluate(
      ({ selectors, resolveScrollRootSource }) => {
        const resolveScrollRoot = new Function(
          `return (${resolveScrollRootSource})`,
        )()
        const hit = resolveScrollRoot(document, selectors)
        const content = hit?.node
        if (!content) return { ok: false, reason: 'missing nodes' }
        const canScroll = content.scrollHeight - content.clientHeight > 200
        content.scrollTop = 1600
        return {
          ok:
            getComputedStyle(document.body).overflowY === 'hidden' &&
            (!canScroll || content.scrollTop > 400),
          selector: hit.selector,
          bodyOverflow: getComputedStyle(document.body).overflowY,
          contentScrollTop: content.scrollTop,
          contentOverflow: getComputedStyle(content).overflowY,
        }
      },
      {
        selectors: app.scrollSelectors,
        resolveScrollRootSource: resolveScrollRoot.toString(),
      },
    )
    record(app.id, 'scroll:pwa-content', pwa.ok, JSON.stringify(pwa))

    await page.evaluate(() =>
      document.documentElement.classList.remove('standalone-pwa'),
    )
    if (app.moreButton) {
      const moreBtn = page.locator(app.moreButton).first()
      if ((await moreBtn.count()) > 0) {
        await moreBtn.click()
        await page.waitForTimeout(200)
        const close = app.moreClose ? page.locator(app.moreClose).first() : null
        if (close && (await close.count()) > 0) {
          await close.click()
          await page.waitForTimeout(200)
        } else {
          await page.keyboard.press('Escape')
          await page.waitForTimeout(200)
        }
        const afterMore = await page.evaluate(() => {
          window.scrollTo(0, 900)
          return {
            bodyPos: getComputedStyle(document.body).position,
            bodyInlinePos: document.body.style.position,
            scrollY: window.scrollY,
          }
        })
        record(
          app.id,
          'scroll:after-more-sheet',
          afterMore.bodyPos !== 'fixed' &&
            afterMore.bodyInlinePos !== 'fixed' &&
            afterMore.scrollY > 200,
          JSON.stringify(afterMore),
        )
      } else {
        record(
          app.id,
          'scroll:after-more-sheet',
          true,
          'skipped — no more button',
        )
      }
    } else {
      record(
        app.id,
        'scroll:after-more-sheet',
        true,
        'skipped — no more button',
      )
    }

    if (app.shellType === 'main-wrap-main' && app.clipPaths?.length) {
      for (const clipPath of app.clipPaths) {
        await checkPwaNestedWrap(page, app.id, clipPath, app.url)
      }
    }

    if (app.shellType === 'main-col-wrap' && app.clipPaths?.length) {
      for (const clipPath of app.clipPaths) {
        await checkPwaShellColumnWorkspace(page, app.id, clipPath, app.url)
      }
    }
  } catch (err) {
    record(
      app.id,
      'fatal',
      false,
      err instanceof Error ? err.message : String(err),
    )
  } finally {
    await context.close()
  }
}

async function main() {
  if (targets.length === 0) {
    console.error('No apps matched SCROLL_QA_APPS filter')
    process.exit(1)
  }

  const browser = await chromium.launch({ headless: true })
  try {
    for (const app of targets) {
      console.log(`\n── ${app.id} ${app.url}${app.path} ──`)
      await runApp(browser, app)
    }
  } finally {
    await browser.close()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    console.error('\nFailed:')
    for (const f of failed) {
      console.error(`  [${f.app}] ${f.case}${f.detail ? `: ${f.detail}` : ''}`)
    }
    process.exit(1)
  }
}

main()
