import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const res = spawnSync('supabase', ['projects', 'api-keys', '--project-ref', 'iueozzuctstwvzbcxcyh', '-o', 'json'], {
  cwd: appRoot,
  encoding: 'utf8'
});
const arr = JSON.parse(res.stdout || '[]');
const list = Array.isArray(arr) ? arr : arr.keys || [];
const serviceKey = list.find((x) => x.name === 'service_role')?.api_key;

const admin = createClient('https://iueozzuctstwvzbcxcyh.supabase.co', serviceKey, {
  auth: { persistSession: false }
});
const anon = createClient('https://iueozzuctstwvzbcxcyh.supabase.co', 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL', {
  auth: { persistSession: false }
});

const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: '334452284ken@gmail.com' });
const { data: auth } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' });
const token = auth.session.access_token;

const userClient = createClient('https://iueozzuctstwvzbcxcyh.supabase.co', 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL', {
  db: { schema: 'music' },
  global: { headers: { Authorization: `Bearer ${token}` } }
});

const { data, error, status } = await userClient
  .from('music_track_meta')
  .select('track_id,title,storage_path')
  .eq('user_id', auth.session.user.id)
  .limit(3);

console.log('query status', status, 'error', error?.message, 'count', data?.length);
if (data?.[0]) console.log('sample', data[0]);

const { data: signed, error: sErr } = await userClient.storage
  .from('music')
  .createSignedUrl(`${auth.session.user.id}/39b39136a309402406aaebc7be1e7888925dea3c77a045f8174133db218e7996.mp3`, 60);
console.log('signed', sErr?.message || signed?.signedUrl?.slice(0, 100));
