#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const fail = (message) => {
  console.error(`check-kenos-phase2 — FAIL: ${message}`)
  process.exit(1)
}

const read = (path) => readFileSync(path, 'utf8')
const manifest = JSON.parse(read('apps/aios/app.manifest.json'))
const portalApps = read('apps/portal/src/lib/apps.js')
const portalActions = read('apps/portal/src/lib/commandPaletteActions.js')
const readProjections = read('apps/aios/src/lib/kenos/readProjections.core.js')
const readSources = read('apps/aios/src/lib/kenos/readSources.js')
const approvalReadSource = read('apps/aios/src/lib/kenos/approvalReadSource.core.js')
const approvalReadTests = read('apps/aios/src/lib/approvalReadSource.core.test.js')
const controlCenter = read('apps/aios/src/lib/kenos/controlCenter.svelte.js')
const approvalsPage = read('apps/aios/src/routes/approvals/+page.svelte')
const todayPage = read('apps/aios/src/routes/+page.svelte')
const portalStrangler = read('apps/portal/src/lib/kenosStrangler.js')
const portalBadge = read('apps/portal/src/lib/portalActionBadge.js')
const portalBadgeTest = read('apps/portal/scripts/portalActionBadge.test.mjs')
const routingTest = read('apps/portal/scripts/kenos-strangler-routing.test.mjs')
const contracts = read('packages/contracts/src/kenos.ts')
const contractManifest = JSON.parse(read('packages/contracts/fixtures/kenos/v1/manifest.json'))
const contractCorpus = JSON.parse(read('packages/contracts/fixtures/kenos/v1/corpus.json'))
const swiftContracts = read('clients/apple/Packages/KenosContracts/Sources/KenosContracts/KenosContracts.swift')
const approvalSql = read('apps/planner/supabase/review/20260719030000_kenos_action_approvals.sql')
const approvalSqlTest = read('apps/planner/supabase/tests/kenos_action_approvals.sql')
const runbook = read('docs/ops/kenos-phase2-assistant-portal.md')
const ledger = read('docs/roadmap/KENOS_MIGRATION_LEDGER.md')
const state = read('docs/roadmap/KENOS_REFACTOR_EXECUTION_STATE.md')

const requiredRoutes = new Map([
  ['/', 'today'],
  ['/assistant', 'assistant'],
  ['/inbox', 'inbox'],
  ['/approvals', 'approvals'],
  ['/activity', 'activity'],
])

if (manifest.name !== 'Kenos Assistant') fail('AIOS strangler host must present the Kenos Assistant product name')
if (manifest.production !== false || manifest.experimental !== true) {
  fail('Assistant must remain experimental and non-production during the local beta')
}
for (const [path, name] of requiredRoutes) {
  if (!manifest.routes.some((route) => route.path === path && route.name === name)) {
    fail(`Assistant manifest missing ${path} -> ${name}`)
  }
}

for (const file of [
  'apps/aios/src/routes/+page.svelte',
  'apps/aios/src/routes/assistant/+page.svelte',
  'apps/aios/src/routes/inbox/+page.svelte',
  'apps/aios/src/routes/approvals/+page.svelte',
  'apps/aios/src/routes/activity/+page.svelte',
  'apps/aios/src/routes/chat/+page.svelte',
  'apps/aios/src/routes/[...missing]/+page.svelte',
]) {
  read(file)
}

for (const source of ['today', 'inbox', 'approvals', 'activity']) {
  if (!new RegExp(`${source}: Object\\.freeze\\(\\[`).test(readProjections)) {
    fail(`read projection owner metadata missing ${source}`)
  }
}
for (const token of [
  "rpc('portal_today_summary'",
  ".from('life_events')",
  ".from('planner_tasks')",
  'readApprovalSource',
  'settleReadSources',
]) {
  if (!readSources.includes(token)) fail(`read adapter missing expected boundary: ${token}`)
}

const approvalStatuses = ['pending', 'approved', 'rejected', 'expired', 'cancelled', 'superseded']
if (JSON.stringify(contractManifest.approvalStatuses) !== JSON.stringify(approvalStatuses)) {
  fail('canonical Approval statuses drifted from the frozen v1 manifest')
}
for (const token of ['KenosApprovalRecordSchema', 'KenosApprovalTransitionSchema', 'KenosApprovalTransitions']) {
  if (!contracts.includes(token)) fail(`canonical Approval contract missing ${token}`)
}
for (const field of [
  'id', 'version', 'ownerId', 'actionId', 'correlationId', 'requestingActor', 'requestingDomain',
  'actionType', 'risk', 'status', 'reasonCode', 'safeSummary', 'dataClassification', 'requestedAt',
  'expiresAt', 'entityRefs', 'createdAt', 'updatedAt',
]) {
  if (!contractManifest.requiredFields.approvalRecord.includes(field)) {
    fail(`canonical Approval manifest missing required field ${field}`)
  }
}
const validApprovalFixtureIds = new Set(contractCorpus.valid.filter((fixture) => fixture.contract === 'approvalRecord').map((fixture) => fixture.id))
const invalidApprovalFixtureIds = new Set(contractCorpus.invalid.filter((fixture) => fixture.id.startsWith('approval-')).map((fixture) => fixture.id))
for (const id of [
  'approval-record-pending-r2', 'approval-record-pending-r3', 'approval-record-approved',
  'approval-record-rejected', 'approval-record-expired', 'approval-record-cancelled',
  'approval-record-superseded', 'approval-record-redacted-sensitive', 'approval-record-multiple-entity-refs',
]) {
  if (!validApprovalFixtureIds.has(id)) fail(`canonical Approval valid corpus missing ${id}`)
}
for (const id of [
  'approval-malformed-uuid', 'approval-owner-mismatch', 'approval-unknown-status', 'approval-invalid-risk',
  'approval-approved-without-decision', 'approval-pending-with-decision', 'approval-invalid-expiry',
  'approval-secret-summary', 'approval-action-id-mismatch', 'approval-unsupported-version', 'approval-illegal-transition',
]) {
  if (!invalidApprovalFixtureIds.has(id)) fail(`canonical Approval invalid corpus missing ${id}`)
}
for (const token of ['KenosApprovalStatus', 'struct ApprovalRecord', 'validateTransition']) {
  if (!swiftContracts.includes(token)) fail(`Swift Approval parity missing ${token}`)
}

for (const token of [
  "rpc('kenos_list_action_approvals'", 'projectApprovalRows', 'executorAvailable',
  'sourceFreshness', 'requestingActor', 'entityReferences',
]) {
  if (!approvalReadSource.includes(token) && !readProjections.includes(token)) {
    fail(`canonical Approval read projection missing ${token}`)
  }
}
for (const stateName of ['ready', 'empty', 'partial', 'stale', 'offline', 'permission_denied', 'unavailable']) {
  if (!`${approvalReadSource}\n${approvalReadTests}`.includes(`'${stateName}'`)) {
    fail(`Approval read adapter coverage missing ${stateName}`)
  }
}
if (!/approvals:\s*Object\.freeze\(\['system'\]\)/.test(readProjections)) {
  fail('canonical Approval owner metadata must remain Platform/System')
}
for (const token of ['expired', 'superseded', 'Executor', '只读']) {
  if (!approvalsPage.includes(token)) fail(`Approvals UI missing read-only state token ${token}`)
}
if ((!todayPage.includes('approvalCountAvailable') && !todayPage.includes('approvalsAvailable')) || !todayPage.includes('href="/approvals"')) {
  fail('Today must derive the canonical Approval count and deep-link to /approvals')
}
if (!todayPage.includes('formatQueueCount')) {
  fail('Today must use availability-aware formatQueueCount for queue badges')
}

for (const token of [
  'Review-only Phase 2 Approval read-model proposal. Never auto-applied.',
  'create table if not exists public.kenos_action_approvals',
  'enable row level security',
  'security invoker',
  "set search_path = ''",
  'grant select on public.kenos_action_approvals to authenticated',
  'kenos_approval_writer nologin noinherit nobypassrls',
  'revoke all on function public.kenos_list_action_approvals',
]) {
  if (!approvalSql.includes(token)) fail(`Approval review SQL missing security invariant: ${token}`)
}
for (const token of [
  'set local role anon', 'set local role authenticated', 'generic service_role must not become the Approval writer',
  'expected direct insert denial', 'expected direct update denial', 'expected direct delete denial',
  'user B must see exactly one own Approval', 'read RPC leaked another owner', 'approval_expired', 'approval_superseded',
]) {
  if (!approvalSqlTest.includes(token)) fail(`Approval SQL privilege test missing ${token}`)
}
for (const category of [
  'missing_in_new',
  'extra_in_new',
  'owner_mismatch',
  'status_mismatch',
  'freshness_mismatch',
  'deep_link_mismatch',
  'redaction_mismatch',
  'unsupported_source',
  'missing_in_canonical',
  'extra_in_canonical',
  'action_mismatch',
  'correlation_mismatch',
  'risk_mismatch',
  'expiry_mismatch',
  'unsupported_legacy_source',
]) {
  if (!readProjections.includes(`'${category}'`)) fail(`shadow diagnostics missing ${category}`)
}
for (const [path, contents] of [
  ['readSources.js', readSources],
  ['approvalReadSource.core.js', approvalReadSource],
  ['controlCenter.svelte.js', controlCenter],
  ['approvals/+page.svelte', approvalsPage],
]) {
  for (const forbidden of [
    /\.insert\s*\(/,
    /\.upsert\s*\(/,
    /\.update\s*\(/,
    /\.delete\s*\(/,
    /executeCreateTaskCommand/,
    /kenos_create_plan_task_action/,
    /kenos_transition_action_approval/,
    /kenos_store_action_approval/,
  ]) {
    if (forbidden.test(contents)) fail(`${path} crosses the read-only/no-Executor boundary: ${forbidden}`)
  }
}
if (/\.(insert|upsert|update|delete)\s*\(/.test(approvalReadSource)) {
  fail('Assistant canonical Approval adapter must remain RPC-read-only')
}
if (/life_events|outbox/i.test(approvalReadSource)) {
  fail('Assistant must not treat Activity/life_events/Outbox as canonical Approval')
}
for (const token of ['shadowPortalActionBadgeWithCanonicalApprovals', 'canonicalPendingCount', 'unsupported_legacy_source']) {
  if (!portalBadge.includes(token) && !portalBadgeTest.includes(token)) {
    fail(`Portal Approval count shadow helper missing ${token}`)
  }
}

if (!/id:\s*'aios'[\s\S]*?experimental:\s*true/.test(portalApps)) {
  fail('Portal Assistant launcher must remain explicitly experimental')
}
if (!/PORTAL_PRODUCTION_APPS\s*=\s*PORTAL_APPS\.filter\(\(app\)\s*=>\s*!app\.experimental\)/.test(portalApps)) {
  fail('Portal production list must continue to exclude experimental Assistant')
}
for (const token of ['assistant-today', 'assistant-chat', 'assistant-approvals', 'assistant-activity']) {
  if (!portalActions.includes(`id: '${token}'`)) fail(`Portal command palette missing ${token}`)
}
if (!portalStrangler.includes('KENOS_STRANGLER_DEFAULT_ENABLED = false')) {
  fail('Portal Kenos strangler flag must default Off')
}
for (const token of ['portal.kenos.space', "hostname: 'localhost'", "'?kenos=1'", "'/assistant?return=%2Finbox'"]) {
  if (!routingTest.includes(token)) fail(`Portal compatibility routing test missing ${token}`)
}

for (const lock of [
  '不允许生产 migration',
  'writer cutover',
  'Portal 默认域切换',
  'deploy',
  '旧路径删除',
]) {
  if (!runbook.includes(lock)) fail(`Phase 2 runbook missing production lock: ${lock}`)
}
if (!state.includes('LOCAL_BETA_IN_PROGRESS_NO_PRODUCTION_CUTOVER')) {
  fail('execution state must record the local-beta/no-cutover boundary')
}
for (const document of [runbook, ledger, state]) {
  if (!document.includes('LOCAL_READ_ONLY_READY_NO_HOSTED_APPLY')) {
    fail('runbook, ledger, and execution state must use honest LOCAL_READ_ONLY_READY_NO_HOSTED_APPLY primary label')
  }
  if (!document.includes('TEMPORARY_APPROVED_FOR_PHASE_2_APPROVAL_READ_MODEL')) {
    fail('Phase 2 temporary approval token missing from status docs')
  }
}

const controlCore = read('apps/aios/src/lib/kenos/controlCenter.core.js')
const shadowFixtures = read('apps/aios/src/lib/kenos/shadowLegacyFixtures.js')
const todayPageSrc = read('apps/aios/src/routes/+page.svelte')
if (!controlCore.includes('formatQueueCount') || !controlCore.includes('inboxAvailable')) {
  fail('control queue must expose availability-aware counts (unavailable ≠ 0)')
}
if (!todayPageSrc.includes('formatQueueCount(queue.inboxOpen)')) {
  fail('Today must render unavailable Inbox counts as — via formatQueueCount')
}
if (!readProjections.includes('same_source_self_compare_invalid_evidence')) {
  fail('shadow compare must reject same-source self-compare')
}
if (!shadowFixtures.includes('legacyPortalPendingShadowFixture') || !controlCenter.includes('legacyPortalPendingShadowFixture')) {
  fail('Inbox/Activity shadow must use independent legacy fixtures')
}
if (!read('apps/aios/src/lib/mcp.presets.js').includes('writeToolsBlockedUntilHostedRpc')) {
  fail('AIOS Planner MCP preset must mark write tools blocked until hosted RPC')
}
for (const document of [runbook, ledger, state]) {
  for (const lock of ['Executor', 'production', 'cutover']) {
    if (!document.includes(lock)) fail(`Phase 2 docs must preserve ${lock} as a locked gate`)
  }
}

console.log('check-kenos-phase2 — OK')
