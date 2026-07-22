#!/usr/bin/env node
/**
 * KENOS F5-04 — architecture convergence guard.
 *
 * Enforces the canonical-writer invariants for the core loop so convergence
 * cannot silently regress:
 *
 *  1. No service-role key or env name in client source or built client bundles.
 *  2. Client code never writes the RPC-only internal Kenos tables directly
 *     (activity / outbox / idempotency / capture / approvals) — those are
 *     reachable only through SECURITY DEFINER RPCs.
 *  3. The known legacy competing writers are a fixed allowlist; any NEW
 *     client-side `life_events` write for a core.* type is a violation until it
 *     is migrated to the canonical path (tracked in the migration ledger).
 *
 * Usage: node scripts/check-kenos-architecture.mjs [--self-test]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const EXCLUDE = new Set(['node_modules', '.svelte-kit', 'dist', '.netlify', 'coverage', 'test-results', 'output'])
const CLIENT_SRC_ROOTS = [
  'apps/aios/src',
  'apps/planner/src',
  'apps/finance/src',
  'packages/sync/src',
  'packages/platform-web/src',
  'packages/contracts/src',
]
const CLIENT_BUILD_ROOTS = ['apps/aios/build', 'apps/planner/build']

// RPC-only internal tables — no client may write these directly.
const RPC_ONLY_TABLES = [
  'kenos_plan_activity',
  'kenos_plan_outbox',
  'kenos_plan_action_idempotency',
  'kenos_capture_envelopes',
  'kenos_action_approvals',
]
const DIRECT_WRITE_RE = new RegExp(
  `\\.from\\(['"](${RPC_ONLY_TABLES.join('|')})['"]\\)\\s*\\.\\s*(insert|upsert|update|delete)`,
)

// Known legacy competing writers (file:line-ish anchor by substring). Each MUST
// have a migration-ledger entry with owner + convergence target + expiry.
// life_events `core.task_captured` from the AIOS assistant tool is the one
// tolerated legacy task-capture writer; converge onto kenos_create_plan_task_action.
const LEGACY_LIFE_EVENTS_ALLOW = new Set(['apps/aios/src/lib/lifeos.js'])

const SERVICE_ROLE_RE = /service_role|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY/

const failures = []
const fail = (m) => failures.push(m)

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (EXCLUDE.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(js|mjs|cjs|ts|svelte)$/.test(name)) out.push(p)
  }
  return out
}

// 1 + 2 + 3 over client source
for (const rootRel of CLIENT_SRC_ROOTS) {
  for (const file of walk(join(ROOT, rootRel))) {
    const rel = relative(ROOT, file)
    if (/\.test\.|\.spec\./.test(rel)) continue // tests may reference forbidden patterns as fixtures
    const text = readFileSync(file, 'utf8')

    if (SERVICE_ROLE_RE.test(text)) {
      fail(`service-role reference in client source: ${rel}`)
    }
    if (DIRECT_WRITE_RE.test(text)) {
      fail(`client writes RPC-only Kenos table directly (must use RPC): ${rel}`)
    }
    // life_events core.* write outside the allowlist
    if (/\.from\(['"]life_events['"]\)\s*\.\s*insert/.test(text) && /['"]core\.[a-z_]+['"]/.test(text)) {
      if (!LEGACY_LIFE_EVENTS_ALLOW.has(rel)) {
        fail(`new client-side life_events core.* writer (converge to canonical RPC): ${rel}`)
      }
    }
  }
}

// 1 over built client bundles (bundled secret would ship to users)
for (const rootRel of CLIENT_BUILD_ROOTS) {
  for (const file of walk(join(ROOT, rootRel))) {
    if (!/\.(js|mjs|cjs|html|json)$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    // A real service-role JWT has role":"service_role"; the bare word may appear
    // in harmless strings, so match the key/JWT shapes.
    if (/role["']?\s*:\s*["']service_role|SUPABASE_SERVICE_ROLE_KEY/.test(text)) {
      fail(`possible service-role secret in client bundle: ${relative(ROOT, file)}`)
    }
  }
}

if (process.argv.includes('--self-test')) {
  // sanity: the regexes match the shapes we intend
  const ok =
    DIRECT_WRITE_RE.test(`x.from('kenos_plan_activity').insert({})`) &&
    !DIRECT_WRITE_RE.test(`x.from('planner_tasks').upsert({})`) &&
    SERVICE_ROLE_RE.test('SUPABASE_SERVICE_ROLE_KEY')
  console.log(ok ? 'self-test OK' : 'self-test FAIL')
  process.exit(ok ? 0 : 1)
}

if (failures.length) {
  console.error('check-kenos-architecture — FAIL')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('check-kenos-architecture — OK (canonical-writer invariants hold)')
