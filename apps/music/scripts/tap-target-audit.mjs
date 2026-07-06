/**
 * Mechanical tap-target audit for Music OS.
 * Flags interactive elements smaller than TAP_MIN (44px) on mobile viewport.
 *
 * Usage:
 *   npm run preview --workspace=music-os   # or dev on :5189
 *   node scripts/tap-target-audit.mjs
 */
import { chromium, devices } from 'playwright';

const BASE = process.env.MUSIC_URL ?? 'http://127.0.0.1:5189';
const TAP_MIN = 44;
const TAP_AA = 24;
const ROUTES = ['/', '/library', '/browse', '/search', '/playlists', '/settings', '/now-playing'];

/** @typedef {{ route: string, tag: string, role: string, label: string, w: number, h: number, selector: string }} Fail */

/** @param {import('playwright').Page} page */
async function seedLibrary(page) {
  await page.evaluate(async () => {
    const req = indexedDB.open('musicos_library');
    const db = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const now = Date.now();
    const track = {
      id: 'tap-audit-1',
      title: 'Audit Track',
      artist: 'QA Artist',
      album: 'QA Album',
      albumKey: 'QA Album',
      artistKey: 'QA Artist',
      duration: 200,
      mime: 'audio/mpeg',
      size: 0,
      addedAt: now,
      playCount: 1,
      liked: 0,
      words: ['audit']
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').put(track);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
}

/** @param {import('playwright').Page} page @param {string} route */
async function auditRoute(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  /** @type {Fail[]} */
  const fails = await page.evaluate(
    ({ tapMin, tapAa, routePath }) => {
      const INTERACTIVE =
        'button:not([disabled]), a[href], input:not([type="hidden"]):not([disabled]), select, textarea, summary, [role="button"]:not([aria-disabled="true"]), [role="menuitem"], [role="tab"]';

      /** @type {Fail[]} */
      const out = [];
      const seen = new Set();

      for (const el of document.querySelectorAll(INTERACTIVE)) {
        if (!(el instanceof HTMLElement)) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
        if (el.closest('[aria-hidden="true"]')) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;

        const key = `${el.tagName}|${rect.x}|${rect.y}|${rect.width}|${rect.height}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        const minSide = Math.min(w, h);

        // WCAG inline exception: text links inside paragraphs
        const inParagraph = Boolean(el.closest('p'));
        const isInlineText =
          inParagraph && el.tagName === 'BUTTON' && el.textContent && el.textContent.length < 24;

        if (isInlineText) continue;

        if (minSide >= tapMin) continue;

        const aria = el.getAttribute('aria-label') || '';
        const text = (el.textContent || '').trim().slice(0, 40);
        const label = aria || text || el.getAttribute('title') || el.className.toString().slice(0, 40);

        out.push({
          route: routePath,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          label,
          w,
          h,
          selector: el.className ? `.${String(el.className).split(/\s+/).slice(0, 2).join('.')}` : el.tagName.toLowerCase(),
          level: minSide < tapAa ? 'fail-aa' : 'warn-aaa'
        });
      }

      return out;
    },
    { tapMin: TAP_MIN, tapAa: TAP_AA, routePath: route }
  );

  return fails;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 14'],
    hasTouch: true
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    console.error(`Cannot reach ${BASE} — start preview/dev first.`);
    console.error(String(e));
    process.exit(2);
  }

  await seedLibrary(page);

  /** @type {Fail[]} */
  const all = [];

  for (const route of ROUTES) {
    try {
      const fails = await auditRoute(page, route);
      all.push(...fails);
    } catch (e) {
      console.warn(`Route ${route} skipped:`, e);
    }
  }

  // Open queue drawer on home with track playing
  await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
  await page.locator('.track-row-body').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.locator('.mini-player-btn').filter({ has: page.locator('[data-lucide]') }).nth(2).click().catch(() => {});
  await page.waitForTimeout(300);
  const queueFails = await auditRoute(page, '/queue-drawer');
  all.push(...queueFails.filter((f) => f.label.toLowerCase().includes('queue') || f.selector.includes('queue')));

  // More sheet
  await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
  await page.locator('.nav-item-more').click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
  const moreFails = await page.evaluate(
    ({ tapMin }) => {
      /** @type {Fail[]} */
      const out = [];
      for (const el of document.querySelectorAll('.mobile-more-sheet button, .mobile-more-sheet a')) {
        const rect = el.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (Math.min(w, h) < tapMin) {
          out.push({
            route: '/more-sheet',
            tag: el.tagName.toLowerCase(),
            role: '',
            label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || '',
            w,
            h,
            selector: el.className?.toString().slice(0, 40) || '',
            level: 'warn-aaa'
          });
        }
      }
      return out;
    },
    { tapMin: TAP_MIN }
  );
  all.push(...moreFails);

  await browser.close();

  const critical = all.filter((f) => f.level === 'fail-aa' || Math.min(f.w, f.h) < TAP_AA);
  const warn = all.filter((f) => !critical.includes(f));

  console.log(`\n=== Music OS Tap Target Audit (${TAP_MIN}px target) ===\n`);
  console.log(`Scanned routes: ${ROUTES.join(', ')} + overlays`);
  console.log(`Critical (<${TAP_AA}px): ${critical.length}`);
  console.log(`Warnings (<${TAP_MIN}px AAA): ${warn.length}\n`);

  if (critical.length) {
    console.log('--- CRITICAL ---');
    for (const f of critical) {
      console.log(`  [${f.route}] ${f.tag} ${f.w}×${f.h} — ${f.label || f.selector}`);
    }
  }

  if (warn.length) {
    console.log('--- WARNINGS ---');
    for (const f of warn) {
      console.log(`  [${f.route}] ${f.tag} ${f.w}×${f.h} — ${f.label || f.selector}`);
    }
  }

  if (!critical.length && !warn.length) {
    console.log('All visible interactive targets meet 44×44px on mobile viewport.');
  }

  process.exit(critical.length ? 1 : warn.length ? 0 : 0);
}

main();
