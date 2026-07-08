/**
 * Life OS 四端移动端滚动 QA（浏览器 + PWA standalone）
 *
 * Usage:
 *   npm run build -w @life-os/theme && npm run build:planner && ...
 *   npm run preview -w planner-os -- --port 5188 &
 *   node scripts/life-os-mobile-scroll-qa.mjs
 *
 * Env (optional):
 *   SCROLL_QA_PLANNER_URL  default http://127.0.0.1:5188
 *   SCROLL_QA_FITNESS_URL  default http://127.0.0.1:5173
 *   SCROLL_QA_MUSIC_URL    default http://127.0.0.1:5191
 *   SCROLL_QA_FINANCE_URL  default http://127.0.0.1:5180
 *   SCROLL_QA_APPS         comma list e.g. planner,finance
 */
import { chromium, devices } from 'playwright'

const APPS = [
  {
    id: 'planner',
    url: process.env.SCROLL_QA_PLANNER_URL ?? 'http://127.0.0.1:5188',
    path: '/settings',
    waitSelector: '.app-shell',
    scrollSelector: '.main-col > .wrap, .main-col > .auth-wrap',
    moreButton: '.nav button[aria-label="更多"], .mobile-tabbar button[aria-label="更多"]',
    moreClose: '.mobile-more-close, .sheet-bg',
  },
  {
    id: 'fitness',
    url: process.env.SCROLL_QA_FITNESS_URL ?? 'http://127.0.0.1:5173',
    path: '/settings',
    waitSelector: '.app-shell',
    scrollSelector: '#main-content',
    moreButton: '.mobile-tabbar button[aria-label="更多"]',
    moreClose: '.mobile-more-close',
    clipPaths: ['/discover', '/program', '/'],
  },
  {
    id: 'music',
    url: process.env.SCROLL_QA_MUSIC_URL ?? 'http://127.0.0.1:5191',
    path: '/settings',
    waitSelector: '.app-shell',
    scrollSelector: '#main-content',
    moreButton: '.mobile-tabbar button[aria-label="更多"]',
    moreClose: '.mobile-more-close',
    clipPaths: ['/'],
  },
  {
    id: 'finance',
    url: process.env.SCROLL_QA_FINANCE_URL ?? 'http://127.0.0.1:5180',
    path: '/stocks',
    waitSelector: '.app-shell',
    scrollSelector: '.main-wrap > .content',
    moreButton: '.mobile-tabbar button[aria-label="更多"]',
    moreClose: '.mobile-more-close',
  },
]

const filter = process.env.SCROLL_QA_APPS?.split(',').map((s) => s.trim()).filter(Boolean)
const targets = filter?.length
  ? APPS.filter((a) => filter.includes(a.id))
  : APPS

/** @type {{ app: string, case: string, ok: boolean, detail?: string }[]} */
const results = []

function record(app, testCase, ok, detail = '') {
  results.push({ app, case: testCase, ok, detail })
  const mark = ok ? '✓' : '✗'
  console.log(`${mark} [${app}] ${testCase}${detail ? ` — ${detail}` : ''}`)
}

async function wheelScrollY(page, selector, deltaY) {
  const loc = page.locator(selector).first()
  const box = await loc.boundingBox()
  if (!box) return false
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height * 0.35, box.height - 8))
  await page.mouse.wheel(0, deltaY)
  await page.waitForTimeout(180)
  return true
}

async function ensureScrollable(page, scrollSelector) {
  return page.evaluate((sel) => {
    const pick = () => {
      for (const part of sel.split(',').map((s) => s.trim())) {
        const el = document.querySelector(part)
        if (el instanceof HTMLElement) return el
      }
      return null
    }
    const root = pick()
    if (!root) return { ok: false, reason: 'scroll root missing' }
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
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
    }
  }, scrollSelector)
}

async function queryScrollRoot(page, scrollSelector) {
  return page.evaluate((sel) => {
    for (const part of sel.split(',').map((s) => s.trim())) {
      const el = document.querySelector(part)
      if (el instanceof HTMLElement) return part
    }
    return null
  }, scrollSelector)
}

/** PWA: nested .wrap inside #main-content must not be height:0 clipped */
async function checkPwaNestedWrap(page, appId, clipPath, baseUrl) {
  await page.goto(`${baseUrl}${clipPath}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('.app-shell', { timeout: 30000 })
  await page.evaluate(() => document.documentElement.classList.add('standalone-pwa'))

  const metrics = await page.evaluate(() => {
    const main = document.getElementById('main-content')
    const wrap = main?.querySelector('.wrap')
    const body = getComputedStyle(document.body)
    const mainCs = main ? getComputedStyle(main) : null
    const wrapCs = wrap ? getComputedStyle(wrap) : null

    if (!main) return { ok: false, reason: 'missing #main-content' }
    if (!wrap) return { ok: true, skip: true, reason: 'no nested .wrap on page' }

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
  }, clipPath)

  const label = `pwa:clip${clipPath}`
  record(
    appId,
    label,
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

    await page.evaluate(() => document.documentElement.classList.add('standalone-pwa'))
    const prep = await ensureScrollable(page, app.scrollSelector)
    record(app.id, 'prep:scroll-root', prep.ok, JSON.stringify(prep))

    // Browser mode — document scroll
    await page.evaluate(() => document.documentElement.classList.remove('standalone-pwa'))
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

    // PWA touch scroll on inner root (before programmatic scrollTop assignment)
    await page.evaluate(() => document.documentElement.classList.add('standalone-pwa'))
    const scrollSel = await queryScrollRoot(page, app.scrollSelector)
    if (scrollSel) {
      await page.evaluate((sel) => {
        for (const part of sel.split(',').map((s) => s.trim())) {
          const el = document.querySelector(part)
          if (el instanceof HTMLElement) {
            el.scrollTop = 0
            break
          }
        }
      }, app.scrollSelector)
      const before = await page.evaluate(
        (sel) => document.querySelector(sel.split(',')[0].trim())?.scrollTop ?? 0,
        app.scrollSelector,
      )
      await wheelScrollY(page, scrollSel, 420)
      const after = await page.evaluate((sel) => {
        const part = sel.split(',')[0].trim()
        const el = document.querySelector(part)
        return {
          scrollTop: el?.scrollTop ?? 0,
          overflow: el ? getComputedStyle(el).overflowY : '',
        }
      }, app.scrollSelector)
      record(
        app.id,
        'scroll:pwa-wheel',
        after.scrollTop > before + 80,
        JSON.stringify({ before, after }),
      )
    } else {
      record(app.id, 'scroll:pwa-wheel', false, 'scroll root not found')
    }

    // PWA — inner content scroll, body locked
    await page.evaluate(() => document.documentElement.classList.add('standalone-pwa'))
    const pwa = await page.evaluate((sel) => {
      const pick = () => {
        for (const part of sel.split(',').map((s) => s.trim())) {
          const el = document.querySelector(part)
          if (el instanceof HTMLElement) return el
        }
        return null
      }
      const content = pick()
      const shell = document.querySelector('.app-shell')
      if (!content || !shell) return { ok: false, reason: 'missing nodes' }
      const canScroll = content.scrollHeight - content.clientHeight > 200
      content.scrollTop = 1600
      return {
        ok:
          getComputedStyle(document.body).overflowY === 'hidden' &&
          (!canScroll || content.scrollTop > 400),
        bodyOverflow: getComputedStyle(document.body).overflowY,
        contentScrollTop: content.scrollTop,
        contentOverflow: getComputedStyle(content).overflowY,
      }
    }, app.scrollSelector)
    record(app.id, 'scroll:pwa-content', pwa.ok, JSON.stringify(pwa))

    // More sheet must not leave body position:fixed (browser mode)
    await page.evaluate(() => document.documentElement.classList.remove('standalone-pwa'))
    const moreBtn = page.locator(app.moreButton).first()
    if ((await moreBtn.count()) > 0) {
      await moreBtn.click()
      await page.waitForTimeout(200)
      const close = page.locator(app.moreClose).first()
      if ((await close.count()) > 0) {
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
      record(app.id, 'scroll:after-more-sheet', true, 'skipped — no more button')
    }

    if (app.clipPaths?.length) {
      for (const clipPath of app.clipPaths) {
        await checkPwaNestedWrap(page, app.id, clipPath, app.url)
      }
    }
  } catch (err) {
    record(app.id, 'fatal', false, err instanceof Error ? err.message : String(err))
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
