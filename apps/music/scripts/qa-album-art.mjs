/**
 * QA: album cover persistence — import with embedded APIC, verify browse, reload, verify again.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MUSIC_QA_BASE || 'http://127.0.0.1:5189';
const appRoot = fileURLToPath(new URL('..', import.meta.url));
const tmpDir = join(appRoot, '.qa-tmp');

/** Smallest valid 1×1 JPEG */
const MINI_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAADwA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z',
  'base64'
);

/** @type {{ step: string, status: 'pass'|'fail', detail: string }[]} */
const report = [];
const log = (step, status, detail) => {
  report.push({ step, status, detail });
  console.log(`${status === 'pass' ? '✓' : '✗'} [${step}] ${detail}`);
};

function syncsafeSize(n) {
  return [((n >> 21) & 0x7f) | 0, ((n >> 14) & 0x7f) | 0, ((n >> 7) & 0x7f) | 0, (n & 0x7f) | 0];
}

function textFrame(id, text) {
  const body = Buffer.concat([Buffer.from([0x03]), Buffer.from(text, 'utf8')]);
  const header = Buffer.alloc(10);
  header.write(id, 0, 4, 'ascii');
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

function apicFrame(jpeg) {
  const mime = Buffer.from('image/jpeg\0', 'ascii');
  const desc = Buffer.from([0x03, 0x00]); // utf-8, empty description
  const body = Buffer.concat([Buffer.from([0x00]), mime, Buffer.from([0x03]), desc, jpeg]);
  const header = Buffer.alloc(10);
  header.write('APIC', 0, 4, 'ascii');
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

function buildTestMp3({ title, artist, album }) {
  const frames = [
    textFrame('TIT2', title),
    textFrame('TPE1', artist),
    textFrame('TALB', album),
    apicFrame(MINI_JPEG)
  ];
  const tagBody = Buffer.concat(frames);
  const tagSize = syncsafeSize(tagBody.length);
  const id3 = Buffer.concat([
    Buffer.from('ID3\x03\x00\x00'),
    Buffer.from(tagSize),
    tagBody
  ]);
  // Minimal silent MPEG frame stub so the file is recognized as audio/*
  const frame = Buffer.from([
    0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ]);
  return Buffer.concat([id3, frame]);
}

async function clearLibrary(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('musicos_library');
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve(undefined);
    });
  });
}

async function readTrackArtState(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('musicos_library');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    const tracks = await new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readonly');
      const req = tx.objectStore('tracks').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return tracks.map((t) => ({
      title: t.title,
      hasArtBlob: t.artBlob instanceof Blob,
      artBlobSize: t.artBlob instanceof Blob ? t.artBlob.size : 0,
      persistedArtUrl: typeof t.artUrl === 'string' ? t.artUrl.slice(0, 5) : null
    }));
  });
}

async function albumArtLoads(page) {
  return page.evaluate(async () => {
    const img = document.querySelector('.album-card-art');
    if (!img || !(img instanceof HTMLImageElement)) return { ok: false, reason: 'no-img' };
    if (!img.src) return { ok: false, reason: 'empty-src' };
    await new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) return resolve(undefined);
      img.onload = () => resolve(undefined);
      img.onerror = () => reject(new Error('img-error'));
      setTimeout(() => reject(new Error('img-timeout')), 5000);
    });
    return { ok: true, src: img.src.slice(0, 30), width: img.naturalWidth, height: img.naturalHeight };
  });
}

async function main() {
  await mkdir(tmpDir, { recursive: true });
  const stamp = Date.now();
  const mp3Path = join(tmpDir, `qa-cover-${stamp}.mp3`);
  await writeFile(
    mp3Path,
    buildTestMp3({
      title: `QA Cover ${stamp}`,
      artist: 'QA Artist',
      album: `QA Album ${stamp}`
    })
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    await clearLibrary(page);
    await page.reload({ waitUntil: 'networkidle' });

    await page.goto(`${BASE}/import`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(mp3Path);
    await page.waitForURL('**/library', { timeout: 15000 });

    const afterImport = await readTrackArtState(page);
    const track = afterImport[0];
    if (track?.hasArtBlob && track.artBlobSize > 0) {
      log('import-artBlob', 'pass', `artBlob persisted (${track.artBlobSize} bytes)`);
    } else {
      log('import-artBlob', 'fail', JSON.stringify(afterImport));
    }

    await page.goto(`${BASE}/browse`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.album-card-art', { timeout: 10000 });
    const firstLoad = await albumArtLoads(page);
    if (firstLoad.ok) {
      log('browse-first', 'pass', `cover loaded ${firstLoad.width}×${firstLoad.height} src=${firstLoad.src}…`);
    } else {
      log('browse-first', 'fail', firstLoad.reason || 'unknown');
    }

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.album-card-art', { timeout: 10000 });
    const afterReload = await albumArtLoads(page);
    if (afterReload.ok) {
      log('browse-after-reload', 'pass', `cover still loads ${afterReload.width}×${afterReload.height}`);
    } else {
      log('browse-after-reload', 'fail', afterReload.reason || 'unknown');
    }

    const afterReloadDb = await readTrackArtState(page);
    if (afterReloadDb[0]?.hasArtBlob) {
      log('persist-after-reload', 'pass', 'artBlob still in IndexedDB');
    } else {
      log('persist-after-reload', 'fail', JSON.stringify(afterReloadDb));
    }
  } finally {
    await browser.close();
    await rm(tmpDir, { recursive: true, force: true });
  }

  const failed = report.filter((r) => r.status === 'fail');
  console.log('\n--- Summary ---');
  console.log(`${report.length - failed.length}/${report.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
