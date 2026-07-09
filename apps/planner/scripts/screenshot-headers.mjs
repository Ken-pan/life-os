import { chromium, devices } from 'playwright'
import fs from 'node:fs'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const BASE = 'http://127.0.0.1:5188'
const { dir: OUT } = resolveScreenshotDir({
  app: 'planner',
  suite: 'headers',
  importMetaUrl: import.meta.url,
})
const STORAGE_KEY = 'planos_v1'

const shots = [
  { name: 'planner-home-mobile', path: '/', project: 'mobile' },
  {
    name: 'planner-list-back-mobile',
    path: '/lists/list_work_audit',
    project: 'mobile',
    seed: true,
  },
  { name: 'planner-auth-mobile', path: '/auth', project: 'mobile' },
  { name: 'planner-home-desktop', path: '/', project: 'desktop' },
  { name: 'planner-auth-desktop', path: '/auth', project: 'desktop' },
]

function seed() {
  const today = new Date()
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    schemaVersion: 2,
    tasks: [
      {
        id: 'hdr_t1',
        title: '版本发布',
        notes: '',
        listId: 'list_work_audit',
        priority: 1,
        dueDate: fmt(today),
        dueTime: '14:00',
        reminderMinutes: null,
        recurrence: null,
        tags: ['work'],
        subtasks: [],
        completed: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
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
        id: 'list_work_audit',
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

async function capture(
  browser,
  { name, path: route, project, seed: withSeed },
) {
  const ctx = await browser.newContext({
    ...(project === 'mobile' ? devices['Pixel 7'] : {}),
    viewport:
      project === 'mobile'
        ? { width: 390, height: 844 }
        : { width: 1280, height: 800 },
  })
  const page = await ctx.newPage()
  if (withSeed) {
    await page.goto(`${BASE}/`)
    await page.evaluate(
      ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
      { key: STORAGE_KEY, data: seed() },
    )
  }
  await page.goto(`${BASE}${route}`)
  await page.waitForSelector('.appbar', { timeout: 15_000 })
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
  await ctx.close()
}

fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
for (const shot of shots) await capture(browser, shot)
await browser.close()
console.log(`Header QA screenshots saved to ${OUT}`)
