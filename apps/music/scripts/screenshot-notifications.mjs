import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../docs/ui-qa-screenshots/notifications-2026-07-06');
const baseUrl = process.env.MUSIC_QA_BASE ?? 'http://127.0.0.1:5195';

/** @param {import('@playwright/test').Page} page */
async function triggerToast(page, msg, tone = 'success') {
  return page.evaluate(
    async ({ msg, tone }) => {
      /** @type {Record<string, unknown>} */
      let uiMod = null;
      const hrefs = [
        ...document.querySelectorAll('link[rel="modulepreload"][href*="chunks/"]'),
      ].map((el) => el.href);

      for (const href of hrefs) {
        try {
          const mod = await import(href);
          const stateObj = Object.values(mod).find(
            (v) =>
              v &&
              typeof v === 'object' &&
              'show' in v &&
              'msg' in v &&
              'tone' in v,
          );
          if (!stateObj) continue;

          for (const value of Object.values(mod)) {
            if (typeof value !== 'function') continue;
            value('__qa_probe__', 'success', { key: '__qa_probe__', dedupeMs: 0 });
            if (stateObj.msg !== '__qa_probe__' || stateObj.show !== true) continue;
            stateObj.show = false;
            uiMod = { toast: value, toastState: stateObj };
            break;
          }
          if (uiMod) break;
        } catch {
          // not the ui chunk
        }
      }

      if (!uiMod) {
        try {
          uiMod = await import('/src/lib/ui.svelte.js');
        } catch {
          return { ok: false, reason: 'ui module not found' };
        }
      }

      uiMod.toast(msg, tone);
      await new Promise((r) => setTimeout(r, 350));
      const el = document.querySelector('.toast');
      if (!el) return { ok: false, reason: 'no .toast element' };
      const cs = getComputedStyle(el);
      return {
        ok: true,
        className: el.className,
        msg: el.querySelector('.toast-msg')?.textContent ?? el.textContent,
        opacity: cs.opacity,
        bottom: cs.bottom,
        zIndex: cs.zIndex,
        inMusicApp: Boolean(el.closest('.music-app')),
      };
    },
    { msg, tone },
  );
}

const scenarios = [
  {
    name: 'toast-success-mobile',
    viewport: devices['Pixel 7'].viewport,
    path: '/',
    tone: 'success',
    msg: '已保存到云端',
  },
  {
    name: 'toast-error-mobile',
    viewport: devices['Pixel 7'].viewport,
    path: '/',
    tone: 'error',
    msg: '播放失败，请重试',
  },
  {
    name: 'toast-warn-mobile',
    viewport: devices['Pixel 7'].viewport,
    path: '/',
    tone: 'warn',
    msg: 'AI 标签暂不可用',
  },
  {
    name: 'toast-success-mobile-mini-player',
    viewport: devices['Pixel 7'].viewport,
    path: '/',
    tone: 'success',
    msg: '已加入播放队列',
    setup: async (page) => {
      await page.evaluate(() => {
        document.querySelector('.bottom-shell')?.setAttribute('data-player-chrome', 'mini');
        const mini = document.querySelector('.mini-player');
        if (mini) mini.classList.add('show');
      });
    },
  },
  {
    name: 'toast-error-desktop',
    viewport: { width: 1280, height: 800 },
    path: '/now-playing',
    tone: 'error',
    msg: '无法加载音频源',
  },
  {
    name: 'toast-success-desktop',
    viewport: { width: 1280, height: 800 },
    path: '/settings',
    tone: 'success',
    msg: '同步完成',
  },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = [];

for (const scenario of scenarios) {
  const context = await browser.newContext({ viewport: scenario.viewport });
  const page = await context.newPage();
  await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: 'networkidle' });
  if (scenario.setup) await scenario.setup(page);
  const result = await triggerToast(page, scenario.msg, scenario.tone);
  const file = path.join(outDir, `${scenario.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.push({ scenario: scenario.name, file, ...result });
  await context.close();
}

await browser.close();

const failed = report.filter((r) => !r.ok || r.opacity === '0' || !r.className?.includes('show'));
console.log(JSON.stringify({ outDir, report, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
