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
const runbook = read('docs/ops/kenos-phase2-assistant-portal.md')
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
]) {
  read(file)
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

console.log('check-kenos-phase2 — OK')
