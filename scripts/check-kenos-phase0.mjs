#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const requiredFiles = [
  'docs/architecture/kenos-domain-ownership-inventory.md',
  'docs/architecture/kenos-policy-matrices.md',
  'docs/architecture/kenos-decision-register.md',
  'docs/roadmap/KENOS_MIGRATION_LEDGER.md',
  'docs/roadmap/KENOS_REFACTOR_EXECUTION_STATE.md',
]

const fail = (message) => {
  console.error(`check-kenos-phase0 — FAIL: ${message}`)
  process.exit(1)
}

const read = (path) => readFileSync(path, 'utf8')

for (const path of requiredFiles) read(path)

const inventory = read('docs/architecture/kenos-domain-ownership-inventory.md')
const policy = read('docs/architecture/kenos-policy-matrices.md')
const decisions = read('docs/architecture/kenos-decision-register.md')
const ledger = read('docs/roadmap/KENOS_MIGRATION_LEDGER.md')
const state = read('docs/roadmap/KENOS_REFACTOR_EXECUTION_STATE.md')

for (const token of ['TODO', 'Plan task / `plan.task`', 'life_events', 'INV-001', 'INV-002']) {
  if (!inventory.includes(token === 'TODO' ? 'UNKNOWN' : token)) fail(`inventory missing expected Phase 0 evidence token: ${token}`)
}
if (inventory.includes('| TODO |')) fail('inventory still contains placeholder table rows')

for (const decision of ['OPEN-001', 'OPEN-002', 'OPEN-003', 'OPEN-004', 'OPEN-005', 'OPEN-006', 'OPEN-007', 'OPEN-008']) {
  if (!decisions.includes(decision)) fail(`decision register missing ${decision}`)
  const signoffLine = policy.split('\n').find((line) => line.startsWith(`| ${decision} `))
  if (!signoffLine) fail(`policy sign-off queue missing ${decision}`)
  if (!/PENDING/.test(signoffLine)) fail(`${decision} must remain owner PENDING`)
}

for (const risk of ['R0', 'R1', 'R2', 'R3', 'R4']) {
  if (!policy.includes(`| ${risk} |`)) fail(`policy matrix missing ${risk}`)
}

if (!ledger.includes('MIGRATION: KR-P1-001 Plan create task Action/Outbox vertical slice')) fail('ledger missing first reversible migration slice')
for (const required of ['Target single writer:', 'Rollback deadline and steps:', 'Compatibility removal date:', 'Remaining unknowns:']) {
  if (!ledger.includes(required)) fail(`ledger migration slice missing ${required}`)
}

for (const line of `${policy}\n${ledger}`.split('\n')) {
  if (/OWNER_PENDING|PENDING/.test(line) && /IMPLEMENTED/.test(line)) fail('owner-pending material must not claim IMPLEMENTED')
}

const changed = [
  ...execSync('git diff --name-only', { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  ...execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
]
const allowed = [/^AGENTS\.md$/, /^docs\/architecture\/KENOS_REFACTOR\.md$/, /^docs\/architecture\/kenos-.*\.md$/, /^docs\/roadmap\/KENOS_REFACTOR_.*\.md$/, /^docs\/roadmap\/KENOS_MIGRATION_LEDGER\.md$/, /^docs\/ops\/kenos-.*\.md$/, /^docs\/qa\/README\.md$/, /^docs\/qa\/kenos-.*\.md$/, /^scripts\/verify-kenos-refactor\.sh$/, /^scripts\/check-kenos-.*\.mjs$/, /^tests\/kenos\//]
const krP1001RuntimeAllowed = ledger.includes('Status: `TEMPORARY_APPROVED_FOR_KR-P1-001`')
  ? [
      /^apps\/planner\/src\/lib\/domain\/planTaskCommand(\.test)?\.js$/,
      /^apps\/planner\/src\/lib\/domain\/tasks\.js$/,
      /^apps\/planner\/src\/lib\/persist\/migrate\.js$/,
      /^apps\/planner\/server\/mcpTasks(\.test)?\.mjs$/,
      /^apps\/planner\/netlify\/functions\/mcp\.mjs$/,
    ]
  : []
for (const path of changed) {
  if (![...allowed, ...krP1001RuntimeAllowed].some((pattern) => pattern.test(path))) fail(`allowlist violation in diff: ${path}`)
}

for (const token of ['Starting revision:', 'S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'Phase 0 preparation definition of done:']) {
  if (!state.includes(token)) fail(`execution state missing ${token}`)
}

console.log('check-kenos-phase0 — OK')
