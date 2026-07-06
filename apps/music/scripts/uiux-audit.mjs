/**
 * Music OS UI/UX walkthrough — desktop + mobile
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:5189';
const OUT = join(process.cwd(), '.qa-screenshots/uiux-audit');
const issues = [];

function issue(id, severity, flow, title, detail, screenshot = '') {
  issues.push({ id, severity, flow, title, detail, screenshot });
}

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return name + '.png';
}

async function wait(page, ms = 500) {
  await page.waitForTimeout(ms);
}

async function seedLibrary(page) {
  await page.evaluate(async () => {
    const req = indexedDB.open('musicos_library', 1);
    await new Promise((resolve, reject) => {
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tracks')) {
          db.createObjectStore('tracks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('recent')) {
          db.createObjectStore('recent', { keyPath: 'trackId' });
        }
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const db = req.result;
    const now = Date.now();
    const samples = [
      {
        id: 'qa-1',
        title: '夜曲',
        artist: '周杰伦',
        album: '十一月的萧邦',
        albumKey: '十一月的萧邦',
        artistKey: '周杰伦',
        duration: 226,
        mime: 'audio/mpeg',
        size: 0,
        addedAt: now - 86400000,
        playCount: 12,
        liked: 1,
        words: ['夜曲', '周杰伦', '十一月的萧邦']
      },
      {
        id: 'qa-2',
        title: '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        albumKey: '叶惠美',
        artistKey: '周杰伦',
        duration: 269,
        mime: 'audio/mpeg',
        size: 0,
        addedAt: now - 172800000,
        playCount: 8,
        liked: 0,
        words: ['晴天', '周杰伦', '叶惠美']
      },
      {
        id: 'qa-3',
        title: '稻香',
        artist: '周杰伦',
        album: '魔杰座',
        albumKey: '魔杰座',
        artistKey: '周杰伦',
        duration: 223,
        mime: 'audio/mpeg',
        size: 0,
        addedAt: now,
        playCount: 3,
        liked: 0,
        words: ['稻香', '周杰伦', '魔杰座']
      }
    ];
    const tx = db.transaction(['tracks', 'recent'], 'readwrite');
    for (const t of samples) tx.objectStore('tracks').put(t);
    tx.objectStore('recent').put({ trackId: 'qa-1', playedAt: now - 3600000 });
    await new Promise((r, j) => {
      tx.oncomplete = r;
      tx.onerror = j;
    });
  });
}

async function checkAppBarSearch(page, flow, shots) {
  const styles = await page.evaluate(() => {
    const desktop = document.querySelector('.appbar-search-desktop');
    const mobile = document.querySelector('.appbar-search-mobile');
    const input = document.querySelector('.appbar-search-input');
    return {
      desktopDisplay: desktop ? getComputedStyle(desktop).display : 'missing',
      mobileDisplay: mobile ? getComputedStyle(mobile).display : 'missing',
      inputVisible: input ? input.offsetParent !== null : false,
      viewport: window.innerWidth
    };
  });
  if (styles.viewport >= 861 && styles.desktopDisplay === 'none') {
    issue(
      'D-04',
      'critical',
      flow,
      '桌面全局搜索框被 CSS 隐藏',
      `appbar-search-desktop display=${styles.desktopDisplay}；Svelte scoped 内 @media (--life-os-desktop) 可能未生效`,
      shots
    );
  }
  if (styles.viewport >= 861 && styles.mobileDisplay !== 'none') {
    issue(
      'D-05',
      'medium',
      flow,
      '桌面仍显示移动端搜索图标',
      `appbar-search-mobile display=${styles.mobileDisplay}`,
      shots
    );
  }
}

async function desktopFlow(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(BASE);
  await seedLibrary(page);
  await page.reload();
  await wait(page, 1200);

  let s = await shot(page, '01-desktop-home');
  await checkAppBarSearch(page, '首页', s);

  // Home content checks
  const sections = await page.locator('.page-section-title').allTextContents();
  if (!sections.some((t) => t.includes('最近'))) {
    issue('D-01', 'medium', '首页', '首页缺少任务型模块', `sections: ${sections.join(', ')}`, s);
  }
  if (await page.locator('.mini-player.show').count()) {
    /* ok */
  } else {
    issue('D-02', 'low', '首页', '无播放时 MiniPlayer 隐藏', '符合预期，但首屏看不到播放系统占位', s);
  }

  // Library
  await page.goto(`${BASE}/library`);
  await wait(page, 1000);
  s = await shot(page, '02-desktop-library');
  await checkAppBarSearch(page, '资料库', s);

  const table = await page.locator('.track-table').count();
  if (table === 0) {
    issue('D-06', 'high', '资料库', '桌面未渲染 TrackTable', '1440px 下应为表格', s);
  } else {
    const wrapMax = await page.evaluate(() => {
      const el = document.querySelector('.library-page');
      return el ? getComputedStyle(el).maxWidth : 'n/a';
    });
    if (wrapMax === '920px') {
      issue('D-07', 'medium', '资料库', '宽内容区未解锁', `max-width 仍为 ${wrapMax}`, s);
    }
    await page.locator('#library-filter').fill('夜');
    await wait(page, 200);
    s = await shot(page, '02b-desktop-library-filter');
  }

  // Search page (fallback since appbar search broken)
  await page.goto(`${BASE}/search?q=周`);
  await wait(page);
  s = await shot(page, '04-desktop-search-results');
  const scopes = await page.locator('.search-scopes button').count();
  if (scopes < 5) issue('D-08', 'medium', '搜索', 'Scope 切换不完整', `仅 ${scopes} 个`, s);

  // Browse
  await page.goto(`${BASE}/browse`);
  await wait(page);
  s = await shot(page, '05-desktop-browse-albums');
  if ((await page.locator('.browse-scopes button').count()) < 4) {
    issue('D-09', 'medium', '浏览', '四 scope 未齐全', '', s);
  }
  await page.locator('.browse-scopes button').nth(2).click();
  await wait(page);
  await shot(page, '06-desktop-browse-tracks');

  // Playlists + liked via sidebar
  await page.goto(`${BASE}/playlists`);
  await wait(page);
  await shot(page, '07-desktop-playlists');
  await page.goto(`${BASE}/liked`);
  await wait(page);
  await shot(page, '07b-desktop-liked');

  // Play flow
  await page.goto(`${BASE}/library`);
  await wait(page);
  const playBtn = page.locator('.track-table-icon-btn.play').first();
  if ((await playBtn.count()) > 0) {
    await playBtn.click();
    await wait(page, 800);
    s = await shot(page, '08-desktop-mini-player');
    if ((await page.locator('.mini-player.show').count()) === 0) {
      issue('D-10', 'high', '播放', '播放后 MiniPlayer 未出现', '', s);
    }
    const centerVisible = await page.evaluate(() => {
      const el = document.querySelector('.mini-player-center');
      return el ? getComputedStyle(el).display !== 'none' : false;
    });
    if (!centerVisible) {
      issue('D-11', 'high', '播放', '桌面 MiniPlayer 无完整控制区', 'mini-player-center 仍为 display:none', s);
    }

    // Queue utility pane
    const btns = page.locator('.mini-player-actions button, .mini-player-actions a');
    const n = await btns.count();
    for (let i = 0; i < n; i++) {
      const label = await btns.nth(i).getAttribute('aria-label');
      if (label?.includes('队列')) {
        await btns.nth(i).click();
        break;
      }
    }
    await wait(page);
    s = await shot(page, '09-desktop-utility-pane');
    if ((await page.locator('.utility-pane').count()) === 0) {
      issue('D-12', 'medium', '播放', 'UtilityPane 未打开', '点击队列按钮后无右侧面板', s);
    }

    await page.locator('.mini-player-link').click();
    await wait(page, 800);
    await shot(page, '10-desktop-now-playing');
  }

  await page.goto(`${BASE}/import`);
  await wait(page);
  await shot(page, '12-desktop-import');
  await page.goto(`${BASE}/settings`);
  await wait(page);
  await shot(page, '11-desktop-settings');

  // Sidebar active
  await page.goto(`${BASE}/library`);
  await wait(page);
  if ((await page.locator('.music-sidebar .nav-item.active').count()) === 0) {
    issue('D-13', 'low', '导航', '侧栏激活态缺失', '', '02-desktop-library');
  }

  await ctx.close();
}

async function mobileFlow(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await wait(page, 1000);
  let s = await shot(page, '20-mobile-home');

  const tabs = await page.locator('.nav .nav-item, .bottom-nav .nav-item').count();
  if (tabs < 5) issue('M-01', 'high', '导航', '底栏 tab 不足 5 个', `实际 ${tabs}`, s);

  const more = page.locator('.nav-item-more');
  if ((await more.count()) > 0) {
    await more.click();
    await wait(page);
    s = await shot(page, '21-mobile-more-sheet');
    if ((await page.locator('.mobile-more-sheet').count()) === 0) {
      issue('M-02', 'high', '导航', 'More Sheet 未弹出', '', s);
    }
    await page.keyboard.press('Escape');
    await wait(page);
  } else {
    issue('M-02', 'high', '导航', '缺少 More 按钮', '', s);
  }

  await page.goto(`${BASE}/library`);
  await wait(page);
  s = await shot(page, '22-mobile-library');
  if ((await page.locator('.track-table').count()) > 0) {
    issue('M-03', 'medium', '资料库', '移动端误显示桌面表格', '', s);
  }
  if ((await page.locator('.appbar-search-mobile').count()) === 0) {
    issue('M-04', 'medium', '搜索', '移动端 AppBar 无搜索入口', '', s);
  }

  await page.goto(`${BASE}/browse`);
  await wait(page);
  await shot(page, '23-mobile-browse');
  await page.goto(`${BASE}/search`);
  await wait(page);
  await shot(page, '24-mobile-search');

  await page.goto(`${BASE}/library`);
  await wait(page);
  // hover to reveal play on mobile - use force click on row body
  await page.locator('.track-row-body').first().click();
  await wait(page, 800);
  s = await shot(page, '25-mobile-mini-player');

  await page.goto(`${BASE}/playlists`);
  await wait(page);
  await shot(page, '26-mobile-playlists');

  await ctx.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    await desktopFlow(browser);
    await mobileFlow(browser);
  } finally {
    await browser.close();
  }

  const report = `# Music OS UI/UX 走查报告

生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

截图目录: \`apps/music/.qa-screenshots/uiux-audit/\`

## 问题汇总 (${issues.length} 项)

| ID | 严重度 | 流程 | 问题 | 详情 | 截图 |
|----|--------|------|------|------|------|
${issues.map((i) => `| ${i.id} | ${i.severity} | ${i.flow} | ${i.title} | ${i.detail} | ${i.screenshot || '—'} |`).join('\n')}

## 走查覆盖

- 桌面 1440：首页、资料库（表格/过滤）、搜索、浏览、歌单、喜欢、播放链路、Now Playing、导入、设置
- 移动 390：首页、More Sheet、资料库、浏览、搜索、播放、歌单

## 截图索引

见目录内 \`01-*\` 至 \`26-*\` PNG 文件。
`;

  await writeFile(join(OUT, 'REPORT.md'), report, 'utf8');
  console.log(`Issues: ${issues.length}`);
  issues.forEach((i) => console.log(`[${i.severity}] ${i.id} ${i.title}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
