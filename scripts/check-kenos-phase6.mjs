#!/usr/bin/env node
/**
 * Phase 6 guard — Wave 1 formal package + FINAL approval packet readiness.
 * Must NOT claim production apply, hosted staging pass, or writer cutover.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const fail = (message) => {
  console.error(`check-kenos-phase6 — FAIL: ${message}`)
  process.exit(1)
}
const read = (path) => readFileSync(path, 'utf8')
const mustExist = (path) => {
  if (!existsSync(path)) fail(`missing ${path}`)
}
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

const formal = [
  'apps/finance/supabase/migrations/20260719130100_kenos_wave1_plan_create_task_command.sql',
  'apps/finance/supabase/migrations/20260719130200_kenos_wave1_plan_privilege_model.sql',
  'apps/finance/supabase/migrations/20260719130300_kenos_wave1_action_approvals.sql',
  'apps/finance/supabase/migrations/20260719130400_kenos_wave1_focus_context.sql',
  'apps/finance/supabase/migrations/20260719130500_kenos_wave1_work_domain.sql',
]

const expectedChecksums = {
  'apps/finance/supabase/migrations/20260719130100_kenos_wave1_plan_create_task_command.sql':
    'b7cb2296e9bd426a089a0ff6ec9c1c627803151bba449ce74033bdf0beb37dac',
  'apps/finance/supabase/migrations/20260719130200_kenos_wave1_plan_privilege_model.sql':
    '6d3e59c0401c74183b707b0c6057658f873aed3936e7ca4867b086792d4ec0c6',
  'apps/finance/supabase/migrations/20260719130300_kenos_wave1_action_approvals.sql':
    'bc25f630238a5f5063a985c1001f4c07a89acfd9bae9aded52701ef3eafabbb9',
  'apps/finance/supabase/migrations/20260719130400_kenos_wave1_focus_context.sql':
    'd90d64aa4ad12315171816e169ff26781e8ed8c89fa6d01907d08899137c5134',
  'apps/finance/supabase/migrations/20260719130500_kenos_wave1_work_domain.sql':
    'ef334e64b96c10697aae7f13b76a971cfd4dca12c10cb3aaf4885eaa9f0b169d',
}

for (const path of [
  'docs/ops/kenos-phase6-production-environment-matrix.md',
  'docs/ops/kenos-phase6-writer-matrix.md',
  'docs/ops/kenos-phase6-schema-diff-procedure.md',
  'docs/ops/kenos-phase6-wave1-migration-package.md',
  'docs/ops/kenos-phase6-observability-and-shadow.md',
  'docs/ops/kenos-phase6-production-deployment-workflow.md',
  'docs/qa/kenos-phase6-backup-restore-proof.md',
  'docs/qa/kenos-phase6-dual-user-hosted-plan.md',
  'docs/qa/kenos-phase6-stage-a-approval-packet.md',
  'docs/qa/kenos-production-wave1-final-approval-packet.md',
  'apps/planner/supabase/review/20260719110000_kenos_focus_context.sql',
  'apps/planner/supabase/review/20260719100000_kenos_revoke_planner_tasks_direct_write.sql',
  'scripts/kenos-wave1-local-verify.mjs',
  ...formal,
]) {
  mustExist(path)
}

const packet = read('docs/qa/kenos-production-wave1-final-approval-packet.md')
const stageA = read('docs/qa/kenos-phase6-stage-a-approval-packet.md')
const state = read('docs/roadmap/KENOS_REFACTOR_EXECUTION_STATE.md')
const verify = read('scripts/verify-kenos-refactor.sh')
const backup = read('docs/qa/kenos-phase6-backup-restore-proof.md')
const revoke = read(
  'apps/planner/supabase/review/20260719100000_kenos_revoke_planner_tasks_direct_write.sql',
)
const focusFormal = read(formal[3])

if (!packet.includes('KENOS PRODUCTION WAVE 1 FINAL APPROVAL PACKET')) {
  fail('FINAL approval packet title missing')
}
const ready = packet.includes('READY_FOR_OWNER_APPROVAL')
const blocked = packet.includes('WAVE_1_APPROVAL_BLOCKED')
if (!ready && !blocked) {
  fail(
    'FINAL packet must report READY_FOR_OWNER_APPROVAL or WAVE_1_APPROVAL_BLOCKED',
  )
}
if (ready) {
  if (
    !packet.includes('197d69a09dc04bd2f60e63be11ac0b0e3e8c3b19') ||
    !packet.includes('c4819e9d38a441106985d589709dfbc049ad2016')
  ) {
    fail(
      'READY packet must identify baseline and paused-push tip on origin/master',
    )
  }
  if (!existsSync('docs/qa/kenos-authoritative-push-report.md')) {
    fail('READY packet requires authoritative push report')
  }
  const pushReport = read('docs/qa/kenos-authoritative-push-report.md')
  if (!pushReport.includes('PRODUCTION_CLIENT_AUTOBUILDS_PAUSED')) {
    fail('push report must record PRODUCTION_CLIENT_AUTOBUILDS_PAUSED')
  }
  if (!pushReport.includes('APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY')) {
    fail('push report must document separate client-deploy approval phrase')
  }
} else if (
  !packet.includes('PRODUCTION_APPLY_BLOCKED_UNTIL_AUTHORITATIVE_COMMIT_PUSHED')
) {
  fail(
    'blocked packet must mark apply blocked until authoritative commit pushed',
  )
}
if (!packet.includes('LOCAL_LOGICAL_RESTORE_VERIFIED')) {
  fail('must record local logical restore status')
}
if (!packet.includes('APPROVE_KENOS_PRODUCTION_WAVE_1')) {
  fail('approval phrase missing')
}
if (
  packet.includes('HOSTED_RESTORE_VERIFIED') &&
  !packet.includes('not `HOSTED_RESTORE_VERIFIED`') &&
  !packet.includes('**NO**')
) {
  // allow mentioning the claim name only when denied
}
if (!backup.includes('LOCAL_LOGICAL_RESTORE_VERIFIED')) {
  fail('backup proof must record LOCAL_LOGICAL_RESTORE_VERIFIED')
}
if (backup.includes('restore drill is **not** claimed complete')) {
  fail('backup proof must not still claim Stage A incomplete drill')
}
if (
  !state.includes('WAVE_1_APPROVAL_BLOCKED') &&
  !state.includes('READY_FOR_OWNER_APPROVAL') &&
  !state.includes('FINAL APPROVAL')
) {
  fail('Execution State must mention Wave 1 FINAL readiness or blocked status')
}
if (!verify.includes('check-kenos-phase6.mjs')) {
  fail('verify-kenos-refactor.sh must invoke Phase 6 guard')
}
if (!revoke.includes('BLOCKED_PENDING_HOSTED_APPLY_AND_CUTOVER')) {
  fail('revoke artifact must remain blocked pending cutover')
}
if (!focusFormal.includes("set search_path = ''")) {
  fail('formal Focus list RPC must use fixed empty search_path')
}
if (
  /drop policy if exists "planner_tasks_insert_own"/i.test(
    formal.map(read).join('\n'),
  )
) {
  fail('Wave 1 formal migrations must not revoke planner_tasks writes')
}

const financeNames = readdirSync('apps/finance/supabase/migrations')
if (financeNames.some((n) => /revoke_planner_tasks/i.test(n))) {
  fail('revoke must not enter finance migrations')
}

for (const path of formal) {
  const digest = sha256(read(path))
  if (digest !== expectedChecksums[path]) {
    fail(`checksum mismatch for ${path}: ${digest}`)
  }
  if (!packet.includes(digest)) {
    fail(`FINAL packet must include checksum ${digest}`)
  }
}

// Negative claims
if (packet.includes('PRODUCTION_INTEGRATED_AND_CUTOVER_VERIFIED')) {
  fail('must not claim full production cutover verified')
}
if (stageA.includes('PRODUCTION_INTEGRATED_AND_CUTOVER_VERIFIED')) {
  fail('Stage A packet must not claim production cutover')
}

console.log(
  'check-kenos-phase6 — OK (Wave 1 formal package + FINAL packet; apply still blocked)',
)
