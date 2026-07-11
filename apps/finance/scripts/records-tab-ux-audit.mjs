#!/usr/bin/env node
/**
 * 记录 Tab UX 截图走查 — 桌面/移动、折叠态、账本区、子 Tab
 * Usage: npm run dev -- --port 5180
 *        node scripts/records-tab-ux-audit.mjs
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const dateTag = process.env.UI_QA_DATE ?? '2026-07-06-records'
const { dir: shotRoot } = resolveScreenshotDir({
  app: 'finance',
  suite: 'records-tab',
  importMetaUrl: import.meta.url,
  runId: process.env.QA_RUN_ID ?? dateTag,
})
const storageKey = 'life_os_auth'
const baseUrl = process.env.UI_QA_URL ?? 'http://localhost:5180'

const VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 402, height: 874 },
]

mkdirSync(resolve(shotRoot, 'desktop'), { recursive: true })
mkdirSync(resolve(shotRoot, 'mobile'), { recursive: true })

function loadEnv() {
  return Object.fromEntries(
    readFileSync(resolve(root, '.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i), l.slice(i + 1)]
      }),
  )
}

const env = loadEnv()
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { storageKey, persistSession: false },
})

const email = process.env.FINANCE_QA_EMAIL ?? process.env.UI_QA_EMAIL
const password = process.env.FINANCE_QA_PASSWORD ?? process.env.UI_QA_PASSWORD
if (!email || !password) throw new Error('Missing rotated FINANCE_QA_EMAIL or FINANCE_QA_PASSWORD (values redacted)')

const { data: auth, error } = await sb.auth.signInWithPassword({
  email,
  password,
})
if (error || !auth.session) {
  console.error('Auth failed:', error?.message)
  process.exit(1)
}

async function injectSession(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ key, session }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        }),
      )
    },
    { key: storageKey, session: auth.session },
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(3500)
}

async function goRecords(page, section = 'insights') {
  await page.goto(`${baseUrl}/history/${section}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)
}

async function measureBlocks(page) {
  return page.evaluate(() => {
    const vh = window.innerHeight
    const pick = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        top: Math.round(r.top + window.scrollY),
        height: Math.round(r.height),
        pctViewport: Math.round((r.height / vh) * 100),
      }
    }
    const introDetails = document.querySelector('.history-intro-details')
    const duplicateProductRows = document.querySelectorAll(
      '.ledger-row.has-enrichment.open .ledger-product-strip li, .ledger-row.has-enrichment .purchase-enrichment-items li',
    ).length
    const mobileActionTriggers = document.querySelectorAll(
      '.lr-actions-trigger',
    ).length
    const desktopActionIcons = document.querySelectorAll(
      '.lr-actions--desktop .ledger-icon-btn',
    ).length
    return {
      viewportH: vh,
      scrollH: document.documentElement.scrollHeight,
      intro: pick('.history-intro-details, .history-intro'),
      introOpen: introDetails?.open ?? null,
      summary: pick('.history-summary'),
      budgetPulse: pick('.budget-pulse'),
      kpiCard: pick('.history-kpi-card'),
      insightsToggle: pick('.history-insights-toggle'),
      insights: pick('.history-insights'),
      ledger: pick('#history-ledger'),
      duplicateProductRows,
      mobileActionTriggers,
      desktopActionIcons,
    }
  })
}

async function capture(page, vpId, name, opts = {}) {
  const path = resolve(shotRoot, vpId, `${name}.png`)
  await page.screenshot({
    path,
    fullPage: Boolean(opts.fullPage),
    clip: opts.clip,
  })
  console.log(`CAPTURE [${vpId}] ${name}`)
  return path
}

const report = { viewports: {}, shots: [] }
const browser = await chromium.launch()

for (const vp of VIEWPORTS) {
  const page = await browser.newPage()
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await injectSession(page)
  await goRecords(page, 'insights')

  report.viewports[vp.id] = {
    aboveFold: await measureBlocks(page),
  }

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  report.shots.push(await capture(page, vp.id, '01-above-fold'))

  report.shots.push(
    await capture(page, vp.id, '02-full-page', { fullPage: true }),
  )

  if (vp.id === 'mobile') {
    const toggle = page.locator('.history-insights-toggle .btn')
    if (await toggle.count()) {
      await toggle.click()
      await page.waitForTimeout(500)
      report.viewports.mobile.insightsExpanded = await measureBlocks(page)
      report.shots.push(await capture(page, vp.id, '03-insights-expanded'))
    }
  }

  const ledger = page.locator('#history-ledger')
  if (await ledger.count()) {
    await ledger.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    report.shots.push(await capture(page, vp.id, '04-ledger'))
  }

  for (const sub of [
    { slug: 'fixed', name: '05-subtab-fixed' },
    { slug: 'oneoff', name: '06-subtab-oneoff' },
  ]) {
    await goRecords(page, sub.slug)
    report.shots.push(await capture(page, vp.id, sub.name))
  }

  await page.close()
}

await browser.close()

const checks = []
for (const [vpId, data] of Object.entries(report.viewports)) {
  const blocks = data.aboveFold ?? {}
  const vh = blocks.viewportH ?? 900
  const summaryPct = blocks.summary?.pctViewport ?? 0
  const ledgerTop = blocks.ledger?.top ?? Infinity
  const ledgerInFirstScreen = ledgerTop < vh * 1.15
  const insightsCollapsed =
    !blocks.insights?.height || blocks.insights.height === 0

  checks.push({
    id: `${vpId}-summary-compact`,
    pass: summaryPct <= 55,
    detail: `summary ${summaryPct}% of viewport (target ≤55%)`,
  })
  checks.push({
    id: `${vpId}-ledger-priority`,
    pass: ledgerInFirstScreen,
    detail: `ledger starts at scroll ${ledgerTop}px (target within ~1.15 viewports)`,
  })
  checks.push({
    id: `${vpId}-insights-collapsed`,
    pass: insightsCollapsed,
    detail: insightsCollapsed
      ? 'insights hidden by default'
      : `insights visible (${blocks.insights?.height}px) — should be collapsed`,
  })
}

report.checks = checks
report.pass = checks.every((c) => c.pass)

const findings = []
for (const [vpId, data] of Object.entries(report.viewports)) {
  const b = data.aboveFold ?? {}
  if ((b.intro?.pctViewport ?? 0) > 8) {
    findings.push({
      id: `${vpId}-intro-long`,
      severity: 'medium',
      title: '说明文字占用首屏',
      detail: `intro ${b.intro.pctViewport}% viewport — 应默认折叠为 summary 一行`,
      refs: [
        'NN/G progressive disclosure',
        'Smashing sticky/collapsible header',
      ],
    })
  }
  if (b.duplicateProductRows > 4) {
    findings.push({
      id: `${vpId}-duplicate-products`,
      severity: 'high',
      title: '商品列表重复渲染',
      detail: `${b.duplicateProductRows} product DOM nodes — strip 与展开区不应重复`,
    })
  }
  if (vpId === 'mobile' && (b.mobileActionTriggers ?? 0) < 1) {
    findings.push({
      id: 'mobile-no-action-sheet',
      severity: 'high',
      title: '移动端缺少 overflow 操作入口',
      detail: '应提供 bottom sheet / 更多按钮（可访问性替代 swipe）',
      refs: ['NN/G bottom sheet', 'TestParty gesture alternatives'],
    })
  }
}

report.findings = findings
report.annotatedAt = new Date().toISOString()

const annotatedMd = `# Records Tab UX 走查 (${dateTag})

## 自动化阈值
${checks.map((c) => `- ${c.pass ? '✅' : '❌'} **${c.id}**: ${c.detail}`).join('\n')}

## 视觉/结构问题
${findings.length ? findings.map((f) => `- **[${f.severity}] ${f.title}** (${f.id}): ${f.detail}${f.refs ? `\n  - 参考: ${f.refs.join('; ')}` : ''}`).join('\n') : '- 无额外结构问题'}

## 截图
- Desktop: \`desktop/01-above-fold.png\`, \`04-ledger.png\`
- Mobile: \`mobile/01-above-fold.png\`, \`04-ledger.png\`

## 现代 UX 对策（已采纳/推荐）
1. **渐进披露**: 商品 strip 预览 + 展开仅元数据（避免重复列表）
2. **Bottom sheet**: 移动端 ⋯ 菜单替代常驻编辑/删除（保留桌面 inline actions）
3. **折叠 intro**: \`<details>\` 一行摘要，详情按需展开
4. **FAB 优先**: 移动端隐藏预算卡内「记一笔」，避免双 CTA
`

writeFileSync(resolve(shotRoot, 'ANNOTATED.md'), annotatedMd)
writeFileSync(resolve(shotRoot, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\nReport: ${resolve(shotRoot, 'report.json')}`)
console.log(`Screenshots: ${shotRoot}`)
for (const c of checks) {
  console.log(c.pass ? 'PASS' : 'FAIL', c.id, '—', c.detail)
}
if (!report.pass) process.exitCode = 1
