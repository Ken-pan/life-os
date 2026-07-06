/**
 * QA: cloud-only track gets cover via iTunes lookup after repairMissingArt.
 */
import { chromium } from 'playwright';

const BASE = process.env.MUSIC_QA_BASE || 'http://127.0.0.1:5189';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  await new Promise((r) => {
    const req = indexedDB.deleteDatabase('musicos_library');
    req.onsuccess = () => r(undefined);
    req.onblocked = () => r(undefined);
  });
});

await page.evaluate(async () => {
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('musicos_library', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('tracks', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').put({
        id: 'cloud-feiniaochan',
        title: '飞鸟和蝉',
        artist: '任然',
        album: '飞鸟和蝉',
        albumKey: '任然::飞鸟和蝉',
        artistKey: '任然',
        duration: 200,
        mime: 'audio/mpeg',
        size: 8000000,
        addedAt: Date.now(),
        playCount: 0,
        liked: 0,
        storagePath: 'user/test.mp3',
        words: ['飞鸟和蝉', '任然']
      });
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    };
  });
});

// Stub signed URL fetch + cloud sniff to fail so iTunes path is exercised
await page.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.includes('supabase.co/storage')) {
    await route.fulfill({ status: 416, body: '' });
    return;
  }
  await route.continue();
});

await page.goto(`${BASE}/library`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(
  () => {
    const img = document.querySelector('.track-row-art');
    return img instanceof HTMLImageElement && img.src.startsWith('https://');
  },
  { timeout: 60000 }
);

const result = await page.evaluate(async () => {
  const img = document.querySelector('.track-row-art');
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
  return {
    src: img?.src?.slice(0, 60),
    artRemoteUrl: tracks[0]?.artRemoteUrl?.slice(0, 60)
  };
});

await browser.close();
console.log(result.src?.startsWith('https://') ? `✓ cloud+iTunes art: ${result.src}…` : '✗ no remote art');
console.log(`  persisted artRemoteUrl: ${result.artRemoteUrl}…`);
if (!result.src?.startsWith('https://')) process.exit(1);
