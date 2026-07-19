#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const fail = (message) => {
  console.error(`check-kenos-phase4b — FAIL: ${message}`)
  process.exit(1)
}
const read = (path) => readFileSync(path, 'utf8')
const mustExist = (path) => {
  if (!existsSync(path)) fail(`missing required path ${path}`)
}

const role = read('docs/architecture/kenos-phase4b-watch-role.md')
const decision = read('docs/architecture/kenos-decision-register.md')
const ledger = read('docs/roadmap/KENOS_MIGRATION_LEDGER.md')
const state = read('docs/roadmap/KENOS_REFACTOR_EXECUTION_STATE.md')
const refactor = read('docs/architecture/KENOS_REFACTOR.md')
const verify = read('scripts/verify-kenos-refactor.sh')
const projectYml = read('clients/apple/Apps/project.yml')
const watchApp = read('clients/apple/Apps/watchOS/Sources/KenosWatchApp.swift')
const notifications = read('clients/apple/Packages/KenosNotifications/Sources/KenosNotifications/KenosNotifications.swift')
const handoff = read('clients/apple/Packages/KenosHandoff/Sources/KenosHandoff/KenosHandoff.swift')
const glances = read('clients/apple/Packages/KenosClient/Sources/KenosClient/KenosGlances.swift')
const complication = read('clients/apple/Packages/KenosNotifications/Sources/KenosNotifications/KenosComplicationFoundation.swift')
const qa = existsSync('docs/qa/kenos-phase4b-cross-device-daily-loop.md')
  ? read('docs/qa/kenos-phase4b-cross-device-daily-loop.md')
  : ''

if (!decision.includes('TEMPORARY_APPROVED_FOR_PHASE_4B_CROSS_DEVICE_DAILY_LOOP')) {
  fail('decision register missing Phase 4B temporary status')
}
if (!role.includes('companion surface') || !role.includes('CaptureEnvelope')) {
  fail('watch role doc must define companion boundaries and CaptureEnvelope')
}
if (!ledger.includes('CROSS_DEVICE_DAILY_LOOP_READY') && !ledger.includes('PARTIAL_PASS_CROSS_DEVICE_FOUNDATION_READY_WITH_DISTRIBUTION_GATES')) {
  fail('Migration Ledger must record Phase 4B cross-device status')
}
if (!state.includes('Phase 4B') && !state.includes('CROSS_DEVICE_DAILY_LOOP')) {
  fail('Execution State missing Phase 4B closeout')
}
if (!refactor.includes('Phase 4B') && !refactor.includes('CROSS_DEVICE')) {
  fail('KENOS_REFACTOR.md must mention Phase 4B')
}
if (!verify.includes('check-kenos-phase4b.mjs')) {
  fail('verify-kenos-refactor.sh must invoke Phase 4B guard')
}

for (const path of [
  'clients/apple/Packages/KenosNotifications',
  'clients/apple/Packages/KenosHandoff',
  'clients/apple/Apps/watchOS/Sources/KenosWatchApp.swift',
  'clients/apple/Apps/Extensions/Widget/Sources/KenosWidgetBundle.swift',
  'clients/apple/Packages/KenosClient/Sources/KenosClient/KenosGlances.swift',
]) {
  mustExist(path)
}

if (!projectYml.includes('KenosWatch') || !projectYml.match(/platform:\s*watchOS/)) {
  fail('project.yml must include KenosWatch watchOS target')
}
if (!projectYml.includes('space.kenos.app.ios.watch')) {
  fail('watch placeholder bundle ID missing (must nest under ios companion id)')
}
if (!projectYml.includes('group.space.kenos.app') && !projectYml.includes('App Group placeholder') && !role.includes('App Group')) {
  fail('App Group placeholder gate must be documented')
}

for (const token of ['TodayGlance', 'ApprovalGlance', 'ActivityGlance', 'CaptureDraftGlance', 'KenosGlanceMapper']) {
  if (!glances.includes(token)) fail(`glance mapping missing ${token}`)
}
if (glances.includes('struct WatchTask') || glances.includes('WatchApprovalTruth')) {
  fail('must not invent Watch canonical truth types')
}

for (const token of [
  'KenosNotificationRecord',
  'deduplicationKey',
  'lockScreenBody',
  'MockNotificationProvider',
  'criticalAlertsEnabled: false',
  'isLocalDistributionPreference',
]) {
  if (!notifications.includes(token)) fail(`notifications package missing ${token}`)
}
if (notifications.includes('APNs') && notifications.includes('URLSession') && notifications.includes('api.push.apple.com')) {
  fail('must not wire production APNs')
}

for (const token of [
  'KenosHandoffEnvelope',
  'idempotencyKey',
  'correlationId',
  'FakeCompanionTransport',
  'transferCapture',
  'unsupportedVersion',
  'ownerMismatch',
]) {
  if (!handoff.includes(token)) fail(`handoff package missing ${token}`)
}

for (const surface of ['WatchTodayView', 'WatchCaptureView', 'WatchInboxView', 'WatchApprovalsView', 'WatchActivityView']) {
  if (!watchApp.includes(surface)) fail(`watch app missing ${surface}`)
}
if (!watchApp.includes('approvalsActionsEnabled = false') || !watchApp.includes('.disabled(!model.approvalsActionsEnabled)')) {
  fail('Watch Approvals must remain read-only / disabled')
}
if (watchApp.includes('ProductionExecutor') || watchApp.includes('approveApproval(')) {
  fail('Watch must not call production Executor or approve')
}

if (!complication.includes('KenosComplicationFoundation') || !complication.includes('summaryLine')) {
  fail('complication/widget foundation helpers missing')
}

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
for (const file of walk('clients/apple')) {
  const text = read(file)
  if (/DEVELOPMENT_TEAM\s*=\s*[A-Z0-9]{8,}/.test(text)) fail(`hardcoded Team ID in ${file}`)
  if (/sk_live_|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/.test(text)) fail(`possible secret in ${file}`)
}
if (projectYml.match(/DEVELOPMENT_TEAM:\s*"[A-Z0-9]{8,}"/)) {
  fail('project.yml must keep DEVELOPMENT_TEAM empty placeholder')
}

for (const marker of ['proactiveAutonomy', 'Phase5Proactive', 'autoApproveAll']) {
  if (watchApp.includes(marker) || handoff.includes(marker) || notifications.includes(marker)) {
    fail(`Phase 5 marker found: ${marker}`)
  }
}

if (qa && (!qa.includes('40mm') || !qa.includes('VoiceOver') || !qa.includes('zero-write'))) {
  fail('Phase 4B QA doc must cover 40mm, VoiceOver, and zero-write Approval evidence')
}

console.log('check-kenos-phase4b — OK')
