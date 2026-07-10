import { expect, test } from '@playwright/test'
import { STORAGE_KEY, waitForPlannerShell } from './e2e.helpers.js'

const project = {
  id: 'project-roadmap-e2e',
  title: 'Roadmap project',
  slug: 'roadmap-project',
  status: 'active',
  areaId: null,
  priority: 'p0',
  summary: 'Reference rendering fixture',
  progressMode: 'manual',
  manualProgress: 75,
  roadmapRefs: [
    {
      id: 'roadmap-ref',
      roadmapItemId: 'P-PROJ-3',
      sourcePath: 'docs/roadmap/apps/planner.md',
      anchor: 'project-attachment-设计边界',
      label: 'Planner Roadmap',
      isPrimary: true,
    },
  ],
  repoRefs: [
    {
      id: 'commit-ref',
      kind: 'commit',
      label: 'Project sync implementation',
      url: 'https://github.com/Ken-pan/life-os/commit/935a5b78',
    },
    {
      id: 'unsafe-ref',
      kind: 'deploy',
      label: 'Unsafe reference',
      url: 'javascript:alert(1)',
    },
  ],
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
  deletedAt: null,
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: STORAGE_KEY,
      value: {
        schemaVersion: 3,
        tasks: [],
        lists: [],
        projects: [project],
        settings: { locale: 'zh', syncAuto: false },
      },
    },
  )
})

test('renders roadmap and safe repository references', async ({ page }) => {
  await page.goto('/projects/project-roadmap-e2e')
  await waitForPlannerShell(page)

  await expect(page.getByRole('heading', { name: 'Roadmap 与代码引用' })).toBeVisible()
  await expect(page.getByText('P-PROJ-3', { exact: true })).toBeVisible()
  await expect(page.getByText('docs/roadmap/apps/planner.md#project-attachment-设计边界')).toBeVisible()

  const commit = page.getByRole('link', { name: 'Project sync implementation' })
  await expect(commit).toHaveAttribute(
    'href',
    'https://github.com/Ken-pan/life-os/commit/935a5b78',
  )
  await expect(page.getByRole('link', { name: 'Unsafe reference' })).toHaveCount(0)
  await expect(page.getByText('javascript:alert(1)')).toBeVisible()
})
