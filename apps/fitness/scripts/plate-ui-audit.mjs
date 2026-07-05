/**
 * PlateBuilder UI 对齐 / 统一性审计
 * node scripts/plate-ui-audit.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

async function seed(page, overrides = {}) {
  await page.goto(`${BASE}/`);
  await page.evaluate((o) => {
    const raw = localStorage.getItem('fitos_v2') || '{}';
    const state = JSON.parse(raw);
    state.settings = { unit: 'lbs', ...o.settings };
    state.weights = { ...state.weights, ...o.weights };
    if (o.programOverrides !== undefined) state.programOverrides = o.programOverrides;
    delete state.focusCursor;
    localStorage.setItem('fitos_v2', JSON.stringify(state));
    sessionStorage.removeItem('fitos_focus');
  }, overrides);
  await page.reload();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function auditBarbell(page, ctx) {
  const viewport = page.viewportSize();
  const stacked = viewport.width <= 420;

  const m = await page.evaluate((isStacked) => {
    const r = (el) => el?.getBoundingClientRect();
    const shaft = document.querySelector('.pb-shaft');
    const core = document.querySelector('.pb-barbell-core');
    const bar = document.querySelector('.pb-barbell-bar');
    const stage = document.querySelector('.pb-barbell');
    const stageWrap = document.querySelector('.pb-barbell-stage');
    const leftSide = document.querySelector('.pb-side--left');
    const rightSide = document.querySelector('.pb-side--right');
    const leftPlates = [...document.querySelectorAll('.pb-side--left .pb-plate')];
    const rightPlates = [...document.querySelectorAll('.pb-side--right .pb-plate')];
    const legend = document.querySelector('.pb-barbell-legend');
    const secTitle = document.querySelector('.pb-sec-title');
    const vizBefore = getComputedStyle(document.querySelector('.pb-viz-container'), '::before').content;
    const vizAfter = getComputedStyle(document.querySelector('.pb-viz-container'), '::after').content;

    if (!shaft || !core || !bar || !stage || !leftSide || !rightSide) {
      return { ok: false, reason: 'missing-elements' };
    }

    const sb = r(shaft);
    const cb = r(core);
    const bb = r(bar);
    const st = r(stage);
    const ls = r(leftSide);
    const rs = r(rightSide);

    const shaftCy = (sb.top + sb.bottom) / 2;
    const coreCy = (cb.top + cb.bottom) / 2;
    const stageCy = (st.top + st.bottom) / 2;

    const leftOuter = r(leftPlates[0]);
    const rightOuter = r(rightPlates[rightPlates.length - 1]);
    const barExtendL = leftOuter ? leftOuter.left - bb.left : null;
    const barExtendR = rightOuter ? bb.right - rightOuter.right : null;

    const stagePad = getComputedStyle(stage);
    const padL = parseFloat(stagePad.paddingLeft);
    const padR = parseFloat(stagePad.paddingRight);
    const padT = parseFloat(stagePad.paddingTop);
    const padB = parseFloat(stagePad.paddingBottom);

    let legendAlign = null;
    if (legend) {
      const lg = r(legend);
      if (isStacked) {
        legendAlign = {
          mode: 'stacked',
          leftDelta: Math.abs(lg.left - st.left),
          gap: lg.top - st.bottom
        };
      } else {
        legendAlign = {
          mode: 'side',
          deltaCy: Math.abs((lg.top + lg.bottom) / 2 - coreCy),
          heightDelta: Math.abs(lg.height - st.height)
        };
      }
    }

    let titleAlign = null;
    if (secTitle && stageWrap) {
      const tg = r(secTitle);
      const sw = r(stageWrap);
      titleAlign = Math.abs(tg.left - sw.left);
    }

    const coreCenterInStage = Math.abs((cb.left + cb.right) / 2 - (st.left + st.right) / 2);

    return {
      ok: true,
      stacked: isStacked,
      shaftCoreDelta: Math.abs(shaftCy - coreCy),
      coreStageDelta: Math.abs(coreCy - stageCy),
      barExtendL,
      barExtendR,
      barExtendDelta: barExtendL != null && barExtendR != null ? Math.abs(barExtendL - barExtendR) : null,
      sideWidthDelta: Math.abs(ls.width - rs.width),
      padL,
      padR,
      padT,
      padB,
      padSym: Math.abs(padL - padR),
      padVertSym: Math.abs(padT - padB),
      legendAlign,
      titleAlign,
      coreCenterInStage,
      vizBefore,
      vizAfter,
      plateCount: leftPlates.length + rightPlates.length
    };
  }, stacked);

  if (!m.ok) throw new Error(`${ctx}: ${m.reason}`);

  assert(m.shaftCoreDelta <= 1, `${ctx}: 杆身未垂直居中 core (Δ${m.shaftCoreDelta.toFixed(2)}px)`);
  assert(m.coreStageDelta <= 4, `${ctx}: 装片区未在展示台垂直居中 (Δ${m.coreStageDelta.toFixed(2)}px)`);
  assert(m.sideWidthDelta <= 2, `${ctx}: 左右铃片区宽度不对称 (Δ${m.sideWidthDelta.toFixed(1)}px)`);
  if (m.barExtendDelta != null) {
    assert(m.barExtendDelta <= 2, `${ctx}: 杆两端伸出不对称 L${m.barExtendL?.toFixed(1)} R${m.barExtendR?.toFixed(1)}`);
  }
  assert(m.padSym <= 1, `${ctx}: 展示台左右内边距不对称 L${m.padL} R${m.padR}`);
  assert(m.padVertSym <= 1, `${ctx}: 展示台上下内边距不对称 T${m.padT} B${m.padB}`);
  assert(m.coreCenterInStage <= 4, `${ctx}: 杠铃未在展示台水平居中 (Δ${m.coreCenterInStage.toFixed(1)}px)`);
  assert(m.vizBefore === 'none', `${ctx}: viz-container 左侧渐隐未移除`);
  assert(m.vizAfter === 'none', `${ctx}: viz-container 右侧渐隐未移除`);
  if (m.legendAlign?.mode === 'stacked') {
    assert(m.legendAlign.leftDelta <= 1, `${ctx}: 图例与杠铃左缘未对齐 (Δ${m.legendAlign.leftDelta.toFixed(1)}px)`);
    assert(m.legendAlign.gap >= 8 && m.legendAlign.gap <= 14, `${ctx}: 图例与杠铃间距异常 (${m.legendAlign.gap.toFixed(1)}px)`);
  } else if (m.legendAlign?.mode === 'side') {
    assert(m.legendAlign.heightDelta <= 1, `${ctx}: 图例高度与杠铃展示台不一致 (Δ${m.legendAlign.heightDelta.toFixed(1)}px)`);
    assert(m.legendAlign.deltaCy <= 8, `${ctx}: 图例与杠铃垂直未对齐 (Δ${m.legendAlign.deltaCy.toFixed(1)}px)`);
  }
  if (m.titleAlign != null) {
    assert(m.titleAlign <= 1, `${ctx}: 「杠铃视图」标题与展示区左缘未对齐 (Δ${m.titleAlign.toFixed(1)}px)`);
  }

  console.log(`✓ ${ctx}`, {
    layout: m.stacked ? 'stacked' : 'side',
    plates: m.plateCount,
    pad: `${m.padL}/${m.padR}`,
    barExt: m.barExtendL != null ? `${m.barExtendL.toFixed(1)}/${m.barExtendR?.toFixed(1)}` : 'n/a'
  });
  return m;
}

async function auditFocusGlance(page) {
  const m = await page.evaluate(() => {
    const stage = document.querySelector('.pb-barbell');
    const core = document.querySelector('.pb-barbell-core');
    const hero = document.querySelector('.pb-hero');
    const legend = document.querySelector('.pb-barbell-legend');
    const secTitle = document.querySelector('.pb-sec-title');
    if (!stage || !core) return { ok: false, reason: 'missing' };
    const st = stage.getBoundingClientRect();
    const cb = core.getBoundingClientRect();
    const coreCenter = (cb.left + cb.right) / 2;
    const stageCenter = (st.left + st.right) / 2;
    return {
      ok: true,
      coreCenterDelta: Math.abs(coreCenter - stageCenter),
      hasLegend: !!legend,
      hasSecTitle: !!secTitle,
      heroCentered: hero ? getComputedStyle(hero).textAlign === 'center' : null
    };
  });
  assert(m.ok, 'focus-glance missing elements');
  assert(m.coreCenterDelta <= 6, `focus-glance: 杠铃未水平居中 (Δ${m.coreCenterDelta.toFixed(1)}px)`);
  assert(!m.hasLegend, 'focus-glance: 不应显示图例');
  assert(!m.hasSecTitle, 'focus-glance: 不应显示「杠铃视图」标题');
  console.log('✓ focus-glance', { centerΔ: m.coreCenterDelta.toFixed(1) });
}

async function auditSingleSide(page) {
  const m = await page.evaluate(() => {
    const viz = document.querySelector('.pb-viz');
    const sleeve = document.querySelector('.pb-sleeve');
    const plates = [...document.querySelectorAll('.pb-viz .pb-plate')];
    if (!viz || !sleeve || !plates.length) return { ok: false, reason: 'missing' };
    const vb = viz.getBoundingClientRect();
    const sb = sleeve.getBoundingClientRect();
    const pad = getComputedStyle(viz);
    return {
      ok: true,
      padL: parseFloat(pad.paddingLeft),
      padR: parseFloat(pad.paddingRight),
      sleeveCy: (sb.top + sb.bottom) / 2,
      vizCy: (vb.top + vb.bottom) / 2,
      plateCount: plates.length
    };
  });
  assert(m.ok, 'single-side missing');
  assert(Math.abs(m.padL - m.padR) <= 1, `单端视图左右内边距不对称 L${m.padL} R${m.padR}`);
  console.log('✓ single-side', { pad: `${m.padL}/${m.padR}`, plates: m.plateCount });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

try {
  // Discover default
  await seed(page);
  await page.goto(`${BASE}/discover/tools`);
  await page.locator('.tool-card', { hasText: '杠铃片凑重' }).locator('.tool-head').click();
  await page.waitForSelector('.pb-barbell');
  await auditBarbell(page, 'discover-225');

  // Modal
  await seed(page, { weights: { c_bench: 185 } });
  await page.goto(`${BASE}/day/chest/focus`);
  await page.waitForSelector('.focus-weight');
  await page.locator('.focus-weight').click();
  await page.waitForSelector('.modal.wtm .pb-barbell');
  await auditBarbell(page, 'modal-185');

  // Focus sheet glance
  await seed(page, { weights: { c_bench: 185 } });
  await page.goto(`${BASE}/day/chest/focus`);
  await page.locator('.focus-plates-link').click();
  await page.waitForSelector('.tool-sheet .pb-barbell');
  await auditBarbell(page, 'tool-sheet-185');
  await auditFocusGlance(page);

  // Dense load
  await seed(page);
  await page.goto(`${BASE}/discover/tools`);
  await page.locator('.tool-card', { hasText: '杠铃片凑重' }).locator('.tool-head').click();
  await page.locator('.ptp-input-wrap input').fill('495');
  await page.waitForTimeout(300);
  await auditBarbell(page, 'discover-495-dense');

  // Tablet + legend
  await page.setViewportSize({ width: 768, height: 1024 });
  await auditBarbell(page, 'tablet-315');

  // Single side
  await page.setViewportSize({ width: 390, height: 844 });
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
  await page.waitForSelector('.focus-weight');
  await page.locator('.focus-weight').click();
  await page.waitForSelector('.modal.wtm .pb-viz');
  await auditSingleSide(page);

  console.log('\n全部 UI 对齐审计通过');
} catch (e) {
  console.error('\n✗', e.message);
  process.exit(1);
} finally {
  await browser.close();
}
