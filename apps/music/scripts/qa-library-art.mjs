/**
 * QA: full library art flow — cloud-only tracks (like synced library) + library page UI.
 */
import { chromium } from 'playwright';

const BASE = process.env.MUSIC_QA_BASE || 'http://127.0.0.1:5189';

/** Simulates bulk-synced / cloud-only library entries */
const CLOUD_TRACKS = [
  {
    id: 'qa-feiniaochan',
    title: '飞鸟和蝉',
    artist: '任然',
    album: '飞鸟和蝉',
    albumKey: '任然::飞鸟和蝉',
    artistKey: '任然'
  },
  {
    id: 'qa-antihero',
    title: 'Anti-Hero',
    artist: 'Taylor Swift',
    album: 'Midnights',
    albumKey: 'taylor swift::midnights',
    artistKey: 'taylor swift'
  },
  {
    id: 'qa-blinding',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    albumKey: 'the weeknd::after hours',
    artistKey: 'the weeknd'
  }
];

/** @type {{ step: string, status: 'pass'|'fail', detail: string }[]} */
const report = [];
const log = (step, status, detail) => {
  report.push({ step, status, detail });
  console.log(`${status === 'pass' ? '✓' : '✗'} [${step}] ${detail}`);
};

async function seedCloudLibrary(page) {
  await page.evaluate(async () => {
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase('musicos_library');
      req.onsuccess = () => r(undefined);
      req.onblocked = () => r(undefined);
    });
  });

  await page.evaluate(
    async (tracks) => {
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('musicos_library', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore('tracks', { keyPath: 'id' });
          db.createObjectStore('playlists', { keyPath: 'id' });
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('tracks', 'readwrite');
          const store = tx.objectStore('tracks');
          for (const t of tracks) {
            store.put({
              ...t,
              duration: 200,
              mime: 'audio/mpeg',
              size: 5_000_000,
              addedAt: Date.now(),
              playCount: 0,
              liked: 0,
              storagePath: `qa-user/${t.id}.mp3`,
              words: `${t.title} ${t.artist} ${t.album}`.toLowerCase().split(/\s+/).filter(Boolean)
            });
          }
          tx.oncomplete = () => resolve(undefined);
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    CLOUD_TRACKS
  );
}

async function readDbArt(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('musicos_library');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tracks = await new Promise((res, rej) => {
      const tx = db.transaction('tracks', 'readonly');
      const q = tx.objectStore('tracks').getAll();
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    db.close();
    return tracks.map((t) => ({
      title: t.title,
      hasArtBlob: t.artBlob instanceof Blob,
      artRemoteUrl: t.artRemoteUrl?.slice(0, 50) || null
    }));
  });
}

async function libraryArtStats(page) {
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.track-row-art')];
    const https = imgs.filter((i) => i instanceof HTMLImageElement && i.src.startsWith('https://'));
    const blob = imgs.filter((i) => i instanceof HTMLImageElement && i.src.startsWith('blob:'));
    const placeholder = imgs.filter((i) => i instanceof HTMLDivElement);
    return { total: imgs.length, https: https.length, blob: blob.length, placeholder: placeholder.length };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();

// Cloud sniff fails → forces iTunes path
await page.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.includes('supabase.co/storage')) {
    await route.fulfill({ status: 416, body: '' });
    return;
  }
  await route.continue();
});

try {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await seedCloudLibrary(page);

  await page.goto(`${BASE}/library`, { waitUntil: 'networkidle', timeout: 15000 });

  // Wait until at least 2 of 3 rows show real https artwork (iTunes lookup is async)
  await page.waitForFunction(
    () => {
      const imgs = [...document.querySelectorAll('.track-row-art')];
      const loaded = imgs.filter(
        (i) => i instanceof HTMLImageElement && i.src.startsWith('https://') && i.complete && i.naturalWidth > 0
      );
      return loaded.length >= 2;
    },
    { timeout: 90000 }
  );

  const stats = await libraryArtStats(page);
  if (stats.https >= 2) {
    log('library-ui', 'pass', `${stats.https}/${stats.total} rows show iTunes cover (${stats.placeholder} placeholders)`);
  } else {
    log('library-ui', 'fail', JSON.stringify(stats));
  }

  const dbArt = await readDbArt(page);
  const withRemote = dbArt.filter((t) => t.artRemoteUrl);
  if (withRemote.length >= 2) {
    log('db-persist', 'pass', `${withRemote.length}/${dbArt.length} tracks have artRemoteUrl`);
  } else {
    log('db-persist', 'fail', JSON.stringify(dbArt));
  }

  const feiniao = dbArt.find((t) => t.title === '飞鸟和蝉');
  if (feiniao?.artRemoteUrl) {
    log('feiniaochan', 'pass', `飞鸟和蝉 cover: ${feiniao.artRemoteUrl}…`);
  } else {
    log('feiniaochan', 'fail', JSON.stringify(feiniao));
  }

  // Reload — covers must survive
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.track-row-art', { timeout: 10000 });

  const afterReload = await page.evaluate(async () => {
    const img = document.querySelector('.track-row-art');
    if (!(img instanceof HTMLImageElement)) return { ok: false, reason: 'no-img' };
    await new Promise((res, rej) => {
      if (img.complete && img.naturalWidth > 0) return res(undefined);
      img.onload = () => res(undefined);
      img.onerror = () => rej(new Error('img-error'));
      setTimeout(() => rej(new Error('timeout')), 8000);
    });
    return { ok: true, src: img.src.slice(0, 55), w: img.naturalWidth };
  });

  if (afterReload.ok && afterReload.src?.startsWith('https://')) {
    log('reload', 'pass', `cover persists after reload (${afterReload.w}px)`);
  } else {
    log('reload', 'fail', JSON.stringify(afterReload));
  }

  // Browse page album grid
  await page.goto(`${BASE}/browse`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(
    () => {
      const img = document.querySelector('.album-card-art');
      return img instanceof HTMLImageElement && img.src.startsWith('https://') && img.naturalWidth > 0;
    },
    { timeout: 30000 }
  );
  log('browse-grid', 'pass', 'album grid shows remote cover');
} finally {
  await browser.close();
}

const failed = report.filter((r) => r.status === 'fail');
console.log(`\n--- Summary ---\n${report.length - failed.length}/${report.length} passed`);
if (failed.length) process.exit(1);
