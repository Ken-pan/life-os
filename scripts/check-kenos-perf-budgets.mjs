#!/usr/bin/env node
/**
 * KENOS F5-06.10 — performance regression protection (repeatable, tolerant).
 *
 * Two cheap, non-flaky checks that guard the highest-value measured budgets:
 *  1. Core-loop web bundle size budgets (from the built output).
 *  2. Core-loop DB covering-index presence (from the migration SQL) — the index
 *     whose absence made kenos_list_plan_activity scan all of a user's rows.
 *
 * Bundle budgets use generous tolerances so ordinary growth does not fail CI;
 * they exist to catch a large accidental regression (e.g. a domain bundle
 * pulled into the core route). Run after `npm run build`.
 *
 * Usage: node scripts/check-kenos-perf-budgets.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const failures = []
const notes = []

// 1. Bundle budgets (MB of total immutable JS). Generous — regression guard only.
const BUNDLE_BUDGET_MB = { aios: 4.0, planner: 2.0 }
for (const [app, budget] of Object.entries(BUNDLE_BUDGET_MB)) {
  const dir = join(ROOT, `apps/${app}/build/_app/immutable`)
  if (!existsSync(dir)) {
    notes.push(`bundle: ${app} not built (skip) — run npm run build -w ${app}-os`)
    continue
  }
  let bytes = 0
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (n.endsWith('.js')) bytes += st.size
    }
  }
  walk(dir)
  const mb = bytes / 1024 / 1024
  const status = mb <= budget ? 'OK' : 'FAIL'
  notes.push(`bundle: ${app} total JS ${mb.toFixed(2)}MB / budget ${budget}MB — ${status}`)
  if (mb > budget) failures.push(`${app} bundle ${mb.toFixed(2)}MB exceeds ${budget}MB budget`)
}

// 2. Required covering indexes present in migration SQL (source-of-truth check).
const REQUIRED_INDEXES = [
  { idx: 'kenos_plan_activity_user_created_idx', table: 'kenos_plan_activity' },
  { idx: 'planner_tasks_user_updated_idx', table: 'planner_tasks' },
  { idx: 'kenos_capture_envelopes_owner_created_idx', table: 'kenos_capture_envelopes' },
  { idx: 'kenos_plan_outbox_pending_idx', table: 'kenos_plan_outbox' },
]
const migDir = join(ROOT, 'apps/finance/supabase/migrations')
const allSql = existsSync(migDir)
  ? readdirSync(migDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(migDir, f), 'utf8'))
      .join('\n')
  : ''
for (const { idx } of REQUIRED_INDEXES) {
  if (!allSql.includes(idx)) failures.push(`missing required core-loop index in migrations: ${idx}`)
}
notes.push(`indexes: ${REQUIRED_INDEXES.length} required core-loop covering indexes present`)

for (const n of notes) console.log(`  ${n}`)
if (failures.length) {
  console.error('check-kenos-perf-budgets — FAIL')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('check-kenos-perf-budgets — OK')
