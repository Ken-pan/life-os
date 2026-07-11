import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const STORAGE_KEY = 'planos_v1'
const HOUR_HEIGHT = 72
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  '../../docs/qa/evidence/planner-schedule/2026-07-10',
)

function localDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function task(id, title, overrides = {}) {
  const now = Date.now()
  return {
    id,
    title,
    notes: '',
    listId: 'inbox',
    priority: 'P3',
    dueDate: localDate(),
    dueTime: null,
    scheduledDate: null,
    scheduledStart: null,
    durationMinutes: null,
    reminderMinutes: null,
    recurrence: null,
    tags: [],
    subtasks: [],
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    sortOrder: 1,
    meta: { kind: 'standard' },
    ...overrides,
  }
}

function state(tasks) {
  return {
    schemaVersion: 3,
    tasks,
    projects: [],
    lists: [
      {
        id: 'inbox',
        title: 'inbox',
        icon: 'inbox',
        color: '#F5A623',
        sortOrder: 0,
        system: 'inbox',
        updatedAt: 0,
        deletedAt: null,
      },
    ],
    settings: {
      theme: 'light',
      locale: 'zh',
      defaultListId: 'inbox',
      notificationsEnabled: false,
      syncAuto: false,
      lockPortraitOnPhone: true,
      rhythmEnabled: true,
      dailyGoal: 3,
      rhythmPaused: false,
      rhythmRestDays: [],
      updatedAt: 0,
    },
  }
}

async function seed(page, tasks) {
  await page.goto('/')
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: state(tasks) },
  )
  await page.goto('/calendar')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.day-timeline-canvas')).toBeVisible()
}

async function storedTask(page, id) {
  return page.evaluate(
    ({ key, taskId }) => {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw).tasks.find((item) => item.id === taskId) : null
    },
    { key: STORAGE_KEY, taskId: id },
  )
}

async function dragBy(page, locator, dy) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + dy, { steps: 8 })
  await page.mouse.up()
}

test.describe.configure({ timeout: 60_000 })

test.describe('P-SCHED-0 scheduling usability', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }))

  test('desktop dynamic bounds, 1–4 overlaps, create, move, resize, and reload persistence', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop interaction gate')
    await page.setViewportSize({ width: 1440, height: 960 })
    const today = localDate()
    await seed(page, [
      task('early', 'Early block', {
        scheduledDate: today,
        scheduledStart: '06:30',
        durationMinutes: 30,
      }),
      ...[0, 1, 2, 3].map((index) =>
        task(`overlap-${index}`, `Overlap ${index + 1}`, {
          scheduledDate: today,
          scheduledStart: `10:${String(index * 5).padStart(2, '0')}`,
          durationMinutes: 60,
        }),
      ),
      task('movable', 'Movable block', {
        scheduledDate: today,
        scheduledStart: '14:00',
        durationMinutes: 60,
      }),
      task('late', 'Late block', {
        scheduledDate: today,
        scheduledStart: '23:30',
        durationMinutes: 30,
      }),
      task('place-me', 'Place me'),
    ])

    await expect(page.locator('.day-timeline-hour-label', { hasText: '06:00' })).toBeVisible()
    await expect(page.locator('.day-timeline-hour-label', { hasText: '23:00' })).toBeVisible()
    await expect(page.locator('.time-block')).toHaveCount(7)

    const overlapWidths = await page
      .locator('.time-block--columned')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width))
    expect(overlapWidths).toHaveLength(4)
    expect(Math.max(...overlapWidths) - Math.min(...overlapWidths)).toBeLessThan(2)
    expect(Math.min(...overlapWidths)).toBeGreaterThan(70)

    const canvas = page.locator('.day-timeline-canvas')
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).not.toBeNull()
    const hitbox = page.locator('.day-timeline-slot-hitbox')
    const canvasClientTop = await canvas.evaluate(
      (element) => element.getBoundingClientRect().top,
    )
    const createClientY = canvasClientTop + 7 * HOUR_HEIGHT
    await hitbox.dispatchEvent('pointerdown', {
      button: 0,
      clientY: createClientY,
      pointerId: 41,
      pointerType: 'mouse',
    })
    await hitbox.dispatchEvent('pointerup', {
      button: 0,
      clientY: createClientY,
      pointerId: 41,
      pointerType: 'mouse',
    })
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText(/\d{2}:(00|15|30|45)/)
    await page.getByRole('dialog').getByRole('button', { name: 'Place me' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.time-block', { hasText: 'Place me' })).toBeVisible()
    await expect.poll(async () => (await storedTask(page, 'place-me'))?.scheduledStart).not.toBeNull()

    const movable = page.locator('.time-block', { hasText: 'Movable block' })
    await dragBy(page, movable.locator('.time-block-grip'), HOUR_HEIGHT * 0.75)
    await expect.poll(async () => (await storedTask(page, 'movable'))?.scheduledStart).not.toBe(
      '14:00',
    )
    const moved = await storedTask(page, 'movable')
    expect(moved.durationMinutes).toBe(60)

    const movedTop = await movable.evaluate((element) => Number.parseFloat(element.style.top))
    await page.locator('.day-timeline-scroll').evaluate(
      (element, top) => element.scrollTo({ top: Math.max(0, top - 100) }),
      movedTop,
    )
    await dragBy(page, movable.locator('.time-block-handle--bottom'), HOUR_HEIGHT * 0.75)
    await expect.poll(async () => (await storedTask(page, 'movable'))?.durationMinutes).toBe(90)
    const resized = await storedTask(page, 'movable')
    expect(resized.scheduledStart).toBe(moved.scheduledStart)
    await page.reload()
    await expect(page.locator('.time-block', { hasText: 'Movable block' })).toContainText(
      resized.scheduledStart,
    )
    expect(await storedTask(page, 'movable')).toMatchObject({
      scheduledStart: resized.scheduledStart,
      durationMinutes: 90,
    })

    await page.goto('/')
    await expect(
      page.locator('.task-row', { hasText: 'Movable block' }),
    ).toContainText(resized.scheduledStart)
    await page.goto('/calendar')
    await expect(page.locator('.day-timeline-canvas')).toBeVisible()

    await page.evaluate(() => {
      window.__plannerOriginalSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      }
    })
    const beforeFailedMove = await storedTask(page, 'movable')
    await dragBy(page, page.locator('.time-block', { hasText: 'Movable block' }).locator('.time-block-grip'), HOUR_HEIGHT * 0.75)
    await expect(page.locator('.toast')).toContainText('已恢复原状态')
    await expect(page.locator('.time-block', { hasText: 'Movable block' })).toContainText(
      beforeFailedMove.scheduledStart,
    )
    await page.evaluate(() => {
      Storage.prototype.setItem = window.__plannerOriginalSetItem
      delete window.__plannerOriginalSetItem
    })

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'final-desktop-1440x960.png'),
      fullPage: true,
    })
  })

  test('mobile standalone owns one scroll surface and touch controls avoid FAB/nav collisions', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile interaction gate')
    await page.setViewportSize({ width: 393, height: 852 })
    const today = localDate()
    await seed(page, [
      task('mobile-block', 'Mobile block', {
        scheduledDate: today,
        scheduledStart: '09:00',
        durationMinutes: 60,
      }),
      task('mobile-unscheduled', 'Mobile unscheduled'),
    ])
    await page.evaluate(() => document.documentElement.classList.add('standalone-pwa'))

    const metrics = await page.evaluate(() => {
      const workspace = document.querySelector('.life-os-page-workspace')
      const timeline = document.querySelector('.day-timeline-scroll')
      const fab = document.querySelector('[data-testid="fab-add"]')
      const panel = document.querySelector('.unscheduled-panel')
      const nav = document.querySelector('.mobile-tabbar, .nav')
      const rect = (node) => (node ? node.getBoundingClientRect().toJSON() : null)
      const style = (node) => (node ? getComputedStyle(node).overflowY : null)
      return {
        scrollingElement: document.scrollingElement?.tagName,
        documentOverflow: style(document.scrollingElement),
        workspace: {
          scrollTop: workspace?.scrollTop,
          scrollHeight: workspace?.scrollHeight,
          clientHeight: workspace?.clientHeight,
          overflowY: style(workspace),
        },
        timeline: {
          scrollHeight: timeline?.scrollHeight,
          clientHeight: timeline?.clientHeight,
          overflowY: style(timeline),
        },
        rects: { fab: rect(fab), panel: rect(panel), nav: rect(nav) },
      }
    })

    expect(metrics.workspace.overflowY).toBe('auto')
    expect(metrics.timeline.overflowY).toBe('visible')
    expect(metrics.timeline.scrollHeight).toBe(metrics.timeline.clientHeight)
    expect(metrics.rects.fab.bottom).toBeLessThanOrEqual(metrics.rects.nav.top)
    const horizontallyOverlap =
      metrics.rects.fab.left < metrics.rects.panel.right &&
      metrics.rects.fab.right > metrics.rects.panel.left
    const verticallyOverlap =
      metrics.rects.fab.top < metrics.rects.panel.bottom &&
      metrics.rects.fab.bottom > metrics.rects.panel.top
    expect(horizontallyOverlap && verticallyOverlap).toBe(false)

    const workspace = page.locator('.life-os-page-workspace')
    await workspace.evaluate((element) => element.scrollTo({ top: 240 }))
    const before = await workspace.evaluate((element) => element.scrollTop)
    const mobileBlock = page.locator('.time-block', { hasText: 'Mobile block' })
    await expect(mobileBlock.locator('.time-block-grip')).toBeVisible()
    await expect(mobileBlock.locator('.time-block-handle--bottom')).toBeVisible()
    await dragBy(page, mobileBlock.locator('.time-block-grip'), HOUR_HEIGHT / 2)
    const after = await workspace.evaluate((element) => element.scrollTop)
    expect(Math.abs(after - before)).toBeLessThan(2)

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'final-mobile-393x852.png'),
      fullPage: true,
    })

    await page.setViewportSize({ width: 430, height: 932 })
    const wideRects = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON()
      return {
        fab: rect('[data-testid="fab-add"]'),
        panel: rect('.unscheduled-panel'),
        nav: rect('.mobile-tabbar, .nav'),
      }
    })
    expect(wideRects.fab.bottom).toBeLessThanOrEqual(wideRects.nav.top)
    expect(
      wideRects.fab.left < wideRects.panel.right &&
        wideRects.fab.right > wideRects.panel.left &&
        wideRects.fab.top < wideRects.panel.bottom &&
        wideRects.fab.bottom > wideRects.panel.top,
    ).toBe(false)
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'final-mobile-430x932.png'),
      fullPage: true,
    })
  })
})
