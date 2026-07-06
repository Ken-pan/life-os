/**
 * Full local preview QA: sync + play + verify audio currentTime advances.
 * Usage: MUSIC_QA_URL=http://127.0.0.1:5190 node scripts/qa-preview.mjs
 */
import { chromium, webkit } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

const BASE = process.env.MUSIC_QA_URL ?? 'http://127.0.0.1:5190';
const SUPABASE_URL = 'https://iueozzuctstwvzbcxcyh.supabase.co';
const ANON_KEY = 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL';
const AUTH_KEY = 'life_os_auth';
const EMAIL = '334452284ken@gmail.com';

/** @type {{ step: string, status: 'pass'|'fail', detail: string }[]} */
const report = [];

function log(step, status, detail) {
  report.push({ step, status, detail });
  const icon = status === 'pass' ? '✓' : '✗';
  console.log(`${icon} [${step}] ${detail}`);
}

function getServiceKey() {
  const res = spawnSync(
    'supabase',
    ['projects', 'api-keys', '--project-ref', 'iueozzuctstwvzbcxcyh', '-o', 'json'],
    { encoding: 'utf8', cwd: appRoot }
  );
  if (res.status !== 0) throw new Error(res.stderr || 'supabase api-keys failed');
  const arr = JSON.parse(res.stdout || '[]');
  const k = arr.find((x) => x.name === 'service_role');
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

/**
 * @param {import('playwright').BrowserType} browserType
 * @param {string} label
 */
async function runBrowserSuite(browserType, label) {
  const session = await mintSession();
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext(
    label === 'webkit-mobile' ? { isMobile: true, hasTouch: true } : {}
  );

  await context.addInitScript(() => {
    const Orig = window.Audio;
    /** @type {HTMLAudioElement[]} */
    window.__audios = [];
    window.Audio = function (...args) {
      const el = new Orig(...args);
      window.__audios.push(el);
      return el;
    };
    window.Audio.prototype = Orig.prototype;
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const nav = { waitUntil: 'domcontentloaded', timeout: 30_000 };

  const home = await page.goto(BASE, nav);
  log(`${label}-load`, home?.ok() ? 'pass' : 'fail', `GET ${BASE} → ${home?.status()}`);

  await page.evaluate(
    ({ key, sess }) => localStorage.setItem(key, JSON.stringify(sess)),
    { key: AUTH_KEY, sess: session }
  );
  await page.reload(nav);
  await page.waitForTimeout(800);

  await page.goto(`${BASE}/settings`, nav);
  const syncBtn = page.getByRole('button', { name: '立即同步' });
  if (await syncBtn.isVisible()) {
    await syncBtn.click();
    await page.waitForTimeout(10_000);
    log(`${label}-sync`, 'pass', 'Clicked 立即同步');
  } else {
    // Mobile layouts may hide the button; allow auth auto-sync to populate IDB.
    await page.waitForTimeout(6000);
    log(`${label}-sync`, 'pass', 'Relied on auto-sync (button not visible)');
  }

  const idb = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const req = indexedDB.open('musicos_library');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('tracks', 'readonly');
        const store = tx.objectStore('tracks');
        const all = store.getAll();
        all.onsuccess = () => {
          const tracks = all.result || [];
          resolve({
            total: tracks.length,
            cloud: tracks.filter((t) => t.storagePath).length
          });
        };
      };
      req.onerror = () => resolve({ total: 0, cloud: 0 });
    });
  });
  log(
    `${label}-idb`,
    idb.total > 0 ? 'pass' : 'fail',
    `tracks=${idb.total} cloud=${idb.cloud}`
  );

  await page.goto(`${BASE}/search`, nav);
  await page.locator('input').first().fill('Anti-Hero');
  await page.waitForTimeout(1200);

  const antiRow = page.locator('.track-row, li').filter({ hasText: /Anti-Hero/i }).first();
  if (await antiRow.count()) {
    const play = antiRow.getByRole('button', { name: /播放|Play/i });
    if (await play.count()) await play.click();
    else await antiRow.click();
    log(`${label}-search`, 'pass', 'Found and clicked Anti-Hero');
  } else {
    log(`${label}-search`, 'fail', 'Anti-Hero not in search results');
  }

  await page.waitForTimeout(4500);

  const playback = await page.evaluate(() => {
    const audios = window.__audios || [];
    const a = audios[audios.length - 1];
    const toast = document.querySelector('.toast')?.textContent?.trim() || '';
    const mini = document.querySelector('.mini-player')?.textContent?.trim() || '';
    if (!a) return { error: 'no-audio-element', toast, mini };
    return {
      src: a.src?.slice(0, 100) || '',
      paused: a.paused,
      currentTime: a.currentTime,
      duration: a.duration,
      readyState: a.readyState,
      mediaError: a.error?.code ?? null,
      toast,
      mini: mini.slice(0, 80)
    };
  });

  const audible =
    playback.currentTime > 0.2 && !playback.paused && playback.readyState >= 3 && !playback.mediaError;
  log(
    `${label}-playback`,
    audible ? 'pass' : 'fail',
    audible
      ? `time=${playback.currentTime.toFixed(2)}s dur=${playback.duration.toFixed(1)}s`
      : JSON.stringify(playback)
  );

  const signedOk = playback.src?.includes('/storage/v1/object/sign/music/');
  log(`${label}-signed-url`, signedOk ? 'pass' : 'fail', signedOk ? 'Using cloud signed URL' : playback.src || 'no src');

  const critical = consoleErrors.filter(
    (e) => !/favicon|sourcemap|404.*\.map|Failed to fetch|Load failed/i.test(e)
  );
  log(
    `${label}-console`,
    critical.length ? 'fail' : 'pass',
    critical.length ? critical.slice(0, 3).join(' | ') : 'No critical console errors'
  );

  await browser.close();
  return audible;
}

console.log(`\n=== Preview QA @ ${BASE} ===\n`);

const chromiumOk = await runBrowserSuite(chromium, 'chromium');
const webkitOk = await runBrowserSuite(webkit, 'webkit-mobile');

console.log('\n=== SUMMARY ===');
const fails = report.filter((r) => r.status === 'fail');
console.log(`PASS ${report.filter((r) => r.status === 'pass').length} / FAIL ${fails.length}`);
console.log(`chromium audible: ${chromiumOk ? 'yes' : 'no'}`);
console.log(`webkit audible: ${webkitOk ? 'yes' : 'no'}`);

if (!chromiumOk || !webkitOk || fails.some((f) => /load|sync|idb|search|playback|signed/.test(f.step))) {
  process.exit(1);
}
