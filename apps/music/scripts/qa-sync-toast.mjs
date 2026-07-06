import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:5189';
const appRoot = fileURLToPath(new URL('..', import.meta.url));
const res = spawnSync('supabase', ['projects', 'api-keys', '--project-ref', 'iueozzuctstwvzbcxcyh', '-o', 'json'], {
  cwd: appRoot,
  encoding: 'utf8'
});
const sk = JSON.parse(res.stdout).find((x) => x.name === 'service_role')?.api_key;
const admin = createClient('https://iueozzuctstwvzbcxcyh.supabase.co', sk, { auth: { persistSession: false } });
const anon = createClient('https://iueozzuctstwvzbcxcyh.supabase.co', 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL', { auth: { persistSession: false } });
const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: '334452284ken@gmail.com' });
const { data: auth } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
await page.evaluate(({ key, sess }) => localStorage.setItem(key, JSON.stringify(sess)), {
  key: 'life_os_auth',
  sess: auth.session
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: '立即同步' }).click();
await page.waitForTimeout(12000);
const toast = await page.locator('.toast, [class*="toast"]').innerText().catch(() => '');
const idbCount = await page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('musicos_library');
  req.onsuccess = () => {
    const c = req.result.transaction('tracks', 'readonly').objectStore('tracks').count();
    c.onsuccess = () => resolve(c.result);
  };
  req.onerror = () => resolve(-1);
}));
console.log('toast:', toast || '(none)');
console.log('idb tracks:', idbCount);
await browser.close();
