import { test, expect } from '@playwright/test';
import { seed, dateKey } from './helpers.js';

test.describe('首页与导航', () => {
  test('今日推荐与底部导航', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    // 2026-07 首页改版:hero 标题变为 main 内 h1,「发现」入口更名「资料」
    await expect(page.locator('main h1').first()).toContainText('胸');
    await expect(page.locator('.btn-start')).toBeVisible();

    await page.getByRole('link', { name: '计划', exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL('/program');
    await expect(page.locator('.prog-list').first()).toBeVisible();

    await page.getByRole('link', { name: '资料', exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL('/discover');
    await expect(page.locator('.discover-grid').first()).toBeVisible();

    await page.getByRole('link', { name: '设置', exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL('/settings');
    await expect(page.locator('.sg-title', { hasText: '账号与云同步' })).toBeVisible();

    await page.getByRole('link', { name: '今日', exact: true }).filter({ visible: true }).click();
    await expect(page.locator('main h1').first()).toContainText('胸');
  });

  test('今日进度与减载提醒', async ({ page }) => {
    await seed(page, {
      logs: {
        [`${dateKey()}|chest`]: {
          c_bench: { sets: [{ weight: 185, reps: 8, rir: 2 }, null, null, null] }
        }
      }
    });
    await page.goto('/');
    await expect(page.locator('.tc-pct')).toContainText('1/');

    await seed(page, {
      rotation: {
        next: 0,
        history: Array.from({ length: 12 }, (_, i) => ({
          date: dateKey(-(i + 1)),
          dayId: ['chest', 'back', 'arms', 'legs'][i % 4]
        })),
        lastDeload: null
      }
    });
    await page.goto('/');
    await expect(page.locator('.deload-callout')).toBeVisible();
  });
});

test.describe('计划与概览', () => {
  test('计划列表进入训练日', async ({ page }) => {
    await seed(page);
    await page.goto('/program');
    await page.locator('.prog-day').first().click();
    await expect(page.locator('.day-title')).toBeVisible();
    await expect(page.locator('.focus-entry')).toBeVisible();
  });

  test('概览模式组数芯片与重量弹窗', async ({ page }) => {
    await seed(page, { weights: { c_bench: 185 } });
    await page.goto('/day/chest');
    const chip = page.locator('.set-chip').first();
    await chip.click();
    await expect(chip).toHaveClass(/done/);

    await page.locator('.w-panel').first().click();
    const modal = page.locator('.modal.wtm');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.wc-value-input')).toHaveValue('185');
    await modal.locator('.ma-save').click();
    await expect(modal).not.toBeVisible();
  });
});

test.describe('训练总结', () => {
  test('部分完成显示统计与加重建议', async ({ page }) => {
    await seed(page, {
      logs: {
        [`${dateKey(-1)}|chest`]: {
          c_bench: {
            sets: [
              { weight: 185, reps: 8, rir: 2 },
              { weight: 185, reps: 8, rir: 2 },
              { weight: 185, reps: 8, rir: 1 },
              { weight: 185, reps: 8, rir: 1 }
            ]
          }
        },
        [`${dateKey()}|chest`]: {
          c_bench: {
            sets: [
              { weight: 185, reps: 8, rir: 2 },
              { weight: 185, reps: 8, rir: 2 },
              { weight: 185, reps: 8, rir: 2 },
              { weight: 185, reps: 8, rir: 2 }
            ]
          }
        }
      }
    });
    await page.goto('/day/chest/summary');
    await expect(page.locator('.summary-grid .stat-v').first()).toContainText('4/');
    await expect(page.locator('.advice-row').first()).toBeVisible();
    await expect(page.locator('.btn-complete')).toBeVisible();
  });
});

test.describe('发现子页', () => {
  test('资料库搜索与记录展开', async ({ page }) => {
    await seed(page, {
      logs: {
        [`${dateKey(-1)}|back`]: {
          b_row: { sets: [{ weight: 135, reps: 8, rir: 2 }, { weight: 135, reps: 8, rir: 2 }] }
        }
      }
    });

    await page.goto('/library');
    await expect(page.locator('.lib-card').first()).toBeVisible();
    await page.locator('input.lib-search').fill('RIR');
    await expect(page.locator('.lib-count')).toContainText('找到');

    await page.goto('/discover/records');
    await expect(page.locator('.record-row').first()).toBeVisible();
    await page.locator('.record-row-btn').first().click();
    await expect(page.locator('.record-detail')).toBeVisible();
  });

  test('统计页与健身工具', async ({ page }) => {
    await seed(page, {
      logs: {
        [`${dateKey(-1)}|chest`]: {
          c_bench: { sets: [{ weight: 185, reps: 8, rir: 2 }] }
        }
      }
    });

    await page.goto('/discover/stats');
    await expect(page.locator('.stats-grid')).toBeVisible();
    await expect(page.locator('.stat-card').first()).toBeVisible();

    await page.goto('/discover/tools');
    await expect(page.locator('.tool-card', { hasText: '1RM 估算' })).toBeVisible();
    await page.locator('.tool-card', { hasText: 'BMI' }).locator('.tool-head').click();
    await expect(page.locator('.tool-card.open', { hasText: 'BMI' })).toBeVisible();
    await expect(page.locator('.tool-result')).toContainText('BMI');
  });
});

test.describe('设置与账号', () => {
  test('设置页关键配置', async ({ page }) => {
    await seed(page);
    await page.goto('/settings');
    await expect(page.locator('.sg-title', { hasText: '账号与云同步' })).toBeVisible();
    await expect(page.locator('.sg-title', { hasText: '训练计划模板' })).toBeVisible();
    await expect(page.locator('.sg-title', { hasText: '训练轮换' })).toBeVisible();
  });

  test('登录页切换注册', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.locator('.auth-form')).toBeVisible();
    await page.locator('.auth-switch button', { hasText: '注册' }).click();
    await expect(page.locator('.auth-submit')).toContainText('创建账号');
  });
});

test.describe('计划编辑', () => {
  test('展开训练日并修改组数', async ({ page }) => {
    await seed(page);
    await page.goto('/program/edit');
    await expect(page.locator('.day-collapsible-summary').first()).toBeVisible();

    const setsValue = page.locator('.pe-stepper .sv').first();
    const before = (await setsValue.textContent())?.trim();
    await page.locator('button[aria-label="增加组数"]').first().click();
    await expect(setsValue).not.toHaveText(before ?? '');
  });
});
