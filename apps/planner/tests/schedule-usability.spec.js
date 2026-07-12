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

async function seed(page, tasks, { path = '/calendar' } = {}) {
  await page.goto('/')
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: state(tasks) },
  )
  await page.goto(path)
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
    await page.locator('.day-timeline-scroll').evaluate(
      (element, hourHeight) => element.scrollTo({ top: 5 * hourHeight }),
      HOUR_HEIGHT,
    )
    const emptyPoint = await page.evaluate(() => {
      const scroll = document.querySelector('.day-timeline-scroll')
      const canvasElement = document.querySelector('.day-timeline-canvas')
      if (!scroll || !canvasElement) return null
      const scrollRect = scroll.getBoundingClientRect()
      const canvasRect = canvasElement.getBoundingClientRect()
      const x = canvasRect.left + canvasRect.width * 0.8
      for (let y = scrollRect.top + 24; y < scrollRect.bottom - 24; y += 12) {
        if (document.elementFromPoint(x, y)?.closest('.day-timeline-slot-hitbox')) {
          return { x, y }
        }
      }
      return null
    })
    expect(emptyPoint).not.toBeNull()
    await page.mouse.click(emptyPoint.x, emptyPoint.y)
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
    ], { path: '/calendar?pwa_sim=1' })
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.classList.contains('standalone-pwa'),
        ),
      )
      .toBe(true)

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

    const overflowX = await page.evaluate(() => {
      const workspace = document.querySelector('.life-os-page-workspace')
      return {
        document:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        workspace: workspace ? workspace.scrollWidth - workspace.clientWidth : 0,
      }
    })
    expect(overflowX.document).toBeLessThanOrEqual(1)
    expect(overflowX.workspace).toBeLessThanOrEqual(1)

    // SCH-10: 最后一行时间轴必须真实可达 —— 滚到底后最后一个小时标签完整落在
    // 视口内且不被底部导航覆盖（不是只断言 scrollTop 变化）
    await workspace.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
    const bottomReach = await page.evaluate(() => {
      const canvas = document.querySelector('.day-timeline-canvas')
      const nav = document.querySelector('.mobile-tabbar, .nav')
      const labels = [...document.querySelectorAll('.day-timeline-hour-label')]
      const last = labels[labels.length - 1]
      const lastRect = last?.getBoundingClientRect()
      return {
        canvasBottom: canvas?.getBoundingClientRect().bottom,
        lastLabelTop: lastRect?.top,
        lastLabelBottom: lastRect?.bottom,
        lastLabelText: last?.textContent?.trim(),
        navTop: nav?.getBoundingClientRect().top,
      }
    })
    expect(bottomReach.lastLabelText).toMatch(/^\d{2}:\d{2}$/)
    expect(bottomReach.lastLabelTop).toBeGreaterThanOrEqual(0)
    expect(bottomReach.canvasBottom).toBeLessThanOrEqual(bottomReach.navTop + 2)
    expect(bottomReach.lastLabelBottom).toBeLessThanOrEqual(bottomReach.navTop + 2)

    const slotPoint = await page.evaluate(() => {
      const canvasElement = document.querySelector('.day-timeline-canvas')
      if (!canvasElement) return null
      const canvasRect = canvasElement.getBoundingClientRect()
      const x = canvasRect.left + canvasRect.width * 0.7
      for (let y = Math.max(canvasRect.top, 0) + 24; y < window.innerHeight - 24; y += 12) {
        if (document.elementFromPoint(x, y)?.closest('.day-timeline-slot-hitbox')) {
          return { x, y }
        }
      }
      return null
    })
    expect(slotPoint).not.toBeNull()
    await page.mouse.click(slotPoint.x, slotPoint.y)
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    const sheetScroll = await page
      .locator('.schedule-popover')
      .evaluate((element) => ({
        overflowY: getComputedStyle(element).overflowY,
        withinViewport:
          element.getBoundingClientRect().bottom <= window.innerHeight + 1,
      }))
    expect(sheetScroll.overflowY).toBe('auto')
    expect(sheetScroll.withinViewport).toBe(true)
    await page.locator('.schedule-popover-close').click()
    await expect(sheet).toHaveCount(0)

    // sheet 关闭后主滚动面必须恢复可滚动
    const scrollRestored = await workspace.evaluate((element) => {
      element.scrollTo({ top: 0 })
      element.scrollTo({ top: 120 })
      return element.scrollTop
    })
    expect(scrollRestored).toBeGreaterThan(0)

    await workspace.evaluate((element) => element.scrollTo({ top: 240 }))
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

  test('legacy and representative data walk survives migrate boundary on calendar and today', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile'
    if (isMobile) await page.setViewportSize({ width: 393, height: 852 })
    const today = localDate()
    const now = Date.now()
    /** raw legacy rows: schemaVersion 2, no tags/subtasks defaults, numeric priority */
    const legacyState = {
      schemaVersion: 2,
      tasks: [
        {
          id: 'legacy-unscheduled',
          title: 'Legacy unscheduled — no tags field',
          listId: 'inbox',
          priority: 1,
          dueDate: today,
          completed: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'legacy-start-only',
          title: 'Start time only',
          listId: 'inbox',
          dueDate: today,
          scheduledDate: today,
          scheduledStart: '11:00',
          durationMinutes: null,
          completed: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'legacy-start-end',
          title: 'Start and end time',
          listId: 'inbox',
          dueDate: today,
          scheduledDate: today,
          scheduledStart: '13:00',
          durationMinutes: 90,
          completed: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'legacy-long-title',
          title:
            'A very long legacy task title that keeps going and going to exercise truncation and wrapping behaviour in both the time block and the task row layouts without breaking horizontal overflow',
          listId: 'inbox',
          dueDate: today,
          scheduledDate: today,
          scheduledStart: '13:30',
          durationMinutes: 60,
          tags: 'not-an-array',
          completed: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'legacy-tags',
          title: 'Tagged task',
          listId: 'inbox',
          dueDate: today,
          tags: [' work ', '', 42, null, 'home'],
          completed: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'legacy-completed',
          title: 'Completed legacy task',
          listId: 'inbox',
          dueDate: today,
          scheduledDate: today,
          scheduledStart: '09:00',
          durationMinutes: 30,
          completed: true,
          completedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'legacy-midnight-edge',
          title: 'Late block ending at midnight',
          listId: 'inbox',
          dueDate: today,
          scheduledDate: today,
          scheduledStart: '23:30',
          durationMinutes: 30,
          completed: false,
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
          updatedAt: 0,
          deletedAt: null,
        },
      ],
      settings: { locale: 'zh', syncAuto: false },
    }

    /** @type {Error[]} */
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error))

    await page.goto('/')
    await page.evaluate(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      { key: STORAGE_KEY, value: legacyState },
    )
    await page.goto(isMobile ? '/calendar?pwa_sim=1' : '/calendar')
    await page.waitForLoadState('networkidle')
    expect(
      await page.evaluate(() =>
        document.documentElement.classList.contains('standalone-pwa'),
      ),
    ).toBe(isMobile)

    await expect(page.locator('.day-timeline-canvas')).toBeVisible()
    // scheduled: start-only, start+end, long-title, completed, midnight edge
    await expect(page.locator('.time-block')).toHaveCount(5)
    await expect(page.locator('.time-block', { hasText: 'Start time only' })).toBeVisible()
    await expect(
      page.locator('.day-timeline-hour-label', { hasText: '23:00' }),
    ).toBeVisible()

    const docOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(docOverflow).toBeLessThanOrEqual(1)

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('.task-row', { hasText: 'Legacy unscheduled' }),
    ).toBeVisible()
    await expect(page.locator('.task-row', { hasText: 'Tagged task' })).toBeVisible()

    expect(pageErrors).toEqual([])

    await page.screenshot({
      path: path.join(
        EVIDENCE_DIR,
        `legacy-walk-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    })
  })
})
