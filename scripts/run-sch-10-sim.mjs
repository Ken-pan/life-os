import { chromium, devices } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const outDir = path.resolve('output/playwright/sch-10-planner');
const appUrl = 'http://127.0.0.1:5188';
const routes = ['/today', '/calendar', '/settings'];
const scrollSelector = '.life-os-shell-column > .life-os-page-workspace';

async function run() {
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const device = devices['iPhone 13'];
  const context = await browser.newContext({
    ...device,
    isMobile: true,
    hasTouch: true
  });

  await context.addInitScript(() => {
    document.documentElement.classList.add('standalone-pwa');
  });

  const report = {};

  for (const route of routes) {
    const page = await context.newPage();
    const url = `${appUrl}${route}`;
    console.log(`Testing ${url}...`);

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.documentElement.classList.add('standalone-pwa'));
    await page.waitForTimeout(2000); // wait for render and stable layout

    const viewport = page.viewportSize();
    const ua = await page.evaluate(() => navigator.userAgent);
    const testTime = new Date().toISOString();
    const hasStandaloneClass = await page.evaluate(() => document.documentElement.classList.contains('standalone-pwa'));

    const metrics = await page.evaluate((selector) => {
      const container = document.querySelector(selector);
      if (!container) return null;

      const computed = window.getComputedStyle(container);
      return {
        selector,
        overflowY: computed.overflowY,
        clientHeight: container.clientHeight,
        scrollHeight: container.scrollHeight,
        initialScrollTop: container.scrollTop
      };
    }, scrollSelector);

    await page.screenshot({ path: path.join(outDir, `top-${route.replace('/', '')}.png`) });

    let finalScrollTop = 0;
    let canReachEnd = false;
    let tabBarObscures = false;

    if (metrics) {
      await page.evaluate((selector) => {
        const container = document.querySelector(selector);
        container.scrollTo(0, container.scrollHeight);
      }, scrollSelector);

      await page.waitForTimeout(1000);

      const bottomMetrics = await page.evaluate((selector) => {
        const container = document.querySelector(selector);
        return {
          scrollTop: container.scrollTop,
          canReachEnd: container.scrollTop + container.clientHeight >= container.scrollHeight - 5 // tolerance
        };
      }, scrollSelector);

      finalScrollTop = bottomMetrics.scrollTop;
      canReachEnd = bottomMetrics.canReachEnd;
      // Heuristic for tab bar obscuring: usually if it can't reach end, or we just flag it manual or visual check.
      // We can also check if the bottom-most element is visible above the bottom navigation.
      const lastChildVisible = await page.evaluate((selector) => {
        const container = document.querySelector(selector);
        if (!container.lastElementChild) return true;
        const rect = container.lastElementChild.getBoundingClientRect();
        return rect.bottom <= window.innerHeight; // if it's within viewport, it's not obscured
      }, scrollSelector);

      tabBarObscures = !lastChildVisible;
    }

    await page.screenshot({ path: path.join(outDir, `bottom-${route.replace('/', '')}.png`) });

    report[route] = {
      viewport,
      userAgent: ua,
      testTime,
      hasStandaloneClass,
      scrollSelector,
      ...metrics,
      finalScrollTop,
      canReachEnd,
      tabBarObscures
    };

    await page.close();
  }

  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

  await browser.close();
  console.log('Test completed.');
}

run().catch(console.error);
