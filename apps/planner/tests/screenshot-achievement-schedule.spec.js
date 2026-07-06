import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const STORAGE_KEY = 'planos_v1'
const OUT_DIR = path.join(
  process.cwd(),
  'tests',
  'screenshots',
  'achievement-schedule-jul2026',
)

function localDateOffset(days = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** @param {{ allTodayDone?: boolean }} [opts] */
function featureSeedState(opts = {}) {
  const today = localDateOffset(0)
  const yesterday = localDateOffset(-1)
  const twoDaysAgo = localDateOffset(-2)
  const now = Date.now()
  const hourAgo = now - 60 * 60 * 1000

  const todayOpen = !opts.allTodayDone

  /** @param {Record<string, unknown>} row */
  function todayTask(row) {
    if (!todayOpen && row.dueDate === today && !row.completed) {
      return { ...row, completed: true, completedAt: hourAgo }
    }
    return row
  }

  const rawTasks = [
    {
      id: 'sch_focus',
      title: '深度写作 · 产品方案',
      notes: '',
      listId: 'inbox',
      priority: 1,
      dueDate: today,
      dueTime: null,
      scheduledDate: today,
      scheduledStart: '09:00',
      durationMinutes: 90,
      reminderMinutes: null,
      recurrence: null,
      tags: ['focus'],
      subtasks: [],
      completed: false,
      meta: { kind: 'focus' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'sch_standup',
      title: '团队站会',
      notes: '',
      listId: 'inbox',
      priority: 2,
      dueDate: today,
      dueTime: '09:30',
      scheduledDate: today,
      scheduledStart: '09:30',
      durationMinutes: 30,
      reminderMinutes: null,
      recurrence: null,
      tags: [],
      subtasks: [],
      completed: false,
      meta: { kind: 'micro' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'sch_review',
      title: '设计评审',
      notes: '',
      listId: 'inbox',
      priority: 1,
      dueDate: today,
      dueTime: '14:00',
      scheduledDate: today,
      scheduledStart: '14:00',
      durationMinutes: 60,
      reminderMinutes: null,
      recurrence: null,
      tags: ['work'],
      subtasks: [],
      completed: true,
      completedAt: hourAgo,
      meta: { kind: 'standard' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'sch_email',
      title: '回复客户邮件',
      notes: '',
      listId: 'inbox',
      priority: 3,
      dueDate: today,
      dueTime: null,
      scheduledDate: today,
      scheduledStart: '16:00',
      durationMinutes: 30,
      reminderMinutes: null,
      recurrence: null,
      tags: [],
      subtasks: [],
      completed: true,
      completedAt: hourAgo - 30 * 60 * 1000,
      meta: { kind: 'micro' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'unsched_1',
      title: '整理收件箱',
      notes: '',
      listId: 'inbox',
      priority: 4,
      dueDate: today,
      dueTime: null,
      scheduledDate: null,
      scheduledStart: null,
      durationMinutes: null,
      reminderMinutes: null,
      recurrence: null,
      tags: [],
      subtasks: [],
      completed: todayOpen ? false : true,
      completedAt: todayOpen ? null : hourAgo,
      meta: { kind: 'micro' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'unsched_2',
      title: '阅读行业报告',
      notes: '',
      listId: 'inbox',
      priority: 4,
      dueDate: today,
      dueTime: null,
      scheduledDate: null,
      scheduledStart: null,
      durationMinutes: null,
      reminderMinutes: null,
      recurrence: null,
      tags: [],
      subtasks: [],
      completed: todayOpen ? false : true,
      completedAt: todayOpen ? null : hourAgo - 15 * 60 * 1000,
      meta: { kind: 'habit' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'done_yesterday',
      title: '昨日已完成任务',
      notes: '',
      listId: 'inbox',
      priority: 4,
      dueDate: yesterday,
      dueTime: null,
      scheduledDate: null,
      scheduledStart: null,
      durationMinutes: null,
      reminderMinutes: null,
      recurrence: null,
      tags: [],
      subtasks: [],
      completed: true,
      completedAt: now - 24 * 60 * 60 * 1000,
      meta: { kind: 'standard' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'done_2days',
      title: '前天习惯打卡',
      notes: '',
      listId: 'inbox',
      priority: 4,
      dueDate: twoDaysAgo,
      dueTime: null,
      scheduledDate: null,
      scheduledStart: null,
      durationMinutes: null,
      reminderMinutes: null,
      recurrence: null,
      tags: [],
      subtasks: [],
      completed: true,
      completedAt: now - 48 * 60 * 60 * 1000,
      meta: { kind: 'habit' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tomorrow_task',
      title: '明日站会准备',
      notes: '',
      listId: 'inbox',
      priority: 2,
      dueDate: localDateOffset(1),
      dueTime: null,
      scheduledDate: null,
      scheduledStart: null,
      durationMinutes: null,
      reminderMinutes: null,
      recurrence: null,
      tags: [],
      subtasks: [],
      completed: false,
      meta: { kind: 'standard' },
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
  await page.waitForSelector('[data-testid="fab-add"]', { timeout: 15_000 })
}

async function snap(page, name) {
  const dir = path.join(OUT_DIR, test.info().project.name)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${name}.png`)
  await page.waitForTimeout(400)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

test.describe.configure({ timeout: 60_000 })

test.describe('成就感 + 日程截图', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  })

  test('主导航与核心界面', async ({ page }, testInfo) => {
    await seedState(page, featureSeedState())

    await page.goto('/')
    await page.waitForSelector('.today-progress', { timeout: 10_000 })
    await snap(page, '01-today-progress')

    const doneSection = page.locator('#done-today, [id="done-today"]')
    if (await doneSection.count()) {
      await doneSection.scrollIntoViewIfNeeded()
      await snap(page, '02-today-done-today')
    }

    await page.goto('/?view=timeline')
    await page.waitForSelector('.schedule-summary', { timeout: 10_000 })
    await snap(page, '03-schedule-day-plan')

    await page
      .getByRole('button', { name: '安排', exact: true })
      .first()
      .click()
    await page.waitForSelector('.schedule-popover', { timeout: 5000 })
    await snap(page, '04-schedule-popover')

    await page.getByRole('button', { name: '下午', exact: true }).click()
    await page.waitForTimeout(200)
    await snap(page, '05-schedule-popover-preset')

    await page.getByRole('button', { name: '取消' }).click()
    await page.waitForSelector('.schedule-popover', { state: 'hidden' })

    await page.goto('/calendar')
    await page.waitForLoadState('networkidle')
    await snap(page, '06-calendar')

    await page.goto('/completed')
    await page.waitForSelector('.completed-rhythm', { timeout: 10_000 })
    await snap(page, '07-completed-rhythm')

    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight * 0.62),
    )
    await page.waitForTimeout(300)
    await snap(page, '08-settings-rhythm')

    testInfo.annotations.push({
      type: 'screenshots',
      description: path.join(OUT_DIR, testInfo.project.name),
    })
  })

  test('Today 庆祝卡', async ({ page }, testInfo) => {
    await seedState(page, featureSeedState({ allTodayDone: true }))
    await page.evaluate(() => sessionStorage.removeItem('planner_today_closed'))
    await page.goto('/')
    await page.waitForSelector('.today-closed', { timeout: 10_000 })
    await snap(page, '09-today-closed-celebration')

    testInfo.annotations.push({
      type: 'screenshots',
      description: path.join(OUT_DIR, testInfo.project.name),
    })
  })

  test('完成动效与撤销 Toast', async ({ page }, testInfo) => {
    await seedState(page, featureSeedState())
    await page.goto('/')
    const row = page.locator('.task-row', { hasText: '深度写作' }).first()
    await row.locator('.task-check').first().click({ force: true })
    await page.waitForTimeout(600)
    await snap(page, '10-complete-ritual-toast')

    testInfo.annotations.push({
      type: 'screenshots',
      description: path.join(OUT_DIR, testInfo.project.name),
    })
  })
})
