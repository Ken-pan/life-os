#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const fail = (message) => {
  console.error(`check-kenos-phase3 — FAIL: ${message}`)
  process.exit(1)
}

const read = (path) => readFileSync(path, 'utf8')
const contracts = read('packages/contracts/src/kenos.ts')
const manifest = JSON.parse(read('packages/contracts/fixtures/kenos/v1/manifest.json'))
const corpus = JSON.parse(read('packages/contracts/fixtures/kenos/v1/corpus.json'))
const swift = read('clients/apple/Packages/KenosContracts/Sources/KenosContracts/KenosContracts.swift')
const workCommand = read('apps/aios/src/lib/kenos/workCommand.core.js')
const workStore = read('apps/aios/src/lib/kenos/workStore.svelte.js')
const workPage = read('apps/aios/src/routes/work/+page.svelte')
const todayPage = read('apps/aios/src/routes/+page.svelte')
const workSql = read('apps/planner/supabase/review/20260719040000_kenos_work_domain.sql')
const workSqlTest = read('apps/planner/supabase/tests/kenos_work_domain.sql')
const inventory = read('docs/architecture/kenos-phase3-work-domain-inventory.md')
const decisionRegister = read('docs/architecture/kenos-decision-register.md')
const ledger = read('docs/roadmap/KENOS_MIGRATION_LEDGER.md')
const state = read('docs/roadmap/KENOS_REFACTOR_EXECUTION_STATE.md')
const aiosManifest = JSON.parse(read('apps/aios/app.manifest.json'))
const phase1Guard = read('scripts/check-kenos-phase1.mjs')
const phase2Guard = read('scripts/check-kenos-phase2.mjs')
const verify = read('scripts/verify-kenos-refactor.sh')

if (manifest.phase3OwnershipStatus !== 'TEMPORARY_APPROVED_FOR_PHASE_3_WORK_FOUNDATION') {
  fail('manifest must record TEMPORARY_APPROVED_FOR_PHASE_3_WORK_FOUNDATION')
}
if (!decisionRegister.includes('TEMPORARY_APPROVED_FOR_PHASE_3_WORK_FOUNDATION')) {
  fail('decision register missing Phase 3 temporary ownership status')
}
if (!inventory.includes('Plan project') || !inventory.includes('Work Project')) {
  fail('inventory must distinguish Plan projects from Work Projects')
}

for (const token of [
  'KenosWorkProjectSchema',
  'KenosWorkDeliverableSchema',
  'KenosWorkMeetingSchema',
  'KenosWorkDecisionSchema',
  'KenosWorkActionProposalSchema',
  'KenosConnectorRegistryEntrySchema',
  'KenosWorkActionProposalTransitions',
]) {
  if (!contracts.includes(token)) fail(`Work contract missing ${token}`)
}

for (const id of [
  'work-project-active',
  'work-project-completed',
  'work-project-with-deliverables',
  'work-meeting-with-decisions',
  'work-decision-supersession',
  'work-action-proposal-draft',
  'work-action-proposal-proposed',
  'work-action-proposal-converted',
  'work-action-proposal-rejected',
  'work-action-proposal-expired',
  'work-project-redacted-source-refs',
  'work-project-library-refs',
  'work-cross-domain-entity-refs',
  'work-connector-registry-read-only',
]) {
  if (!corpus.valid.some((fixture) => fixture.id === id)) fail(`valid Work fixture missing ${id}`)
}
for (const id of [
  'work-malformed-uuid',
  'work-owner-mismatch',
  'work-invalid-timestamp',
  'work-unsupported-version',
  'work-invalid-status',
  'work-converted-without-task-ref',
  'work-plan-task-embedded-duplicate',
  'work-sensitive-meeting-transcript',
  'work-external-secret',
  'work-writing-canonical-task',
  'work-library-document-copied',
  'work-conflicting-idempotency-replay',
]) {
  if (!corpus.invalid.some((fixture) => fixture.id === id)) fail(`invalid Work fixture missing ${id}`)
}

for (const token of ['struct WorkProject', 'struct WorkActionProposal', 'struct WorkMeeting', 'struct WorkDecision', 'struct ConnectorRegistryEntry']) {
  if (!swift.includes(token)) fail(`Swift Work parity missing ${token}`)
}

for (const field of manifest.requiredFields.workProject || []) {
  const fixture = corpus.valid.find((row) => row.id === 'work-project-active')
  if (!(field in fixture.value)) fail(`work-project-active missing required field ${field}`)
}

if (!aiosManifest.routes.some((route) => route.path === '/work' && route.name === 'work')) {
  fail('AIOS manifest must include /work route')
}
if (aiosManifest.production !== false) fail('Assistant/Work host must remain non-production')

for (const token of [
  'createWorkActionProposal',
  'convertWorkActionProposalToPlanTask',
  'reconcilePlanTaskRefs',
  'reconcileLibraryRefs',
  'buildWorkTodayProjection',
  'CONNECTOR_REGISTRY_PROPOSAL',
  "producer: 'plan'",
  'productionWrite: false',
  'work_conversion_flag_off',
  'work_explicit_user_required',
  'work_must_not_embed_canonical_task',
  "readWriteCapability: 'read_only'",
]) {
  if (!workCommand.includes(token)) fail(`Work command boundary missing ${token}`)
}

if (/invokeExecutor|runExecutor\(|production Executor|executeViaExecutor/.test(workCommand)) {
  fail('Work command must not invoke an Executor')
}
if (!workCommand.includes('executorAvailable: false')) {
  fail('Work projections must advertise executorAvailable: false')
}
if (workCommand.includes('@life-os/contracts/kenos')) {
  fail('Work browser/core module must not value-import @life-os/contracts/kenos')
}
if (workStore.includes('VITE_KENOS_PHASE3_WORK_TASK_CONVERSION') === false && !workCommand.includes('VITE_KENOS_PHASE3_WORK_TASK_CONVERSION')) {
  fail('conversion feature flag must exist and default Off')
}
if (!workStore.includes("get('kenosDemo') === '1'") && !workStore.includes("get(\"kenosDemo\") === '1'")) {
  fail('Work demo must remain explicit via ?kenosDemo=1')
}

for (const token of ['当前目标', '下一个交付', '阻塞', '最近决定', 'Create task', 'WorkActionProposal 不是 Task', 'conversion flag Off']) {
  if (!workPage.includes(token)) fail(`Work UI missing ${token}`)
}
if (!todayPage.includes('today-work-title') || !todayPage.includes('href="/work"') || !todayPage.includes('owner={card.ownerDomain}')) {
  fail('Today must include Work projection section with owner metadata and /work deep link')
}

for (const token of [
  'Review-only Phase 3 Work persistence proposal. Never auto-applied.',
  'create table if not exists public.kenos_work_projects',
  'create table if not exists public.kenos_work_action_proposals',
  'enable row level security',
  "set search_path = ''",
  'kenos_work_writer nologin noinherit nobypassrls',
  'grant select on public.kenos_work_projects to authenticated',
  'work_must_not_embed_canonical_task',
  'work_idempotency_conflict',
]) {
  if (!workSql.includes(token)) fail(`Work review SQL missing ${token}`)
}
if (workSql.includes('apps/planner/supabase/migrations') || workSql.includes('-- migrate:')) {
  fail('Work SQL must remain review-only outside production migrations')
}
for (const token of [
  'authenticated must not write Work projects directly',
  'anon must not read Work projects',
  'generic service_role must not become the Work writer',
  'work_owner_mismatch',
  'work_idempotency_conflict',
  'RLS leaked user B Work projects to user A',
]) {
  if (!workSqlTest.includes(token)) fail(`Work SQL test missing ${token}`)
}

if (!ledger.includes('WORK_LOOP_FOUNDATION_READY') && !state.includes('WORK_LOOP_FOUNDATION_READY')) {
  fail('Ledger/Execution State must record WORK_LOOP_FOUNDATION_READY')
}
if (state.includes('PHASE 4') && /start Phase 4|begin Phase 4|Phase 4 Apple/.test(state) && state.includes('STARTED Phase 4')) {
  fail('Phase 3 closeout must not start Phase 4')
}
if (!phase1Guard || !phase2Guard) fail('Phase 1/2 guards must remain present')
if (!verify.includes('check-kenos-phase3.mjs')) {
  fail('verify-kenos-refactor.sh must invoke Phase 3 guard')
}

for (const banned of ['git push', 'netlify deploy', 'apply production migration', 'Phase 5']) {
  if (workCommand.includes(banned) || workStore.includes(banned)) {
    fail(`Phase 3 runtime code unexpectedly references ${banned}`)
  }
}

console.log('check-kenos-phase3 — OK')
