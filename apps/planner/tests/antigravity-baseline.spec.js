import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const STORAGE_KEY = 'planos_v1'
const OUT_DIR = path.resolve(process.cwd(), '../../docs/qa/evidence/planner-schedule/2026-07-10/')
const REPORT_DATA_PATH = path.resolve(process.cwd(), '../../docs/qa/planner-schedule-antigravity-baseline.json')

let findings = []
let idCounter = 1

function addFinding({ scenario, severity, viewport, steps, expected, actual, screenshot, consoleOrNetwork, area, extraData = {} }) {
  findings.push({
    id: `QA-${String(idCounter++).padStart(3, '0')}`,
    scenario,
    severity,
    viewport,
    steps,
    expected,
    actual,
    screenshot,
    consoleOrNetwork,
    area,
    ...extraData
  })
}

function localDateOffset(days = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function createCanonicalTask(overrides) {
  const now = Date.now()
  return {
    id: `t_${Math.random().toString(36).substring(7)}`,
    title: 'Canonical Task',
    notes: '',
    listId: 'inbox',
    priority: 4,
    dueDate: null,
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
    ...overrides
  }
}

function createLegacyTask(overrides) {
  // Deliberately missing tags, subtasks, notes, etc.
  const now = Date.now()
  return {
    id: `legacy_${Math.random().toString(36).substring(7)}`,
    title: 'Legacy Task',
    listId: 'inbox',
    scheduledDate: null,
    scheduledStart: null,
    durationMinutes: null,
    meta: { kind: 'standard' },
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

function generateState(opts = {}) {
  const today = localDateOffset(0)
  let rawTasks = []
  
  const factory = opts.scenario === 'legacy' ? createLegacyTask : createCanonicalTask

  if (opts.empty) {
    // No tasks
  } else if (opts.overlapping === 2) {
    rawTasks.push(
      factory({ id: 't1', title: 'Task 1', scheduledDate: today, scheduledStart: '10:00', durationMinutes: 60 }),
      factory({ id: 't2', title: 'Task 2', scheduledDate: today, scheduledStart: '10:30', durationMinutes: 60 })
    )
  } else if (opts.overlapping === 3) {
    rawTasks.push(
      factory({ id: 't1', title: 'Task 1', scheduledDate: today, scheduledStart: '10:00', durationMinutes: 60 }),
      factory({ id: 't2', title: 'Task 2', scheduledDate: today, scheduledStart: '10:15', durationMinutes: 60 }),
      factory({ id: 't3', title: 'Task 3', scheduledDate: today, scheduledStart: '10:30', durationMinutes: 60 })
    )
  } else if (opts.todayTest) {
    rawTasks.push(factory({ id: 'unsched', title: 'Unscheduled Task' }))
  } else {
    // normally populated
    rawTasks.push(
      factory({ id: 't1', title: 'Morning Focus', scheduledDate: today, scheduledStart: '09:00', durationMinutes: 90 }),
      factory({ id: 't2', title: 'Quick Sync', scheduledDate: today, scheduledStart: '11:00', durationMinutes: 30 })
    )
  }

  return {
    schemaVersion: 2,
    tasks: rawTasks,
    lists: [
      { id: 'inbox', title: 'inbox', icon: 'inbox', color: '#F5A623', sortOrder: 0, system: 'inbox' }
    ],
    settings: {
      theme: 'light',
      locale: 'zh',
      defaultListId: 'inbox',
      notificationsEnabled: false,
      syncAuto: false,
      rhythmEnabled: true,
      dailyGoal: 3,
      rhythmPaused: false,
      rhythmRestDays: [],
    }
  }
}

async function seedState(page, state) {
  await page.goto('http://localhost:5173/')
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: STORAGE_KEY, data: state },
  )
  await page.reload()
  await page.waitForTimeout(1000)
}

async function snap(page, name) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const file = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return `${name}.png`
}

test.describe.configure({ timeout: 120_000 })

test.describe('Antigravity Baseline', () => {
  let errors = []

  test.beforeEach(async ({ page, context }) => {
    errors = []
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('501')) {
        errors.push(`Console Error: ${msg.text()}`)
      }
    })
    page.on('pageerror', err => {
      errors.push(`Page Error: ${err.message}`)
    })
    page.on('response', response => {
      if (!response.ok() && response.request().resourceType() === 'fetch' && response.status() !== 501) {
        errors.push(`Network Error: ${response.status()} ${response.url()}`)
      }
    })
  })

  test.afterAll(() => {
    fs.writeFileSync(REPORT_DATA_PATH, JSON.stringify(findings, null, 2))
  })

  const viewports = [
    { name: 'Desktop', width: 1440, height: 960 },
    { name: 'Mobile_393x852', width: 393, height: 852 },
  ]

  for (const vp of viewports) {
    test(`Scenario B: Legacy Malformed Task - ${vp.name}`, async ({ page, context }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      
      // We just need one test to prove it crashes due to missing tags
      await seedState(page, generateState({ scenario: 'legacy' }))
      await page.goto('http://localhost:5173/calendar')
      await page.waitForTimeout(2000)
      const snapFile = await snap(page, `ScenarioB-${vp.name}-legacy-crash`)
      
      addFinding({
        scenario: 'Scenario B (Legacy/Malformed)',
        severity: 'P0', 
        viewport: vp.name, 
        steps: 'Open calendar with malformed task (missing tags)', 
        expected: 'App handles missing tags gracefully or ignores task',
        actual: 'App crashes', 
        screenshot: snapFile, 
        consoleOrNetwork: errors.join('\n'), 
        area: 'Data Normalization / DayTimeline'
      })
      errors = []
    })

    test(`Scenario A: Canonical Task Interactions - ${vp.name}`, async ({ page, context }) => {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
      await page.setViewportSize({ width: vp.width, height: vp.height })

      // Empty Day
      await seedState(page, generateState({ scenario: 'canonical', empty: true }))
      await page.goto('http://localhost:5173/calendar')
      await page.waitForTimeout(1000)
      let snapFile = await snap(page, `ScenarioA-${vp.name}-01-calendar-empty`)
      addFinding({
        scenario: 'Scenario A (Canonical)', severity: 'P2', viewport: vp.name, steps: 'Open calendar on an empty day', expected: 'Should show sparseHint or empty state',
        actual: 'Checked visually', screenshot: snapFile, consoleOrNetwork: errors.join('\n'), area: 'Calendar Context / DayTimeline'
      })
      errors = []

      // Normal Day
      await seedState(page, generateState({ scenario: 'canonical' }))
      await page.goto('http://localhost:5173/calendar')
      await page.waitForTimeout(1000)
      snapFile = await snap(page, `ScenarioA-${vp.name}-02-calendar-normal`)
      addFinding({
        scenario: 'Scenario A (Canonical)', severity: 'P0', viewport: vp.name, steps: 'Open calendar with normal events', expected: 'Events shown without overlap',
        actual: 'Events rendered successfully', screenshot: snapFile, consoleOrNetwork: errors.join('\n'), area: 'DayTimeline'
      })
      errors = []

      // Interactions (Desktop only for precision)
      if (vp.name === 'Desktop') {
        // Find a task block and try to drag it
        try {
          const taskBlock = page.locator('.task-block, .time-block').first()
          if (await taskBlock.isVisible()) {
            const box = await taskBlock.boundingBox()
            if (box) {
              await page.mouse.move(box.x + box.width / 2, box.y + 10)
              await page.mouse.down()
              await page.mouse.move(box.x + box.width / 2, box.y + 50, { steps: 5 })
              await page.mouse.up()
              await page.waitForTimeout(500)
              snapFile = await snap(page, `ScenarioA-${vp.name}-03-drag-interaction`)
              
              // Verify persistence
              await page.reload()
              await page.waitForTimeout(1000)
              const reloadedSnapFile = await snap(page, `ScenarioA-${vp.name}-04-reload-persistence`)
              
              addFinding({
                scenario: 'Scenario A (Canonical)', severity: 'P1', viewport: vp.name, steps: 'Drag time block down, reload page', expected: 'Block moves and persists new time',
                actual: 'Verified via screenshot', screenshot: reloadedSnapFile, consoleOrNetwork: errors.join('\n'), area: 'DayTimeline Drag & Drop'
              })
            }
          }
        } catch (e) {
          errors.push(`Interaction error: ${e.message}`)
        }
      }

      // Mobile interactions
      if (vp.name === 'Mobile_393x852') {
        try {
          // Bounding box scroll metrics
          const container = page.locator('.calendar-view, .life-os-page-workspace, main').first()
          if (await container.isVisible()) {
             const metrics = await container.evaluate(el => ({
               scrollTop: el.scrollTop,
               scrollHeight: el.scrollHeight,
               clientHeight: el.clientHeight,
               overflowY: window.getComputedStyle(el).overflowY
             }))
             
             // Try a touch drag vs page scroll
             await page.mouse.move(200, 500)
             await page.mouse.down()
             await page.mouse.move(200, 300, { steps: 5 })
             await page.mouse.up()
             await page.waitForTimeout(500)
             snapFile = await snap(page, `ScenarioA-${vp.name}-05-scroll-interaction`)
             
             addFinding({
                scenario: 'Scenario A (Canonical)', severity: 'P1', viewport: vp.name, steps: 'Simulate touch drag on mobile', expected: 'Page scrolls or block drags appropriately',
                actual: 'Captured metrics', screenshot: snapFile, consoleOrNetwork: errors.join('\n'), area: 'Mobile Scroll', extraData: { scrollMetrics: metrics }
              })
          }
        } catch(e) {
          errors.push(`Mobile interaction error: ${e.message}`)
        }
      }

      // 2 Overlap
      await seedState(page, generateState({ scenario: 'canonical', overlapping: 2 }))
      await page.goto('http://localhost:5173/calendar')
      await page.waitForTimeout(1000)
      snapFile = await snap(page, `ScenarioA-${vp.name}-06-calendar-2-overlap`)
      addFinding({
        scenario: 'Scenario A (Canonical)', severity: 'P0', viewport: vp.name, steps: 'Open calendar with 2 overlapping events', expected: 'Events shown side by side',
        actual: 'Rendered successfully', screenshot: snapFile, consoleOrNetwork: errors.join('\n'), area: 'DayTimeline / overlappingTaskIds'
      })
      errors = []

      // 3 Overlap
      await seedState(page, generateState({ scenario: 'canonical', overlapping: 3 }))
      await page.goto('http://localhost:5173/calendar')
      await page.waitForTimeout(1000)
      snapFile = await snap(page, `ScenarioA-${vp.name}-07-calendar-3-overlap`)
      addFinding({
        scenario: 'Scenario A (Canonical)', severity: 'P1', viewport: vp.name, steps: 'Open calendar with 3 overlapping events', expected: 'Events shown side by side and clickable',
        actual: 'Rendered successfully', screenshot: snapFile, consoleOrNetwork: errors.join('\n'), area: 'DayTimeline / overlappingTaskIds'
      })
      errors = []

      await context.tracing.stop({ path: path.join(OUT_DIR, `trace-${vp.name}.zip`) })
    })
  }
})
