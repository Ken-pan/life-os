/**
 * End-to-end QA: cloud library sync + playback in Music OS.
 * Run from apps/music with dev server on http://127.0.0.1:5189
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MUSIC_QA_URL ?? 'http://127.0.0.1:5189';
const SUPABASE_URL = 'https://iueozzuctstwvzbcxcyh.supabase.co';
const ANON_KEY = 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL';
const AUTH_KEY = 'life_os_auth';
const EMAIL = '334452284ken@gmail.com';

/** @type {{ step: string, status: 'pass'|'fail'|'warn', detail: string }[]} */
const report = [];

function log(step, status, detail) {
  report.push({ step, status, detail });
  const icon = status === 'pass' ? '✓' : status === 'warn' ? '!' : '✗';
  console.log(`${icon} [${step}] ${detail}`);
}

function getServiceKey() {
  const appRoot = fileURLToPath(new URL('..', import.meta.url));
  const res = spawnSync(
    'supabase',
    ['projects', 'api-keys', '--project-ref', 'iueozzuctstwvzbcxcyh', '-o', 'json'],
    { cwd: appRoot, encoding: 'utf8' }
  );
  const arr = JSON.parse(res.stdout || '[]');
  const list = Array.isArray(arr) ? arr : arr.keys || [];
  const k = list.find((x) => x.name === 'service_role' || x.id === 'service_role');
  if (!k?.api_key) throw new Error('No service_role key');
  return k.api_key;
}

async function mintSession() {
  const admin = createClient(SUPABASE_URL, getServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: EMAIL
  });
  if (linkErr) throw linkErr;
  const { data, error } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'email'
  });
  if (error || !data.session) throw error || new Error('No session');
  return data.session;
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const session = await mintSession();
log('0-auth', 'pass', `Session minted for ${EMAIL}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

// Step 1: load app
try {
  const resp = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  log('1-load', resp?.ok() ? 'pass' : 'fail', `GET / → ${resp?.status()}`);
} catch (e) {
  log('1-load', 'fail', String(e));
  await browser.close();
  process.exit(1);
}

// Step 2: inject auth before app reads session
await page.evaluate(
  ({ key, sess }) => {
    localStorage.setItem(key, JSON.stringify(sess));
  },
  { key: AUTH_KEY, sess: session }
);
await page.reload({ waitUntil: 'networkidle' });
await wait(1500);

// Step 3: verify signed-in state on settings
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
const settingsText = await page.locator('.wrap').innerText();
if (settingsText.includes(EMAIL)) log('2-login', 'pass', 'Settings shows signed-in email');
else log('2-login', 'fail', 'Settings does not show email after session inject');

// Step 4: sync
const syncBtn = page.getByRole('button', { name: '立即同步' });
if (await syncBtn.isVisible()) {
  await syncBtn.click();
  await wait(8000);
  log('3-sync', 'pass', 'Clicked 立即同步, waited 8s');
} else {
  log('3-sync', 'fail', 'Sync button not found');
}

// Step 5: library count
await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
await wait(2000);
const trackRows = page.locator('.track-row, [class*="TrackRow"], li, .track-list > *');
const rowCount = await trackRows.count();
const libraryText = await page.locator('.wrap').innerText();
if (libraryText.includes('还没有') || rowCount === 0) {
  log('4-library', 'fail', `Library empty after sync (rows=${rowCount})`);
} else {
  log('4-library', 'pass', `Library shows content (approx rows=${rowCount})`);
}

// Step 6: search known track
await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
const searchInput = page.locator('input[type="search"], input[placeholder*="搜索"], input').first();
await searchInput.fill('Anti-Hero');
await wait(1500);
const searchText = await page.locator('.wrap').innerText();
if (/Anti-Hero/i.test(searchText)) log('5-search', 'pass', 'Search finds Anti-Hero');
else log('5-search', 'fail', 'Search did not find Anti-Hero after sync');

// Step 7: play Anti-Hero from search results (not first arbitrary row)
const antiHeroRow = page.locator('.track-row, li, [class*="track"]').filter({ hasText: /Anti-Hero/i }).first();
if (await antiHeroRow.count()) {
  const rowPlay = antiHeroRow.getByRole('button', { name: /播放|Play/i });
  if (await rowPlay.count()) await rowPlay.click();
  else await antiHeroRow.click();
  await wait(5000);
} else {
  const playBtn = page.getByRole('button', { name: /播放|Play/i }).first();
  if (await playBtn.count()) await playBtn.click();
  await wait(5000);
}

// Step 8: playback — player uses new Audio() (no DOM <audio>); verify via signed URL fetch
const miniText = await page.locator('.mini-player, [class*="MiniPlayer"]').first().innerText().catch(() => '');
const playbackState = await page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 2000));
  const storageReqs = performance
    .getEntriesByType('resource')
    .filter((r) => r.name.includes('/storage/v1/object/sign/music/') || (r.name.includes('token=') && r.name.includes('.mp3')));
  const best = storageReqs.sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))[0];
  return {
    signedUrlHits: storageReqs.length,
    transferSize: best?.transferSize ?? 0,
    url: best?.name?.slice(0, 120) ?? ''
  };
});

if (playbackState.signedUrlHits > 0 && playbackState.transferSize > 0) {
  log('6-audio', 'pass', `Cloud audio loaded (${playbackState.transferSize} bytes) ${playbackState.url.slice(0, 80)}…`);
} else if (playbackState.signedUrlHits > 0) {
  log('6-audio', 'warn', `Signed URL requested but transferSize=0 url=${playbackState.url}`);
} else {
  log('6-audio', 'fail', 'No signed storage URL fetch detected after play');
}

if (/Anti-Hero/i.test(miniText) || /Taylor/i.test(miniText)) {
  log('7-mini-player', 'pass', 'Mini player shows Anti-Hero metadata');
} else {
  log('7-mini-player', 'warn', `Mini player text unclear: "${miniText.slice(0, 80)}"`);
}

// Step 9: network — signed URL request
const reqs = [];
page.on('request', () => {});
const network = await page.evaluate(() =>
  performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.includes('storage') || u.includes('.mp3') || u.includes('sign'))
);
if (network.some((u) => u.includes('storage') || u.includes('token='))) {
  log('8-network', 'pass', 'Storage/signed URL requested');
} else {
  log('8-network', 'warn', 'No storage signed URL seen in performance entries');
}

// Step 9b: signed URL requires authenticated session (RLS on storage.objects)
const signedTest = await page.evaluate(
  async ({ url, key, accessToken, trackId, userId }) => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const sb = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    const path = `${userId}/${trackId}.mp3`;
    const { data, error } = await sb.storage.from('music').createSignedUrl(path, 60);
    if (error) return { ok: false, error: error.message };
    const res = await fetch(data.signedUrl, { method: 'HEAD' });
    return { ok: res.ok, status: res.status, path };
  },
  {
    url: SUPABASE_URL,
    key: ANON_KEY,
    accessToken: session.access_token,
    userId: session.user.id,
    trackId: '39b39136a309402406aaebc7be1e7888925dea3c77a045f8174133db218e7996'
  }
);
if (signedTest.ok) log('9-signed-url', 'pass', `HEAD signed URL ${signedTest.status} for Anti-Hero`);
else log('9-signed-url', 'fail', `${signedTest.error || signedTest.status}`);

// Step 10: IndexedDB track count
const idb = await page.evaluate(async () => {
  return new Promise((resolve) => {
    const req = indexedDB.open('musicos_library');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('tracks', 'readonly');
      const store = tx.objectStore('tracks');
      const c = store.count();
      c.onsuccess = () => {
        const all = store.getAll();
        all.onsuccess = () => {
          const tracks = all.result || [];
          const withCloud = tracks.filter((t) => t.storagePath).length;
          const withBlob = tracks.filter((t) => t.audioBlob).length;
          resolve({ total: c.result, withCloud, withBlob, sample: tracks.slice(0, 3).map((t) => ({ title: t.title, storagePath: t.storagePath })) });
        };
      };
    };
    req.onerror = () => resolve({ error: 'idb open failed' });
  });
});
log('10-indexeddb', idb.total > 0 ? 'pass' : 'fail', `tracks=${idb.total} cloud=${idb.withCloud} localBlob=${idb.withBlob} sample=${JSON.stringify(idb.sample?.[0] || {})}`);

// Console errors
const critical = consoleErrors.filter((e) => !/favicon|sourcemap|404.*\.map/i.test(e));
if (critical.length) log('11-console', 'warn', critical.slice(0, 5).join(' | '));
else log('11-console', 'pass', 'No critical console errors');

await page.screenshot({ path: '/tmp/music-qa-now-playing.png', fullPage: true }).catch(() => {});

await browser.close();

console.log('\n=== QA SUMMARY ===');
const fails = report.filter((r) => r.status === 'fail');
const warns = report.filter((r) => r.status === 'warn');
console.log(`PASS ${report.filter((r) => r.status === 'pass').length} / WARN ${warns.length} / FAIL ${fails.length}`);
if (fails.length) process.exit(1);
