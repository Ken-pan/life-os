/**
 * English locale screenshot audit — core tabs & flows
 * node scripts/i18n-en-audit.mjs
 *
 * Outputs:
 *   docs/ui-qa-screenshots/fitness/i18n-en-audit/latest/
 *   docs/ui-qa-screenshots/fitness/i18n-zh-audit/latest/
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'fs'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'
import { UI_DECOR_ROLES, UI_DECOR_HIDE_MATRIX } from '../src/lib/uiDecor.js'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const { dir: OUT_EN } = resolveScreenshotDir({
  app: 'fitness',
  suite: 'i18n-en-audit',
  importMetaUrl: import.meta.url,
})
const { dir: OUT_ZH } = resolveScreenshotDir({
  app: 'fitness',
  suite: 'i18n-zh-audit',
  importMetaUrl: import.meta.url,
})

const ZH = /[\u4e00-\u9fff]/

/** @param {import('@playwright/test').Page} page @param {'zh'|'en'} locale */
async function seedLocale(page, locale, data = {}) {
  await page.goto(`${BASE}/`)
  await page.evaluate(
    ({ locale: loc, d }) => {
      const raw = localStorage.getItem('fitos_v2') || '{}'
      const s = typeof raw === 'string' ? JSON.parse(raw) : {}
      s.schemaVersion = 6
      s.settings = {
        unit: 'lbs',
        logDetail: 'quick',
        locale: loc,
        plateCollarLbs: 0,
        plateCollarKg: 0,
        ...d.settings,
      }
      s.weights = { c_bench: 185, c_incdb: 47.5, b_row: 135, ...d.weights }
      if (d.logs) s.logs = d.logs
      if (d.rotation) s.rotation = d.rotation
      delete s.focusCursor
      localStorage.setItem('fitos_v2', JSON.stringify(s))
    },
    { locale, d: data },
  )
  await page.reload()
  await page.waitForTimeout(400)
}

/** @param {import('@playwright/test').Page} page */
async function seedEn(page, data = {}) {
  return seedLocale(page, 'en', data)
}

/** @param {import('@playwright/test').Page} page */
async function collectZh(page) {
  return page.evaluate(() => {
    const re = /[\u4e00-\u9fff]/
    const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT'])
    const seen = new Set()
    const hits = []

    const walk = (el) => {
      if (skip.has(el.tagName)) return
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = node.textContent?.replace(/\s+/g, ' ').trim()
          if (!t || !re.test(t) || seen.has(t)) continue
          seen.add(t)
          const parent = /** @type {HTMLElement} */ (node.parentElement)
          hits.push({
            text: t.slice(0, 120),
            tag: parent?.tagName?.toLowerCase() ?? '',
            cls: (parent?.className || '').toString().slice(0, 80),
          })
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el2 = /** @type {HTMLElement} */ (node)
          const aria = el2.getAttribute('aria-label')
          if (aria && re.test(aria) && !seen.has(aria)) {
            seen.add(aria)
            hits.push({
              text: aria.slice(0, 120),
              tag: el2.tagName.toLowerCase(),
              cls: 'aria-label',
            })
          }
          walk(el2)
        }
      }
    }
    walk(document.body)
    return hits.slice(0, 40)
  })
}

/** @param {import('@playwright/test').Page} page */
async function collectDecor(page) {
  return page.evaluate(() => {
    /** @type {{ role: string, text: string, cls: string, marked: boolean, nearby?: string }[]} */
    const items = []

    const nearbyTitle = (el) => {
      const header = el.closest(
        '.sec-header, .coach-head, .hero-copy, .today-card, .set-group, .stat-card',
      )
      if (!header) return undefined
      const title = header.querySelector(
        '.sec-title, .hero-title, .stat-v, h1, h2',
      )
      return title?.textContent?.trim().slice(0, 60)
    }

    document.querySelectorAll('[data-ui-decor]').forEach((el) => {
      const role = el.getAttribute('data-ui-decor') || 'unknown'
      const hidden = getComputedStyle(el).display === 'none'
      items.push({
        role,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        cls: (el.className || '').toString().slice(0, 60),
        marked: true,
        hidden,
        nearby: nearbyTitle(el),
      })
    })

    const autoMap = {
      tag: '.tag:not([data-ui-decor])',
      kicker:
        '.hero-kicker:not([data-ui-decor]), .hm-kicker:not([data-ui-decor])',
      'section-label':
        '.cycle-label:not([data-ui-decor]), .sg-title:not([data-ui-decor])',
      'callout-label':
        '.co-label:not([data-ui-decor]), .tc-label:not([data-ui-decor])',
      'meta-strip':
        '.appbar-meta:not([data-ui-decor]), .coach-sub:not([data-ui-decor])',
      eyebrow: '.eyebrow:not([data-ui-decor])',
      'en-accent': '.decor-en:not([data-ui-decor])',
      'stat-label': '.stat-l:not([data-ui-decor])',
    }

    for (const [role, sel] of Object.entries(autoMap)) {
      document.querySelectorAll(sel).forEach((el) => {
        items.push({
          role,
          text: (el.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 100),
          cls: (el.className || '').toString().slice(0, 60),
          marked: false,
          nearby: nearbyTitle(el),
        })
      })
    }

    return items
  })
}

/** @param {string} id @param {{ role: string, text: string, marked: boolean, nearby?: string }[]} items */
function summarizeDecor(id, items) {
  const byRole = {}
  for (const it of items) {
    byRole[it.role] = (byRole[it.role] || 0) + 1
  }
  const hidden = items.filter(
    (it) => it.hidden || UI_DECOR_ROLES[it.role]?.hide,
  )
  const visible = items.filter(
    (it) => !it.hidden && !UI_DECOR_ROLES[it.role]?.hide,
  )
  return {
    id,
    total: items.length,
    visibleCount: visible.length,
    hiddenCount: hidden.length,
    unmarked: items.filter((i) => !i.marked).length,
    byRole,
    hidden,
    visible,
  }
}

/** @param {string} locale @param {Awaited<ReturnType<typeof collectDecor>>[]} allDecor */
function writeDecorReport(locale, allDecor, outDir) {
  const pages = allDecor.map(({ id, url, items, summary }) => ({
    id,
    url,
    summary,
    items,
  }))
  const matrix = UI_DECOR_HIDE_MATRIX[locale]

  const catalog = Object.entries(UI_DECOR_ROLES).map(([role, meta]) => ({
    role,
    ...meta,
  }))

  writeFileSync(
    join(outDir, 'decor-report.json'),
    JSON.stringify({ locale, hidePolicy: matrix, catalog, pages }, null, 2),
  )

  const lines = [
    `# ${locale === 'zh' ? '中文' : 'English'} UI — decorative copy audit`,
    '',
    'Generated by `node scripts/i18n-en-audit.mjs`. Low-value decor is **hidden in UI** via `app.css` + `data-ui-decor`.',
    '',
    '## Hide policy (`' + locale + '`)',
    '',
    '**Hidden roles:** `' + matrix.hide.join('`, `') + '`',
    '',
    '**Kept visible:** ' + matrix.keep.join(', '),
    '',
    ...matrix.notes.map((n) => `- ${n}`),
    '',
    '## Role catalog',
    '',
    '| Role | Value | Hidden | Note |',
    '|------|-------|--------|------|',
    ...catalog.map(
      (c) =>
        `| \`${c.role}\` | ${c.value} | ${c.hide ? 'yes' : 'no'} | ${c.note} |`,
    ),
    '',
    '## Visible decor per page',
    '',
  ]

  for (const p of pages) {
    lines.push(
      `### ${p.id}`,
      '',
      `- URL: ${p.url}`,
      `- In DOM: ${p.summary.total} · **Visible: ${p.summary.visibleCount}** · Hidden: ${p.summary.hiddenCount}`,
      '',
    )
    if (p.summary.visible.length) {
      for (const it of p.summary.visible) {
        lines.push(
          `- \`${it.role}\` — "${it.text}"${it.nearby ? ` _(near: ${it.nearby})_` : ''}`,
        )
      }
    } else {
      lines.push('_No decorative copy visible on this screen._')
    }
    lines.push('')
  }

  writeFileSync(join(outDir, 'decor-report.md'), lines.join('\n'))
}

/** @param {import('@playwright/test').Page} page @param {string} outDir */
async function audit(page, id, outDir, opts = {}) {
  if (opts.goto) await page.goto(`${BASE}${opts.goto}`)
  if (opts.wait)
    await page.locator(opts.wait).first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(opts.delay ?? 350)
  await page.screenshot({
    path: join(outDir, `${id}.png`),
    fullPage: opts.fullPage ?? false,
  })
  const zh = await collectZh(page)
  const decor = await collectDecor(page)
  const decorSummary = summarizeDecor(id, decor)
  return { id, url: page.url(), zhCount: zh.length, zh, decor, decorSummary }
}

function dateKey(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** @param {'zh'|'en'} locale @param {import('@playwright/test').Page} page @param {string} outDir */
async function runSuite(locale, page, outDir) {
  await seedLocale(page, locale, { logs })

  /** @type {Awaited<ReturnType<typeof audit>>[]} */
  const report = []

  report.push(
    await audit(page, '01-home', outDir, { goto: '/', wait: '.hero-title' }),
  )
  report.push(
    await audit(page, '02-program', outDir, {
      goto: '/program',
      wait: '.sec-title',
    }),
  )
  report.push(
    await audit(page, '03-discover', outDir, {
      goto: '/discover',
      wait: '.discover-grid',
    }),
  )
  report.push(
    await audit(page, '04-settings', outDir, {
      goto: '/settings',
      wait: '.sec-title',
      fullPage: true,
    }),
  )
  report.push(
    await audit(page, '05-day-overview', outDir, {
      goto: '/day/chest',
      wait: '.day-title',
    }),
  )

  await page.goto(`${BASE}/day/chest/focus`)
  await page.locator('.focus-ex-name').waitFor()
  report.push(
    await audit(page, '06-focus-home', outDir, { wait: '.focus-ex-name' }),
  )

  await page.locator('.focus-weight').click()
  await page.locator('.modal.wtm').waitFor()
  report.push(
    await audit(page, '07-weight-modal', outDir, { wait: '.modal.wtm' }),
  )
  await page.keyboard.press('Escape')

  await page.locator('.focus-plates-link').click()
  await page.locator('.tool-sheet').waitFor()
  report.push(
    await audit(page, '08-plates-sheet', outDir, { wait: '.tool-sheet' }),
  )
  await page.keyboard.press('Escape')

  const skipRe = locale === 'zh' ? /跳过/ : /Skip/i
  await page.locator('.focus-nav-btn').filter({ hasText: skipRe }).click()
  await page.locator('.skip-reasons').waitFor()
  report.push(
    await audit(page, '09-skip-modal', outDir, { wait: '.skip-reasons' }),
  )
  await page.keyboard.press('Escape')

  await page.goto(`${BASE}/day/chest/summary`)
  await page
    .locator('.summary-grid')
    .waitFor({ timeout: 10000 })
    .catch(() => {})
  report.push(await audit(page, '10-summary', outDir, { delay: 500 }))

  report.push(
    await audit(page, '11-tools', outDir, {
      goto: '/discover/tools',
      wait: '.tool-list',
      fullPage: true,
    }),
  )
  report.push(
    await audit(page, '12-stats', outDir, {
      goto: '/discover/stats',
      wait: '.stats-grid',
      fullPage: true,
    }),
  )
  report.push(
    await audit(page, '13-records', outDir, {
      goto: '/discover/records',
      wait: '.sec-title',
      fullPage: true,
    }),
  )
  report.push(
    await audit(page, '14-library', outDir, {
      goto: '/library',
      wait: '.sec-title',
      fullPage: true,
    }),
  )
  report.push(
    await audit(page, '15-program-edit', outDir, {
      goto: '/program/edit',
      wait: '.sec-title',
      fullPage: true,
    }),
  )

  await seedLocale(page, locale, { logs })
  await page.goto(`${BASE}/day/chest/focus`)
  await page.locator('.focus-cta-set').click()
  await page
    .locator('.focus-timer-island, .tw-widget')
    .first()
    .waitFor({ timeout: 8000 })
    .catch(() => {})
  report.push(await audit(page, '16-rest-timer', outDir, { delay: 500 }))

  return report
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

const logs = {
  [`${dateKey(-1)}|chest`]: {
    c_bench: {
      sets: [
        { weight: 185, reps: 8, rir: 2 },
        { weight: 185, reps: 8, rir: 2 },
        { weight: 185, reps: 8, rir: 1 },
        { weight: 185, reps: 8, rir: 1 },
      ],
    },
  },
  [`${dateKey()}|chest`]: {
    c_bench: { sets: [{ weight: 185, reps: 8, rir: 2 }, null, null, null] },
  },
  [`${dateKey(-1)}|back`]: {
    b_row: {
      sets: [
        { weight: 135, reps: 8, rir: 2 },
        { weight: 135, reps: 8, rir: 2 },
      ],
    },
  },
}

const reportEn = await runSuite('en', page, OUT_EN)
const reportZh = await runSuite('zh', page, OUT_ZH)

for (const [locale, report, outDir] of [
  ['en', reportEn, OUT_EN],
  ['zh', reportZh, OUT_ZH],
]) {
  const summary = report.map((r) => ({
    id: r.id,
    url: r.url,
    zhCount: r.zhCount,
    decorVisible: r.decorSummary.visibleCount,
    samples: r.zh.slice(0, 8).map((h) => h.text),
  }))

  writeFileSync(
    join(outDir, 'report.json'),
    JSON.stringify({ locale, summary, details: report }, null, 2),
  )

  writeDecorReport(
    locale,
    report.map((r) => ({
      id: r.id,
      url: r.url,
      items: r.decor,
      summary: r.decorSummary,
    })),
    outDir,
  )

  console.log(`\n=== Decorative copy visible (${locale}) ===\n`)
  for (const r of report) {
    console.log(
      `${r.id}: ${r.decorSummary.visibleCount} visible / ${r.decorSummary.total} in DOM`,
    )
  }

  console.log(`\n=== i18n audit (${locale}) ===\n`)
  for (const r of summary.sort((a, b) => b.zhCount - a.zhCount)) {
    if (locale === 'en') {
      console.log(`${r.id}: ${r.zhCount} Chinese snippets`)
      for (const s of r.samples) console.log(`  · ${s}`)
    } else {
      console.log(`${r.id}: ok`)
    }
  }
  console.log('\n→', outDir)
}

await browser.close()
