/**
 * Diagnose whether HTMLAudioElement actually produces sound (currentTime advances).
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';

const BASE = process.env.MUSIC_QA_URL ?? 'http://127.0.0.1:5189';
const SUPABASE_URL = 'https://iueozzuctstwvzbcxcyh.supabase.co';
const ANON_KEY = 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL';
const AUTH_KEY = 'life_os_auth';
const EMAIL = '334452284ken@gmail.com';

function getServiceKey() {
  const res = spawnSync('supabase', ['projects', 'api-keys', '--project-ref', 'iueozzuctstwvzbcxcyh', '-o', 'json'], {
    encoding: 'utf8'
  });
  const arr = JSON.parse(res.stdout || '[]');
  const k = arr.find((x) => x.name === 'service_role');
  return k.api_key;
}

async function mintSession() {
  const admin = createClient(SUPABASE_URL, getServiceKey(), { auth: { persistSession: false } });
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  const { data } = await anon.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'email' });
  return data.session;
}

const session = await mintSession();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(
  ({ key, sess }) => localStorage.setItem(key, JSON.stringify(sess)),
  { key: AUTH_KEY, sess: session }
);
await page.reload({ waitUntil: 'networkidle' });

await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '立即同步' }).click();
await page.waitForTimeout(8000);

await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
await page.locator('input').first().fill('Anti-Hero');
await page.waitForTimeout(1500);

const diag = await page.evaluate(async () => {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const authRaw = localStorage.getItem('life_os_auth');
  const auth = authRaw ? JSON.parse(authRaw) : null;
  const token = auth?.access_token;
  const sb = createClient('https://iueozzuctstwvzbcxcyh.supabase.co', 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL', {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const req = indexedDB.open('musicos_library');
  const track = await new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const db = req.result;
      const all = db.transaction('tracks', 'readonly').objectStore('tracks').getAll();
      all.onsuccess = () => {
        const rows = all.result || [];
        resolve(rows.find((t) => /anti-hero/i.test(t.title)) || rows[0]);
      };
      all.onerror = () => reject(all.error);
    };
    req.onerror = () => reject(req.error);
  });

  if (!track?.storagePath) return { error: 'no track with storagePath', track };

  const { data, error } = await sb.storage.from('music').createSignedUrl(track.storagePath, 120);
  if (error) return { error: error.message, track: { title: track.title, storagePath: track.storagePath } };

  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.playsInline = true;

  // Simulate app: route through Web Audio like audioAnalyser.js
  const ctx = new AudioContext();
  const src = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  src.connect(analyser);
  analyser.connect(ctx.destination);

  const signedUrl = data.signedUrl;
  audio.src = signedUrl;
  audio.load();

  await ctx.resume();

  let playErr = null;
  try {
    await audio.play();
  } catch (e) {
    playErr = String(e);
  }

  await new Promise((r) => setTimeout(r, 2500));

  return {
    track: { title: track.title, storagePath: track.storagePath },
    signedUrl: signedUrl.slice(0, 100),
    ctxState: ctx.state,
    playErr,
    paused: audio.paused,
    currentTime: audio.currentTime,
    duration: audio.duration,
    readyState: audio.readyState,
    networkState: audio.networkState,
    mediaError: audio.error ? { code: audio.error.code, message: audio.error.message } : null
  };
});

console.log(JSON.stringify(diag, null, 2));
await browser.close();
process.exit(diag.currentTime > 0.1 && !diag.playErr ? 0 : 1);
