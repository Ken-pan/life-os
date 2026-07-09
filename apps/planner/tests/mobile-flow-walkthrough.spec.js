import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const STORAGE_KEY = 'planos_v1'
const { dir: OUT_DIR } = resolveScreenshotDir({
  app: 'planner',
  suite: 'mobile-flow-walkthrough',
  importMetaUrl: import.meta.url,
})

/** @type {Array<{ file: string, flow: string, note: string }>} */
const SNAP_INDEX = []

function localDateOffset(days = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function flowSeedState() {
  const today = localDateOffset(0)
  const tomorrow = localDateOffset(1)
  const now = Date.now()
  const hourAgo = now - 60 * 60 * 1000
  const workListId = 'list_flow_work'

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
      completed: true,
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
    tasks: rawTasks,
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

function purgeOldScreenshots() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (name.endsWith('.png')) {
      fs.unlinkSync(path.join(OUT_DIR, name))
    }
  }
}

async function seedState(page, state) {
  await page.goto('/')
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: STORAGE_KEY, data: state },
  )
  await page.reload()
  await page.waitForSelector('h1.page-title', { timeout: 15_000 })
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
    '# Planner 移动端 IA 验收截图',
    '',
    `生成时间：${generated}`,
    '',
    '固定 5 张：Today / Inbox / Upcoming / Completed / Calendar。',
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

test.describe.configure({ timeout: 90_000, mode: 'serial' })

test.describe('移动端 IA 验收截图', () => {
  test.beforeAll(() => {
    purgeOldScreenshots()
    SNAP_INDEX.length = 0
  })

  test.afterAll(() => {
    writeSnapReadme()
  })

  test('5 张一级页面截图', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await seedState(page, flowSeedState())

    await page.goto('/')
    await expect(page.locator('h1.page-title')).toHaveText('今天')
    await expect(page.locator('.today-progress')).toBeVisible()
    await expect(page.getByTestId('fab-add')).toHaveAttribute(
      'data-fab-mode',
      'large',
    )
    await snap(page, '01-today', { flow: 'IA', note: 'Today 大 FAB + 进度卡' })

    await page.goto('/inbox')
    await expect(page.locator('h1.page-title')).toHaveText('收件箱')
    await expect(page.getByTestId('fab-add')).toHaveCount(0)
    await expect(page.locator('.page-hint')).toBeVisible()
    await snap(page, '02-inbox', {
      flow: 'IA',
      note: 'Inbox 无 FAB + 轻量 hint',
    })

    await page.goto('/upcoming')
    await expect(page.locator('h1.page-title')).toHaveText('即将')
    await expect(page.getByTestId('fab-add')).toHaveAttribute(
      'data-fab-mode',
      'compact',
    )
    await snap(page, '03-upcoming', { flow: 'IA', note: 'Upcoming 小 FAB' })

    await page.goto('/completed')
    await expect(page.locator('h1.page-title')).toHaveText('已完成')
    await expect(page.getByTestId('fab-add')).toHaveCount(0)
    await snap(page, '04-completed', {
      flow: 'IA',
      note: 'Completed 节奏与成就',
    })

    await page.goto('/calendar')
    await expect(page.locator('h1.page-title')).toHaveText('日历')
    await expect(page.getByRole('link', { name: '日历' })).toBeVisible()
    await expect(page.getByTestId('fab-add')).toHaveAttribute(
      'data-fab-mode',
      'compact',
    )
    await snap(page, '05-calendar', {
      flow: 'IA',
      note: 'Calendar Primary Tab + 小 FAB',
    })
  })
})
