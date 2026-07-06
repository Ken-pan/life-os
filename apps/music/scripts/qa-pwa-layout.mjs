/**
 * PWA standalone bottom chrome layout QA
 * Usage: npm run preview -- --port 5192 && node scripts/qa-pwa-layout.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MUSIC_QA_URL ?? 'http://127.0.0.1:5192';
const appRoot = fileURLToPath(new URL('..', import.meta.url));

/** @type {{ id: string; severity: 'pass'|'fail'; detail: string }[]} */
const results = [];

function record(id, severity, detail) {
  results.push({ id, severity, detail });
  const mark = severity === 'pass' ? '✓' : '✗';
  console.log(`${mark} [${id}] ${detail}`);
}

const TRACK = {
  id: 'qa-pwa-layout-1',
  title: 'PWA Layout Test',
  artist: 'QA Bot',
  album: 'Diagnostics',
  albumKey: 'diagnostics',
  artistKey: 'qa-bot',
  duration: 180,
  mime: 'audio/mpeg',
  size: 0,
  addedAt: Date.now(),
  playCount: 0,
  liked: 0,
  artUrl: '',
  words: ['pwa', 'layout']
};

async function seed(page) {
  await page.evaluate(async (track) => {
    localStorage.setItem(
      'musicos_v1',
      JSON.stringify({
        settings: {
          theme: 'light',
          locale: 'zh',
          crossfade: false,
          gapless: true,
          volume: 0.8,
          muted: false,
          libraryDensity: 'comfortable',
          albumAmbience: true,
          immersiveViewMode: 'player'
        }
      })
    );
    localStorage.setItem(
      'musicos_player_session',
      JSON.stringify({
        queueIds: [track.id],
        index: 0,
        currentTime: 0,
        playing: false
      })
    );

    await new Promise((resolve) => {
      const del = indexedDB.deleteDatabase('musicos_library');
      del.onsuccess = () => resolve(undefined);
      del.onerror = () => resolve(undefined);
      del.onblocked = () => resolve(undefined);
    });

    const req = indexedDB.open('musicos_library');
    await new Promise((resolve, reject) => {
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('playlistTracks')) {
          db.createObjectStore('playlistTracks', { keyPath: 'rowId', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('recent')) db.createObjectStore('recent', { keyPath: 'trackId' });
        if (!db.objectStoreNames.contains('interactions')) {
          db.createObjectStore('interactions', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('speedDialSlots')) {
          db.createObjectStore('speedDialSlots', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const db = req.result;
    await new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').put(track);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }, TRACK);
}

/** @param {import('playwright').Page} page */
async function readLayoutMetrics(page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const tabbarTotal = parseFloat(root.getPropertyValue('--mobile-tabbar-total-h')) || 0;
    const miniH = parseFloat(root.getPropertyValue('--mini-player-h')) || 0;
    const mini = document.querySelector('.mini-player.show');
    const nav = document.querySelector('.bottom-nav, .nav.bottom-nav');
    const shell = document.querySelector('.bottom-shell');
    const bottomChromeToken = shell
      ? parseFloat(getComputedStyle(shell).getPropertyValue('--bottom-chrome-h')) || 0
      : 0;
    const main = document.getElementById('main-content');
    if (!mini || !nav || !shell || !main) return null;

    const miniRect = mini.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const vvH = window.visualViewport?.height ?? window.innerHeight;
    const mainPadding = parseFloat(getComputedStyle(main).paddingBottom) || 0;

    const expectedFromLayout = navRect.height + miniRect.height;

    return {
      tabbarTotal,
      miniH,
      expectedFromLayout,
      gapMiniToNav: navRect.top - miniRect.bottom,
      shellBottomOffset: vvH - shellRect.bottom,
      shellHeight: shellRect.height,
      miniBottomOffset: vvH - miniRect.bottom,
      mainPadding,
      appVh: root.getPropertyValue('--app-vh').trim(),
      standaloneClass: document.documentElement.classList.contains('standalone-pwa'),
      miniComputedBottom: getComputedStyle(mini).bottom,
      bottomChromeToken
    };
  });
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const result = original(query);
      if (query === '(display-mode: standalone)') {
        return {
          ...result,
          matches: true,
          media: query,
          addEventListener: (type, cb) => result.addEventListener(type, cb),
          removeEventListener: (type, cb) => result.removeEventListener(type, cb),
          addListener: (cb) => result.addListener?.(cb),
          removeListener: (cb) => result.removeListener?.(cb),
          dispatchEvent: (ev) => result.dispatchEvent(ev)
        };
      }
      return result;
    };
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
  });

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await seed(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.now-card-resume-hit, .now-card-play', { timeout: 15000 });
  await page.locator('.now-card-play').first().click();
  await page.waitForFunction(
    () => document.querySelector('.main-wrap')?.getAttribute('data-player-chrome') === 'mini',
    { timeout: 15000 }
  );

  await page.waitForSelector('.mini-player.show', { timeout: 15000 });
  await page.waitForSelector('.bottom-shell', { timeout: 5000 });

  const metrics = await readLayoutMetrics(page);
  if (!metrics) {
    record('layout-metrics', 'fail', '缺少 mini player / bottom shell / main-content');
    await browser.close();
    process.exit(1);
  }

  record(
    'standalone-class',
    metrics.standaloneClass ? 'pass' : 'fail',
    metrics.standaloneClass ? 'html.standalone-pwa 已启用' : 'standalone class 未设置'
  );

  record(
    'app-vh',
    metrics.appVh ? 'pass' : 'fail',
    metrics.appVh ? `--app-vh = ${metrics.appVh}` : '--app-vh 未同步'
  );

  record(
    'mini-nav-gap',
    Math.abs(metrics.gapMiniToNav) <= 2 ? 'pass' : 'fail',
    `mini player 与 tab bar 间距 ${metrics.gapMiniToNav.toFixed(1)}px（期望 ≤2px）`
  );

  record(
    'shell-bottom-anchor',
    Math.abs(metrics.shellBottomOffset) <= 2 ? 'pass' : 'fail',
    `bottom-shell 距视口底 ${metrics.shellBottomOffset.toFixed(1)}px（期望 ≤2px）`
  );

  const expectedMiniBottom = metrics.tabbarTotal;
  record(
    'no-double-safe-area',
    metrics.miniComputedBottom === '0px' || metrics.miniComputedBottom === 'auto'
      ? 'pass'
      : 'fail',
    `mini player bottom = ${metrics.miniComputedBottom}（bottom-shell 内应为 auto/0）`
  );

  const minContentPad = metrics.tabbarTotal + metrics.miniH + 20;
  record(
    'main-padding',
    metrics.mainPadding >= minContentPad - 4 ? 'pass' : 'fail',
    `main padding-bottom ${metrics.mainPadding.toFixed(0)}px（期望 ≥ ${minContentPad.toFixed(0)}px）`
  );

  const expectedChrome = metrics.expectedFromLayout || metrics.tabbarTotal + metrics.miniH;
  const chromeMeasured = metrics.shellHeight;
  record(
    'bottom-chrome-h',
    Math.abs(chromeMeasured - expectedChrome) <= 4 ? 'pass' : 'fail',
    `bottom shell ${chromeMeasured.toFixed(0)}px（期望 ≈ ${expectedChrome.toFixed(0)}px）`
  );

  try {
    const swPath = join(appRoot, 'build/sw.js');
    const sw = readFileSync(swPath, 'utf8');
    const hasPlaceholder = sw.includes('__MUSICOS_BUILD_ID__');
    record(
      'sw-cache-version',
      hasPlaceholder ? 'fail' : 'pass',
      hasPlaceholder ? 'sw.js 仍含未替换的 BUILD_ID 占位符' : 'sw.js BUILD_ID 已在 build 时注入'
    );
  } catch {
    record('sw-cache-version', 'fail', '未找到 build 产物 sw.js，请先 npm run build');
  }

  await browser.close();

  const failed = results.filter((r) => r.severity === 'fail');
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
