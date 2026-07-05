#!/usr/bin/env node
/** 验证 Fitness ↔ Life OS Supabase 连通性（需网络） */
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { FITNESS_TABLES } from '../src/lib/supabaseTables.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://iueozzuctstwvzbcxcyh.supabase.co';
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'fitness' },
  auth: { persistSession: false, autoRefreshToken: false }
});

const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
assert.equal(sessionError, null, `getSession failed: ${sessionError?.message}`);
assert.equal(sessionData.session, null, 'expected no session in CI script');

const { error: signInError } = await supabase.auth.signInWithPassword({
  email: 'connectivity-test-nonexistent@example.com',
  password: 'wrong-password-12345'
});
assert.ok(signInError, 'expected sign-in failure');
assert.match(signInError.message, /invalid login credentials/i);

for (const table of Object.values(FITNESS_TABLES)) {
  const { error } = await supabase.from(table).select('*').limit(1);
  assert.equal(error, null, `select ${table} failed: ${error?.message}`);
}

const { error: rlsError } = await supabase.from(FITNESS_TABLES.userState).upsert(
  { user_id: '00000000-0000-0000-0000-000000000001', settings: {} },
  { onConflict: 'user_id' }
);
assert.ok(rlsError, 'expected anon upsert to be blocked by RLS');
assert.match(rlsError.message, /row-level security/i);

console.log('✓ Supabase connectivity OK (auth + fitness schema + RLS)');
