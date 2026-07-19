import { test, expect } from '@playwright/test'
import {
  clearAppState,
  openNewTaskEditor,
  quickAddTask,
  trackGoTrueWarnings,
  waitForPlannerReady,
  STORAGE_KEY,
} from './e2e.helpers.js'

async function clearAppStateForProject(page, testInfo) {
  await clearAppState(page, testInfo.project.name)
}

async function seedCaptureProject(page, projectName) {
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || '{}')
    state.projects = [
      {
        id: 'project-life-os',
        title: 'Life OS',
        slug: 'life-os',
        status: 'active',
        areaId: null,
        priority: 'p0',
        summary: '',
        progressMode: 'automatic',
        manualProgress: null,
        roadmapRefs: [],
        repoRefs: [],
        createdAt: 1,
        updatedAt: 1,
        archivedAt: null,
        deletedAt: null,
      },
    ]
    localStorage.setItem(key, JSON.stringify(state))
  }, STORAGE_KEY)
  await page.reload()
  await waitForPlannerReady(page, projectName)
}

// 新建任务的编辑器默认折叠高级选项，需要先展开
async function openAdvancedOptions(dialog) {
  const toggle = dialog.locator('.sheet-advanced-toggle')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
}

function localDateOffset(days = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 模拟任务行水平滑动（pointer 手势，多步 move 才能越过 10px 阈值） */
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
  const steps = 16
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX + ((endX - startX) * i) / steps, startY)
  }
  await page.mouse.up()
}

test.describe('PlannerOS E2E', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await clearAppStateForProject(page, testInfo)
  })

  test('首页加载与品牌展示', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('aside.sidebar .brand')).toContainText('PLANNER')
    await expect(page.locator('h1.page-title')).toHaveText('今天')
  })

  test('PLNR.CORE.6: 无重复 GoTrueClient 控制台警告', async ({ page }, testInfo) => {
    const warnings = trackGoTrueWarnings(page)
    await page.goto('/')
    await waitForPlannerReady(page, testInfo.project.name)
    await page.waitForTimeout(500)
    expect(warnings).toEqual([])
  })

  test('快速添加任务并出现在今天列表', async ({ page }, testInfo) => {
    await page.goto('/')
    await quickAddTask(page, '写周报', testInfo.project.name)
    await expect(
      page.locator('.task-title', { hasText: '写周报' }),
    ).toBeVisible()
    await expect(page.locator('.sec-title', { hasText: '今天' })).toBeVisible()
  })

  test('FAB 打开编辑器并保存任务', async ({ page }, testInfo) => {
    await page.goto('/')
    const dialog = await openNewTaskEditor(page, testInfo.project.name)
    await dialog.locator('#task-title').fill('会议准备')
    await dialog.locator('#task-due').fill(localDateOffset(0))
    await openAdvancedOptions(dialog)
    await dialog.locator('#task-priority').selectOption('P0')
    await dialog.getByRole('button', { name: '创建任务' }).click()
    await page.goto('/')
    await expect(
      page.locator('.task-title', { hasText: '会议准备' }),
    ).toBeVisible()
    const savedRow = page.locator('.task-row', {
      has: page.locator('.task-title', { hasText: '会议准备' }),
    })
    await expect(savedRow.locator('.task-check--accent')).toBeVisible()
    await expect(savedRow.locator('.task-meta-line')).not.toContainText('P0')
  })

  test('PLNR.CAPTURE.0: 新建 dialog 默认折叠并支持 @ 项目与撤销', async ({ page }, testInfo) => {
    await page.goto('/')
    await seedCaptureProject(page, testInfo.project.name)

    const dialog = await openNewTaskEditor(page, testInfo.project.name)
    await expect(dialog.locator('.sheet-advanced-toggle')).toHaveAttribute('aria-expanded', 'false')

    const title = dialog.locator('#task-title')
    await title.fill('准备发布 @life')
    await expect(dialog.getByRole('option', { name: 'Life OS' })).toBeVisible()
    await title.press('Enter')

    await expect(title).toHaveValue('准备发布')
    await expect(dialog.locator('.project-picker-trigger')).toContainText('Life OS')
    await expect(dialog.locator('.sheet-advanced-toggle')).toHaveAttribute('aria-expanded', 'false')

    await dialog.getByRole('button', { name: '创建任务' }).click()
    const row = page.locator('.task-row', {
      has: page.locator('.task-title', { hasText: '准备发布' }),
    })
    await expect(row).toBeVisible()
    await expect(row.locator('.chip--project')).toHaveText('Life OS')

    await page.getByRole('button', { name: '撤销' }).click()
    await expect(row).toHaveCount(0)
  })

  test('PLNR.CAPTURE.0: 脏草稿关闭前要求确认', async ({ page }, testInfo) => {
    await page.goto('/')
    const dialog = await openNewTaskEditor(page, testInfo.project.name)
    await dialog.locator('#task-title').fill('不应意外丢失')
    await dialog.getByRole('button', { name: '关闭' }).click()

    await expect(dialog.getByText('放弃未保存的更改？')).toBeVisible()
    await dialog.getByRole('button', { name: '继续编辑' }).click()
    await expect(dialog.locator('#task-title')).toHaveValue('不应意外丢失')

    await dialog.getByRole('button', { name: '取消' }).click()
    await dialog.getByRole('button', { name: '放弃更改' }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('PLNR.CAPTURE.0: Inbox QuickAdd 共用 @ 项目键盘流', async ({ page }, testInfo) => {
    await page.goto('/')
    await seedCaptureProject(page, testInfo.project.name)
    await page.goto('/inbox')

    const input = page.locator('.quick-add input').first()
    await input.fill('收集灵感 @life')
    await expect(page.getByRole('option', { name: 'Life OS' })).toBeVisible()
    await input.press('Enter')
    await expect(input).toHaveValue('收集灵感')
    await input.press('Enter')

    const row = page.locator('.task-row', {
      has: page.locator('.task-title', { hasText: '收集灵感' }),
    })
    await expect(row).toBeVisible()
    await expect(row.locator('.chip--project')).toHaveText('Life OS')
  })

  test('PLNR.CAPTURE.0: QuickAdd 在 IME 组字期间不误提交', async ({ page }) => {
    await page.goto('/inbox')
    const input = page.locator('.quick-add input').first()
    await input.fill('拼音任务')
    await input.dispatchEvent('compositionstart')
    await input.press('Enter')
    await expect(page.locator('.task-title', { hasText: '拼音任务' })).toHaveCount(0)

    await input.dispatchEvent('compositionend')
    await page.waitForTimeout(10)
    await input.press('Enter')
    await expect(page.locator('.task-title', { hasText: '拼音任务' })).toBeVisible()
  })

  test('完成任务后进入今日完成或庆祝态', async ({ page }, testInfo) => {
    await page.goto('/')
    await quickAddTask(page, '待完成项', testInfo.project.name)
    const row = page.locator('.task-row', {
      has: page.locator('.task-title', { hasText: '待完成项' }),
    })
    await row.locator('.task-check').click()
    const doneToday = page.locator('#done-today .task-title', {
      hasText: '待完成项',
    })
    await expect(page.locator('.today-closed')).toBeVisible()
    await expect(doneToday).toBeVisible()
    await expect(
      page
        .locator('.sec-title', { hasText: '今天' })
        .locator('..')
        .locator('.task-title', { hasText: '待完成项' }),
    ).toHaveCount(0)
  })

  test('点击任务打开编辑并更新标题', async ({ page }, testInfo) => {
    await page.goto('/')
    await quickAddTask(page, '旧标题', testInfo.project.name)
    await page.locator('.task-title', { hasText: '旧标题' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.locator('#task-title').fill('新标题')
    await page.getByRole('dialog').getByRole('button', { name: /创建任务|保存更改/ }).click()
    await expect(
      page.locator('.task-title', { hasText: '新标题' }),
    ).toBeVisible()
  })

  test('收件箱页面添加无日期任务', async ({ page }, testInfo) => {
    await page.goto('/inbox')
    await expect(page.locator('h1.page-title')).toHaveText('收件箱')
    await expect(page.getByTestId('fab-add')).toHaveCount(0)
    await quickAddTask(page, '收件箱任务', testInfo.project.name)
    await expect(
      page.locator('.task-title', { hasText: '收件箱任务' }),
    ).toBeVisible()
  })

  test('即将页面路由可访问', async ({ page }, testInfo) => {
    await page.goto('/')
    const dialog = await openNewTaskEditor(page, testInfo.project.name)
    await dialog.locator('#task-title').fill('明天的事')
    await dialog.locator('#task-due').fill(localDateOffset(1))
    await dialog.getByRole('button', { name: /创建任务|保存更改/ }).click()

    await page.goto('/upcoming')
    await expect(page.locator('h1.page-title')).toHaveText('即将')
    await expect(
      page.locator('.task-title', { hasText: '明天的事' }),
    ).toBeVisible()
  })

  test('日历页切换日期', async ({ page }) => {
    await page.goto('/calendar')
    await expect(page.locator('h1.page-title')).toHaveText('日历')
    const days = page.locator('.cal-date')
    await expect(days).toHaveCount(7)
    await days.nth(2).click()
    await expect(days.nth(2)).toHaveClass(/cal-date--sel/)
  })

  test('搜索任务与标签过滤', async ({ page }, testInfo) => {
    await page.goto('/')
    const dialog = await openNewTaskEditor(page, testInfo.project.name)
    await dialog.locator('#task-title').fill('搜索目标')
    await openAdvancedOptions(dialog)
    await dialog.locator('#task-tags').fill('work, urgent')
    await dialog.getByRole('button', { name: /创建任务|保存更改/ }).click()

    await page.goto('/search')
    await page.locator('.field input').fill('搜索目标')
    await expect(
      page.locator('.task-title', { hasText: '搜索目标' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'work', exact: true }).click()
    await expect(
      page.locator('.task-title', { hasText: '搜索目标' }),
    ).toBeVisible()
  })

  test('设置页创建清单并访问清单详情', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('h1.page-title')).toHaveText('设置')
    await page.getByPlaceholder('清单名称').fill('工作项目')
    await page.getByRole('button', { name: '添加', exact: true }).click()
    await expect(
      page.locator('.settings-block').getByRole('link', { name: '工作项目' }),
    ).toBeVisible()
    await page
      .locator('.settings-block')
      .getByRole('link', { name: '工作项目' })
      .click()
    await expect(page.locator('h1.page-title')).toHaveText('工作项目')
  })

  test('主题切换为深色', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '深色', exact: true }).click()
    const theme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    )
    expect(theme).toBe('dark')
  })

  test('语言切换为英文', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'English', exact: true }).click()
    await page.goto('/')
    await expect(page.locator('h1.page-title')).toHaveText('Today')
  })

  test('localStorage 持久化：刷新后任务仍在', async ({ page }, testInfo) => {
    await page.goto('/')
    await quickAddTask(page, '持久化测试', testInfo.project.name)
    await page.reload()
    await waitForPlannerReady(page, testInfo.project.name)
    await expect(
      page.locator('.task-title', { hasText: '持久化测试' }),
    ).toBeVisible()
  })

  test('底部导航切换页面（移动端）', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await page.goto('/')
    await page.getByRole('link', { name: '日历' }).click()
    await expect(page).toHaveURL(/\/calendar/)
    await page.getByRole('link', { name: '搜索' }).click()
    await expect(page).toHaveURL(/\/search/)
    await page.getByRole('button', { name: '更多' }).click()
    await page
      .getByRole('dialog')
      .filter({ has: page.getByText('更多') })
      .getByRole('link', { name: '设置' })
      .click()
    await expect(page).toHaveURL(/\/settings/)
  })

  test('任务抽屉打开智能清单（移动端）', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await page.goto('/')
    await page.getByRole('button', { name: '打开清单' }).click()
    await page
      .getByRole('dialog')
      .filter({ has: page.getByText('清单菜单') })
      .getByRole('link', { name: '收件箱' })
      .click()
    await expect(page).toHaveURL(/\/inbox/)
    await page.getByRole('link', { name: '任务' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('重复任务：完成后生成下一项', async ({ page }, testInfo) => {
    await page.goto('/')
    const dialog = await openNewTaskEditor(page, testInfo.project.name)
    await dialog.locator('#task-title').fill('每日晨跑')
    await dialog.locator('#task-due').fill(localDateOffset(0))
    await openAdvancedOptions(dialog)
    await dialog.getByRole('button', { name: '每天', exact: true }).click()
    await dialog.getByRole('button', { name: /创建任务|保存更改/ }).click()
    await page.goto('/')
    await expect(
      page.locator('.task-title', { hasText: '每日晨跑' }),
    ).toBeVisible()
    const recurringRow = page.locator('.task-row', {
      has: page.locator('.task-title', { hasText: '每日晨跑' }),
    })
    await expect(recurringRow.locator('.chip--recurrence')).toBeVisible()
    await expect(recurringRow.locator('.task-meta-line')).not.toContainText('每天')

    const row = recurringRow
    await row.locator('.task-check').click()
    await expect(page.locator('.today-closed')).toBeVisible()
    await expect(
      page.locator('#done-today .task-title', { hasText: '每日晨跑' }),
    ).toBeVisible()

    await page.goto('/upcoming')
    await expect(
      page.locator('.task-title', { hasText: '每日晨跑' }),
    ).toBeVisible()
  })

  test('侧边栏导航（桌面端）', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '仅桌面端')
    await page.goto('/')
    await expect(page.locator('.sidebar')).toBeVisible()
    await page.locator('.sidebar a[href="/inbox"]').click()
    await expect(page).toHaveURL(/\/inbox/)
    await page.locator('.sidebar a[href="/settings"]').click()
    await expect(page).toHaveURL(/\/settings/)
  })

  test('删除任务', async ({ page }, testInfo) => {
    await page.goto('/')
    await quickAddTask(page, '将被删除', testInfo.project.name)
    await page.locator('.task-title', { hasText: '将被删除' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: '删除任务' }).click()
    await dialog.getByRole('button', { name: '确认删除' }).click()
    await expect(
      page.locator('.task-title', { hasText: '将被删除' }),
    ).toHaveCount(0)
  })

  test('右滑完成任务', async ({ page }, testInfo) => {
    await page.goto('/inbox')
    await quickAddTask(page, '右滑完成', testInfo.project.name)
    await swipeTaskRow(page, '右滑完成', 120)
    await expect(
      page.locator('.task-title', { hasText: '右滑完成' }),
    ).toHaveCount(0)
    await page.goto('/completed')
    await expect(
      page.locator('.task-title', { hasText: '右滑完成' }),
    ).toBeVisible()
  })

  test('左滑展开操作并删除可撤销', async ({ page }, testInfo) => {
    await page.goto('/inbox')
    await quickAddTask(page, '左滑删除', testInfo.project.name)
    await swipeTaskRow(page, '左滑删除', -140)
    const deleteBtn = page
      .locator('.swipe-item', {
        has: page.locator('.task-title', { hasText: '左滑删除' }),
      })
      .locator('.swipe-action--delete')
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    await deleteBtn.click()
    await expect(page.locator('.toast')).toContainText(/已删除|deleted/i)
    await page.getByRole('button', { name: /撤销|Undo/i }).click()
    await expect(
      page.locator('.task-title', { hasText: '左滑删除' }),
    ).toBeVisible()
  })

  test('左滑改期到明天', async ({ page }, testInfo) => {
    await page.goto('/inbox')
    await quickAddTask(page, '改期任务', testInfo.project.name)
    await swipeTaskRow(page, '改期任务', -140)
    await page
      .locator('.swipe-item', {
        has: page.locator('.task-title', { hasText: '改期任务' }),
      })
      .locator('.swipe-action--tomorrow')
      .click()
    await expect(page.locator('.toast')).toContainText(/安排|Scheduled/i)
    await page.goto('/upcoming')
    await expect(
      page.locator('.task-title', { hasText: '改期任务' }),
    ).toBeVisible()
  })

  test('编辑已有任务添加子任务', async ({ page }, testInfo) => {
    await page.goto('/')
    await quickAddTask(page, '带子任务', testInfo.project.name)
    await page.locator('.task-title', { hasText: '带子任务' }).click()
    const dialog = page.getByRole('dialog')
    await openAdvancedOptions(dialog)
    await dialog.getByPlaceholder('添加子任务').fill('子项一')
    await dialog.getByRole('button', { name: '添加', exact: true }).click()
    await expect(
      dialog.locator('.subtask-row', { hasText: '子项一' }),
    ).toBeVisible()
    await dialog.getByRole('button', { name: /创建任务|保存更改/ }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.locator('.task-title', { hasText: '带子任务' }).click()
    await expect(
      page.getByRole('dialog').locator('.subtask-row', { hasText: '子项一' }),
    ).toBeVisible()
  })

  test('移动端 AppBar 搜索入口', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    await page.goto('/')
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '搜索' }).click()
    await expect(page).toHaveURL(/\/search/)
  })

  test('移动端 AppBar 设置入口（搜索/已完成/清单）', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端')
    for (const path of ['/search', '/completed']) {
      await page.goto(path)
      await expect(page.locator('.appbar-settings')).toBeVisible()
    }
  })

  test('已完成任务页展示', async ({ page }, testInfo) => {
    await page.goto('/')
    await quickAddTask(page, '完成后可见', testInfo.project.name)
    const row = page.locator('.task-row', {
      has: page.locator('.task-title', { hasText: '完成后可见' }),
    })
    await row.locator('.task-check').click()
    await expect(
      page.locator('#done-today .task-title', { hasText: '完成后可见' }),
    ).toBeVisible()
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('planos_v1')
          if (!raw) return false
          const state = JSON.parse(raw)
          return state.tasks?.some(
            (t) => t.title === '完成后可见' && t.completed,
          )
        }),
      )
      .toBe(true)

    await page.goto('/completed')
    await expect(page.locator('h1.page-title')).toHaveText('已完成')
    await expect(
      page.locator('.task-title', { hasText: '完成后可见' }).first(),
    ).toBeVisible({
      timeout: 10_000,
    })
  })

  test('Insight 批量排期无日期任务', async ({ page }, testInfo) => {
    await page.goto('/inbox')
    await quickAddTask(page, '排期A', testInfo.project.name)
    await quickAddTask(page, '排期B', testInfo.project.name)
    await quickAddTask(page, '排期C', testInfo.project.name)
    await page.goto('/')
    // 有任务时 Insight 默认折叠为摘要，等待加载后展开
    const summary = page.locator('.insight-summary')
    await summary.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    if (await summary.isVisible()) {
      await summary.click()
    }
    const scheduleBtn = page.locator('.insight-banner-cta', {
      hasText: /安排最近|Schedule up to/i,
    })
    await expect(scheduleBtn).toBeVisible({ timeout: 10_000 })
    await scheduleBtn.click()
    await expect(page.locator('.toast')).toContainText(/3|安排|Scheduled/i)

    await page.goto('/')
    await expect(
      page.locator('.task-title', { hasText: '排期A' }),
    ).toBeVisible()

    await page.goto('/upcoming')
    // 「未来 7 天」分组默认折叠，先展开再断言
    const weekGroup = page.getByRole('button', { name: /未来|Next/ })
    await weekGroup.waitFor({ state: 'visible', timeout: 10_000 })
    if ((await weekGroup.getAttribute('aria-expanded')) === 'false') {
      await weekGroup.click()
    }
    await expect(
      page.locator('.task-title', { hasText: '排期B' }),
    ).toBeVisible()
    await expect(
      page.locator('.task-title', { hasText: '排期C' }),
    ).toBeVisible()
  })
})
