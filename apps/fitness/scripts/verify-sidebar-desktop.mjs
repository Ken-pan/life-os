import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('docs/ui-qa-screenshots');
const targets = [
  { name: 'fitness-home', url: 'http://127.0.0.1:5174/', file: 'fitness-sidebar-brand.png' },
  { name: 'planner-home', url: 'http://127.0.0.1:5188/', file: 'planner-sidebar-brand.png' },
  { name: 'finance-home', url: 'http://127.0.0.1:5173/', file: 'finance-sidebar-brand.png' }
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

let failed = false;

for (const target of targets) {
  await page.goto(target.url, { waitUntil: 'networkidle', timeout: 60_000 });

  const audit = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    const brand = sidebar?.querySelector('.brand');
    const item = sidebar?.querySelector('.nav-item');
    const settings =
      sidebar?.querySelector('.sidebar-foot-item') ??
      sidebar?.querySelector('.nav-item:last-of-type');
    const mark = brand?.querySelector('.brand-mark, img.brand-mark');
    const accent = brand?.querySelector('.brand-name-accent');
    const brandName = brand?.querySelector('.brand-name');

    if (!sidebar || !brand || !item || !settings || !mark || !brandName) {
      return {
        ok: false,
        reason: !sidebar
          ? 'sidebar-missing'
          : !brand
            ? 'brand-missing'
            : !mark
              ? 'brand-mark-missing'
              : 'nav-missing'
      };
    }

    const itemStyle = getComputedStyle(item);
    const markRect = mark.getBoundingClientRect();
    const accentStyle = accent ? getComputedStyle(accent) : null;
    const brandText = brandName.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const sidebarRect = sidebar.getBoundingClientRect();
    const settingsRect = settings.getBoundingClientRect();

    const brandNameStyle = getComputedStyle(brandName);
    const nameBase = brand?.querySelector('.brand-name-base');
    const nameBaseRect = nameBase?.getBoundingClientRect();
    const accentRect = accent?.getBoundingClientRect();
    const nameOsGap =
      nameBaseRect && accentRect ? Math.round(accentRect.left - nameBaseRect.right) : null;

    return {
      ok:
        itemStyle.flexDirection === 'row' &&
        Math.round(markRect.width) === 28 &&
        Math.round(markRect.height) === 28 &&
        !brandText.includes('.') &&
        accent != null &&
        accent.textContent?.trim() === 'OS' &&
        accentStyle != null &&
        accentStyle.color !== brandNameStyle.color &&
        brandNameStyle.columnGap !== 'normal' &&
        nameOsGap != null &&
        nameOsGap >= 4,
      flexDirection: itemStyle.flexDirection,
      markSize: `${Math.round(markRect.width)}x${Math.round(markRect.height)}`,
      brandText,
      accentText: accent?.textContent?.trim() ?? null,
      nameOsGap,
      settingsBottomGap: Math.round(sidebarRect.bottom - settingsRect.bottom)
    };
  });

  const screenshotPath = path.join(outDir, target.file);
  const brand = page.locator('.sidebar .brand');
  if (await brand.count()) {
    await brand.screenshot({ path: screenshotPath });
  } else {
    await page.screenshot({ path: screenshotPath });
  }

  console.log(JSON.stringify({ target: target.name, audit, screenshotPath }, null, 2));
  if (!audit.ok) failed = true;
}

await browser.close();
process.exit(failed ? 1 : 0);
