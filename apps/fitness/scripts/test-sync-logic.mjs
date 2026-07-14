#!/usr/bin/env node
/** 轻量校验 sync / auth 同步逻辑(不连 Supabase) */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FITNESS_TABLES } from '../src/lib/supabaseTables.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const syncSrc = readFileSync(join(root, 'src/lib/sync.js'), 'utf8');
const authSrc = readFileSync(join(root, 'src/lib/auth.svelte.js'), 'utf8');

assert.match(syncSrc, /FITNESS_TABLES as T/);
assert.match(syncSrc, /from '@life-os\/sync'/);
assert.match(syncSrc, /createBidirectionalSync/);
assert.match(syncSrc, /export \{ syncBidirectional, scheduleBidirectionalSync/);
assert.doesNotMatch(syncSrc, /applyState\(\{\}, 'replace'\)/, '换账号时不应清空本机');
assert.doesNotMatch(
  syncSrc,
  /\.from\(['"](?:user_state|exercise_weights|workout_sessions|exercise_logs)['"]\)/,
  '应使用 FITNESS_TABLES 而非裸表名'
);
assert.match(authSrc, /createAppAuthStore/);
assert.match(authSrc, /syncBidirectional/);

for (const name of Object.values(FITNESS_TABLES)) {
  assert.match(name, /^fitness_/, `表名 ${name} 应有 fitness_ 前缀`);
}

console.log('✓ sync table names + bidirectional + auth session hooks OK');
