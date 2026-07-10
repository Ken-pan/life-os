import { expect, test } from '@playwright/test'
import { STORAGE_KEY, waitForPlannerShell } from './e2e.helpers.js'

const baseTask = {
  id: 'triage-task-1',
  title: '联系物业修理漏水的水龙头',
  notes: '先确认下周二上午是否有人在家。',
  listId: 'inbox',
  completed: false,
  completedAt: null,
  deletedAt: null,
  dueDate: null,
  dueTime: null,
  scheduledDate: null,
  scheduledStart: null,
  durationMinutes: null,
  reminderMinutes: null,
  priority: null,
  urgency: 'normal',
  size: null,
  area: 'home',
  nextAction: null,
  tags: [],
  subtasks: [],
  recurrence: null,
  meta: { kind: 'standard' },
  sortOrder: 1,
  createdAt: 1,
  updatedAt: 1,
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, task }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          schemaVersion: 3,
          tasks: [task],
          projects: [],
          lists: [],
          settings: { locale: 'zh', syncAuto: false },
        }),
      ),
    { key: STORAGE_KEY, task: baseTask },
  )
})

test('advances after scheduling even when optional clarification is incomplete', async ({ page }) => {
  await page.goto('/triage')
  await waitForPlannerShell(page)

  await expect(page.getByRole('heading', { name: baseTask.title })).toBeVisible()
  await expect(page.getByText('剩余 1 项')).toBeVisible()

  await page.getByRole('button', { name: '明天', exact: true }).click()

  await expect(page.getByText('快速处理完成')).toBeVisible()
  await expect
    .poll(async () => {
      const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY)
      return saved.tasks[0]
    })
    .toMatchObject({
      meta: { triagedAt: expect.any(Number) },
      dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })
})

test('keeps secondary classification collapsed by default', async ({ page }) => {
  await page.goto('/triage')
  await waitForPlannerShell(page)

  const details = page.getByText('更多分类', { exact: true })
  await expect(details).toBeVisible()
  await expect(page.getByRole('button', { name: '家庭', exact: true })).toBeHidden()
  await details.click()
  await expect(page.getByRole('button', { name: '家庭', exact: true })).toBeVisible()
})
