import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'planos_v1';

async function clearAppState(page) {
  await page.goto('/');
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
  await page.waitForSelector('[data-testid="fab-add"]', { timeout: 15_000 });
}

// 桌面端走快速添加栏；移动端快速添加栏隐藏，走 FAB + 编辑器
async function quickAddTask(page, title) {
  const input = page.locator('.quick-add input').first();
  if (await input.isVisible()) {
    await input.fill(title);
    await page.locator('.quick-add button[type="submit"]').first().click();
  } else {
    await page.getByTestId('fab-add').click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#task-title').fill(title);
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog).toHaveCount(0);
  }
}

// 新建任务的编辑器默认折叠高级选项，需要先展开
async function openAdvancedOptions(dialog) {
  const toggle = dialog.locator('.sheet-advanced-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
}

function localDateOffset(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.describe('PlannerOS E2E', () => {
  test.beforeEach(async ({ page }) => {
    await clearAppState(page);
  });

  test('首页加载与品牌展示', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('aside.sidebar .brand')).toContainText('PLANNER');
    await expect(page.locator('h1.page-title')).toHaveText('今天');
  });

  test('快速添加任务并出现在今天列表', async ({ page }) => {
    await page.goto('/');
    await quickAddTask(page, '写周报');
    await expect(page.locator('.task-title', { hasText: '写周报' })).toBeVisible();
    await expect(page.locator('.sec-title', { hasText: '今天' })).toBeVisible();
  });

  test('FAB 打开编辑器并保存任务', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('fab-add').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#task-title').fill('会议准备');
    await page.locator('#task-due').fill(localDateOffset(0));
    await openAdvancedOptions(page.getByRole('dialog'));
    await page.locator('#task-priority').selectOption({ label: '高' });
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click();
    await expect(page.locator('.task-title', { hasText: '会议准备' })).toBeVisible();
    await expect(page.locator('.priority-dot')).toBeVisible();
  });

  test('完成任务后从活跃列表消失', async ({ page }) => {
    await page.goto('/');
    await quickAddTask(page, '待完成项');
    const row = page.locator('.task-row', { has: page.locator('.task-title', { hasText: '待完成项' }) });
    await row.locator('.task-check').click();
    await expect(row).toHaveCount(0);
  });

  test('点击任务打开编辑并更新标题', async ({ page }) => {
    await page.goto('/');
    await quickAddTask(page, '旧标题');
    await page.locator('.task-title', { hasText: '旧标题' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: '更多选项' })).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#task-title').fill('新标题');
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click();
    await expect(page.locator('.task-title', { hasText: '新标题' })).toBeVisible();
  });

  test('收件箱页面添加无日期任务', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.locator('h1.page-title')).toHaveText('收件箱');
    await quickAddTask(page, '收件箱任务');
    await expect(page.locator('.task-title', { hasText: '收件箱任务' })).toBeVisible();
  });

  test('即将页面路由可访问', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('fab-add').click();
    await page.locator('#task-title').fill('明天的事');
    await page.locator('#task-due').fill(localDateOffset(1));
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click();

    await page.goto('/upcoming');
    await expect(page.locator('h1.page-title')).toHaveText('即将');
    await expect(page.locator('.task-title', { hasText: '明天的事' })).toBeVisible();
  });

  test('日历页切换日期', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.locator('h1.page-title')).toHaveText('日历');
    const days = page.locator('.cal-day');
    await expect(days).toHaveCount(7);
    await days.nth(2).click();
    await expect(days.nth(2)).toHaveClass(/on/);
  });

  test('搜索任务与标签过滤', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('fab-add').click();
    await page.locator('#task-title').fill('搜索目标');
    await openAdvancedOptions(page.getByRole('dialog'));
    await page.locator('#task-tags').fill('work, urgent');
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click();

    await page.goto('/search');
    await page.locator('.field input').fill('搜索目标');
    await expect(page.locator('.task-title', { hasText: '搜索目标' })).toBeVisible();

    await page.getByRole('button', { name: 'work', exact: true }).click();
    await expect(page.locator('.task-title', { hasText: '搜索目标' })).toBeVisible();
  });

  test('设置页创建清单并访问清单详情', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1.page-title')).toHaveText('设置');
    await page.getByPlaceholder('清单名称').fill('工作项目');
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.locator('.settings-block').getByRole('link', { name: '工作项目' })).toBeVisible();
    await page.locator('.settings-block').getByRole('link', { name: '工作项目' }).click();
    await expect(page.locator('h1.page-title')).toHaveText('工作项目');
  });

  test('主题切换为深色', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: '深色', exact: true }).click();
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(theme).toBe('dark');
  });

  test('语言切换为英文', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.goto('/');
    await expect(page.locator('h1.page-title')).toHaveText('Today');
  });

  test('localStorage 持久化：刷新后任务仍在', async ({ page }) => {
    await page.goto('/');
    await quickAddTask(page, '持久化测试');
    await page.reload();
    await page.waitForSelector('[data-testid="fab-add"]', { timeout: 15_000 });
    await expect(page.locator('.task-title', { hasText: '持久化测试' })).toBeVisible();
  });

  test('底部导航切换页面（移动端）', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端');
    await page.goto('/');
    await page.getByRole('link', { name: '收件箱' }).click();
    await expect(page).toHaveURL(/\/inbox/);
    await page.getByRole('link', { name: '设置' }).click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test('重复任务：完成后生成下一项', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('fab-add').click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#task-title').fill('每日晨跑');
    await dialog.locator('#task-due').fill(localDateOffset(0));
    await openAdvancedOptions(dialog);
    await dialog.getByRole('button', { name: '每天', exact: true }).click();
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.locator('.task-title', { hasText: '每日晨跑' })).toBeVisible();
    await expect(page.locator('.task-meta', { hasText: '每天' })).toBeVisible();

    const row = page.locator('.task-row', { has: page.locator('.task-title', { hasText: '每日晨跑' }) });
    await row.locator('.task-check').click();
    await expect(row).toHaveCount(0);

    await page.goto('/upcoming');
    await expect(page.locator('.task-title', { hasText: '每日晨跑' })).toBeVisible();
  });

  test('侧边栏导航（桌面端）', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '仅桌面端');
    await page.goto('/');
    await expect(page.locator('.sidebar')).toBeVisible();
    await page.locator('.sidebar a[href="/inbox"]').click();
    await expect(page).toHaveURL(/\/inbox/);
    await page.locator('.sidebar a[href="/settings"]').click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test('删除任务', async ({ page }) => {
    await page.goto('/');
    await quickAddTask(page, '将被删除');
    await page.locator('.task-title', { hasText: '将被删除' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '删除' }).click();
    await expect(page.locator('.task-title', { hasText: '将被删除' })).toHaveCount(0);
  });

  test('编辑已有任务添加子任务', async ({ page }) => {
    await page.goto('/');
    await quickAddTask(page, '带子任务');
    await page.locator('.task-title', { hasText: '带子任务' }).click();
    const dialog = page.getByRole('dialog');
    await openAdvancedOptions(dialog);
    await dialog.getByPlaceholder('添加子任务').fill('子项一');
    await dialog.getByRole('button', { name: '添加', exact: true }).click();
    await expect(dialog.locator('.subtask-row', { hasText: '子项一' })).toBeVisible();
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('.task-title', { hasText: '带子任务' }).click();
    await expect(page.getByRole('dialog').locator('.subtask-row', { hasText: '子项一' })).toBeVisible();
  });

  test('移动端 AppBar 搜索入口', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '仅移动端');
    await page.goto('/');
    await page.locator('.appbar-search').click();
    await expect(page).toHaveURL(/\/search/);
  });

  test('已完成任务页展示', async ({ page }) => {
    await page.goto('/');
    await quickAddTask(page, '完成后可见');
    await page.locator('.task-title', { hasText: '完成后可见' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click();
    const row = page.locator('.task-row', { has: page.locator('.task-title', { hasText: '完成后可见' }) });
    await row.locator('.task-check').click();

    await page.goto('/completed');
    await expect(page.locator('h1.page-title')).toHaveText('已完成');
    await expect(page.locator('.task-title', { hasText: '完成后可见' })).toBeVisible();
  });

  test('Insight 批量排期无日期任务', async ({ page }) => {
    await page.goto('/inbox');
    await quickAddTask(page, '排期A');
    await quickAddTask(page, '排期B');
    await quickAddTask(page, '排期C');
    await page.goto('/');
    // 有任务时 Insight 默认折叠为摘要，等待加载后展开
    const summary = page.locator('.insight-summary');
    await summary.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    if (await summary.isVisible()) {
      await summary.click();
    }
    const scheduleBtn = page.locator('.insight-banner-cta', { hasText: /安排最近|Schedule up to/i });
    await expect(scheduleBtn).toBeVisible({ timeout: 10_000 });
    await scheduleBtn.click();
    await expect(page.locator('.toast')).toContainText(/3|安排|Scheduled/i);
    await page.goto('/upcoming');
    // 「未来 7 天」分组默认折叠，先展开再断言
    const weekGroup = page.getByRole('button', { name: /未来|Next/ });
    await weekGroup.waitFor({ state: 'visible', timeout: 10_000 });
    if ((await weekGroup.getAttribute('aria-expanded')) === 'false') {
      await weekGroup.click();
    }
    await expect(page.locator('.task-title', { hasText: '排期A' })).toBeVisible();
    await expect(page.locator('.task-title', { hasText: '排期B' })).toBeVisible();
    await expect(page.locator('.task-title', { hasText: '排期C' })).toBeVisible();
  });
});
