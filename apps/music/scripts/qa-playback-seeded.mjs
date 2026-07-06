/**
 * QA part 2: seed cloud track in IndexedDB + test signed-URL playback (bypasses broken PostgREST sync).
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:5189';
const AUTH_KEY = 'life_os_auth';
const USER_ID = 'c2831538-94b0-4a57-b034-5e873a53c42e';
const TRACK = {
  id: '39b39136a309402406aaebc7be1e7888925dea3c77a045f8174133db218e7996',
  title: 'Anti-Hero',
  artist: 'Taylor Swift',
  album: '未知专辑',
  storagePath: `${USER_ID}/39b39136a309402406aaebc7be1e7888925dea3c77a045f8174133db218e7996.mp3`
};

/** @type {{ step: string, status: 'pass'|'fail'|'warn', detail: string }[]} */
const report = [];
const log = (step, status, detail) => {
  report.push({ step, status, detail });
  console.log(`${status === 'pass' ? '✓' : status === 'warn' ? '!' : '✗'} [${step}] ${detail}`);
};

async function mintSession() {
  const appRoot = fileURLToPath(new URL('..', import.meta.url));
  const res = spawnSync('supabase', ['projects', 'api-keys', '--project-ref', 'iueozzuctstwvzbcxcyh', '-o', 'json'], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  const sk = JSON.parse(res.stdout).find((x) => x.name === 'service_role')?.api_key;
  const admin = createClient('https://iueozzuctstwvzbcxcyh.supabase.co', sk, { auth: { persistSession: false } });
  const anon = createClient('https://iueozzuctstwvzbcxcyh.supabase.co', 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL', {
    auth: { persistSession: false }
  });
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: '334452284ken@gmail.com' });
  const { data: auth } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' });
  return auth.session;
}

const session = await mintSession();
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(({ key, sess }) => localStorage.setItem(key, JSON.stringify(sess)), {
  key: AUTH_KEY,
  sess: session
});
await page.reload({ waitUntil: 'networkidle' });

// Seed IndexedDB with one cloud track
const seeded = await page.evaluate(async (track) => {
  const slug = (s) => (s || 'unknown').trim().toLowerCase() || 'unknown';
  return new Promise((resolve) => {
    const req = indexedDB.open('musicos_library');
    req.onupgradeneeded = () => {};
    req.onsuccess = () => {
      const db = req.result;
      const row = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        albumKey: slug(`${track.artist}::${track.album}`),
        artistKey: slug(track.artist),
        duration: 200,
        mime: 'audio/mpeg',
        size: 8061293,
        addedAt: Date.now(),
        playCount: 0,
        liked: 0,
        storagePath: track.storagePath,
        words: `${track.title} ${track.artist} ${track.album}`.toLowerCase().split(/\s+/).filter(Boolean)
      };
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').put(row);
      tx.oncomplete = () => resolve({ ok: true, row });
      tx.onerror = () => resolve({ ok: false, err: String(tx.error) });
    };
    req.onerror = () => resolve({ ok: false, err: 'open failed' });
  });
}, TRACK);

if (seeded.ok) log('seed-idb', 'pass', `Seeded ${TRACK.title} with storagePath`);
else log('seed-idb', 'fail', seeded.err || 'unknown');

await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
const libText = await page.locator('.wrap').innerText();
if (libText.includes('Anti-Hero')) log('library-ui', 'pass', 'Library shows Anti-Hero');
else log('library-ui', 'fail', `Library text missing track: ${libText.slice(0, 120)}`);

const playBtn = page.locator('.track-row').first().getByRole('button', { name: '播放' });
const storageHits = [];
page.on('response', (res) => {
  const u = res.url();
  if (u.includes('/storage/v1/object/sign/music') || u.includes('.mp3')) {
    storageHits.push({ url: u.slice(0, 100), status: res.status() });
  }
});

await playBtn.click();
await page.waitForTimeout(8000);

const pauseBtn = page.locator('.mini-player').getByRole('button', { name: '暂停' });
const playStateBtn = page.locator('.mini-player').getByRole('button', { name: /播放|暂停/ });
const btnLabel = await playStateBtn.getAttribute('aria-label').catch(() => '');

if (storageHits.some((h) => h.status >= 200 && h.status < 400)) {
  log('player-network', 'pass', `Audio fetched: ${JSON.stringify(storageHits[0])}`);
} else if (storageHits.length) {
  log('player-network', 'fail', `Storage fetch failed: ${JSON.stringify(storageHits)}`);
} else {
  log('player-network', 'fail', 'No storage/signed URL fetch observed after play');
}

if (btnLabel === '暂停') log('player-state', 'pass', 'Mini player in playing state (暂停)');
else log('player-state', 'warn', `Mini player aria-label=${btnLabel}`);

const mini = await page.locator('.mini-player').innerText().catch(() => '');
if (/Anti-Hero|Taylor/i.test(mini)) log('mini-player', 'pass', 'Mini player shows track');
else log('mini-player', 'warn', `Mini: ${mini.slice(0, 80)}`);

await browser.close();
console.log('\n=== PLAYBACK QA ===');
console.log(`FAIL ${report.filter((r) => r.status === 'fail').length} WARN ${report.filter((r) => r.status === 'warn').length}`);
