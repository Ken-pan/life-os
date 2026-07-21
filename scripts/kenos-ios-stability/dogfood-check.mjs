#!/usr/bin/env node
/**
 * kenos-ios-dogfood-check — one-line daily readiness for Owner.
 * READY FOR TODAY | ACTION NEEDED: <one issue>
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEVICE,
  EVID,
  ROOT,
  deviceOnline,
  gitSha,
  installedAppInfo,
  kenosCtl,
  lanIp,
  localHostName,
  nowIso,
  originBase,
  originIsStableHostname,
  probeUrl,
  readBuildMeta,
  rollbackTargetExists,
} from './lib.mjs'

const DOG = join(ROOT, 'docs/qa/evidence/kenos-ios-dogfood-2026-07')
mkdirSync(DOG, { recursive: true })

const issues = []
function need(msg) {
  issues.push(msg)
}

const build = readBuildMeta()
const origin = originBase()
const mdns = localHostName()
const online = deviceOnline()
if (!online.ok) need('unlock/connect iPhone 17 Pro')

const app = installedAppInfo()
if (!app.ok) need('install Kenos on 17 Pro')

if (!originIsStableHostname(origin)) {
  need(`stable hostname missing (origin=${origin || 'empty'})`)
}

const health = probeUrl('shell', `${origin}/__health`)
if (!health.ok) {
  // try restart once
  kenosCtl('start')
  const again = probeUrl('shell', `${origin}/__health`)
  if (!again.ok) need(`Daily Beta shell unreachable at ${mdns}.local:5219 — run kenos-ctl start`)
}

for (const [name, port] of [
  ['planner', 5188],
  ['fitness', 5190],
]) {
  const host = (() => {
    try {
      return new URL(origin).hostname
    } catch {
      return mdns ? `${mdns}.local` : lanIp()
    }
  })()
  const p = probeUrl(name, `http://${host}:${port}/__health`)
  if (!p.ok) {
    const root = probeUrl(name, `http://${host}:${port}/`)
    if (!root.ok) need(`${name} down on ${host}:${port}`)
  }
}

if (!rollbackTargetExists()) need('no rollback target (~/.kenos-daily-beta/previous)')

// Doctor summary (non-fatal if locked)
const doctor = spawnSync(
  'bash',
  [join(ROOT, 'scripts/kenos-ios-stability/doctor.sh'), EVID],
  { encoding: 'utf8', timeout: 60_000 },
)

const report = {
  ts: nowIso(),
  head: gitSha(true),
  build,
  originHost: (() => {
    try {
      return new URL(origin).host
    } catch {
      return null
    }
  })(),
  stableHostname: originIsStableHostname(origin),
  localHostName: mdns,
  deviceOnline: online.ok,
  appInstalled: app.ok,
  appBuild: app.bundleVersion || null,
  rollback: rollbackTargetExists(),
  issues,
  doctorExit: doctor.status,
}

const day = nowIso().slice(0, 10)
writeFileSync(join(DOG, `check-${day}.json`), JSON.stringify(report, null, 2) + '\n')
writeFileSync(join(DOG, 'check-latest.json'), JSON.stringify(report, null, 2) + '\n')

if (issues.length === 0) {
  console.log('READY FOR TODAY')
  process.exit(0)
}
console.log(`ACTION NEEDED: ${issues[0]}`)
if (issues.length > 1) {
  for (const i of issues.slice(1)) console.log(`  also: ${i}`)
}
process.exit(1)
