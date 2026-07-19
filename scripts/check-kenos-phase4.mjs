#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const fail = (message) => {
  console.error(`check-kenos-phase4 — FAIL: ${message}`)
  process.exit(1)
}

const read = (path) => readFileSync(path, 'utf8')
const mustExist = (path) => {
  if (!existsSync(path)) fail(`missing required path ${path}`)
}

const inventory = read('docs/architecture/kenos-phase4a-apple-inventory.md')
const decisionRegister = read('docs/architecture/kenos-decision-register.md')
const ledger = read('docs/roadmap/KENOS_MIGRATION_LEDGER.md')
const state = read('docs/roadmap/KENOS_REFACTOR_EXECUTION_STATE.md')
const refactor = read('docs/architecture/KENOS_REFACTOR.md')
const verify = read('scripts/verify-kenos-refactor.sh')
const qa = existsSync('docs/qa/kenos-phase4a-native-daily-loop.md')
  ? read('docs/qa/kenos-phase4a-native-daily-loop.md')
  : ''

if (!decisionRegister.includes('TEMPORARY_APPROVED_FOR_PHASE_4A_NATIVE_DAILY_LOOP')) {
  fail('decision register missing Phase 4A temporary ownership status')
}
if (!inventory.includes('clients/apple') || !inventory.includes('KenosClient')) {
  fail('Phase 4A inventory must name clients/apple foundation packages')
}
if (!ledger.includes('APPLE_NATIVE_DAILY_LOOP_READY') && !ledger.includes('PARTIAL_PASS_NATIVE_FOUNDATION_READY_WITH_DISTRIBUTION_GATES')) {
  fail('Migration Ledger must record Phase 4A native daily loop status')
}
if (!state.includes('Phase 4A') && !state.includes('APPLE_NATIVE_DAILY_LOOP')) {
  fail('Execution State missing Phase 4A closeout')
}
if (!refactor.includes('Phase 4A') && !refactor.includes('APPLE_NATIVE')) {
  fail('KENOS_REFACTOR.md must mention Phase 4A')
}
if (!verify.includes('check-kenos-phase4.mjs')) {
  fail('verify-kenos-refactor.sh must invoke Phase 4 guard')
}

for (const path of [
  'clients/apple/Packages/KenosContracts',
  'clients/apple/Packages/KenosClient',
  'clients/apple/Packages/KenosStore',
  'clients/apple/Packages/KenosActions',
  'clients/apple/Packages/KenosDesign',
  'clients/apple/Apps/project.yml',
  'clients/apple/Apps/iOS/Sources/KenosApp.swift',
  'clients/apple/Apps/macOS/Sources/KenosMacApp.swift',
  'clients/apple/Apps/Shared/KenosRootView.swift',
  'clients/apple/Apps/Shared/KenosAppModel.swift',
]) {
  mustExist(path)
}

const client = read('clients/apple/Packages/KenosClient/Sources/KenosClient/KenosClient.swift')
const store = read('clients/apple/Packages/KenosStore/Sources/KenosStore/KenosStore.swift')
const actions = read('clients/apple/Packages/KenosActions/Sources/KenosActions/KenosActions.swift')
const design = read('clients/apple/Packages/KenosDesign/Sources/KenosDesign/KenosDesign.swift')
const rootView = read('clients/apple/Apps/Shared/KenosRootView.swift')
const appModel = read('clients/apple/Apps/Shared/KenosAppModel.swift')
const macApp = read('clients/apple/Apps/macOS/Sources/KenosMacApp.swift')
const projectYml = read('clients/apple/Apps/project.yml')

for (const token of [
  'KenosKeychainSessionStore',
  'InMemorySecureStore',
  'KenosDeepLinkRouter',
  'MockKenosAPIClient',
  'kenos://today',
  'kenos://work/project/',
  'kenos://plan/task/',
]) {
  if (!client.includes(token)) fail(`KenosClient missing ${token}`)
}

for (const token of ['FileProjectionStore', 'KenosReadRepository', 'restrictedLocalOnly', 'stale', 'unavailable']) {
  if (!store.includes(token)) fail(`KenosStore missing ${token}`)
}

for (const token of [
  'KenosOfflineActionQueue',
  'FakeActionExecutor',
  'productionWrite',
  'requiresApproval',
  'idempotencyKey',
  'KenosCaptureFactory',
]) {
  if (!actions.includes(token)) fail(`KenosActions missing ${token}`)
}

if (!design.includes('KenosStatusBanner') || !design.includes('accessibilityIdentifier')) {
  fail('KenosDesign missing semantic status/a11y primitives')
}

for (const surface of [
  'TodayView',
  'AssistantView',
  'InboxView',
  'ApprovalsView',
  'ActivityView',
  'WorkHubView',
  'CaptureView',
  'SystemStatusView',
]) {
  if (!rootView.includes(surface)) fail(`App shell missing ${surface}`)
}

if (!rootView.includes('approvalsActionsEnabled') || !rootView.includes('.disabled(!model.approvalsActionsEnabled)')) {
  fail('Approval actions must remain disabled / read-only')
}
if (!appModel.includes('approvalsActionsEnabled = false')) {
  fail('App model must keep Approval production actions Off')
}
if (!actions.includes('FakeActionExecutor') || actions.includes('ProductionExecutor')) {
  // ProductionExecutor string must not appear as a live type in this foundation slice.
}
if (actions.includes('struct ProductionExecutor') || client.includes('struct ProductionExecutor')) {
  fail('Phase 4A must not introduce a production Executor')
}

if (!macApp.includes('MenuBarExtra') || !macApp.includes('Quick Capture')) {
  fail('macOS app must include menu bar Quick Capture foundation')
}

if (!projectYml.includes('space.kenos.app.ios') || !projectYml.includes('space.kenos.app.macos')) {
  fail('project.yml must declare local/dev placeholder bundle IDs')
}
// Phase 4B may add a watchOS companion target under the same Kenos product.
if (projectYml.match(/platform:\s*watchOS/) && !existsSync('docs/architecture/kenos-phase4b-watch-role.md')) {
  fail('watchOS target requires Phase 4B watch role doc')
}

const forbiddenSecretPatterns = [
  /sk_live_[A-Za-z0-9]+/,
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /-----BEGIN (RSA )?PRIVATE KEY-----/,
]
const appleRoots = ['clients/apple/Packages', 'clients/apple/Apps']
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === '.build' || name === 'DerivedData' || name === 'xcuserdata') continue
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) walk(path, out)
    else if (/\.(swift|yml|md|plist|json|mjs)$/.test(name)) out.push(path)
  }
  return out
}
for (const root of appleRoots) {
  for (const file of walk(root)) {
    const text = read(file)
    for (const pattern of forbiddenSecretPatterns) {
      if (pattern.test(text)) fail(`possible hardcoded secret in ${file}`)
    }
    if (
      text.includes('UserDefaults.standard') &&
      (text.includes('setValue') || text.includes('set(')) &&
      (text.includes('token') || text.includes('accessToken')) &&
      !file.includes('Tests')
    ) {
      fail(`session token must not use UserDefaults (${file})`)
    }
  }
}

if (client.includes('UserDefaults') && client.includes('tokenAccount')) {
  // Keychain tests may mention UserDefaults negatively; ensure save path is secure store only.
  if (!client.includes('secureStore.writeSecret')) fail('session save must write via secure store')
}

const proactiveMarkers = ['proactiveAutonomy', 'Phase5Proactive', 'autoApproveAll']
for (const marker of proactiveMarkers) {
  if (rootView.includes(marker) || appModel.includes(marker) || actions.includes(marker)) {
    fail(`Phase 5 creep marker found: ${marker}`)
  }
}

if (qa && (!qa.includes('VoiceOver') || !qa.includes('390'))) {
  fail('Phase 4A QA doc must cover accessibility and 390×844 baseline')
}

console.log('check-kenos-phase4 — OK')
