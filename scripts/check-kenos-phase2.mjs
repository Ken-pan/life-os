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
const controlCenter = read('apps/aios/src/lib/kenos/controlCenter.svelte.js')
const portalStrangler = read('apps/portal/src/lib/kenosStrangler.js')
const routingTest = read('apps/portal/scripts/kenos-strangler-routing.test.mjs')
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
  "sourceState('unsupported'",
  'settleReadSources',
]) {
  if (!readSources.includes(token)) fail(`read adapter missing expected boundary: ${token}`)
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
]) {
  if (!readProjections.includes(`'${category}'`)) fail(`shadow diagnostics missing ${category}`)
}
for (const [path, contents] of [
  ['readSources.js', readSources],
  ['controlCenter.svelte.js', controlCenter],
]) {
  for (const forbidden of [
    /\.insert\s*\(/,
    /\.upsert\s*\(/,
    /\.update\s*\(/,
    /\.delete\s*\(/,
    /executeCreateTaskCommand/,
    /kenos_create_plan_task_action/,
  ]) {
    if (forbidden.test(contents)) fail(`${path} crosses the read-only/no-Executor boundary: ${forbidden}`)
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
  if (!document.includes('PARTIAL_PASS_WITH_EXPLICIT_READ_MODEL_BLOCKERS')) {
    fail('runbook, ledger, and execution state must agree on the Phase 2 partial verdict')
  }
  if (!document.includes('canonical Approval read model')) {
    fail('Phase 2 docs must preserve the explicit canonical Approval read-model blocker')
  }
}

console.log('check-kenos-phase2 — OK')
