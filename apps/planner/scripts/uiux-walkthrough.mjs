/**
 * UI/UX 走查：三条主流程 + 截图
 * 输出：docs/ui-qa-screenshots/planner/uiux-walkthrough/latest/
 */
import { chromium, devices } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const { dir: OUT } = resolveScreenshotDir({
  app: 'planner',
  suite: 'uiux-walkthrough',
  importMetaUrl: import.meta.url,
})
const BASE = 'http://127.0.0.1:5188'
const STORAGE_KEY = 'planos_v1'

const mobile = devices['iPhone 13'].viewport
const desktop = { width: 1280, height: 800 }

function localDateOffset(days = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function seedState() {
  const today = localDateOffset(0)
  const yesterday = localDateOffset(-1)
  const tomorrow = localDateOffset(1)
  const now = Date.now()
  return {
    schemaVersion: 2,
    tasks: [
      {
        id: 'ux_t1',
        title: '设计评审',
        notes: '与产品对齐 Q3 路线图',
        listId: 'inbox',
        priority: 1,
        dueDate: today,
        dueTime: '09:30',
        reminderMinutes: 15,
        recurrence: null,
        tags: ['work'],
        subtasks: [{ id: 'sub_1', title: '准备幻灯片', done: false }],
        completed: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ux_t2',
        title: '迟到的周报',
        notes: '',
        listId: 'inbox',
        priority: 0,
        dueDate: yesterday,
        dueTime: '17:00',
        reminderMinutes: null,
        recurrence: null,
        tags: ['work'],
        subtasks: [],
        completed: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ux_t3',
        title: '明日站会',
        notes: '',
        listId: 'inbox',
        priority: 2,
        dueDate: tomorrow,
        dueTime: null,
        reminderMinutes: null,
        recurrence: null,
        tags: [],
        subtasks: [],
        completed: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ux_done',
        title: '已完成的参考任务',
        notes: '',
        listId: 'inbox',
        priority: 4,
        dueDate: yesterday,
        dueTime: null,
        reminderMinutes: null,
        recurrence: null,
        tags: [],
        subtasks: [],
        completed: true,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    lists: [
      {
        id: 'inbox',
        title: 'inbox',
        icon: 'inbox',
        color: '#F5A623',
        sortOrder: 0,
        system: 'inbox',
      },
      {
        id: 'list_work',
        title: '工作项目',
        icon: 'list',
        color: '#0F66AE',
        sortOrder: 1,
        system: null,
      },
    ],
    settings: {
      theme: 'light',
      locale: 'zh',
      defaultListId: 'inbox',
      notificationsEnabled: false,
      syncAuto: true,
    },
  }
}

/** @param {import('@playwright/test').Page} page */
async function snap(page, flow, step, viewport = 'mobile') {
  const dir = path.join(OUT, flow, viewport)
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${step}.png`)
  await page.waitForTimeout(350)
  await page.screenshot({ path: file, fullPage: false })
  return file
}

/** @param {import('@playwright/test').Page} page */
async function auditPage(page) {
  return page.evaluate(() => {
    const de = document.documentElement
    const tapTargets = [
      ...document.querySelectorAll('button, a, input, [role="button"]'),
    ]
    const smallTargets = tapTargets
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)
      })
      .slice(0, 8)
      .map((el) => ({
        tag: el.tagName,
        cls: el.className?.toString?.().slice(0, 60),
        w: Math.round(el.getBoundingClientRect().width),
        h: Math.round(el.getBoundingClientRect().height),
      }))

    const wrap = document.querySelector('.wrap')
    const fab = document.querySelector('.fab')
    const nav = document.querySelector('.nav')
    const lastTask = document.querySelector(
      '.task-row:last-child, .empty-state',
    )
    const lr = lastTask?.getBoundingClientRect()
    const fr = fab?.getBoundingClientRect()
    const nr = nav?.getBoundingClientRect()

    return {
      path: location.pathname,
      title: document.querySelector('.page-title')?.textContent?.trim(),
      scrollExcess: de.scrollHeight - de.clientHeight,
      hOverflow: de.scrollWidth - de.clientWidth,
      smallTargets,
      chromeOverlap: fab && lr && fr ? lr.bottom > fr.top - 4 : null,
      gapLastToNav: lr && nr ? nr.top - lr.bottom : null,
      hasDialog: !!document.querySelector('[role="dialog"]'),
      contrastHints: {
        mutedText:
          getComputedStyle(document.body).getPropertyValue('--t3') || null,
      },
    }
  })
}

/** @param {import('@playwright/test').Page} page */
async function seed(page) {
  await page.goto(BASE + '/')
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: STORAGE_KEY, data: seedState() },
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="fab-add"]', {
    state: 'visible',
    timeout: 15000,
  })
}

const findings = []

function note(flow, step, issue, severity = 'medium') {
  findings.push({ flow, step, issue, severity })
}

/** Flow 1: 日常任务 — 添加 / 完成 / 编辑 */
async function flow1TaskDaily(browser) {
  const flow = 'flow1-daily-tasks'
  const shots = []
  const page = await browser.newPage({ viewport: mobile })

  await seed(page)
  shots.push(await snap(page, flow, '01-home-mobile', 'mobile'))
  let audit = await auditPage(page)
  if (audit.scrollExcess > 0 && audit.chromeOverlap) {
    note(flow, '01', '首页末行任务可能与 FAB 重叠，需滚动才完全可见', 'high')
  }

  // Quick add (mobile: FAB + sheet; desktop: inline)
  const vp = page.viewportSize()
  const isMobile = vp && vp.width <= 860
  if (isMobile) {
    await page.getByTestId('fab-add').click()
    await page.waitForSelector('[role="dialog"]')
    await page.locator('#task-title').fill('走查临时任务')
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click()
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' })
  } else {
    const input = page.locator('.quick-add input')
    await input.fill('走查临时任务')
    await input.press('Enter')
  }
  shots.push(await snap(page, flow, '02-after-quick-add', 'mobile'))

  // Complete overdue task
  const overdueRow = page.locator('.task-row', { hasText: '迟到的周报' })
  await overdueRow.locator('.task-check').click()
  shots.push(await snap(page, flow, '03-task-completed', 'mobile'))

  // FAB → editor
  await page.getByTestId('fab-add').click()
  await page.waitForSelector('[role="dialog"]')
  shots.push(await snap(page, flow, '04-editor-sheet', 'mobile'))
  audit = await auditPage(page)
  if (audit.scrollExcess > 0) {
    note(
      flow,
      '04',
      '打开编辑器时背景页仍可感知滚动余量（已部分修复 scroll lock）',
      'low',
    )
  }

  await page.locator('#task-title').fill('走查编辑任务')
  await page.getByRole('dialog').getByRole('button', { name: '保存' }).click()
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' })
  shots.push(await snap(page, flow, '05-after-save', 'mobile'))

  // Desktop same flow start
  await page.setViewportSize(desktop)
  await page.goto(BASE + '/')
  await page.waitForLoadState('networkidle')
  shots.push(await snap(page, flow, '06-home-desktop', 'desktop'))

  await page.close()
  return { flow, shots }
}

/** Flow 2: 浏览导航 — More / 搜索 / 已完成 / 清单 */
async function flow2BrowseNav(browser) {
  const flow = 'flow2-browse-nav'
  const shots = []
  const page = await browser.newPage({ viewport: mobile })
  await seed(page)

  await page.goto(BASE + '/')
  await page.getByRole('button', { name: /更多|More/i }).click()
  await page.waitForSelector('.mobile-more-sheet')
  shots.push(await snap(page, flow, '01-more-sheet', 'mobile'))

  await page.locator('.mobile-more-row', { hasText: '搜索' }).click()
  await page.waitForURL('**/search**')
  shots.push(await snap(page, flow, '02-search', 'mobile'))

  await page.locator('.field input').fill('设计')
  shots.push(await snap(page, flow, '03-search-results', 'mobile'))

  await page.goto(BASE + '/completed')
  shots.push(await snap(page, flow, '04-completed', 'mobile'))

  await page.goto(BASE + '/lists/list_work')
  shots.push(await snap(page, flow, '05-custom-list', 'mobile'))
  const listAudit = await page.evaluate(() => ({
    hasBack: !!document.querySelector('.appbar--back'),
  }))
  if (!listAudit.hasBack) {
    note(flow, '05', '自定义清单页 AppBar 缺少返回按钮', 'medium')
  }

  await page.goto(BASE + '/search')
  await page.waitForLoadState('networkidle')
  const searchShortcut = await page.locator('.appbar-settings').count()
  if (searchShortcut === 0) {
    note(flow, '06', '搜索页缺少 AppBar 设置快捷入口', 'medium')
  }

  await page.goto(BASE + '/settings')
  shots.push(await snap(page, flow, '06-settings-from-more-ia', 'mobile'))

  await page.close()
  return { flow, shots }
}

/** Flow 3: 设置与个性化 */
async function flow3Settings(browser) {
  const flow = 'flow3-settings'
  const shots = []
  const page = await browser.newPage({ viewport: mobile })
  await seed(page)

  await page.goto(BASE + '/settings')
  shots.push(await snap(page, flow, '01-settings-top', 'mobile'))

  await page.locator('button', { hasText: '深色' }).click()
  shots.push(await snap(page, flow, '02-dark-theme', 'mobile'))

  await page.evaluate(() => window.scrollTo(0, 99999))
  shots.push(await snap(page, flow, '03-settings-scrolled-bottom', 'mobile'))
  const auditBottom = await auditPage(page)
  if (auditBottom.gapLastToNav != null && auditBottom.gapLastToNav > 48) {
    note(
      flow,
      '03',
      `设置页滚到底内容与底栏间距偏大 (${Math.round(auditBottom.gapLastToNav)}px)`,
      'medium',
    )
  }

  await page.locator('button', { hasText: 'English' }).click()
  shots.push(await snap(page, flow, '04-locale-en', 'mobile'))

  await page.goto(BASE + '/auth')
  shots.push(await snap(page, flow, '05-auth', 'mobile'))
  const auditAuth = await auditPage(page)
  if (!auditAuth.path.startsWith('/auth'))
    note(flow, '05', '认证页路由异常', 'high')

  // Tablet
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto(BASE + '/settings')
  shots.push(await snap(page, flow, '06-settings-tablet', 'tablet'))

  await page.close()
  return { flow, shots }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()

  const results = []
  for (const fn of [flow1TaskDaily, flow2BrowseNav, flow3Settings]) {
    results.push(await fn(browser))
  }
  await browser.close()

  const report = {
    generatedAt: new Date().toISOString(),
    viewports: { mobile: 'iPhone 13', desktop: '1280x800', tablet: '768x1024' },
    flows: results,
    findings,
  }
  await writeFile(
    path.join(OUT, 'report.json'),
    JSON.stringify(report, null, 2),
  )
  console.log('Report:', path.join(OUT, 'report.json'))
  console.log('Findings:', findings.length)
  findings.forEach((f) =>
    console.log(`  [${f.severity}] ${f.flow}/${f.step}: ${f.issue}`),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
