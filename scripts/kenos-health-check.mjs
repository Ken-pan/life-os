#!/usr/bin/env node
/**
 * KENOS F5-06.8 — operational health check (read-only, non-production-safe).
 *
 * Probes the canonical data layer that the core loop depends on:
 *   - Postgres reachability
 *   - required schema version / migration tip
 *   - core-loop RPC availability
 *   - covering-index presence
 *   - table RLS enabled
 *
 * Read-only: SELECTs against catalog + a no-op RPC probe. Never writes, never
 * prints secrets or user content. Targets a DBURL (default local clean-room);
 * point it at another DB only via an explicit read-only connection string.
 *
 * Usage:
 *   DBURL=postgresql://... node scripts/kenos-health-check.mjs
 *   node scripts/kenos-health-check.mjs            # local clean-room default
 */
import { execFileSync } from 'node:child_process'

const DBURL = process.env.DBURL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function q(sql) {
  try {
    return execFileSync('psql', [DBURL, '-tAc', sql], { encoding: 'utf8' }).trim()
  } catch (e) {
    return `__ERR__:${String(e.message || e).split('\n')[0]}`
  }
}

const checks = []
const add = (name, ok, detail) => checks.push({ name, ok, detail })

// 1. reachability
const ping = q('select 1')
add('db_reachable', ping === '1', ping === '1' ? 'ok' : ping)

if (ping === '1') {
  // 2. required core-loop RPCs present
  const rpcs = [
    'kenos_create_plan_task_action',
    'kenos_complete_plan_task_action',
    'kenos_ingest_capture_envelope_action',
    'kenos_convert_capture_to_plan_task_action',
    'kenos_list_plan_activity',
    'kenos_list_capture_envelopes',
    'portal_today_summary',
  ]
  const present = q(
    `select string_agg(proname, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname = any(array['${rpcs.join("','")}'])`,
  )
  const missing = rpcs.filter((r) => !present.includes(r))
  add('core_rpcs_present', missing.length === 0, missing.length ? `missing: ${missing.join(',')}` : `${rpcs.length}/7`)

  // 3. covering indexes
  const idx = [
    'kenos_plan_activity_user_created_idx',
    'planner_tasks_user_updated_idx',
    'kenos_capture_envelopes_owner_created_idx',
  ]
  const haveIdx = q(
    `select string_agg(indexname, ',') from pg_indexes where schemaname='public' and indexname = any(array['${idx.join("','")}'])`,
  )
  const missIdx = idx.filter((i) => !haveIdx.includes(i))
  add('covering_indexes', missIdx.length === 0, missIdx.length ? `missing: ${missIdx.join(',')}` : `${idx.length}/3`)

  // 4. RLS enabled on canonical tables
  const noRls = q(
    `select string_agg(relname, ',') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and relrowsecurity=false and relname = any(array['planner_tasks','kenos_capture_envelopes','kenos_plan_activity','life_events'])`,
  )
  add('rls_enabled', !noRls || noRls === '', noRls ? `RLS OFF: ${noRls}` : 'all core tables')

  // 5. schema/migration tip (informational only — absent in a manual clean-room)
  const tip = q("select max(version) from supabase_migrations.schema_migrations")
  const tipVal = tip.startsWith('__ERR__') ? 'n/a (manual clean-room)' : tip || 'none'
  console.log(`  [INFO] migration_tip: ${tipVal}`)
}

let allOk = true
for (const c of checks) {
  const mark = c.ok ? 'OK  ' : 'FAIL'
  if (!c.ok) allOk = false
  console.log(`  [${mark}] ${c.name}: ${c.detail}`)
}
console.log(allOk ? 'kenos-health-check — OK' : 'kenos-health-check — DEGRADED')
process.exit(allOk ? 0 : 1)
