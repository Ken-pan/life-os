#!/usr/bin/env node
/**
 * Phase 6 Stage A guard — documentation / package readiness only.
 * Must NOT claim production apply or writer cutover.
 */
import { existsSync, readFileSync } from 'node:fs'

const fail = (message) => {
  console.error(`check-kenos-phase6 — FAIL: ${message}`)
  process.exit(1)
}
const read = (path) => readFileSync(path, 'utf8')
const mustExist = (path) => {
  if (!existsSync(path)) fail(`missing ${path}`)
}

for (const path of [
  'docs/ops/kenos-phase6-production-environment-matrix.md',
  'docs/ops/kenos-phase6-writer-matrix.md',
  'docs/ops/kenos-phase6-schema-diff-procedure.md',
  'docs/ops/kenos-phase6-wave1-migration-package.md',
  'docs/ops/kenos-phase6-observability-and-shadow.md',
  'docs/qa/kenos-phase6-backup-restore-proof.md',
  'docs/qa/kenos-phase6-dual-user-hosted-plan.md',
  'docs/qa/kenos-phase6-stage-a-approval-packet.md',
  'apps/planner/supabase/review/20260719110000_kenos_focus_context.sql',
  'apps/planner/supabase/review/20260719100000_kenos_revoke_planner_tasks_direct_write.sql',
]) {
  mustExist(path)
}

const packet = read('docs/qa/kenos-phase6-stage-a-approval-packet.md')
const state = read('docs/roadmap/KENOS_REFACTOR_EXECUTION_STATE.md')
const verify = read('scripts/verify-kenos-refactor.sh')
const focusSql = read('apps/planner/supabase/review/20260719110000_kenos_focus_context.sql')
const revoke = read('apps/planner/supabase/review/20260719100000_kenos_revoke_planner_tasks_direct_write.sql')
const backup = read('docs/qa/kenos-phase6-backup-restore-proof.md')

if (!packet.includes('KENOS PRODUCTION WAVE 1 APPROVAL PACKET')) {
  fail('approval packet title missing')
}
if (!packet.includes('APPROVE_KENOS_PRODUCTION_WAVE_1')) {
  fail('approval phrase missing')
}
if (!packet.includes('No hosted migration has been applied')) {
  fail('packet must state no hosted apply')
}
if (!state.includes('Phase 6') || !state.includes('STAGE_A')) {
  fail('Execution State missing Phase 6 Stage A closeout')
}
if (!verify.includes('check-kenos-phase6.mjs')) {
  fail('verify-kenos-refactor.sh must invoke Phase 6 guard')
}
if (!focusSql.includes('kenos_focus_contexts') || !focusSql.includes('Never auto-applied')) {
  fail('Focus review SQL must be review-only with focus tables')
}
if (!revoke.includes('BLOCKED_PENDING_HOSTED_APPLY_AND_CUTOVER')) {
  fail('revoke artifact must remain blocked pending cutover')
}
if (!backup.includes('restore drill is **not** claimed complete')) {
  fail('backup proof must honestly record incomplete restore drill')
}

// Negative: Stage A must not claim production integrated
if (packet.includes('PRODUCTION_INTEGRATED_AND_CUTOVER_VERIFIED')) {
  fail('must not claim full Phase 6 production verified in Stage A')
}
if (focusSql.includes('autoApproveAll') || focusSql.includes('ProductionExecutor')) {
  fail('Focus SQL must not introduce production Executor shortcuts')
}

console.log('check-kenos-phase6 — OK (Stage A docs/package only; no production apply claimed)')
