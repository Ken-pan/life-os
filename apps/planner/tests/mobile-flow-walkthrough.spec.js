import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const STORAGE_KEY = 'planos_v1'
const OUT_DIR = path.join(
  process.cwd(),
  'tests',
  'screenshots',
  'mobile-flow-walkthrough',
)

/** @type {Array<{ file: string, flow: string, note: string }>} */
const SNAP_INDEX = []

function localDateOffset(days = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** @param {{ allTodayDone?: boolean }} [opts] */
function flowSeedState(opts = {}) {
  const today = localDateOffset(0)
  const tomorrow = localDateOffset(1)
  const now = Date.now()
  const hourAgo = now - 60 * 60 * 1000
  const todayOpen = !opts.allTodayDone
  const workListId = 'list_flow_work'

  /** @param {Record<string, unknown>} row */
  function todayTask(row) {
    if (!todayOpen && row.dueDate === today && !row.completed) {
      return { ...row, completed: true, completedAt: hourAgo }
    }
    return row
  }

  const rawTasks = [
    {
      id: 'flow_focus',
      title: '深度写作 · 产品方案',
      listId: 'inbox',
      priority: 1,
      dueDate: today,
      scheduledDate: today,
      scheduledStart: '09:00',
      durationMinutes: 90,
      tags: ['focus'],
      subtasks: [],
      completed: false,
      meta: { kind: 'focus' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'flow_standup',
      title: '团队站会',
      listId: 'inbox',
      priority: 2,
      dueDate: today,
      dueTime: '09:30',
      scheduledDate: today,
      scheduledStart: '09:30',
      durationMinutes: 30,
      tags: [],
      subtasks: [],
      completed: false,
      meta: { kind: 'micro' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'flow_review',
      title: '设计评审',
      listId: 'inbox',
      priority: 1,
      dueDate: today,
      scheduledDate: today,
      scheduledStart: '14:00',
      durationMinutes: 60,
      tags: ['work'],
      subtasks: [],
      completed: true,
      completedAt: hourAgo,
      meta: { kind: 'standard' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'flow_email',
      title: '回复客户邮件',
      listId: 'inbox',
      priority: 3,
      dueDate: today,
      scheduledDate: today,
      scheduledStart: '16:00',
      durationMinutes: 30,
      tags: [],
      subtasks: [],
      completed: todayOpen ? true : true,
      completedAt: hourAgo - 30 * 60 * 1000,
      meta: { kind: 'micro' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'flow_inbox',
      title: '收件箱灵感',
      listId: 'inbox',
      priority: 4,
      dueDate: null,
      tags: [],
      subtasks: [],
      completed: false,
      meta: {},
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'flow_tomorrow',
      title: '明日站会准备',
      listId: 'inbox',
      priority: 2,
      dueDate: tomorrow,
      tags: [],
      subtasks: [],
      completed: false,
      meta: {},
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'flow_list',
      title: '版本发布',
      listId: workListId,
      priority: 1,
      dueDate: localDateOffset(5),
      tags: ['work', 'release'],
      subtasks: [],
      completed: false,
      meta: {},
      createdAt: now,
      updatedAt: now,
    },
  ]

  return {
    schemaVersion: 2,
    tasks: rawTasks.map(todayTask),
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
        id: workListId,
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
      rhythmEnabled: true,
      dailyGoal: 3,
      rhythmPaused: false,
      rhythmRestDays: [],
    },
  }
}

async function seedState(page, state) {
  await page.goto('/')
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: STORAGE_KEY, data: state },
  )
  await page.reload()
  await page.waitForSelector('[data-testid="fab-add"]', {
    timeout: 15_000,
    state: 'attached',
  })
}

async function snap(page, name, meta = { flow: '', note: '' }) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(250)
  const file = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' })
  SNAP_INDEX.push({ file: `${name}.png`, flow: meta.flow, note: meta.note })
  return file
}

function writeSnapReadme() {
  const generated = new Date().toISOString()
  const lines = [
    '# Planner 移动端主流程走查截图',
    '',
    `生成时间：${generated}`,
    '',
    '视口：390×844（Pixel 7）。`fullPage: false`，仅截取当前视口。',
    '',
    '重新生成：',
    '',
    '```bash',
    'cd apps/planner && npm run screenshot:mobile-flow',
    '```',
    '',
    '| 文件 | 流程 | 说明 |',
    '|------|------|------|',
    ...SNAP_INDEX.map(
      ({ file, flow, note }) => `| ${file} | ${flow} | ${note} |`,
    ),
    '',
  ]
  fs.writeFileSync(path.join(OUT_DIR, '00_README.md'), lines.join('\n'))
}

function moreSheet(page) {
  return page.getByRole('dialog').filter({ has: page.getByText('更多') })
}

async function openMore(page) {
  await page.getByRole('button', { name: '更多' }).click()
  await expect(moreSheet(page)).toBeVisible()
}

async function expandUnscheduledIfNeeded(page) {
  const head = page.locator('.unscheduled-panel-head--toggle')
  if (
    (await head.count()) &&
    (await head.getAttribute('aria-expanded')) === 'false'
  ) {
    await head.click()
  }
}

async function swipeTaskRow(page, title, deltaX) {
  const row = page.locator('.swipe-item', {
    has: page.locator('.task-title', { hasText: title }),
  })
  await expect(row).toBeVisible()
  await row.scrollIntoViewIfNeeded()
  const box = await row.boundingBox()
  if (!box) throw new Error(`swipe row not found: ${title}`)
  const startX = box.x + box.width * 0.5
  const startY = box.y + box.height * 0.5
  const endX = startX + deltaX
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(startX + ((endX - startX) * i) / 16, startY)
  }
  await page.mouse.up()
}

test.describe.configure({ timeout: 90_000, mode: 'serial' })

test.describe('移动端主流程走查', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    SNAP_INDEX.length = 0
  })

  test.afterAll(() => {
    writeSnapReadme()
  })

  test('Flow 1 — Today 列表浏览与完成任务', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/')
    await expect(page.locator('h1.page-title')).toHaveText('今天')
    await expect(page.locator('.today-progress')).toBeVisible()
    await expect(
      page.locator('.task-title', { hasText: '深度写作 · 产品方案' }),
    ).toBeVisible()
    await snap(page, '01-today-list', {
      flow: 'Flow 1',
      note: 'Today 列表 + 进度卡',
    })

    const row = page.locator('.task-row', {
      has: page.locator('.task-title', { hasText: '深度写作 · 产品方案' }),
    })
    await row.locator('.task-check').click()
    await expect(
      page.locator('#done-today .task-title', {
        hasText: '深度写作 · 产品方案',
      }),
    ).toBeVisible()
    await expect(
      page
        .locator('.sec-title', { hasText: '今天' })
        .locator('..')
        .locator('.task-title', { hasText: '深度写作 · 产品方案' }),
    ).toHaveCount(0)
    await snap(page, '02-after-complete', {
      flow: 'Flow 1',
      note: '完成任务后移入今日完成',
    })
  })

  test('Flow 2 — FAB 新建任务', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/')
    await page.getByTestId('fab-add').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await snap(page, '03-fab-editor', {
      flow: 'Flow 2',
      note: 'FAB 新建任务编辑器',
    })

    await dialog.locator('#task-title').fill('走查新建任务')
    await dialog.getByRole('button', { name: '保存' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(
      page.locator('.task-title', { hasText: '走查新建任务' }),
    ).toBeVisible()
    await snap(page, '04-after-create', {
      flow: 'Flow 2',
      note: '保存后回到 Today 列表',
    })
  })

  test('Flow 3 — 时间轴与安排弹窗', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/?view=timeline')
    await expect(page.getByRole('tab', { name: '时间轴' })).toHaveClass(/on/)
    await expect(page.getByRole('link', { name: '今天' })).toHaveClass(/on/)
    await expect(page.locator('.nav-item-more')).not.toHaveClass(/on/)
    await page.waitForSelector('.time-block', { timeout: 10_000 })

    const blocks = page.locator('.time-block')
    await expect(blocks.first()).toBeVisible()
    const blockCount = await blocks.count()
    expect(blockCount).toBeGreaterThanOrEqual(2)

    const overlapBlocks = page.locator('.time-block--conflict')
    if ((await overlapBlocks.count()) >= 2) {
      const first = await overlapBlocks.nth(0).boundingBox()
      const second = await overlapBlocks.nth(1).boundingBox()
      if (first && second) {
        expect(Math.abs(first.x - second.x)).toBeGreaterThan(4)
      }
    }
    await snap(page, '05-timeline', {
      flow: 'Flow 3',
      note: '时间轴并排重叠块 + 紧凑统计',
    })

    await page.getByRole('button', { name: '更多' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator('.nav-item-more.on')).toBeVisible()
    await snap(page, '06-more-sheet-on-timeline', {
      flow: 'Flow 3',
      note: '时间轴页打开 More 菜单',
    })

    await page.keyboard.press('Escape')
    await expect(page.getByRole('link', { name: '今天' })).toHaveClass(/on/)
    await expect(page.locator('.nav-item-more')).not.toHaveClass(/on/)
    await expandUnscheduledIfNeeded(page)
    await page
      .getByRole('button', { name: '安排', exact: true })
      .first()
      .click()
    await expect(page.locator('.schedule-popover')).toBeVisible()
    await page.getByRole('button', { name: '下午', exact: true }).click()
    await expect(
      page.getByRole('button', { name: '14:00', exact: true }),
    ).toHaveClass(/on/)
    await snap(page, '07-schedule-popover', {
      flow: 'Flow 3',
      note: '安排弹窗下午预设 → 14:00',
    })
    await page.getByRole('button', { name: '取消' }).click()
  })

  test('Flow 4 — 底栏 Primary 导航', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/')
    await page.getByRole('link', { name: '收件箱' }).click()
    await expect(page).toHaveURL(/\/inbox/)
    await expect(
      page.locator('.task-title', { hasText: '收件箱灵感' }),
    ).toBeVisible()
    await snap(page, '08-inbox', { flow: 'Flow 4', note: '底栏 → 收件箱' })

    await page.getByRole('link', { name: '即将' }).click()
    await expect(page).toHaveURL(/\/upcoming/)
    await expect(
      page.locator('.task-title', { hasText: '明日站会准备' }),
    ).toBeVisible()
    await snap(page, '09-upcoming', { flow: 'Flow 4', note: '底栏 → 即将' })

    await page.getByRole('link', { name: '已完成' }).click()
    await expect(page).toHaveURL(/\/completed/)
    await snap(page, '10-completed', { flow: 'Flow 4', note: '底栏 → 已完成' })

    await page.getByRole('link', { name: '今天' }).click()
    await expect(page).toHaveURL(/\/(\?.*)?$/)
    await snap(page, '11-back-today', {
      flow: 'Flow 4',
      note: '底栏 → 回到今天',
    })
  })

  test('Flow 5 — More 菜单：日历 / 搜索 / 设置 / 清单', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/calendar')
    await expect(page.locator('h1.page-title')).toHaveText('日历')
    const todayNav = page.getByRole('link', { name: '今天' })
    await expect(todayNav).not.toHaveClass(/on/)
    await expect(page.locator('.nav-item-more.on')).toBeVisible()
    await snap(page, '12-calendar-nav', {
      flow: 'Flow 5',
      note: '日历页仅 More 高亮',
    })

    await openMore(page)
    await expect(page.getByTestId('fab-add')).toBeHidden()
    await snap(page, '12b-calendar-more-no-fab', {
      flow: 'Flow 5',
      note: 'More 打开时 FAB 隐藏',
    })
    await page.keyboard.press('Escape')
    await expect(moreSheet(page)).toHaveCount(0)

    await openMore(page)
    await moreSheet(page).getByRole('link', { name: '搜索' }).click()
    await expect(page).toHaveURL(/\/search/)
    await page.locator('.field input').fill('发布')
    await expect(
      page.locator('.task-title', { hasText: '版本发布' }),
    ).toBeVisible()

    const tagButtons = page.locator('.search-tags .seg button')
    const tagCount = await tagButtons.count()
    for (let i = 0; i < tagCount; i++) {
      const text = (await tagButtons.nth(i).innerText()).trim()
      expect(text.length).toBeGreaterThan(0)
    }
    await snap(page, '13-search', { flow: 'Flow 5', note: '搜索 + tag 筛选' })

    await openMore(page)
    await moreSheet(page).getByRole('link', { name: '设置' }).click()
    await expect(page).toHaveURL(/\/settings/)
    await snap(page, '14-settings', { flow: 'Flow 5', note: 'More → 设置' })

    await openMore(page)
    await moreSheet(page).getByRole('link', { name: '工作项目' }).click()
    await expect(page).toHaveURL(/\/lists\/list_flow_work/)
    await expect(
      page.locator('.task-title', { hasText: '版本发布' }),
    ).toBeVisible()
    await snap(page, '15-list-detail', {
      flow: 'Flow 5',
      note: 'More → 工作项目清单',
    })
  })

  test('Flow 6 — 手势：右滑完成 / 左滑改期', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/inbox')
    await swipeTaskRow(page, '收件箱灵感', 120)
    await expect(
      page.locator('.task-title', { hasText: '收件箱灵感' }),
    ).toHaveCount(0)
    await page.goto('/completed')
    await expect(
      page.locator('.task-title', { hasText: '收件箱灵感' }),
    ).toBeVisible()
    await snap(page, '16-swipe-complete', {
      flow: 'Flow 6',
      note: '右滑完成 → 已完成页',
    })

    await page.goto('/inbox')
    await page.getByTestId('fab-add').click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#task-title').fill('左滑改期测试')
    await dialog.getByRole('button', { name: '保存' }).click()
    await swipeTaskRow(page, '左滑改期测试', -140)
    await page
      .locator('.swipe-item', {
        has: page.locator('.task-title', { hasText: '左滑改期测试' }),
      })
      .locator('.swipe-action--tomorrow')
      .click()
    await expect(page.locator('.toast')).toContainText(/安排|Scheduled/i)
    await page.goto('/upcoming')
    await expect(
      page.locator('.task-title', { hasText: '左滑改期测试' }),
    ).toBeVisible()
    await snap(page, '17-swipe-reschedule', {
      flow: 'Flow 6',
      note: '左滑改期 → 即将页',
    })
  })

  test('Flow 7 — 庆祝态（全部完成）', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState({ allTodayDone: true }))
    await page.evaluate(() => sessionStorage.removeItem('planner_today_closed'))
    await page.goto('/')

    await expect(page.locator('.today-closed')).toBeVisible()
    await expect(page.locator('.insight-card')).toHaveCount(0)
    const doneHeader = page.locator(
      '#done-today .sec-header--collapsible, #done-today',
    )
    await expect(doneHeader.first()).toBeVisible()
    const expanded = await page
      .locator('#done-today .sec-header--collapsible')
      .getAttribute('aria-expanded')
      .catch(() => 'true')
    expect(expanded).not.toBe('false')
    await snap(page, '18-celebration', {
      flow: 'Flow 7',
      note: '庆祝态无 Insight/FAB，今日完成展开',
    })
  })

  test('Flow 8 — AppBar 搜索入口与滚动', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/')
    await page.locator('.appbar-search').click()
    await expect(page).toHaveURL(/\/search/)

    await page.goto('/')
    const scrollBefore = await page.evaluate(() => {
      const col = document.querySelector('.main-col')
      return col ? col.scrollHeight > col.clientHeight : false
    })
    if (scrollBefore) {
      await page.evaluate(() => {
        const col = document.querySelector('.main-col')
        if (col) col.scrollTop = col.scrollHeight
      })
      const scrollTop = await page.evaluate(() => {
        const col = document.querySelector('.main-col')
        return col?.scrollTop ?? 0
      })
      expect(scrollTop).toBeGreaterThan(0)
    }
    await snap(page, '19-scroll-check', {
      flow: 'Flow 8',
      note: 'AppBar 搜索 + 列表滚动',
    })
  })
})
