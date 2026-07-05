import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

const SHOTS = join(process.cwd(), 'screenshots/plate-e2e');
mkdirSync(SHOTS, { recursive: true });

async function seed(page, overrides = {}) {
  await page.goto('/');
  await page.evaluate((o) => {
    const raw = localStorage.getItem('fitos_v2') || '{}';
    const state = JSON.parse(raw);
    state.settings = {
      unit: 'lbs',
      sound: true,
      theme: 'dark',
      logDetail: 'quick',
      notifyRest: true,
      barWeights: {},
      plateInventory: null,
      plateCollarLbs: 0,
      plateCollarKg: 0,
      ...o.settings
    };
    state.weights = { ...state.weights, ...o.weights };
    state.programOverrides = { ...state.programOverrides, ...o.programOverrides };
    localStorage.setItem('fitos_v2', JSON.stringify(state));
  }, overrides);
  await page.reload();
}

async function openDiscoverPlates(page) {
  await page.goto('/discover/tools');
  await page.locator('.tool-card', { hasText: '杠铃片凑重' }).locator('.tool-head').click();
  await page.waitForSelector('.ptp');
}

async function shot(page, name) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
}

/** 双侧杠铃 canvas 已渲染（Dumbbell 由同一 plate 列表对称绘制） */
async function expectBarbellMirrored(page) {
  const mirrored = await page.evaluate(() => {
    const canvas = document.querySelector('.pb-render-canvas');
    if (!canvas || canvas.width === 0) return { ok: false, hero: '' };
    const hero = document.querySelector('.pb-hero-result')?.textContent?.trim() ?? '';
    return { ok: true, hero };
  });
  expect(mirrored.ok, `杠铃视图未渲染（${mirrored.hero}）`).toBe(true);
}

test.describe('PlateToolPanel · 发现页独立工具', () => {
  test('快捷步进、preset、双模式、单位切换', async ({ page }) => {
    await seed(page);
    await openDiscoverPlates(page);
    await shot(page, '01-discover-open');

    const input = page.locator('.ptp-input-wrap input');
    await expect(input).toHaveValue('225');
    await expect(page.locator('.pb-hero-result')).toContainText('2×45');

    await expectBarbellMirrored(page);

    // preset 185
    await page.locator('.wc-chip', { hasText: '185' }).click();
    await expect(input).toHaveValue('185');
    await expect(page.locator('.pb-hero-result')).toContainText('45 + 25');

    // quick step +10
    await page.locator('.wc-chip', { hasText: '+10' }).click();
    await expect(input).toHaveValue('195');

    // 双模式：点片凑重
    await page.locator('.pb-modes button', { hasText: '点片凑重' }).click();
    await page.locator('.pb-rack .pb-add', { hasText: /^45$/ }).first().click();
    await expect(input).toHaveValue('285');
    await shot(page, '02-build-mode');

    // 切回输入目标
    await page.locator('.pb-modes button', { hasText: '输入目标' }).click();
    await input.fill('137');
    await expect(page.locator('.pb-warn')).toContainText('凑不齐');
    await expect(page.locator('.pb-snap', { hasText: '较轻' })).toBeVisible();
    await shot(page, '03-nearest-warn');

    // kg 单位
    await page.locator('.ptp-unit button', { hasText: 'KG' }).click();
    await expect(page.locator('.ptp-suffix')).toHaveText('kg');
    await expect(page.locator('.pb-bar-chip.on').filter({ hasText: /^20$/ })).toBeVisible();
    await shot(page, '04-kg-unit');
  });

  test('折叠摘要、片库开关、自定义杆重、卡箍', async ({ page }) => {
    await seed(page);
    await openDiscoverPlates(page);
    await page.locator('.wc-chip', { hasText: '225' }).click();

    // 折叠卡片显示摘要
    await page.locator('.tool-head', { hasText: '杠铃片凑重' }).click();
    const platesHint = page.locator('.tool-card', { hasText: '杠铃片凑重' }).locator('.tool-hint');
    await expect(platesHint).toContainText('225');
    await expect(platesHint).toContainText('每侧');
    await shot(page, '05-collapsed-summary');

    await page.locator('.tool-head', { hasText: '杠铃片凑重' }).click();

    // 片库：禁用 2.5
    await page.locator('.pb-inv-toggle').click();
    await page.waitForSelector('.pb-inventory .pb-inv-chip');
    await page.locator('.pb-inventory .pb-inv-chip').filter({ hasText: '2.5' }).click();
    await expect(page.locator('.pb-inv-chip.off').filter({ hasText: '2.5' })).toBeVisible();
    await expect(page.locator('.pb-rack .pb-add').filter({ hasText: '2.5' })).toHaveCount(0);
    await shot(page, '06-inventory');

    // 自定义杆重 40
    await page.locator('.pb-bar-chip', { hasText: '自定义' }).click();
    await page.locator('.pb-custom-bar input').fill('40');
    await page.locator('.pb-custom-apply').click();
    await expect(page.locator('.pb-hero-formula')).toContainText('40');
    await shot(page, '07-custom-bar');

    // 卡箍 +5
    const collarVal = page.locator('.pb-collar-val');
    const before = await collarVal.textContent();
    await page.locator('.pb-collar-ctrl button', { hasText: '+' }).click();
    await expect(collarVal).not.toHaveText(before);
    await shot(page, '08-collar');
  });

  test('点击杠铃卸最外侧片', async ({ page }) => {
    await seed(page);
    await openDiscoverPlates(page);
    await page.locator('.ptp-input-wrap input').fill('295');
    await expectBarbellMirrored(page);

    const input = page.locator('.ptp-input-wrap input');
    await page.locator('.pb-render-hit').click();
    await expect(input).toHaveValue('225');
    await expectBarbellMirrored(page);

    await page.locator('.ptp-input-wrap input').fill('295');
    await page.locator('.pb-render-hit').click();
    await expect(input).toHaveValue('225');
    await expectBarbellMirrored(page);
  });
});

test.describe('WeightModal · 训练弹窗', () => {
  test('快捷步进、preset、较轻较重推荐', async ({ page }) => {
    await seed(page, { weights: { c_bench: 185 } });
    await page.goto('/day/chest/focus');
    await page.locator('.focus-weight').click();
    const modal = page.locator('.modal.wtm');
    await expect(modal).toBeVisible();
    await shot(page, '09-modal-default');

    await modal.locator('.wc-chip', { hasText: '205' }).click();
    await expect(modal.locator('.wc-value-input')).toHaveValue('205');

    await modal.locator('.wc-step').first().click();
    await expect(modal.locator('.wc-value-input')).toHaveValue('200');

    await modal.locator('.wc-value-input').fill('137');
    await expect(modal.locator('.wc-value-note')).toContainText('较轻');
    await expect(modal.locator('.pb-snap', { hasText: '较轻 135' })).toBeVisible();
    await shot(page, '10-modal-nearest');

    await modal.locator('.wc-settings-row').click();
    await modal.locator('.pb-modes button', { hasText: '点片凑重' }).click();
    await modal.locator('.pb-rack .pb-add', { hasText: /^25$/ }).first().click();
    await expect(modal.locator('.wc-value-input')).toHaveValue('185');
    await shot(page, '11-modal-build-mode');
  });
});

test.describe('训练工具 Sheet · 计划联动', () => {
  test('从专注模式打开凑重并可见 PlateBuilder', async ({ page }) => {
    await seed(page, { weights: { c_bench: 185 } });
    await page.goto('/day/chest/focus');
    await page.locator('.focus-plates-link').click();
    await expect(page.locator('.tool-sheet .ptp--focus')).toBeVisible();
    await page.waitForTimeout(400);

    await expect(page.locator('.tool-sheet .tool-tabs')).toHaveCount(0);
    await expect(page.locator('#tool-sheet-title')).toHaveText('凑重');
    await expect(page.locator('.tool-sheet .pb-barbell')).toBeVisible();
    await expect(page.locator('.tool-sheet .pb-barbell-legend')).toHaveCount(0);
    await expect(page.locator('.tool-sheet .pb-settings')).not.toBeVisible();
    await expect(page.locator('.tool-sheet .wc-settings-row')).toBeVisible();

    await page.locator('.tool-sheet .wc-settings-row').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.tool-sheet .pb-barbell')).toBeVisible();
    await expect(page.locator('.tool-sheet .pb-barbell-legend')).toHaveCount(0);
    await expect(page.locator('.tool-sheet .pb-settings')).toBeVisible();

    await page.locator('.tool-sheet').evaluate((el) => {
      el.querySelector('.pb-barbell')?.scrollIntoView({ block: 'center' });
    });

    const pbBox = await page.locator('.tool-sheet .pb-barbell').boundingBox();
    const vh = page.viewportSize()?.height ?? 844;
    expect(pbBox).not.toBeNull();
    expect(pbBox.y).toBeLessThan(vh);
    expect(pbBox.y + pbBox.height).toBeGreaterThan(0);

    await expect(page.locator('.tool-sheet .wc-value-input')).toHaveValue('185');
    await shot(page, '12-tool-sheet-expanded');

    await page.locator('.tool-sheet .wc-settings-collapse').click();
    await expect(page.locator('.tool-sheet .pb-settings')).not.toBeVisible();
    await expect(page.locator('.tool-sheet .pb-barbell')).toBeVisible();
    await shot(page, '12b-tool-sheet-compact');
  });

  test('单端装片（地雷管）', async ({ page }) => {
    await seed(page, {
      weights: { c_landmine: 90 },
      programOverrides: {
        'day:chest': {
          addedEx: ['c_landmine'],
          exOrder: ['c_landmine', 'c_bench']
        }
      }
    });
    await page.goto('/day/chest/focus');
    await page.locator('.focus-weight').click();
    const modal = page.locator('.modal.wtm');
    await expect(modal.locator('.pb-hero-title')).toContainText('单端装片');
    await expect(modal.locator('.pb-viz')).toBeVisible();
    await expect(modal.locator('.pb-bars')).toHaveCount(0);
    await shot(page, '13-landmine-single-side');
  });

  test('单端装片不受全局卡箍影响', async ({ page }) => {
    await seed(page, {
      settings: { plateCollarLbs: 5 },
      weights: { c_landmine: 90 },
      programOverrides: {
        'day:chest': {
          addedEx: ['c_landmine'],
          exOrder: ['c_landmine', 'c_bench']
        }
      }
    });
    await page.goto('/day/chest/focus');
    await page.locator('.focus-weight').click();
    const modal = page.locator('.modal.wtm');
    await expect(modal.locator('.pb-hero-result')).toContainText('45 + 45');
    await expect(modal.locator('.wc-value-input')).toHaveValue('90');
  });
});

test.describe('触控目标尺寸', () => {
  test('主要按钮满足 44px 最小高度', async ({ page }) => {
    await seed(page);
    await openDiscoverPlates(page);
    const selectors = ['.wc-chip', '.pb-add', '.pb-bar-chip'];
    for (const sel of selectors) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});
