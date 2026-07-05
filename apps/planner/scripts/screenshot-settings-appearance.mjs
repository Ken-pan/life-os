/**
 * Life OS 设置页「外观」区块截图 + 结构对比
 * 用法：先启动三个 dev server，再 node scripts/screenshot-settings-appearance.mjs
 *
 * Planner:  npm run dev -- --port 5188 --strictPort
 * Fitness:  npm run dev -- --port 5189 --strictPort
 * Finance:  npm run dev -- --port 5190 --strictPort
 */
import { chromium, devices } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../docs/ui-qa-screenshots/settings-appearance-2026-07-05');

const APPS = {
  planner: {
    base: process.env.PLANNER_URL ?? 'http://127.0.0.1:5188',
    settingsPath: '/settings',
    storageKey: 'planos_v1',
    seed(settings = {}) {
      return {
        schemaVersion: 2,
        tasks: [],
        lists: [
          {
            id: 'inbox',
            title: 'inbox',
            icon: 'inbox',
            color: '#F5A623',
            sortOrder: 0,
            system: 'inbox'
          }
        ],
        settings: {
          theme: 'light',
          locale: 'zh',
          defaultListId: 'inbox',
          notificationsEnabled: false,
          syncAuto: true,
          ...settings
        }
      };
    }
  },
  fitness: {
    base: process.env.FITNESS_URL ?? 'http://127.0.0.1:5189',
    settingsPath: '/settings',
    storageKey: 'fitos_v2',
    seed(settings = {}) {
      return {
        settings: {
          unit: 'lbs',
          logDetail: 'quick',
          theme: 'dark',
          locale: 'zh',
          sound: true,
          notifyRest: false,
          ...settings
        },
        weights: {},
        logs: {},
        rotation: { next: 0, history: [], lastDeload: null }
      };
    }
  },
  finance: {
    base: process.env.FINANCE_URL ?? 'http://127.0.0.1:5190',
    settingsPath: '/#settings/app',
    storageKey: 'fos-theme',
    seed() {
      return null;
    }
  }
};

const viewports = [
  { id: 'mobile', size: devices['Pixel 7'].viewport },
  { id: 'desktop', size: { width: 1280, height: 800 } }
];

function auditAppearance(root) {
  const section = root.querySelector('[data-testid="settings-appearance"]');
  if (!section) {
    return { ok: false, error: 'missing settings-appearance test id' };
  }

  const rows = section.querySelectorAll('.pref-row, .settings-row, .set-row');
  const groups = section.querySelectorAll('[role="group"]');
  const pressed = [...section.querySelectorAll('button[aria-pressed="true"]')].map((btn) =>
    btn.textContent?.trim()
  );
  const labels = [...section.querySelectorAll('.pref-label, .sr-label, .pref-copy .sr-label')].map(
    (node) => node.textContent?.trim()
  );

  const themeButtons = groups[1]
    ? [...groups[1].querySelectorAll('button')].map((btn) => btn.textContent?.trim())
    : [];
  const localeButtons = groups[0]
    ? [...groups[0].querySelectorAll('button')].map((btn) => btn.textContent?.trim())
    : [];

  const ok =
    rows.length >= 2 &&
    groups.length >= 2 &&
    localeButtons.length >= 2 &&
    themeButtons.length >= 3 &&
    pressed.length >= 2;

  return {
    ok,
    rowCount: rows.length,
    groupCount: groups.length,
    labels,
    localeButtons,
    themeButtons,
    pressed
  };
}

async function seedPage(page, appKey) {
  const app = APPS[appKey];
  const payload = app.seed();
  if (!payload) return;
  await page.goto(`${app.base}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: app.storageKey, value: payload }
  );
}

async function seedFinanceSession(page) {
  const financeRoot = path.resolve(__dirname, '../../Moneymoneymoney');
  let env = {};
  try {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(path.join(financeRoot, '.env.local'), 'utf8');
    env = Object.fromEntries(
      raw
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const i = line.indexOf('=');
          return [line.slice(0, i), line.slice(i + 1)];
        })
    );
  } catch {
    return false;
  }

  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return false;

  const { createRequire } = await import('node:module');
  const require = createRequire(path.join(financeRoot, 'package.json'));
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { storageKey: 'life_os_auth', persistSession: false }
  });
  const email = process.env.UI_QA_EMAIL ?? 'p1a-rls-test-b@example.test';
  const password = process.env.UI_QA_PASSWORD ?? 'P1aTestPass!2026';
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;

  await page.goto(`${APPS.finance.base}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.evaluate(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
      localStorage.setItem('fos-theme', 'light');
      localStorage.setItem('fos-locale', 'zh-CN');
    },
    { key: 'life_os_auth', session: data.session }
  );
  return true;
}

async function captureApp(browser, appKey, viewport) {
  const app = APPS[appKey];
  const page = await browser.newPage();
  await page.setViewportSize(viewport.size);

  if (appKey !== 'finance') {
    await seedPage(page, appKey);
  } else {
    const authed = await seedFinanceSession(page);
    if (!authed) {
      await page.addInitScript(() => {
        localStorage.setItem('fos-theme', 'light');
        localStorage.setItem('fos-locale', 'zh-CN');
      });
    }
  }

  const url = `${app.base}${app.settingsPath}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(800);

  const appearance = page.locator('[data-testid="settings-appearance"]');
  if (await appearance.count()) {
    await appearance.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }

  const sections = ['settings-appearance', 'settings-notifications', 'settings-sync', 'settings-backup'];
  const sectionAudit = {};
  for (const id of sections) {
    const loc = page.locator(`[data-testid="${id}"]`);
    sectionAudit[id] = await loc.isVisible().catch(() => false);
  }
  const visible = await appearance.isVisible().catch(() => false);

  let audit = { ok: false, error: 'appearance section not visible' };
  if (visible) {
    audit = await appearance.evaluate((root) => {
      const section = root;
      const rows = section.querySelectorAll('.pref-row, .settings-row, .set-row');
      const groups = section.querySelectorAll('[role="group"]');
      const pressed = [...section.querySelectorAll('button[aria-pressed="true"]')].map((btn) =>
        btn.textContent?.trim()
      );
      const labels = [...section.querySelectorAll('.pref-label, .sr-label')].map((node) =>
        node.textContent?.trim()
      );
      const themeButtons = groups[1]
        ? [...groups[1].querySelectorAll('button')].map((btn) => btn.textContent?.trim())
        : [];
      const localeButtons = groups[0]
        ? [...groups[0].querySelectorAll('button')].map((btn) => btn.textContent?.trim())
        : [];
      const ok =
        rows.length >= 2 &&
        groups.length >= 2 &&
        localeButtons.length >= 2 &&
        themeButtons.length >= 3 &&
        pressed.length >= 2;
      return {
        ok,
        rowCount: rows.length,
        groupCount: groups.length,
        labels,
        localeButtons,
        themeButtons,
        pressed
      };
    });
  }

  const file = `${appKey}-appearance-${viewport.id}.png`;
  if (visible) {
    await appearance.screenshot({ path: path.join(outDir, file) });
  } else {
    await page.screenshot({ path: path.join(outDir, `${appKey}-settings-${viewport.id}.png`), fullPage: true });
  }

  if (visible && viewport.id === 'mobile') {
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        viewportWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        overflowPx: root.scrollWidth - root.clientWidth
      };
    });
    audit.overflow = overflow;
    audit.ok = audit.ok && overflow.overflowPx <= 1;
  }

  await page.close();
  return { app: appKey, viewport: viewport.id, url, visible, screenshot: file, audit, sectionAudit };
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const viewport of viewports) {
  for (const appKey of Object.keys(APPS)) {
    try {
      const result = await captureApp(browser, appKey, viewport);
      results.push(result);
      console.log(`${result.audit?.ok ? 'ok' : 'FAIL'} ${appKey}-${viewport.id}`, result.audit);
    } catch (err) {
      results.push({ app: appKey, viewport: viewport.id, ok: false, error: err.message });
      console.error(`fail ${appKey}-${viewport.id}:`, err.message);
    }
  }
}

await browser.close();

const summary = {
  generatedAt: new Date().toISOString(),
  outDir,
  pass: results.every((r) => {
    if (r.audit?.ok !== true || r.error) return false;
    const required = ['settings-appearance'];
    if (r.app === 'planner') {
      required.push('settings-notifications', 'settings-sync', 'settings-backup');
    }
    if (r.app === 'fitness') {
      required.push('settings-notifications', 'settings-sync', 'settings-backup');
    }
    if (r.app === 'finance') {
      required.push('settings-backup');
    }
    return required.every((id) => r.sectionAudit?.[id]);
  }),
  results
};

await writeFile(path.join(outDir, 'report.json'), JSON.stringify(summary, null, 2));

if (!summary.pass) process.exitCode = 1;
console.log(`report -> ${path.join(outDir, 'report.json')}`);
