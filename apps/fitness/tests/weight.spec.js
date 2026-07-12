import { test, expect } from '@playwright/test';
import { dateKey, seed } from './helpers.js';

test('next workout defaults to the most recently performed straight-set weight', async ({ page }) => {
  await seed(page, {
    weights: { c_bench: 185 },
    logs: {
      [`${dateKey(-1)}|chest`]: {
        c_bench: {
          done: 4,
          sets: [
            { weight: 185, reps: 8, rir: 2 },
            { weight: 190, reps: 8, rir: 2 },
            { weight: 190, reps: 7, rir: 1 },
            { weight: 190, reps: 7, rir: 1 }
          ]
        }
      }
    }
  });

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('fitos_v2'));
    state.schemaVersion = 6;
    localStorage.setItem('fitos_v2', JSON.stringify(state));
  });
  await page.reload();
  await page.goto('/day/chest/focus');

  await expect(page.locator('.focus-weight .w-num')).toContainText('190');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fitos_v2')).weights.c_bench)).toBe(190);
});

test('changing weight mid-workout preserves old sets and carries the new load forward', async ({ page }) => {
  await seed(page, { weights: { c_bench: 185 }, settings: { logDetail: 'minimal' } });
  await page.goto('/day/chest/focus');

  await page.locator('.focus-cta-set').click();
  await page.locator('.focus-weight').click();
  const modal = page.locator('.modal.wtm');
  await modal.locator('.wc-value-input').fill('175');
  await modal.locator('.ma-save').click();
  await page.locator('.focus-cta-set').click();

  const result = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('fitos_v2'));
    const sets = state.logs[`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}|chest`].c_bench.sets;
    return { saved: state.weights.c_bench, first: sets[0].weight, second: sets[1].weight };
  });

  expect(result).toEqual({ saved: 175, first: 185, second: 175 });
});

test('weight recommendation end-to-end', async ({ page }) => {
  // Go to home page to initialize state
  await page.goto('/');

  // Inject a complete session for the default program's chest day yesterday
  // (full reps at range top + RIR ≥ 1 → double progression should suggest +5)
  await page.evaluate(() => {
    const raw = localStorage.getItem('fitos_v2') || '{}';
    const state = JSON.parse(raw);
    // load() ignores stored state without settings — keep it valid
    state.settings = state.settings || { unit: 'lbs' };

    const d = new Date();
    d.setDate(d.getDate() - 1);
    const dateK = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    state.weights = state.weights || {};
    state.weights['c_bench'] = 185;

    state.logs = state.logs || {};
    // no `done` field on purpose: migration should infer it from recorded sets
    state.logs[`${dateK}|chest`] = {
      'c_bench': {
        sets: [
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 8, rir: 1 },
          { weight: 185, reps: 8, rir: 1 }
        ]
      }
    };

    localStorage.setItem('fitos_v2', JSON.stringify(state));
  });

  // Reload to pick up state
  await page.reload();

  // Navigate to focus mode for the chest day
  await page.goto('/day/chest/focus');

  // Wait for the recommendation badge to appear (barbell bench → +5 lbs)
  const badge = page.locator('.focus-weight .w-badge.increase');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('↑+5');

  // Click adopt
  const adoptBtn = page.locator('.focus-advice.increase button.btn-link');
  await adoptBtn.click();

  // Verify the badge disappears
  await expect(badge).not.toBeVisible();

  // Verify weight changed to 190
  const weightText = page.locator('.focus-weight .w-num');
  await expect(weightText).toContainText('190');
});

test('weight modal: plate builder round-trip', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const raw = localStorage.getItem('fitos_v2') || '{}';
    const state = JSON.parse(raw);
    state.settings = state.settings || { unit: 'lbs' };
    state.weights = state.weights || {};
    state.weights['c_bench'] = 185;
    localStorage.setItem('fitos_v2', JSON.stringify(state));
  });
  await page.reload();
  await page.goto('/day/chest/focus');

  // Open the weight modal from the focus header
  await page.locator('.focus-weight').click();
  const modal = page.locator('.modal.wtm');
  await expect(modal).toBeVisible();

  // 185 with a 45 bar → per side 45+25 → shown in builder caption
  await expect(modal.locator('.pb-hero-result')).toContainText('45 + 25');

  await modal.locator('.wc-settings-row').click();
  await modal.locator('.pb-rack .pb-add', { hasText: '45' }).first().click();
  await expect(modal.locator('.wc-value-input')).toHaveValue('275');

  // Undo removes the outermost (smallest) plate: 275 → minus 25×2 → 225
  await modal.locator('.pb-undo').click();
  await expect(modal.locator('.wc-value-input')).toHaveValue('225');

  // Forward input: typing a weight re-derives the plate breakdown
  await modal.locator('.wc-value-input').fill('185');
  await expect(modal.locator('.pb-hero-result')).toContainText('45 + 25');

  // Save persists the value
  await modal.locator('.ma-save').click();
  await expect(page.locator('.focus-weight .w-num')).toContainText('185');
});
