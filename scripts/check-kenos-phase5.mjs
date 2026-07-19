#!/usr/bin/env node
/**
 * Phase 5 Focus / Contextual Intelligence local guard.
 * Behavioral contracts must be backed by tests — not string matching alone.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const fail = (message) => {
  console.error(`check-kenos-phase5 — FAIL: ${message}`)
  process.exit(1)
}
const read = (path) => readFileSync(path, 'utf8')
const mustExist = (path) => {
  if (!existsSync(path)) fail(`missing required path ${path}`)
}

const decision = read('docs/architecture/kenos-decision-register.md')
const ledger = read('docs/roadmap/KENOS_MIGRATION_LEDGER.md')
const state = read('docs/roadmap/KENOS_REFACTOR_EXECUTION_STATE.md')
const appleArch = read('docs/architecture/kenos-apple-client-architecture.md')
const verify = read('scripts/verify-kenos-refactor.sh')
const focusTs = read('packages/contracts/src/kenos-focus.ts')
const focusRuntime = read('packages/contracts/src/kenos-focus-runtime.ts')
const focusTest = read('packages/contracts/scripts/kenos-focus.test.mjs')
const aiosRuntime = read('apps/aios/src/lib/kenos/focusRuntime.core.js')
const aiosStore = read('apps/aios/src/lib/kenos/focusStore.core.js')
const aiosStoreTest = read('apps/aios/src/lib/kenos/focusStore.test.js')
const aiosLayout = read('apps/aios/src/routes/+layout.svelte')
const chat = read('apps/aios/src/lib/chat.svelte.js')
const swiftFocus = read('clients/apple/Packages/KenosContracts/Sources/KenosContracts/KenosFocus.swift')
const swiftRuntime = read('clients/apple/Packages/KenosContracts/Sources/KenosContracts/KenosFocusRuntime.swift')
const swiftStore = read('clients/apple/Packages/KenosClient/Sources/KenosClient/KenosFocusStore.swift')
const rootView = read('clients/apple/Apps/Shared/KenosRootView.swift')
const watchApp = read('clients/apple/Apps/watchOS/Sources/KenosWatchApp.swift')
const qa = existsSync('docs/qa/kenos-phase5-contextual-intelligence.md')
  ? read('docs/qa/kenos-phase5-contextual-intelligence.md')
  : ''

const phase5Foundation = existsSync('docs/architecture/kenos-phase5-focus-foundation.md')
  ? read('docs/architecture/kenos-phase5-focus-foundation.md')
  : ''
if (
  !decision.includes('TEMPORARY_APPROVED_FOR_PHASE_5_FOCUS_FOUNDATION') &&
  !phase5Foundation.includes('TEMPORARY_APPROVED_FOR_PHASE_5_FOCUS_FOUNDATION')
) {
  fail('missing TEMPORARY_APPROVED_FOR_PHASE_5_FOCUS_FOUNDATION (decision register or phase5 foundation doc)')
}
if (!state.includes('Phase 5') || !state.includes('CONTEXTUAL_INTELLIGENCE')) {
  fail('Execution State missing Phase 5 contextual intelligence closeout')
}
if (!ledger.includes('CONTEXTUAL_INTELLIGENCE') && !ledger.includes('PHASE_5')) {
  fail('Migration Ledger missing Phase 5 status row')
}
if (!appleArch.includes('Today · Assistant · Spaces · Inbox')) {
  fail('Apple architecture must keep unified top-level IA')
}
if (!verify.includes('check-kenos-phase5.mjs')) {
  fail('verify-kenos-refactor.sh must invoke Phase 5 guard')
}

for (const path of [
  'packages/contracts/src/kenos-focus.ts',
  'packages/contracts/src/kenos-focus-runtime.ts',
  'packages/contracts/scripts/kenos-focus.test.mjs',
  'apps/aios/src/lib/kenos/focusRuntime.core.js',
  'apps/aios/src/lib/kenos/focusStore.core.js',
  'apps/aios/src/lib/kenos/focusStore.test.js',
  'apps/aios/src/routes/focus/+page.svelte',
  'apps/aios/src/routes/spaces/training/+page.svelte',
  'apps/aios/src/routes/spaces/work/+page.svelte',
  'clients/apple/Packages/KenosContracts/Sources/KenosContracts/KenosFocus.swift',
  'clients/apple/Packages/KenosClient/Sources/KenosClient/KenosFocusStore.swift',
  'docs/qa/kenos-phase5-contextual-intelligence.md',
]) {
  mustExist(path)
}

for (const token of [
  'KenosFocusContextSchema',
  'KenosFocusStatusTransitions',
  'KenosDeferredItemSchema',
  'KenosProactiveSuggestionSchema',
  'KenosInterventionBudgetSchema',
  'KenosSessionSummarySchema',
]) {
  if (!focusTs.includes(token)) fail(`Focus contract missing ${token}`)
}

for (const token of [
  'evaluateInterruption',
  'startFocusSession',
  'deferInterruption',
  'resolveAssistantScope',
  'canShowSuggestion',
  'buildSessionSummary',
  'appleFocusSuggestion',
  'hidesGlobalNavigation',
]) {
  if (!focusRuntime.includes(token)) fail(`Focus runtime missing ${token}`)
  if (!aiosRuntime.includes(token)) fail(`AIOS focus runtime mirror missing ${token}`)
}

for (const token of ['startTrainingFocus', 'startDeepWorkFocus', 'temporarilyLeaveFocus', 'endFocus', 'showDeferredBadge']) {
  if (!aiosStore.includes(token)) fail(`AIOS focus store missing ${token}`)
}
if (!aiosStore.includes('showDeferredBadge: false')) {
  fail('Active Focus must not show deferred anxiety badges')
}
if (!aiosLayout.includes('hideGlobalNav') || !aiosLayout.includes('Focus Session')) {
  fail('AIOS layout must hide global navigation during Focus Session')
}
if (!chat.includes('Focus Session') || !chat.includes('禁止主动提起被隐藏域')) {
  fail('Scoped Assistant prompt enforcement missing in chat.svelte.js')
}

for (const token of ['FocusContext', 'FocusStatus', 'DeferredItem', 'ProactiveSuggestion']) {
  if (!swiftFocus.includes(token)) fail(`Swift Focus contracts missing ${token}`)
}
for (const token of ['evaluateInterruption', 'startFocusSession', 'hidesGlobalNavigation', 'resolveAssistantScope']) {
  if (!swiftRuntime.includes(token)) fail(`Swift Focus runtime missing ${token}`)
}
if (!swiftStore.includes('startTrainingFocus') || !swiftStore.includes('startDeepWorkFocus')) {
  fail('KenosFocusStore missing Training/Deep Work vertical starters')
}
if (!rootView.includes('FocusSession') && !rootView.includes('FocusSessionView')) {
  fail('Apple root view missing Focus session UI')
}
if (!watchApp.includes('Focus') && !watchApp.includes('focus')) {
  fail('Watch must present Focus-active session surface')
}

// Production locks
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === '.build' || name === 'DerivedData' || name === 'node_modules' || name === 'xcuserdata') continue
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) walk(path, out)
    else if (/\.(swift|js|mjs|svelte|ts|yml|md)$/.test(name)) out.push(path)
  }
  return out
}

for (const file of [
  ...walk('apps/aios/src/lib/kenos'),
  ...walk('clients/apple/Packages/KenosClient/Sources/KenosClient'),
  ...walk('packages/contracts/src'),
]) {
  const text = read(file)
  if (text.includes('ProductionExecutor')) fail(`production Executor reference in ${file}`)
  if (text.includes('autoApproveAll')) fail(`autoApproveAll in ${file}`)
  if (/api\.push\.apple\.com/.test(text)) fail(`production APNs endpoint in ${file}`)
}

if (focusRuntime.includes('autoEnter: true') && !focusRuntime.includes('requiresUserConfirm: true')) {
  fail('Apple Focus integration must not default auto-enter without confirm')
}
if (!focusRuntime.includes('Foreground Focus already active')) {
  fail('Focus runtime must reject a second foreground Focus')
}
if (!focusTest.includes('explicit_cross_domain') || !focusTest.includes('resolveAssistantScope')) {
  fail('Focus contract tests must cover scoped Assistant cross-domain behavior')
}
if (!aiosStoreTest.includes('Training Focus') || !aiosStoreTest.includes('Deep Work')) {
  fail('AIOS focusStore tests must cover Training and Deep Work vertical slices')
}
if (!qa.includes('Training') || !qa.includes('Deep Work') || !qa.includes('PARTIAL_PASS') || !qa.includes('no production')) {
  fail('Phase 5 QA doc must cover Training/Deep Work and production gates honesty')
}

// Behavioral: run focused test suites (not string-only)
const run = (cmd, args, cwd = process.cwd()) => {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    fail(`behavioral test failed: ${cmd} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  }
}

run('node', ['packages/contracts/scripts/kenos-focus.test.mjs'])
run('node', ['--test', 'apps/aios/src/lib/kenos/focusStore.test.js'])

console.log('check-kenos-phase5 — OK')
