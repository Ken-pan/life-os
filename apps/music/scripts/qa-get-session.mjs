/**
 * QA helper: mint a user session via admin magic link (no password needed).
 * Prints JSON session for Playwright localStorage injection.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://iueozzuctstwvzbcxcyh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL';
const email = process.argv[2] || '334452284ken@gmail.com';

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email
});
if (linkErr) throw linkErr;

const { data: sessionData, error: verifyErr } = await anon.auth.verifyOtp({
  token_hash: linkData.properties.hashed_token,
  type: 'email'
});
if (verifyErr) throw verifyErr;

console.log(JSON.stringify(sessionData.session));
