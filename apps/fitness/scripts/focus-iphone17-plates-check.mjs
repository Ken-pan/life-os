/**
 * iPhone 17 Pro · Focus 模式凑重截图检查
 * node scripts/focus-iphone17-plates-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

/** iPhone 17 Pro 逻辑分辨率（与 16 Pro 同为 402×874） */
const IPHONE_17_PRO = { width: 402, height: 874 };
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = join(process.cwd(), 'screenshots/focus-iphone17-review');
mkdirSync(OUT, { recursive: true });

async function seed(page, data = {}) {
  await page.goto(`${BASE}/`);
  await page.evaluate((d) => {
    const s = JSON.parse(localStorage.getItem('fitos_v2') || '{}');
    s.settings = { unit: 'lbs', logDetail: 'quick', ...d.settings };
    s.weights = { c_bench: 185, ...d.weights };
    if (d.programOverrides !== undefined) s.programOverrides = d.programOverrides;
    localStorage.setItem('fitos_v2', JSON.stringify(s));
    sessionStorage.removeItem('fitos_focus');
  }, data);
  await page.reload();
}

async function scrollSheet(page) {
  await page.locator('.ptp-focus-scroll').evaluate((el) => {
    el.querySelector('.pb-barbell, .pb-viz')?.scrollIntoView({ block: 'center' });
  });
}

async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  console.log('✓', name);
}

async function waitSheetSettled(page) {
  await page.locator('.tool-sheet .ptp--focus').waitFor();
  await page.waitForFunction(() => {
    const sheet = document.querySelector('.tool-sheet--focus');
    const footer = document.querySelector('.ptp-focus-footer');
    if (!sheet || !footer) return false;
    const sb = sheet.getBoundingClientRect();
    const fb = footer.getBoundingClientRect();
    return Math.abs(sb.bottom - window.innerHeight) < 3 && fb.bottom <= window.innerHeight + 1;
  });
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
    return { plate: pick('.pb-barbell .pb-plate'), collar: pick('.pb-barbell .pb-collar') };
  });
  if (radii.plate == null || radii.plate > 5) {
    throw new Error(`铃片圆角应 ≤5px，实际 ${radii.plate}px`);
  }
  if (radii.collar == null || radii.collar > 4) {
    throw new Error(`卡箍圆角应 ≤4px，实际 ${radii.collar}px`);
  }
}

async function assertTouchTargets(page) {
  const bad = await page.evaluate(() => {
    const fails = [];
    for (const el of document.querySelectorAll('.ptp-focus-step, .ptp-more')) {
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        fails.push(`${el.className} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    for (const el of document.querySelectorAll('.pb-barbell .pb-plate')) {
      const r = el.getBoundingClientRect();
      if (r.height < 44) fails.push(`plate-h ${Math.round(r.height)}`);
    }
    return fails;
  });
  if (bad.length) throw new Error(`触控目标不足: ${bad.join(', ')}`);
}

async function assertBarbellInViewport(page, { topPad = 48, bottomPad = 64, scroll = true } = {}) {
  if (scroll) {
    await page.locator('.pb-barbell').evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
    await page.waitForTimeout(100);
  }
  const ok = await page.locator('.pb-barbell').evaluate(
    (el, pads) => {
      const r = el.getBoundingClientRect();
      const footer = document.querySelector('.ptp-focus-footer')?.getBoundingClientRect();
      const bottomLimit = footer ? Math.min(window.innerHeight - pads.bottom, footer.top - 4) : window.innerHeight - pads.bottom;
      return r.top >= pads.top && r.bottom <= bottomLimit + 1 && r.width > 40;
    },
    { top: topPad, bottom: bottomPad }
  );
  if (!ok) throw new Error('杠铃视图未完整落在可视区域内');
}

async function assertCompactFocus(page) {
  await waitSheetSettled(page);
  await expectVisible(page, '.tool-sheet--focus');
  await expectVisible(page, '.ptp-focus-scroll');
  await expectVisible(page, '.ptp-focus-weight');
  await expectHidden(page, '.tool-tabs');
  await expectVisible(page, '.pb-barbell');
  await expectHidden(page, '.pb-settings');
  await expectHidden(page, '.ptp-quick');
  await expectVisible(page, '.ptp-more');
  await expectVisible(page, '.ptp-focus-footer');
  const title = await page.locator('#tool-sheet-title').textContent();
  if (!title?.includes('凑重')) throw new Error(`标题应为凑重，实际: ${title}`);
  const formula = page.locator('.pb-hero-formula');
  if (await formula.count()) {
    await expectHidden(page, '.pb-hero-formula');
  }
  const sheetH = await page.locator('.tool-sheet--focus').evaluate((el) => el.getBoundingClientRect().height);
  const vh = page.viewportSize()?.height ?? 874;
  if (sheetH > vh * 0.58) throw new Error(`Focus sheet 过高: ${sheetH}px / ${vh}px`);
  const footerBox = await page.locator('.ptp-focus-footer').boundingBox();
  const viewportH = page.viewportSize()?.height ?? 874;
  if (!footerBox || footerBox.y + footerBox.height > viewportH - 4) {
    throw new Error('底栏应完整落在视口内');
  }
  const textOnGraphic = await page.locator('.pb-barbell .pb-plate-num, .pb-barbell .pb-shaft-label').count();
  if (textOnGraphic > 0) throw new Error('Focus 杠铃图形上不应有文字');
  const legendCount = await page.locator('.pb-barbell-legend').count();
  if (legendCount > 0) throw new Error('Focus 精简态不应显示侧边图例');
  await assertBarbellGeometry(page);
  await assertTouchTargets(page);
  await assertBarbellInViewport(page);
}

async function expectVisible(page, sel) {
  const el = page.locator(sel).first();
  await el.waitFor({ state: 'visible', timeout: 5000 });
}

async function expectHidden(page, sel) {
  const el = page.locator(sel).first();
  if (!(await el.count())) return;
  const visible = await el.isVisible();
  if (visible) throw new Error(`应隐藏: ${sel}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: IPHONE_17_PRO });
const page = await ctx.newPage();

// 1. Focus 首屏
await seed(page);
await page.goto(`${BASE}/day/chest/focus`);
await page.locator('.focus-ex-name').waitFor();
await shot(page, '01-focus-home');

// 2. 凑重 Sheet · 精简首屏（渐进披露）
await page.locator('.focus-plates-link').click();
await waitSheetSettled(page);
await assertCompactFocus(page);
const compactH = await page.locator('.tool-sheet--focus').evaluate((el) => el.getBoundingClientRect().height);
await page.evaluate((h) => { window.__focusSheetCompactH = h; }, compactH);
await shot(page, '02-plates-compact-top');

// 3. 展开装片选项 → Sheet 增高，步进器仍可见
await page.locator('.ptp-more').click();
await expectVisible(page, '.pb-settings');
await expectVisible(page, '.ptp-quick');
await expectVisible(page, '.ptp-focus-weight');
const expandedH = await page.locator('.tool-sheet--focus').evaluate((el) => el.getBoundingClientRect().height);
const storedCompactH = await page.evaluate(() => window.__focusSheetCompactH);
if (expandedH <= storedCompactH) throw new Error(`展开后高度应大于精简态: ${expandedH} <= ${storedCompactH}`);
await scrollSheet(page);
await shot(page, '03-plates-expanded-scrolled');
await page.locator('.ptp-focus-scroll').evaluate((el) => { el.scrollTop = 0; });
await shot(page, '03-plates-expanded-top');
const barInView = await page.locator('.pb-barbell').evaluate((el) => {
  const r = el.getBoundingClientRect();
  return r.top >= 56 && r.bottom <= window.innerHeight - 72;
});
if (!barInView) throw new Error('展开后首屏应可见杠铃视图');

// 4. 重载 495 · 铃片自动缩小无横向滚动
await page.locator('.ptp-focus-input input').fill('495');
await page.waitForTimeout(200);
const heavy = await page.evaluate(() => {
  const bb = document.querySelector('.pb-barbell');
  if (!bb) return null;
  return {
    scale: getComputedStyle(bb).getPropertyValue('--pb-scale').trim(),
    scrollW: bb.scrollWidth,
    clientW: bb.clientWidth,
    plates: document.querySelectorAll('.pb-barbell .pb-plate').length
  };
});
if (!heavy || heavy.plates < 10) throw new Error(`495 铃片数异常: ${JSON.stringify(heavy)}`);
if (heavy.scrollW > heavy.clientW + 2) throw new Error(`495 仍有横向溢出: ${JSON.stringify(heavy)}`);
if (parseFloat(heavy.scale) >= 1) throw new Error(`495 应缩小铃片: scale=${heavy.scale}`);
await assertBarbellGeometry(page);
await scrollSheet(page);
await shot(page, '04-plates-495-dense');

// 5. 重量弹窗 · 完整杠铃 + 滚花杆身
await page.keyboard.press('Escape');
await page.locator('.focus-weight').click();
await page.locator('.modal.wtm .pb-barbell').waitFor();
await page.locator('.modal.wtm .pb-barbell').scrollIntoViewIfNeeded();
await shot(page, '05-weight-modal');

// 6. 组间补录 Sheet 凑重入口
await page.keyboard.press('Escape');
await page.locator('.focus-cta-set').click();
if (await page.locator('.sheet').isVisible()) {
  await page.locator('.setlog-tool-link', { hasText: '凑重' }).click();
  await waitSheetSettled(page);
  await assertCompactFocus(page);
  await scrollSheet(page);
  await shot(page, '06-setlog-plates-compact');
}

// 7. iPhone SE 短视口 · 精简态
const seCtx = await browser.newContext({ viewport: { width: 375, height: 667 } });
const sePage = await seCtx.newPage();
await seed(sePage);
await sePage.goto(`${BASE}/day/chest/focus`);
await sePage.locator('.focus-plates-link').click();
await waitSheetSettled(sePage);
await assertCompactFocus(sePage);
await assertBarbellInViewport(sePage, { topPad: 40, bottomPad: 56 });
await shot(sePage, '07-iphone-se-compact');
await sePage.locator('.ptp-more').click();
await sePage.locator('.pb-settings').waitFor({ state: 'visible' });
await sePage.locator('.ptp-focus-weight').waitFor({ state: 'visible' });
const seExpandedBar = await sePage.locator('.pb-barbell').evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, vh: window.innerHeight };
});
if (seExpandedBar.top < 36) throw new Error(`SE 展开后杠铃被顶栏遮挡: top=${seExpandedBar.top}`);
await scrollSheet(sePage);
await shot(sePage, '08-iphone-se-expanded');
await seCtx.close();

await browser.close();
console.log('→', OUT);
