import { test, expect } from '@playwright/test';
import { seed, dateKey } from './helpers.js';

async function chooseBenchSubstitute(page) {
  await page.getByRole('button', { name: '跳过', exact: true }).click();
  const substitute = page.locator('.skip-alt', { hasText: '坐姿（下斜）推胸器' });
  await substitute.click();
  await expect(substitute).toHaveClass(/active/);
  await expect(substitute).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '确认替换' }).click();
}

test.describe('GYMS.SUB.5 substitute exercise flow', () => {
  test('zero-set skip keeps skip wording and exposes substitute selection state', async ({ page }) => {
    await seed(page, { settings: { logDetail: 'off' } });
    await page.goto('/day/chest/focus');
    await page.getByRole('button', { name: '跳过', exact: true }).click();

    await expect(page.getByText('跳过 · 杠铃卧推')).toBeVisible();
    await expect(page.getByRole('button', { name: '确认跳过' })).toBeVisible();
    const substitute = page.locator('.skip-alt', { hasText: '坐姿（下斜）推胸器' });
    await expect(substitute).not.toHaveClass(/active/);
    await expect(substitute).toHaveAttribute('aria-pressed', 'false');
    await substitute.click();
    await expect(substitute).toHaveClass(/active/);
    await expect(substitute).toHaveAttribute('aria-pressed', 'true');
  });
  test('substitute replaces Focus slot, survives reload, logs sets, and keeps attribution', async ({ page }) => {
    await seed(page, { settings: { logDetail: 'off' } });
    await page.goto('/day/chest/focus');
    await expect(page.locator('.focus-ex-name')).toHaveText('杠铃卧推');

    await page.locator('.focus-cta-set').click();
    await page.locator('.focus-cta-set').click();
    await page.getByRole('button', { name: '跳过', exact: true }).click();
    await expect(page.getByText('替换剩余组 · 杠铃卧推')).toBeVisible();
    await expect(page.getByRole('button', { name: '确认替换' })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await chooseBenchSubstitute(page);

    await expect(page.locator('.focus-ex-name')).toHaveText('坐姿（下斜）推胸器');
    await expect(page.locator('.focus-switch-note')).toHaveText('原计划：杠铃卧推');
    await expect(page.locator('.badge.sets')).toContainText('3 × 12');
    await page.getByRole('button', { name: '下一个' }).click();
    await expect(page.locator('.focus-ex-name')).toHaveText('上斜哑铃卧推');
    await page.getByRole('button', { name: '上一个' }).click();
    await expect(page.locator('.focus-ex-name')).toHaveText('坐姿（下斜）推胸器');
    await page.reload();
    await expect(page.locator('.focus-ex-name')).toHaveText('坐姿（下斜）推胸器');

    await page.locator('.focus-cta-set').click();
    await page.locator('.focus-cta-set').click();
    await page.locator('.focus-cta-set').click();
    await expect(page.locator('.focus-ex-name')).not.toHaveText('杠铃卧推');

    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('fitos_v2')));
    const log = state.logs[`${dateKey()}|chest`];
    expect(log.c_bench.done).toBe(2);
    expect(log.c_bench.skipped.substituteId).toBe('c_decmc');
    expect(log.c_bench.skipped.attribution).toEqual({ source: 'user_selection' });
    expect(log.c_decmc.done).toBe(3);
  });

  test('repeated skip cannot overwrite a persisted substitution', async ({ page }) => {
    await seed(page, {
      settings: { logDetail: 'off' },
      logs: {
        [`${dateKey()}|chest`]: {
          c_bench: { done: 0, sets: [null, null, null, null], skipped: { reason: 'equipment', substituteId: 'c_decmc', ts: new Date().toISOString() } }
        }
      }
    });
    await page.goto('/day/chest/focus');
    await expect(page.locator('.focus-ex-name')).toHaveText('坐姿（下斜）推胸器');
    await page.getByRole('button', { name: '跳过', exact: true }).click();
    await page.getByRole('button', { name: '确认跳过' }).click();
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('fitos_v2')));
    expect(state.logs[`${dateKey()}|chest`].c_bench.skipped.substituteId).toBe('c_decmc');
  });

  test('missing or invalid substitute safely remains a normal skip', async ({ page }) => {
    for (const substituteId of [null, 'not_an_exercise']) {
      await seed(page, {
        logs: {
          [`${dateKey()}|chest`]: {
            c_bench: { done: 0, sets: [null, null, null, null], skipped: { reason: 'other', substituteId, ts: new Date().toISOString() } }
          }
        }
      });
      await page.goto('/day/chest/focus');
      await expect(page.locator('.focus-ex-name')).toHaveText('上斜哑铃卧推');
      await page.locator('.focus-cta-set').click();
      const state = await page.evaluate(() => JSON.parse(localStorage.getItem('fitos_v2')));
      expect(state.logs[`${dateKey()}|chest`].c_bench.done).toBe(0);
      expect(state.logs[`${dateKey()}|chest`].c_incdb.done).toBe(1);
      expect(state.logs[`${dateKey()}|chest`].not_an_exercise).toBeUndefined();
    }
  });

  test('substituted workout reaches summary and shows planned and performed exercises', async ({ page }) => {
    const full = (sets) => ({ done: sets, sets: Array.from({ length: sets }, () => ({ weight: 45, reps: 12, rir: 2 })) });
    await seed(page, {
      logs: {
        [`${dateKey()}|chest`]: {
          c_bench: { done: 2, sets: [{ weight: 185, reps: 8, rir: 2 }, { weight: 185, reps: 8, rir: 2 }, null, null], skipped: { reason: 'equipment', substituteId: 'c_decmc', ts: new Date().toISOString() } },
          c_decmc: full(3), c_incdb: full(3), c_incmc: full(3), c_fly: full(3)
        }
      }
    });
    await page.goto('/day/chest/focus');
    await expect(page.getByRole('button', { name: '查看训练总结' })).toBeVisible();
    await page.getByRole('button', { name: '查看训练总结' }).click();
    await expect(page.locator('.summary-ex-row', { hasText: '杠铃卧推' })).toContainText('已替换');
    await expect(page.locator('.summary-ex-row', { hasText: '杠铃卧推' })).not.toContainText('跳过');
    await expect(page.locator('.summary-ex-row', { hasText: '坐姿（下斜）推胸器' })).toContainText('3/3');
    await expect(page.locator('.summary-grid .stat-v').first()).toHaveText('14/14');
    await page.goto('/discover/stats');
    await expect(page.locator('.ex-trend-block', { hasText: '杠铃卧推' })).toContainText('2/2');
    await expect(page.locator('.ex-trend-block', { hasText: '坐姿（下斜）推胸器' })).toContainText('3/3');
  });

  test('normal non-skip Focus regression', async ({ page }) => {
    await seed(page, { settings: { logDetail: 'off' } });
    await page.goto('/day/chest/focus');
    await page.locator('.focus-cta-set').click();
    await expect(page.locator('.focus-ex-name')).toHaveText('杠铃卧推');
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('fitos_v2')));
    expect(state.logs[`${dateKey()}|chest`].c_bench.done).toBe(1);
    expect(state.logs[`${dateKey()}|chest`].c_bench.skipped).toBeNull();
  });
});
