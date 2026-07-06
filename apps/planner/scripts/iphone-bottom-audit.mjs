/**
 * iPhone Pro 类视口底部留白审计（402×874 ≈ 16/17 Pro）
 * 检查：底栏贴底、nav 下方无异常空白、scroll 高度合理
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5188';
/** @type {import('@playwright/test').ViewportSize} */
const IPHONE_PRO = { width: 402, height: 874 };

/** @param {import('@playwright/test').Page} page */
async function auditBottom(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.nav');
    const fab = document.querySelector('.fab');
    const tint = document.querySelector('.safari-chrome-tint-bottom');
    const mainCol = document.querySelector('.main-col');
    const wrap = document.querySelector('.wrap');
    const shell = document.querySelector('.app-shell');
    const lastRow = document.querySelector('.task-row:last-of-type, .empty-state');
    const nr = nav?.getBoundingClientRect();
    const fr = fab?.getBoundingClientRect();
    const lr = lastRow?.getBoundingClientRect();
    const sr = shell?.getBoundingClientRect();
    const mr = mainCol?.getBoundingClientRect();
    const vh = window.innerHeight;
    const styles = mainCol ? getComputedStyle(mainCol) : null;
    const wrapStyles = wrap ? getComputedStyle(wrap) : null;
    return {
      path: location.pathname,
      viewportH: vh,
      docH: document.documentElement.scrollHeight,
      scrollExcess: document.documentElement.scrollHeight - vh,
      navBottom: nr ? Math.round(nr.bottom) : null,
      gapBelowNav: nr ? Math.round(vh - nr.bottom) : null,
      gapContentToFab:
        lr && fr && fr.height > 0 ? Math.round(fr.top - lr.bottom) : null,
      gridSlackBelowMainCol:
        mr && nr ? Math.round(nr.top - mr.bottom) : null,
      shellH: sr ? Math.round(sr.height) : null,
      navH: nr ? Math.round(nr.height) : null,
      tintH: tint ? Math.round(tint.getBoundingClientRect().height) : null,
      mainColPadBottom: styles?.paddingBottom ?? null,
      wrapPadBottom: wrapStyles?.paddingBottom ?? null,
      fabVisible: mainCol?.getAttribute('data-fab-visible'),
      chrome: mainCol?.getAttribute('data-mobile-chrome')
    };
  });
}

/** @type {Array<{ path: string; label: string }>} */
const routes = [
  { path: '/', label: 'home+fab' },
  { path: '/settings', label: 'settings' },
  { path: '/search', label: 'search' },
  { path: '/completed', label: 'completed' }
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: IPHONE_PRO,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1'
});

await page.addInitScript(() => {
  document.documentElement.style.setProperty('--safe-bottom', '34px');
  document.documentElement.style.setProperty('--safe-bottom-effective', '34px');
});

let failed = false;
for (const { path, label } of routes) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const a = await auditBottom(page);
  const okNav = a.gapBelowNav != null && Math.abs(a.gapBelowNav) <= 1;
  const okPad = a.mainColPadBottom === '0px';
  const okSlack = a.gridSlackBelowMainCol == null || a.gridSlackBelowMainCol <= 8;
  const okContentFab =
    path !== '/' || a.gapContentToFab == null || a.gapContentToFab <= 120;
  const okScroll =
    path === '/settings'
      ? a.scrollExcess < 360
      : a.scrollExcess <= 8;
  const pass = okNav && okPad && okSlack && okContentFab && okScroll;
  if (!pass) failed = true;
  console.log(
    `${pass ? '✓' : '✗'} ${label} (${path})`,
    JSON.stringify({
      gapBelowNav: a.gapBelowNav,
      gridSlackBelowMainCol: a.gridSlackBelowMainCol,
      gapContentToFab: a.gapContentToFab,
      mainColPadBottom: a.mainColPadBottom,
      wrapPadBottom: a.wrapPadBottom,
      scrollExcess: a.scrollExcess,
      fabVisible: a.fabVisible,
      chrome: a.chrome
    })
  );
}

await browser.close();
if (failed) {
  console.error('\nBottom inset audit FAILED');
  process.exit(1);
}
console.log('\nBottom inset audit passed (iPhone Pro 402×874)');
