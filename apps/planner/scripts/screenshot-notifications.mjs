import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../docs/ui-qa-screenshots/notifications-2026-07-05');
const baseUrl = 'http://127.0.0.1:5188';

const scenarios = [
  {
    name: 'toast-success-mobile',
    viewport: devices['Pixel 7'].viewport,
    path: '/',
    setup: async (page) => {
      await page.evaluate(() => {
        const el = document.querySelector('.toast');
        if (!el) return;
        el.textContent = '已保存';
        el.className = 'toast toast--success show';
      });
    }
  },
  {
    name: 'toast-error-mobile',
    viewport: devices['Pixel 7'].viewport,
    path: '/',
    setup: async (page) => {
      await page.evaluate(() => {
        const el = document.querySelector('.toast');
        if (!el) return;
        el.textContent = '云同步失败';
        el.className = 'toast toast--error show';
      });
    }
  },
  {
    name: 'toast-warn-mobile',
    viewport: devices['Pixel 7'].viewport,
    path: '/',
    setup: async (page) => {
      await page.evaluate(() => {
        const el = document.querySelector('.toast');
        if (!el) return;
        el.textContent = 'AI 暂不可用';
        el.className = 'toast toast--warn show';
      });
    }
  },
  {
    name: 'banner-critical-mobile',
    viewport: devices['Pixel 7'].viewport,
    path: '/settings',
    setup: async (page) => {
      await page.evaluate(() => {
        const existing = document.querySelector('.banner--fixed');
        if (existing) existing.remove();
        const banner = document.createElement('div');
        banner.className = 'banner critical banner--row banner--fixed';
        banner.setAttribute('role', 'alert');
        banner.innerHTML =
          '<span class="banner__text">云同步失败：网络错误，请检查连接</span>' +
          '<button type="button" class="btn-ghost banner-close">关闭</button>';
        document.body.prepend(banner);
        document.body.classList.add('has-banner-fixed');
      });
    }
  },
  {
    name: 'banner-warning-inline-mobile',
    viewport: devices['Pixel 7'].viewport,
    path: '/settings',
    setup: async (page) => {
      await page.evaluate(() => {
        const wrap = document.querySelector('.wrap-long') || document.querySelector('.wrap');
        if (!wrap) return;
        const banner = document.createElement('div');
        banner.className = 'banner banner--row';
        banner.innerHTML =
          '<span class="banner__text">数据可能已过期，建议重新同步。</span>';
        wrap.prepend(banner);
      });
    }
  },
  {
    name: 'toast-success-desktop',
    viewport: { width: 1280, height: 800 },
    path: '/',
    setup: async (page) => {
      await page.evaluate(() => {
        const el = document.querySelector('.toast');
        if (!el) return;
        el.textContent = '已保存';
        el.className = 'toast toast--success show';
      });
    }
  },
  {
    name: 'toast-error-desktop',
    viewport: { width: 1280, height: 800 },
    path: '/',
    setup: async (page) => {
      await page.evaluate(() => {
        const el = document.querySelector('.toast');
        if (!el) return;
        el.textContent = '云同步失败';
        el.className = 'toast toast--error show';
      });
    }
  },
  {
    name: 'banner-critical-desktop',
    viewport: { width: 1280, height: 800 },
    path: '/settings',
    setup: async (page) => {
      await page.evaluate(() => {
        const banner = document.createElement('div');
        banner.className = 'banner critical banner--row banner--fixed';
        banner.setAttribute('role', 'alert');
        banner.innerHTML =
          '<span class="banner__text">云同步失败：网络错误，请检查连接</span>' +
          '<button type="button" class="btn-ghost banner-close">关闭</button>';
        document.body.prepend(banner);
      });
    }
  },
  {
    name: 'toast-dark-mobile',
    viewport: devices['Pixel 7'].viewport,
    path: '/settings',
    setup: async (page) => {
      await page.getByRole('button', { name: '深色', exact: true }).click();
      await page.goto(`${baseUrl}/`);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => {
        const el = document.querySelector('.toast');
        if (!el) return;
        el.textContent = '已保存';
        el.className = 'toast toast--success show';
      });
    }
  }
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

for (const scenario of scenarios) {
  await page.setViewportSize(scenario.viewport);
  try {
    await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(400);
    if (scenario.setup) await scenario.setup(page);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(outDir, `${scenario.name}.png`),
      fullPage: false
    });
    console.log(`ok ${scenario.name}`);
  } catch (err) {
    console.error(`fail ${scenario.name}:`, err.message);
    process.exitCode = 1;
  }
}

await browser.close();
console.log(`screenshots -> ${outDir}`);
