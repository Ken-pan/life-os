import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const res = spawnSync('supabase', ['projects', 'api-keys', '--project-ref', 'iueozzuctstwvzbcxcyh', '-o', 'json'], {
  cwd: appRoot,
  encoding: 'utf8'
});
const serviceKey = JSON.parse(res.stdout).find((x) => x.name === 'service_role')?.api_key;

async function getSession() {
  const admin = createClient('https://iueozzuctstwvzbcxcyh.supabase.co', serviceKey, { auth: { persistSession: false } });
  const anon = createClient('https://iueozzuctstwvzbcxcyh.supabase.co', 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL', {
    auth: { persistSession: false }
  });
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: '334452284ken@gmail.com' });
  const { data: auth } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' });
  return auth.session;
}

const session = await getSession();
const supabase = createClient('https://iueozzuctstwvzbcxcyh.supabase.co', 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL', {
  db: { schema: 'music' },
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${session.access_token}` } }
});

let ok = 0;
let fail = 0;
for (let i = 0; i < 10; i++) {
  const { data, error } = await supabase
    .from('music_track_meta')
    .select('track_id,title,storage_path')
    .eq('user_id', session.user.id)
    .limit(5);
  if (error) {
    fail++;
    console.log(`try ${i + 1} FAIL`, error.message);
  } else {
    ok++;
    console.log(`try ${i + 1} OK count=${data.length}`);
  }
}
console.log(`summary ok=${ok} fail=${fail}`);
