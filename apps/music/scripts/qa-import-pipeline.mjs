/**
 * QA: new import pipeline — local import → upload → tags → sync
 * Run with dev server: http://127.0.0.1:5189
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MUSIC_QA_URL ?? 'http://127.0.0.1:5189';
const SUPABASE_URL = 'https://iueozzuctstwvzbcxcyh.supabase.co';
const ANON_KEY = 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL';
const AUTH_KEY = 'life_os_auth';
const EMAIL = '334452284ken@gmail.com';
const USER_ID = 'c2831538-94b0-4a57-b034-5e873a53c42e';

const TEST_FILE =
  process.env.MUSIC_QA_IMPORT_FILE ??
  '/Users/kenpan/Downloads/bbno$ & Rich Brian - edamame (Official Video).mp3';

/** @type {{ step: string, status: 'pass'|'fail'|'warn', detail: string }[]} */
const report = [];
const log = (step, status, detail) => {
  report.push({ step, status, detail });
  const icon = status === 'pass' ? '✓' : status === 'warn' ? '!' : '✗';
  console.log(`${icon} [${step}] ${detail}`);
};

function getServiceKey() {
  const appRoot = fileURLToPath(new URL('..', import.meta.url));
  const res = spawnSync(
    'supabase',
    ['projects', 'api-keys', '--project-ref', 'iueozzuctstwvzbcxcyh', '-o', 'json'],
    { cwd: appRoot, encoding: 'utf8' },
  );
  const arr = JSON.parse(res.stdout || '[]');
  const list = Array.isArray(arr) ? arr : arr.keys || [];
  const k = list.find((x) => x.name === 'service_role' || x.id === 'service_role');
  if (!k?.api_key) throw new Error('No service_role key');
  return k.api_key;
}

async function mintSession() {
  const admin = createClient(SUPABASE_URL, getServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: EMAIL,
  });
  if (linkErr) throw linkErr;
  const { data, error } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'email',
  });
  if (error || !data.session) throw error || new Error('No session');
  return data.session;
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function trackIdFromFile(path) {
  const buf = readFileSync(path);
  return createHash('sha256').update(buf).digest('hex');
}

async function fetchCloudTrack(db, trackId) {
  const { data: meta } = await db
    .from('music_track_meta')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('track_id', trackId)
    .maybeSingle();
  const { data: enrich } = await db
    .from('track_enrichment')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('track_id', trackId)
    .maybeSingle();
  const { data: tags } = await db
    .from('track_tags')
    .select('tag_slug, confidence, source')
    .eq('user_id', USER_ID)
    .eq('track_id', trackId);
  return { meta, enrich, tags: tags ?? [] };
}

const trackId = trackIdFromFile(TEST_FILE);
log('0-setup', 'pass', `Test file track_id=${trackId.slice(0, 12)}…`);

const serviceKey = getServiceKey();
const db = createClient(SUPABASE_URL, serviceKey, {
  db: { schema: 'music' },
  auth: { persistSession: false, autoRefreshToken: false },
});

const before = await fetchCloudTrack(db, trackId);
log(
  '0-cloud-before',
  before.meta ? 'pass' : 'warn',
  `meta=${Boolean(before.meta)} storage=${before.meta?.storage_path || '(empty)'} tags=${before.tags.length}`,
);

const session = await mintSession();
log('1-auth', 'pass', `Session for ${EMAIL}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

const consoleErrors = [];
const progressLog = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.evaluate(
  ({ key, sess }) => {
    localStorage.setItem(key, JSON.stringify(sess));
  },
  { key: AUTH_KEY, sess: session },
);
await page.reload({ waitUntil: 'domcontentloaded' });
await wait(3000);

await page.goto(`${BASE}/import`, { waitUntil: 'domcontentloaded' });
const hint = await page.locator('.page-sub').innerText();
if (hint.includes('Supabase') || hint.includes('上传')) {
  log('2-import-ui', 'pass', `Logged-in hint shown: ${hint.slice(0, 60)}…`);
} else {
  log('2-import-ui', 'warn', `Hint may be offline-only: ${hint.slice(0, 80)}`);
}

const fileInput = page.locator('input[type="file"]');
await fileInput.setInputFiles(TEST_FILE);

const progressEl = page.locator('.wrap p').last();
const deadline = Date.now() + 120_000;
let lastProgress = '';
while (Date.now() < deadline) {
  const txt = (await progressEl.innerText().catch(() => '')).trim();
  if (txt && txt !== lastProgress) {
    progressLog.push(txt);
    lastProgress = txt;
    process.stdout.write(`  … ${txt}\n`);
  }
  const url = page.url();
  if (url.includes('/library')) break;
  await wait(500);
}

const landedLibrary = page.url().includes('/library');
log(
  '3-import-flow',
  landedLibrary ? 'pass' : 'fail',
  landedLibrary
    ? `Redirected to library after ${progressLog.length} progress updates`
    : `Stuck on ${page.url()} last="${lastProgress}"`,
);

const phasesSeen = {
  import: progressLog.some((p) => p.includes('导入')),
  art: progressLog.some((p) => p.includes('封面')),
  metadata: progressLog.some((p) => p.includes('元数据')),
  upload: progressLog.some((p) => p.includes('上传')),
  tags: progressLog.some((p) => p.includes('打标')),
  sync: progressLog.some((p) => p.includes('同步')),
};
for (const [phase, seen] of Object.entries(phasesSeen)) {
  log(`3-phase-${phase}`, seen ? 'pass' : 'warn', seen ? 'shown in UI' : 'not seen in progress text');
}

await wait(5000);

const localState = await page.evaluate(async (id) => {
  const open = indexedDB.open('musicos_library');
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(open.error);
  });
  const tr = await new Promise((res, rej) => {
    const tx = db.transaction('tracks', 'readonly');
    const req = tx.objectStore('tracks').get(id);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  db.close();
  return tr
    ? {
        title: tr.title,
        artist: tr.artist,
        album: tr.album,
        storagePath: tr.storagePath || '',
        hasBlob: Boolean(tr.audioBlob || tr.size),
        lyricsLen: (tr.lyrics || '').length,
      }
    : null;
}, trackId);

if (localState?.storagePath) {
  log('4-local-idb', 'pass', `storagePath=${localState.storagePath}`);
} else {
  log(
    '4-local-idb',
    localState ? 'fail' : 'fail',
    localState
      ? 'Track in IDB but no storagePath'
      : 'Track not found in IndexedDB',
  );
}

const after = await fetchCloudTrack(db, trackId);
const uploaded = Boolean(after.meta?.storage_path);
log(
  '5-cloud-upload',
  uploaded ? 'pass' : 'fail',
  uploaded ? `storage_path=${after.meta.storage_path}` : 'storage_path still empty',
);

const tagCount = after.tags.length;
log(
  '6-cloud-tags',
  tagCount >= 5 ? 'pass' : tagCount > 0 ? 'warn' : 'fail',
  `${tagCount} tags, status=${after.enrich?.tagging_status ?? 'none'}`,
);

if (after.meta?.art_remote_url?.startsWith('https://')) {
  log('7-cover', 'pass', 'art_remote_url set');
} else {
  log('7-cover', after.meta?.art_remote_url ? 'warn' : 'fail', `art=${after.meta?.art_remote_url || 'empty'}`);
}

const lyricsLen = (after.meta?.lyrics || '').length;
log(
  '8-lyrics',
  lyricsLen > 100 ? 'pass' : lyricsLen > 0 ? 'warn' : 'warn',
  `cloud lyrics len=${lyricsLen} (background fetch may lag)`,
);

if (consoleErrors.length) {
  log('9-console', 'warn', `${consoleErrors.length} console errors`);
  for (const e of consoleErrors.slice(0, 5)) console.log('   ', e.slice(0, 200));
} else {
  log('9-console', 'pass', 'No console errors');
}

await browser.close();

console.log('\n=== SUMMARY ===');
const fails = report.filter((r) => r.status === 'fail');
const warns = report.filter((r) => r.status === 'warn');
console.log(`pass=${report.filter((r) => r.status === 'pass').length} warn=${warns.length} fail=${fails.length}`);
if (before.meta?.storage_path && !uploaded) {
  console.log('NOTE: had storage before but lost after import — regression');
}
process.exit(fails.length ? 1 : 0);
