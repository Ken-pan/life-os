import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const STORAGE_KEY = 'planos_v1'
const OUT_DIR = path.join(process.cwd(), 'tests', 'screenshots', 'mobile-flow-walkthrough')

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

async function snap(page, name) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const file = path.join(OUT_DIR, `${name}.png`)
  await page.waitForTimeout(350)
  await page.screenshot({ path: file, fullPage: false })
  return file
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
  if ((await head.count()) && (await head.getAttribute('aria-expanded')) === 'false') {
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
  })

  test('Flow 1 — Today 列表浏览与完成任务', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/')
    await expect(page.locator('h1.page-title')).toHaveText('今天')
    await expect(page.locator('.today-progress')).toBeVisible()
    await expect(page.locator('.task-title', { hasText: '深度写作 · 产品方案' })).toBeVisible()
    await snap(page, '01-today-list')

    const row = page.locator('.task-row', {
      has: page.locator('.task-title', { hasText: '深度写作 · 产品方案' }),
    })
    await row.locator('.task-check').click()
    await expect(page.locator('.toast')).toBeVisible()
    await snap(page, '02-complete-toast')

    await page.getByRole('button', { name: /撤销|Undo/i }).click({ timeout: 3000 }).catch(() => {})
    await expect(
      page.locator('.task-title', { hasText: '深度写作 · 产品方案' }),
    ).toBeVisible()
  })

  test('Flow 2 — FAB 新建任务', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/')
    await page.getByTestId('fab-add').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await snap(page, '03-fab-editor')

    await dialog.locator('#task-title').fill('走查新建任务')
    await dialog.getByRole('button', { name: '保存' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.task-title', { hasText: '走查新建任务' })).toBeVisible()
    await snap(page, '04-after-create')
  })

  test('Flow 3 — 时间轴与安排弹窗', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/?view=timeline')
    await expect(page.getByRole('tab', { name: '时间轴' })).toHaveClass(/on/)
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
    await snap(page, '05-timeline')

    await page.getByRole('button', { name: '更多' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator('.nav-item-more.on, .nav-item-more')).toBeVisible()
    await snap(page, '06-more-on-timeline')

    await page.keyboard.press('Escape')
    await expandUnscheduledIfNeeded(page)
    await page.getByRole('button', { name: '安排', exact: true }).first().click()
    await expect(page.locator('.schedule-popover')).toBeVisible()
    await page.getByRole('button', { name: '下午', exact: true }).click()
    await expect(page.getByRole('button', { name: '14:00', exact: true })).toHaveClass(/on/)
    await snap(page, '07-schedule-popover')
    await page.getByRole('button', { name: '取消' }).click()
  })

  test('Flow 4 — 底栏 Primary 导航', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/')
    await page.getByRole('link', { name: '收件箱' }).click()
    await expect(page).toHaveURL(/\/inbox/)
    await expect(page.locator('.task-title', { hasText: '收件箱灵感' })).toBeVisible()
    await snap(page, '08-inbox')

    await page.getByRole('link', { name: '即将' }).click()
    await expect(page).toHaveURL(/\/upcoming/)
    await expect(page.locator('.task-title', { hasText: '明日站会准备' })).toBeVisible()
    await snap(page, '09-upcoming')

    await page.getByRole('link', { name: '已完成' }).click()
    await expect(page).toHaveURL(/\/completed/)
    await snap(page, '10-completed')

    await page.getByRole('link', { name: '今天' }).click()
    await expect(page).toHaveURL(/\/(\?.*)?$/)
    await snap(page, '11-back-today')
  })

  test('Flow 5 — More 菜单：日历 / 搜索 / 设置 / 清单', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/calendar')
    await expect(page.locator('h1.page-title')).toHaveText('日历')
    const todayNav = page.getByRole('link', { name: '今天' })
    await expect(todayNav).not.toHaveClass(/on/)
    await expect(page.locator('.nav-item-more.on')).toBeVisible()
    await snap(page, '12-calendar-nav')

    await openMore(page)
    await expect(page.getByTestId('fab-add')).toBeHidden()
    await snap(page, '12b-calendar-more-no-fab')
    await page.keyboard.press('Escape')
    await expect(moreSheet(page)).toHaveCount(0)

    await openMore(page)
    await moreSheet(page).getByRole('link', { name: '搜索' }).click()
    await expect(page).toHaveURL(/\/search/)
    await page.locator('.field input').fill('发布')
    await expect(page.locator('.task-title', { hasText: '版本发布' })).toBeVisible()

    const tagButtons = page.locator('.search-tags .seg button')
    const tagCount = await tagButtons.count()
    for (let i = 0; i < tagCount; i++) {
      const text = (await tagButtons.nth(i).innerText()).trim()
      expect(text.length).toBeGreaterThan(0)
    }
    await snap(page, '13-search')

    await openMore(page)
    await moreSheet(page).getByRole('link', { name: '设置' }).click()
    await expect(page).toHaveURL(/\/settings/)
    await snap(page, '14-settings')

    await openMore(page)
    await moreSheet(page).getByRole('link', { name: '工作项目' }).click()
    await expect(page).toHaveURL(/\/lists\/list_flow_work/)
    await expect(page.locator('.task-title', { hasText: '版本发布' })).toBeVisible()
    await snap(page, '15-list-detail')
  })

  test('Flow 6 — 手势：右滑完成 / 左滑改期', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/inbox')
    await swipeTaskRow(page, '收件箱灵感', 120)
    await expect(page.locator('.task-title', { hasText: '收件箱灵感' })).toHaveCount(0)
    await page.goto('/completed')
    await expect(page.locator('.task-title', { hasText: '收件箱灵感' })).toBeVisible()
    await snap(page, '16-swipe-complete')

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
    await expect(page.locator('.task-title', { hasText: '左滑改期测试' })).toBeVisible()
    await snap(page, '17-swipe-reschedule')
  })

  test('Flow 7 — 庆祝态（全部完成）', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState({ allTodayDone: true }))
    await page.evaluate(() => sessionStorage.removeItem('planner_today_closed'))
    await page.goto('/')

    await expect(page.locator('.today-closed')).toBeVisible()
    await expect(page.locator('.insight-card')).toHaveCount(0)
    const doneHeader = page.locator('#done-today .sec-header--collapsible, #done-today')
    await expect(doneHeader.first()).toBeVisible()
    const expanded = await page
      .locator('#done-today .sec-header--collapsible')
      .getAttribute('aria-expanded')
      .catch(() => 'true')
    expect(expanded).not.toBe('false')
    await snap(page, '18-celebration')
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
    await snap(page, '19-scroll-check')
  })
})
