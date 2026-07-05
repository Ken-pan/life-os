/**
 * 杠铃凑重 UI 各状态截图检查
 * 运行: node scripts/plate-screenshot-check.mjs
 */
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join(process.cwd(), 'screenshots/plate-builder-review');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';

async function seed(page, overrides = {}) {
  await page.goto(`${BASE}/`);
  await page.evaluate((o) => {
    const raw = localStorage.getItem('fitos_v2') || '{}';
    const state = JSON.parse(raw);
    state.settings = { unit: 'lbs', ...o.settings };
    state.weights = { ...state.weights, ...o.weights };
    state.barWeights = { ...state.barWeights, ...o.barWeights };
    state.logs = { ...state.logs, ...o.logs };
    if (o.programOverrides !== undefined) state.programOverrides = o.programOverrides;
    delete state.focusCursor;
    localStorage.setItem('fitos_v2', JSON.stringify(state));
    sessionStorage.removeItem('fitos_focus');
  }, overrides);
  await page.reload();
}

async function scrollToBarbell(page) {
  const sheet = page.locator('.tool-sheet');
  if (await sheet.count()) {
    await sheet.evaluate((el) => {
      const target = el.querySelector('.pb-barbell, .pb-viz');
      target?.scrollIntoView({ block: 'center' });
    });
  }
  const barbell = page.locator('.pb-barbell, .pb-viz').first();
  if (await barbell.count()) await barbell.scrollIntoViewIfNeeded().catch(() => {});
}

async function shot(page, name) {
  await scrollToBarbell(page);
  await page.waitForTimeout(200);
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log('✓', path);
  return path;
}

async function assertBarbellGeometry(page) {
  const m = await page.evaluate(() => {
    const shaft = document.querySelector('.pb-shaft')?.getBoundingClientRect();
    const bar = document.querySelector('.pb-barbell-bar')?.getBoundingClientRect();
    const core = document.querySelector('.pb-barbell-core')?.getBoundingClientRect();
    const leftCollar = document.querySelector('.pb-side--left .pb-collar')?.getBoundingClientRect();
    const rightCollar = document.querySelector('.pb-side--right .pb-collar')?.getBoundingClientRect();
    const leftOuter = document.querySelector('.pb-side--left .pb-plate:first-of-type')?.getBoundingClientRect();
    const rightOuter = document.querySelector('.pb-side--right .pb-plate:last-of-type')?.getBoundingClientRect();
    const leftInner = document.querySelector('.pb-side--left .pb-plate:last-of-type')?.getBoundingClientRect();
    if (!shaft || !bar || !core || !leftCollar || !rightCollar || !leftOuter || !rightOuter || !leftInner) {
      return { ok: false, reason: 'missing-elements' };
    }
    const leftGap = +(shaft.left - leftCollar.right).toFixed(1);
    const rightGap = +(rightCollar.left - shaft.right).toFixed(1);
    const orderFromCenter = (side) => {
      const nodes = [...document.querySelectorAll(`.pb-side--${side} .pb-plate`)];
      const ordered = side === 'left' ? nodes.reverse() : nodes;
      return ordered.map((n) => n.getAttribute('title')?.replace(/^卸下 /, ''));
    };
    const leftOrder = orderFromCenter('left');
    const rightOrder = orderFromCenter('right');
    return {
      ok: true,
      leftGap,
      rightGap,
      gapDelta: Math.abs(leftGap - rightGap),
      barMatchesCore: bar.left <= core.left + 1 && bar.right >= core.right - 1,
      barCoversPlates: bar.left <= leftOuter.left + 1 && bar.right >= rightOuter.right - 1,
      leftCollarOrder: leftInner.right <= leftCollar.left + 2 && leftCollar.right <= shaft.left + 4,
      rightCollarOrder: rightCollar.left >= shaft.right - 3,
      mirrored: JSON.stringify(leftOrder) === JSON.stringify(rightOrder),
      leftOrder,
      rightOrder
    };
  });
  if (!m.ok) throw new Error(`杠铃几何检查失败: ${m.reason}`);
  if (m.gapDelta > 1) throw new Error(`左右杆身间隙不对称: L${m.leftGap} R${m.rightGap}`);
  if (!m.barMatchesCore) throw new Error('套筒未铺满装片区');
  if (!m.barCoversPlates) throw new Error('套筒未延伸到最外侧铃片');
  if (!m.leftCollarOrder || !m.rightCollarOrder) throw new Error('卡箍顺序错误');
  if (!m.mirrored) throw new Error(`左右装片顺序未镜像: L[${m.leftOrder}] R[${m.rightOrder}]`);
  const radii = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      return el ? parseFloat(getComputedStyle(el).borderTopLeftRadius) : null;
    };
    return {
      plate: pick('.pb-barbell .pb-plate'),
      collar: pick('.pb-barbell .pb-collar'),
      stage: pick('.pb-barbell')
    };
  });
  if (radii.plate == null || radii.plate > 5) {
    throw new Error(`铃片圆角应 ≤5px，实际 ${radii.plate}px`);
  }
  if (radii.collar == null || radii.collar > 4) {
    throw new Error(`卡箍圆角应 ≤4px，实际 ${radii.collar}px`);
  }
  if (radii.stage == null || radii.stage > 12) {
    throw new Error(`展示台圆角应 ≤12px，实际 ${radii.stage}px`);
  }
  return m;
}

async function assertBarbell(page, { sides = 2, minPlates = 0, legend = true } = {}) {
  if (sides === 2) {
    const barbell = page.locator('.pb-barbell').first();
    await barbell.waitFor({ state: 'attached' });
    await scrollToBarbell(page);
    await barbell.waitFor({ state: 'visible' });
    await page.locator('.pb-side--left').first().waitFor({ state: 'visible' });
    await page.locator('.pb-side--right').first().waitFor({ state: 'visible' });
    await page.locator('.pb-shaft').first().waitFor({ state: 'visible' });
    const titleEl = page.locator('.pb-sec-title').first();
    if (await titleEl.count()) {
      const title = await titleEl.textContent();
      if (!title?.includes('杠铃视图')) throw new Error(`标题应为杠铃视图，实际: ${title}`);
    }
    const count = await page.locator('.pb-barbell .pb-plate').count();
    if (count < minPlates) throw new Error(`铃片数不足: ${count} < ${minPlates}`);
    if (count % 2 !== 0) throw new Error(`双侧铃片数应为偶数: ${count}`);
    const textOnGraphic = await page.locator('.pb-barbell .pb-plate-num, .pb-barbell .pb-shaft-label').count();
    if (textOnGraphic > 0) throw new Error('杠铃图形上不应有文字标签');
    if (legend) {
      const hasLegend = await page.locator('.pb-barbell-legend').count();
      if (!hasLegend) throw new Error('应显示侧边装片说明');
    }
    await assertBarbellGeometry(page);
  } else {
    const viz = page.locator('.pb-viz').first();
    await viz.waitFor({ state: 'attached' });
    await viz.scrollIntoViewIfNeeded();
    await viz.waitFor({ state: 'visible' });
    const title = await page.locator('.pb-sec-title').first().textContent();
    if (!title?.includes('单端视图')) throw new Error(`标题应为单端视图，实际: ${title}`);
  }
}

async function openDiscoverPlates(page) {
  await page.goto(`${BASE}/discover/tools`);
  await page.locator('.tool-card', { hasText: '杠铃片凑重' }).locator('.tool-head').click();
  await page.waitForSelector('.pb');
}

async function openWeightModal(page, dayId = 'chest', exId = 'c_bench') {
  await page.goto(`${BASE}/day/${dayId}/focus`);
  await page.waitForSelector('.focus-weight');
  await page.locator('.focus-weight').click();
  await page.waitForSelector('.modal.wtm .pb');
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

try {
  // ── 1. 发现页 · 工具卡片 ──
  await seed(page);
  await openDiscoverPlates(page);
  await assertBarbell(page, { minPlates: 4 });
  await shot(page, '01-discover-default-225');

  const plateInput = page.locator('.ptp-input-wrap input');

  // ── 2. 空状态 ──
  await plateInput.fill('');
  await shot(page, '02-discover-empty');

  // ── 3. 低于杆重 ──
  await plateInput.fill('30');
  await shot(page, '03-discover-below-bar');

  // ── 4. 无法凑齐（余量警告）──
  await plateInput.fill('137');
  await shot(page, '04-discover-remainder-warn');

  // ── 5. 重载（多片横向滚动）──
  await plateInput.fill('495');
  await shot(page, '05-discover-heavy-load');

  // ── 6. 换杆重 35lb ──
  await page.locator('.pb-bar-chip', { hasText: '35' }).click();
  await shot(page, '06-discover-bar-35');

  // ── 7. 仅片（杆重 0）──
  await page.locator('.pb-bar-chip', { hasText: '仅片' }).click();
  await shot(page, '07-discover-bar-zero');

  // ── 7b. 点片凑重模式 · 完整杠铃 ──
  await page.locator('.pb-modes button', { hasText: '点片凑重' }).click();
  await assertBarbell(page, { minPlates: 4 });
  await shot(page, '07b-discover-build-mode');

  // ── 8. 点击加片交互 ──
  await plateInput.fill('');
  await page.locator('.pb-rack .pb-add', { hasText: '45' }).first().click();
  await page.locator('.pb-rack .pb-add', { hasText: '25' }).first().click();
  await shot(page, '08-discover-click-add-plates');

  // ── 9. 重量弹窗 · 杠铃卧推 185 ──
  await seed(page, { weights: { c_bench: 185 } });
  await openWeightModal(page);
  await assertBarbell(page, { minPlates: 4 });
  await shot(page, '09-modal-bench-185');

  // ── 10. 教练建议 ──
  await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const dateK = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const raw = localStorage.getItem('fitos_v2') || '{}';
    const state = JSON.parse(raw);
    state.logs = state.logs || {};
    state.logs[`${dateK}|chest`] = {
      c_bench: {
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
  await page.reload();
  await openWeightModal(page);
  await shot(page, '10-modal-coach-advice');

  // ── 11. kg 模式 ──
  await seed(page, { settings: { unit: 'kg' }, weights: { c_bench: 185 } });
  await openWeightModal(page);
  await shot(page, '11-modal-kg-mode');

  // ── 12. 单端装片（地雷管）──
  await seed(page, {
    weights: { c_landmine: 90 },
    programOverrides: {
      'day:chest': {
        addedEx: ['c_landmine'],
        exOrder: ['c_landmine', 'c_bench', 'c_incdb', 'c_incmc', 'c_fly']
      }
    }
  });
  await page.goto(`${BASE}/day/chest/focus`);
  await page.waitForSelector('.focus-ex-name');
  await page.locator('.focus-weight').click();
  await page.waitForSelector('.modal.wtm .pb');
  await assertBarbell(page, { sides: 1 });
  await shot(page, '12-modal-landmine-single-side');

  // ── 13. 训练工具 Sheet（专注模式 · 凑重入口）──
  await seed(page, { weights: { c_bench: 185 }, programOverrides: {} });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/day/chest/focus`);
  await page.waitForSelector('.focus-plates-link');
  await page.locator('.focus-plates-link').click();
  await page.waitForSelector('.tool-sheet .pb-barbell');
  await page.waitForFunction(() => {
    const sheet = document.querySelector('.tool-sheet--focus');
    const footer = document.querySelector('.ptp-focus-footer');
    if (!sheet || !footer) return false;
    return Math.abs(sheet.getBoundingClientRect().bottom - window.innerHeight) < 3;
  });
  await assertBarbell(page, { minPlates: 4, legend: false });
  await shot(page, '13-tool-sheet-plates');

  // ── 14. 平板横屏 ──
  await page.setViewportSize({ width: 768, height: 1024 });
  await seed(page);
  await openDiscoverPlates(page);
  await plateInput.fill('315');
  await shot(page, '14-tablet-landscape');

  // ── 15. 弹窗 · 无法凑齐余量 ──
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, { weights: { c_bench: 137 } });
  await openWeightModal(page);
  await shot(page, '15-modal-remainder-warn');

  // ── 16. EZ 杠（杆重选项不同）──
  await seed(page, {
    weights: { ar_ezcurl: 50 },
    programOverrides: {
      'day:arms': {
        addedEx: ['ar_ezcurl'],
        exOrder: ['ar_ezcurl']
      }
    }
  });
  await page.goto(`${BASE}/day/arms/focus`);
  await page.waitForSelector('.focus-weight');
  await page.locator('.focus-weight').click();
  await page.waitForSelector('.modal.wtm .pb');
  await shot(page, '16-modal-ezbar');

  console.log('\n截图完成 →', OUT);
} finally {
  await browser.close();
}
