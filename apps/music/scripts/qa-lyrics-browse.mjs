/**
 * Lyrics UI browse QA — desktop + mobile screenshots with issue markers.
 * Usage: node scripts/qa-lyrics-browse.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MUSIC_QA_URL ?? 'http://127.0.0.1:5189';
const appRoot = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(appRoot, '.qa-screenshots', 'lyrics-browse');
mkdirSync(outDir, { recursive: true });

/** @type {{ id: string, severity: 'high'|'medium'|'low', page: string, viewport: string, issue: string }[]} */
const issues = [];

function mark(severity, page, viewport, issue) {
  issues.push({ id: `L-${issues.length + 1}`, severity, page, viewport, issue });
}

async function fetchLyrics(title, artist, duration) {
  const res = await fetch(`${BASE}/api/lyrics/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, artist, duration })
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data?.text || '';
}

const SYNCED_LYRICS = await fetchLyrics('稻香', '周杰伦', 220);
const PLAIN_TRACK = {
  id: 'qa-lyrics-empty-001',
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  album: 'A Night at the Opera',
  duration: 354,
  lyrics: ''
};
const SYNCED_TRACK = {
  id: 'qa-lyrics-synced-002',
  title: '稻香',
  artist: '周杰伦',
  album: '魔杰座',
  duration: 220,
  lyrics: SYNCED_LYRICS
};
const PLAIN_LYRICS_TRACK = {
  id: 'qa-lyrics-plain-003',
  title: 'Imagine',
  artist: 'John Lennon',
  album: 'Imagine',
  duration: 183,
  lyrics: 'Imagine there\'s no heaven\nIt\'s easy if you try\nNo hell below us\nAbove us only sky'
};

async function seedTracks(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.waitForLoadState('domcontentloaded');
      return await page.evaluate(
    async (tracks) => {
      const slug = (s) => (s || 'unknown').trim().toLowerCase() || 'unknown';
      return new Promise((resolve) => {
        const req = indexedDB.open('musicos_library');
        req.onupgradeneeded = () => {};
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('tracks', 'readwrite');
          const store = tx.objectStore('tracks');
          for (const track of tracks) {
            store.put({
              id: track.id,
              title: track.title,
              artist: track.artist,
              album: track.album,
              albumKey: slug(`${track.artist}::${track.album}`),
              artistKey: slug(track.artist),
              duration: track.duration,
              mime: 'audio/mpeg',
              size: 1,
              addedAt: Date.now(),
              playCount: 0,
              liked: 0,
              lyrics: track.lyrics || '',
              words: `${track.title} ${track.artist} ${track.album}`.toLowerCase().split(/\s+/).filter(Boolean)
            });
          }
          tx.oncomplete = () => resolve({ ok: true, count: tracks.length });
          tx.onerror = () => resolve({ ok: false });
        };
        req.onerror = () => resolve({ ok: false });
      });
    },
    [SYNCED_TRACK, PLAIN_TRACK, PLAIN_LYRICS_TRACK]
  );
    } catch (err) {
      if (!String(err).includes('Execution context was destroyed') || attempt === 2) throw err;
      await page.waitForTimeout(600);
    }
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {string} trackTitle
 */
async function playTrack(page, trackTitle) {
  await page.goto(`${BASE}/library`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.track-row', { timeout: 15_000 });
  const row = page.locator('.track-row').filter({ hasText: trackTitle }).first();
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  await row.getByRole('button', { name: '播放' }).click();
  await page.waitForSelector('.mini-player.show', { timeout: 10_000 });
  await page.locator('a.mini-player-link').click();
  await page.waitForURL('**/now-playing', { timeout: 10_000 });
  await page.waitForTimeout(1200);
}

/**
 * @param {import('playwright').Page} page
 * @param {string} name
 */
async function shot(page, name) {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

const browser = await chromium.launch({ headless: true });

// --- Desktop ---
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const dPage = await desktop.newPage();

await dPage.goto(`${BASE}/library`, { waitUntil: 'domcontentloaded' });
await seedTracks(dPage);
await dPage.reload({ waitUntil: 'domcontentloaded' });
await dPage.waitForSelector('.track-row', { timeout: 15_000 });

// Settings
await dPage.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
await dPage.waitForTimeout(800);
const settingsText = await dPage.locator('.wrap').innerText();
await shot(dPage, '01-desktop-settings');

if (!settingsText.includes('补抓歌词')) {
  mark('high', 'settings', 'desktop', '设置页未显示「补抓歌词」按钮');
}
if (!/首有音频但尚未获取歌词|missingLyrics/i.test(settingsText) && !settingsText.includes('尚未获取歌词')) {
  mark('medium', 'settings', 'desktop', '缺歌词统计文案未展示（可能已全部有歌词或计数为 0）');
}

const fetchBtn = dPage.getByRole('button', { name: '补抓歌词' });
if (await fetchBtn.isVisible()) {
  const disabled = await fetchBtn.isDisabled();
  if (disabled) mark('low', 'settings', 'desktop', '「补抓歌词」按钮处于禁用状态');
}

// Now playing — synced lyrics
await playTrack(dPage, '稻香');
const syncedLyrics = dPage.locator('.now-playing-lyrics');
const syncedEmpty = dPage.locator('.now-playing-lyrics-empty');
await shot(dPage, '02-desktop-now-playing-synced');

if (await syncedEmpty.isVisible()) {
  mark('high', 'now-playing', 'desktop', '「稻香」应有同步歌词，但显示空态');
} else {
  const hasSyncedTag = await dPage.locator('.now-playing-lyrics-tag').isVisible();
  if (!hasSyncedTag) mark('medium', 'now-playing', 'desktop', 'LRC 歌词未显示「同步」标签');
  const lineCount = await dPage.locator('.now-playing-lyrics-line').count();
  if (lineCount < 5) mark('high', 'now-playing', 'desktop', `同步歌词行数过少（${lineCount} 行）`);
  const lyricsBox = await syncedLyrics.boundingBox().catch(() => null);
  const layout = await dPage.locator('.now-playing-layout').boundingBox().catch(() => null);
  if (lyricsBox && layout && lyricsBox.height < 120) {
    mark('medium', 'now-playing', 'desktop', '歌词区域高度偏小，长歌词可滚动空间不足');
  }
}

// Now playing — empty lyrics (auto-fetch pending)
await playTrack(dPage, 'Bohemian Rhapsody');
await shot(dPage, '03-desktop-now-playing-empty-initial');
const emptyVisible = await syncedEmpty.isVisible();
const emptyText = await syncedEmpty.innerText().catch(() => '');
if (!emptyVisible) {
  mark('medium', 'now-playing', 'desktop', '无歌词曲目未显示空态（可能已自动抓取成功）');
} else if (!emptyText.includes('网络') && !emptyText.includes('获取')) {
  mark('low', 'now-playing', 'desktop', '空态文案未提及自动网络获取');
}

// Wait for lazy fetch
await dPage.waitForTimeout(14000);
await shot(dPage, '04-desktop-now-playing-empty-after-fetch');
const afterFetchEmpty = await syncedEmpty.isVisible();
const afterFetchLines = await dPage.locator('.now-playing-lyrics-line').count();
if (afterFetchEmpty) {
  mark('medium', 'now-playing', 'desktop', '懒加载 14s 后仍未获取到 Bohemian Rhapsody 歌词');
} else if (afterFetchLines > 0) {
  const hasSyncedTag = await dPage.locator('.now-playing-lyrics-tag').isVisible();
  if (!hasSyncedTag) mark('low', 'now-playing', 'desktop', '自动抓取的歌词为纯文本，无时间轴同步');
}

// Now playing — plain lyrics
await playTrack(dPage, 'Imagine');
await shot(dPage, '05-desktop-now-playing-plain');
const plainSyncedTag = await dPage.locator('.now-playing-lyrics-tag').isVisible();
if (plainSyncedTag) mark('low', 'now-playing', 'desktop', '纯文本歌词误显示「同步」标签');
const plainLines = await dPage.locator('.now-playing-lyrics-line').count();
if (plainLines < 2) mark('high', 'now-playing', 'desktop', '纯文本歌词未正确渲染');

await desktop.close();

// --- Mobile ---
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
});
const mPage = await mobile.newPage();

await mPage.goto(`${BASE}/library`, { waitUntil: 'domcontentloaded' });
await seedTracks(mPage);
await mPage.reload({ waitUntil: 'domcontentloaded' });
await mPage.waitForSelector('.track-row', { timeout: 15_000 });

await mPage.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
await mPage.waitForTimeout(800);
await shot(mPage, '06-mobile-settings');
const mSettingsText = await mPage.locator('.wrap').innerText();
const mFetchBtn = mPage.getByRole('button', { name: '补抓歌词' });
if (!(await mFetchBtn.isVisible())) {
  mark('high', 'settings', 'mobile', '移动端设置页看不到「补抓歌词」按钮');
}
const settingsBtnGroup = mPage.locator('.settings-btn-group').first();
const groupBox = await settingsBtnGroup.boundingBox();
if (groupBox && groupBox.width > 390) {
  mark('medium', 'settings', 'mobile', '设置页按钮组可能横向溢出视口');
}

await playTrack(mPage, '稻香');
await shot(mPage, '07-mobile-now-playing-synced');
const mLyrics = mPage.locator('.now-playing-lyrics-body');
const mLyricsBox = await mLyrics.boundingBox();
const mViewport = mPage.viewportSize();
if (mLyricsBox && mViewport && mLyricsBox.height > mViewport.height * 0.55) {
  mark('medium', 'now-playing', 'mobile', '歌词区占据过多竖屏空间，挤压封面与控制区');
}
const artCol = await mPage.locator('.now-playing-art-col').boundingBox();
const mainCol = await mPage.locator('.now-playing-main-col').boundingBox();
if (artCol && mainCol && mainCol.y < artCol.y + artCol.height * 0.5) {
  mark('low', 'now-playing', 'mobile', '封面与歌词主栏布局可能重叠或间距过紧');
}

await playTrack(mPage, 'Bohemian Rhapsody');
await mPage.waitForTimeout(3000);
await shot(mPage, '08-mobile-now-playing-empty');
const mEmpty = await mPage.locator('.now-playing-lyrics-empty').isVisible();
if (mEmpty) {
  const mEmptyText = await mPage.locator('.now-playing-lyrics-empty').innerText();
  if (mEmptyText.length > 60) {
    mark('medium', 'now-playing', 'mobile', '空态提示文案过长，小屏上可能换行拥挤');
  }
}

await mobile.close();
await browser.close();

// Report
const reportPath = join(outDir, 'REPORT.md');
const lines = [
  '# 歌词 UI 浏览 QA 报告',
  '',
  `时间: ${new Date().toISOString()}`,
  `Base URL: ${BASE}`,
  '',
  '## 截图',
  '',
  '| 文件 | 说明 |',
  '|------|------|',
  '| 01-desktop-settings.png | 桌面 · 设置页歌词相关 |',
  '| 02-desktop-now-playing-synced.png | 桌面 · 同步歌词（稻香） |',
  '| 03-desktop-now-playing-empty-initial.png | 桌面 · 无歌词初始态 |',
  '| 04-desktop-now-playing-empty-after-fetch.png | 桌面 · 懒加载 14s 后 |',
  '| 05-desktop-now-playing-plain.png | 桌面 · 纯文本歌词 |',
  '| 06-mobile-settings.png | 移动 · 设置页 |',
  '| 07-mobile-now-playing-synced.png | 移动 · 同步歌词 |',
  '| 08-mobile-now-playing-empty.png | 移动 · 无歌词 |',
  '',
  '## 问题清单',
  ''
];

if (!issues.length) {
  lines.push('_未发现明显问题_');
} else {
  for (const i of issues) {
    lines.push(`- **[${i.id}] ${i.severity.toUpperCase()}** · ${i.page} / ${i.viewport}: ${i.issue}`);
  }
}

lines.push('', `合计: ${issues.length} 项问题`);

import { writeFileSync } from 'node:fs';
writeFileSync(reportPath, lines.join('\n'));

console.log(`\nScreenshots: ${outDir}`);
console.log(`Report: ${reportPath}`);
console.log(`\n=== ISSUES (${issues.length}) ===`);
for (const i of issues) {
  console.log(`[${i.severity}] ${i.page}/${i.viewport}: ${i.issue}`);
}
