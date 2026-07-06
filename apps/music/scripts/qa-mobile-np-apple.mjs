/**
 * Mobile Now Playing Apple-style visual QA + contrast audit
 * Usage: npm run preview -- --port 5191 && node scripts/qa-mobile-np-apple.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MUSIC_QA_URL ?? 'http://127.0.0.1:5191';
const appRoot = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(appRoot, '.qa-screenshots', 'mobile-np-apple');
mkdirSync(outDir, { recursive: true });

/** Reliable cover for blur + palette QA */
const ART = 'https://picsum.photos/seed/music-np-apple/800/800';

const TRACK = {
  id: 'qa-np-apple-1',
  title: "STAR WALKIN'",
  artist: 'Lil Nas X',
  album: 'League of Legends',
  albumKey: 'league-of-legends',
  artistKey: 'lil-nas-x',
  duration: 211,
  mime: 'audio/mpeg',
  size: 0,
  addedAt: Date.now(),
  playCount: 1,
  liked: 0,
  artRemoteUrl: ART,
  artUrl: ART,
  words: ['star', 'walkin', 'lil', 'nas'],
  lyrics: `[00:12.00] Don't ever say it's over if I'm breathing
[00:16.50] Racing to the moonlight and I'm speeding
[00:21.00] I'm headed to the stars ready to go far
[00:25.50] Can't stop now no I won't slow down`
};

/** @type {{ id: string, severity: 'pass'|'warn'|'fail', area: string, detail: string, shot?: string }[]} */
const findings = [];

function finding(id, severity, area, detail, shot = '') {
  findings.push({ id, severity, area, detail, shot });
}

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
        currentTime: 13,
        playing: false
      })
    );

    await new Promise((resolve) => {
      const del = indexedDB.deleteDatabase('musicos_library');
      del.onsuccess = resolve;
      del.onerror = resolve;
      del.onblocked = resolve;
    });

    const req = indexedDB.open('musicos_library');
    await new Promise((resolve, reject) => {
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
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

async function auditContrast(page) {
  return page.evaluate(() => {
    const parseRgb = (c) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };
    const lum = ([r, g, b]) => {
      const f = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    };
    const ratio = (fg, bg) => {
      const a = lum(fg);
      const b = lum(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const bgSample = parseRgb(getComputedStyle(document.querySelector('.np-ambient-back-scrim') || document.body).backgroundColor) || [18, 14, 12];

    /** @param {string} sel @param {string} label */
    const check = (sel, label) => {
      const el = document.querySelector(sel);
      if (!el) return { label, missing: true };
      const fg = parseRgb(getComputedStyle(el).color);
      if (!fg) return { label, missing: true };
      const r = ratio(fg, bgSample);
      return { label, color: getComputedStyle(el).color, contrast: Number(r.toFixed(2)), ok: r >= 4.5 };
    };

    return {
      mode: document.querySelector('.np-mobile-compact-head') ? 'lyrics|queue' : document.querySelector('.np-mobile-cover-stage') ? 'player' : 'unknown',
      artLoaded: (() => {
        const img = document.querySelector('.np-mobile-art, .now-playing-art');
        return img instanceof HTMLImageElement ? img.naturalWidth > 0 : Boolean(document.querySelector('.np-mobile-art.placeholder, .now-playing-art.placeholder'));
      })(),
      ambientArtLoaded: (() => {
        const img = document.querySelector('.np-ambient-back-art');
        return img instanceof HTMLImageElement ? img.naturalWidth > 0 : false;
      })(),
      checks: [
        check('.now-playing-title', 'title'),
        check('.now-playing-artist', 'artist'),
        check('.np-mobile-progress-times span', 'time'),
        check('.player-controls--apple .ctrl-main', 'play'),
        check('.np-mobile-dock-btn', 'dock')
      ]
    };
  });
}

async function shot(page, name) {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return name + '.png';
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: 'light'
});
const page = await ctx.newPage();

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await seed(page);
  await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
  await page.goto(`${BASE}/now-playing`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForSelector('.np-mobile-chrome', { timeout: 20000 });
  await page.waitForTimeout(2200);

  const s1 = await shot(page, '01-player');
  const a1 = await auditContrast(page);
  console.log('player audit:', JSON.stringify(a1, null, 2));
  if (!a1.artLoaded) finding('A-01', 'warn', 'cover', '封面未加载或已回退 placeholder', s1);
  if (!a1.ambientArtLoaded) finding('A-02', 'warn', 'ambient', '模糊背景图未加载（mesh 仍可用）', s1);
  for (const c of a1.checks) {
    if (c.missing) finding('C-' + c.label, 'fail', c.label, '元素缺失', s1);
    else if (!c.ok) finding('C-' + c.label, c.contrast >= 3 ? 'warn' : 'fail', c.label, `对比度 ${c.contrast}:1 (${c.color})`, s1);
    else finding('C-' + c.label, 'pass', c.label, `对比度 ${c.contrast}:1 OK`, s1);
  }

  await page.locator('.np-mobile-dock-btn').first().evaluate((el) => el.click());
  await page.waitForSelector('.np-mobile-compact-head', { timeout: 5000 });
  await page.waitForTimeout(800);
  const s2 = await shot(page, '02-lyrics');
  const a2 = await auditContrast(page);
  console.log('lyrics audit:', JSON.stringify(a2, null, 2));
  if (a2.mode !== 'lyrics|queue') finding('V-02', 'fail', 'lyrics', '未切换到歌词紧凑顶栏', s2);

  await page.locator('.np-mobile-dock-btn').last().evaluate((el) => el.click());
  await page.waitForSelector('.np-mobile-stage--queue', { timeout: 5000 });
  await page.waitForTimeout(800);
  const s3 = await shot(page, '03-queue');
  finding('V-03', 'pass', 'queue', '播放清单视图', s3);

  await page.locator('.np-mobile-compact-main').evaluate((el) => el.click());
  await page.waitForSelector('.np-mobile-cover-stage', { timeout: 5000 });
  await page.waitForTimeout(500);
  await shot(page, '04-back-to-player');
} catch (e) {
  finding('X-01', 'fail', 'run', String(e.message || e));
  console.error('QA failed:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

const report = [
  '# Mobile Now Playing · Apple 风截图走查',
  '',
  `时间：${new Date().toISOString()}`,
  `环境：${BASE} · 390×844 · theme=light · albumAmbience=on`,
  '',
  '## 截图',
  '',
  '| 文件 | 视图 |',
  '|------|------|',
  '| 01-player.png | 封面主视图 |',
  '| 02-lyrics.png | 歌词 |',
  '| 03-queue.png | 播放清单 |',
  '| 04-back-to-player.png | 返回封面 |',
  '',
  '## 检查结果',
  '',
  ...findings.map((f) => `- **[${f.severity.toUpperCase()}] ${f.id}** (${f.area}) ${f.detail}${f.shot ? ` · \`${f.shot}\`` : ''}`),
  ''
].join('\n');

writeFileSync(join(outDir, 'REPORT.md'), report);
console.log(`Screenshots → ${outDir}`);
console.log(`Report → ${join(outDir, 'REPORT.md')}`);
