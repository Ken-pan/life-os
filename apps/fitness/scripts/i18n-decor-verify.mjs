/**
 * Verify decorative copy hide/show policy on core pages (zh + en).
 * node scripts/i18n-decor-verify.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { UI_DECOR_ROLES } from '../src/lib/uiDecor.js';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const OUT = join(process.cwd(), 'screenshots/i18n-decor-verify');
mkdirSync(OUT, { recursive: true });

/** @param {import('@playwright/test').Page} page @param {'zh'|'en'} locale */
async function seed(page, locale) {
  await page.goto(`${BASE}/`);
  await page.evaluate((loc) => {
    const raw = localStorage.getItem('fitos_v2') || '{}';
    const s = JSON.parse(raw);
    s.settings = { ...s.settings, locale: loc, unit: 'lbs', logDetail: 'quick' };
    s.weights = { c_bench: 185, c_incdb: 47.5, b_row: 135, ...(s.weights || {}) };
    s.logs = {
      [`${new Date().toISOString().slice(0, 10)}|chest`]: {
        c_bench: { sets: [{ weight: 185, reps: 8, rir: 2 }, null, null, null] }
      }
    };
    localStorage.setItem('fitos_v2', JSON.stringify(s));
  }, locale);
  await page.reload();
  await page.waitForTimeout(350);
}

/** @param {import('@playwright/test').Page} page */
async function probe(page) {
  return page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false, visible: false, text: '', innerText: '' };
      const st = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const visible =
        st.display !== 'none' &&
        st.visibility !== 'hidden' &&
        st.opacity !== '0' &&
        r.width > 0 &&
        r.height > 0;
      return {
        found: true,
        visible,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        innerText: visible ? (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80) : ''
      };
    };

    const visAll = (sel) =>
      [...document.querySelectorAll(sel)].map((el) => {
        const st = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
          visible:
            st.display !== 'none' &&
            st.visibility !== 'hidden' &&
            r.width > 0 &&
            r.height > 0,
          role: el.getAttribute('data-ui-decor')
        };
      });

    return {
      heroTitle: vis('.hero-title'),
      secTitle: vis('.sec-title'),
      dayTitle: vis('.day-title'),
      tag: vis('[data-ui-decor="tag"]'),
      kicker: vis('[data-ui-decor="kicker"]'),
      calloutLabel: vis('[data-ui-decor="callout-label"]'),
      metaStrip: vis('[data-ui-decor="meta-strip"]'),
      enAccent: visAll('[data-ui-decor="en-accent"]'),
      sectionLabel: visAll('[data-ui-decor="section-label"]'),
      statLabel: visAll('[data-ui-decor="stat-label"]'),
      navLabel: visAll('[data-ui-decor="nav-label"]'),
      eyebrow: vis('.eyebrow'),
      coachHead: vis('.coach-head'),
      btnStart: vis('.btn-start'),
      focusEx: vis('.focus-ex-name')
    };
  });
}

/** @param {object} p @param {'zh'|'en'} locale @param {string} pageId */
function checkExpectations(p, locale, pageId) {
  /** @type {{ ok: boolean, msg: string }[]} */
  const checks = [];

  const mustHidden = (key, label) => {
    const el = p[key];
    if (Array.isArray(el)) {
      const bad = el.filter((x) => x.visible);
      checks.push({
        ok: bad.length === 0,
        msg: bad.length ? `${label} should be hidden but visible: ${bad.map((b) => b.text).join(', ')}` : `${label} hidden ✓`
      });
    } else if (el.found) {
      checks.push({
        ok: !el.visible,
        msg: el.visible ? `${label} should be hidden but visible: "${el.text}"` : `${label} hidden ✓`
      });
    }
  };

  const mustVisible = (key, label, min = 1) => {
    const el = p[key];
    if (Array.isArray(el)) {
      const good = el.filter((x) => x.visible);
      checks.push({
        ok: good.length >= min,
        msg:
          good.length >= min
            ? `${label} visible (${good.length}) ✓`
            : `${label} should be visible (${min}+) but none shown`
      });
    } else {
      checks.push({
        ok: el.found && el.visible,
        msg: el.found && el.visible ? `${label} visible ✓` : `${label} should be visible`
      });
    }
  };

  if (pageId === '01-home') {
    mustVisible('heroTitle', 'Hero title');
    mustVisible('eyebrow', 'Eyebrow date');
    mustHidden('tag', 'Tag');
    mustHidden('kicker', 'Kicker');
    mustHidden('metaStrip', 'AppBar meta');
    mustHidden('enAccent', 'EN accent');
    mustHidden('calloutLabel', 'Workout details label');
    const secVis = p.sectionLabel.filter((x) => x.visible);
    checks.push({
      ok: secVis.some((x) => /rotation|循环/i.test(x.text)),
      msg: secVis.some((x) => /rotation|循环/i.test(x.text))
        ? 'Rotation section label visible ✓'
        : 'Rotation section label should be visible'
    });
    mustVisible('navLabel', 'Nav labels', 4);
    mustVisible('btnStart', 'Start button');
    // eyebrow should NOT contain program name visible
    if (p.eyebrow.visible && /rotation|循环|Chest · Back|胸 · 背/i.test(p.eyebrow.innerText || p.eyebrow.text)) {
      checks.push({
        ok: false,
        msg: `Eyebrow should be date-only but shows program name: "${p.eyebrow.innerText || p.eyebrow.text}"`
      });
    } else if (p.eyebrow.visible) {
      checks.push({ ok: true, msg: `Eyebrow date-only ✓ (${p.eyebrow.innerText || p.eyebrow.text})` });
    }
  }

  if (pageId === '02-program' || pageId === '03-discover' || pageId === '04-settings') {
    mustHidden('tag', 'Tag');
    mustVisible('secTitle', 'Section title');
    mustVisible('navLabel', 'Nav labels', 4);
  }

  if (pageId === '05-day-overview') {
    mustVisible('dayTitle', 'Day title');
    mustHidden('calloutLabel', 'Today focus label');
    mustVisible('navLabel', 'Nav labels', 4);
  }

  if (pageId === '06-focus-home') {
    mustVisible('focusEx', 'Focus exercise name');
    checks.push({
      ok: p.tag.found === false || !p.tag.visible,
      msg: !p.tag.visible ? 'No visible decor tags on focus ✓' : 'Focus should have no decor tags'
    });
  }

  if (pageId === '12-stats') {
    mustHidden('tag', 'Stats tag');
    mustVisible('secTitle', 'Stats title');
    mustVisible('statLabel', 'Stat labels', 2);
  }

  return checks;
}

const CORE = [
  { id: '01-home', path: '/', wait: '.hero-title' },
  { id: '02-program', path: '/program', wait: '.sec-title' },
  { id: '03-discover', path: '/discover', wait: '.discover-grid' },
  { id: '04-settings', path: '/settings', wait: '.sec-title' },
  { id: '05-day-overview', path: '/day/chest', wait: '.day-title' },
  { id: '06-focus-home', path: '/day/chest/focus', wait: '.focus-ex-name' },
  { id: '12-stats', path: '/discover/stats', wait: '.stats-grid' }
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

/** @type {object[]} */
const report = [];

for (const locale of /** @type {const} */ (['en', 'zh'])) {
  await seed(page, locale);
  const dir = join(OUT, locale);
  mkdirSync(dir, { recursive: true });

  for (const { id, path, wait } of CORE) {
    await page.goto(`${BASE}${path}`);
    await page.locator(wait).first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(dir, `${id}.png`), fullPage: id === '04-settings' || id === '12-stats' });

    const probeResult = await probe(page);
    const checks = checkExpectations(probeResult, locale, id);
    const failed = checks.filter((c) => !c.ok);

    report.push({ locale, id, path, checks, failed: failed.length, probe: probeResult });
  }
}

writeFileSync(join(OUT, 'verify-report.json'), JSON.stringify(report, null, 2));

let totalFail = 0;
for (const locale of ['en', 'zh']) {
  console.log(`\n=== ${locale.toUpperCase()} ===\n`);
  for (const r of report.filter((x) => x.locale === locale)) {
    const icon = r.failed ? 'FAIL' : 'OK';
    console.log(`[${icon}] ${r.id}`);
    for (const c of r.checks) {
      if (!c.ok) console.log(`  ✗ ${c.msg}`);
    }
    if (r.failed === 0) console.log(`  ✓ ${r.checks.length} checks passed`);
    totalFail += r.failed;
  }
  console.log(`\nScreenshots → ${join(OUT, locale)}`);
}

await browser.close();
console.log(`\n${totalFail === 0 ? 'All checks passed.' : `${totalFail} check(s) failed.`}`);
process.exit(totalFail ? 1 : 0);
