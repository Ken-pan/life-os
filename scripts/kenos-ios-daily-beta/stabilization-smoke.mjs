#!/usr/bin/env node
/**
 * iOS Daily Beta Stabilization — Day-0 / recurring smoke + LAN probes.
 * Appends to docs/qa/evidence/kenos-ios-dogfood-2026-07/dogfood-events.jsonl
 * Never logs tokens, emails, or user payloads.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const DOG = join(ROOT, 'docs/qa/evidence/kenos-ios-dogfood-2026-07')
const DEVICE = process.env.KENOS_IOS_DEVICE || '8097F071-CAB6-5AF0-8258-BCD985E9D79E'
const BUNDLE = 'space.kenos.app.ios'
const LAN =
  process.env.KENOS_LAN_IP ||
  spawnSync('ipconfig', ['getifaddr', 'en0'], { encoding: 'utf8' }).stdout.trim() ||
  spawnSync('ipconfig', ['getifaddr', 'en1'], { encoding: 'utf8' }).stdout.trim()

mkdirSync(join(DOG, 'smoke'), { recursive: true })
mkdirSync(join(DOG, 'logs'), { recursive: true })

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...opts })
}

function event(type, data) {
  const row = {
    ts: new Date().toISOString(),
    type,
    ...data,
  }
  appendFileSync(join(DOG, 'dogfood-events.jsonl'), JSON.stringify(row) + '\n')
  return row
}

function classifyLaunch(stdout, stderr, status) {
  const blob = `${stdout}${stderr}`
  if (blob.includes('Locked')) return { ok: false, class: 'environment', reason: 'device_locked' }
  if (status !== 0) return { ok: false, class: 'environment', reason: 'launch_failed' }
  return { ok: true, class: 'product', reason: 'launched' }
}

function probeOrigin(label, url) {
  const t0 = Date.now()
  const r = sh('curl', ['-sf', '--max-time', '3', '-o', '/dev/null', '-w', '%{http_code}', url])
  const ms = Date.now() - t0
  const code = (r.stdout || '').trim()
  const ok = r.status === 0 && code === '200'
  return {
    label,
    urlHost: (() => {
      try {
        return new URL(url).host
      } catch {
        return 'invalid'
      }
    })(),
    ok,
    httpCode: code || null,
    ms,
    class: ok ? 'backend' : 'network',
  }
}

function gitSha() {
  return sh('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).stdout.trim()
}

function dailyBetaRelease() {
  const link = sh('readlink', [join(process.env.HOME || '', '.kenos-daily-beta/current')]).stdout.trim()
  return link ? link.split('/').pop() : null
}

const report = {
  ts: new Date().toISOString(),
  phase: 'IOS_DAILY_BETA_STABILIZATION',
  frozen: {
    macWeb: 'READY',
    iosPersonal: 'READY_LAN_DEPENDENT',
    overall: 'READY_LAN_DEPENDENT',
    ia: 'LOCKED',
    phase4: 'EXIT_OPEN',
  },
  build: {
    gitSha: gitSha(),
    dailyBetaRelease: dailyBetaRelease(),
    lanIpPresent: Boolean(LAN),
  },
  lan: {},
  entry: {},
  usb: {},
}

event('stabilization_smoke_start', {
  gitSha: report.build.gitSha,
  dailyBetaRelease: report.build.dailyBetaRelease,
  hasLanIp: report.build.lanIpPresent,
})

// --- LAN probes ---
const origins = [
  ['kenos_health', `http://${LAN || '127.0.0.1'}:5219/__health`],
  ['kenos_loopback_health', 'http://127.0.0.1:5219/__health'],
  ['planner', `http://${LAN || '127.0.0.1'}:5188/`],
  ['fitness', `http://${LAN || '127.0.0.1'}:5190/`],
]
const lanResults = []
for (const [label, url] of origins) {
  const p = probeOrigin(label, url)
  lanResults.push(p)
  event('lan_probe', p)
}
report.lan = {
  results: lanResults,
  allCriticalOk: lanResults.filter((x) => x.label.startsWith('kenos')).every((x) => x.ok),
}

// Temporary unavailable simulation: probe bogus port — App must not be tested here; just document expected class
const miss = probeOrigin('bogus_port', `http://${LAN || '127.0.0.1'}:5999/__health`)
miss.class = 'network'
miss.note = 'expected_fail_for_classification'
lanResults.push(miss)
event('lan_probe', miss)

// --- USB / unlock / cold launch ---
const usbList = sh('idevice_id', ['-l']).stdout.trim().split('\n').filter(Boolean)
report.usb = { present: usbList.length > 0, count: usbList.length }
event('usb_probe', report.usb)

const launch = sh('xcrun', [
  'devicectl',
  'device',
  'process',
  'launch',
  '--terminate-existing',
  '--device',
  DEVICE,
  ...(LAN
    ? ['--payload-url', `http://${LAN}:5219/?iosNativeShell=1`]
    : []),
  BUNDLE,
])
const launchClass = classifyLaunch(launch.stdout, launch.stderr, launch.status)
report.entry.coldLaunch = launchClass
event('cold_launch', launchClass)

if (launchClass.ok) {
  // force-quit = terminate-existing again then relaunch
  spawnSync('sleep', ['2'])
  const relaunch = sh('xcrun', [
    'devicectl',
    'device',
    'process',
    'launch',
    '--terminate-existing',
    '--device',
    DEVICE,
    ...(LAN ? ['--payload-url', `http://${LAN}:5219/?iosNativeShell=1`] : []),
    BUNDLE,
  ])
  const rq = classifyLaunch(relaunch.stdout, relaunch.stderr, relaunch.status)
  report.entry.forceQuitRelaunch = rq
  event('force_quit_relaunch', rq)
}

// Tab deep links (entry reliability) — launch only, no screenshot required
const tabs = [
  ['today', '/?iosNativeShell=1'],
  ['assistant', '/assistant?iosNativeShell=1'],
  ['spaces', '/spaces?iosNativeShell=1'],
  ['inbox', '/inbox?iosNativeShell=1'],
  ['continue', '/?iosNativeShell=1&openContinue=1'],
]
report.entry.tabs = []
if (launchClass.ok) {
  for (const [name, path] of tabs) {
    const r = sh('xcrun', [
      'devicectl',
      'device',
      'process',
      'launch',
      '--terminate-existing',
      '--device',
      DEVICE,
      '--payload-url',
      `http://${LAN}:5219${path}`,
      BUNDLE,
    ])
    const c = classifyLaunch(r.stdout, r.stderr, r.status)
    const row = { tab: name, ...c }
    report.entry.tabs.push(row)
    event('tab_launch', row)
    spawnSync('sleep', ['1'])
  }
}

writeFileSync(join(DOG, 'smoke/lan-probe-day0.json'), JSON.stringify(report.lan, null, 2))
writeFileSync(join(DOG, 'smoke/entry-smoke-day0.json'), JSON.stringify(report.entry, null, 2))
writeFileSync(join(DOG, 'smoke/stabilization-smoke-day0.json'), JSON.stringify(report, null, 2))

// Patch NETWORK report with Day-0 results
const netMd = join(DOG, 'NETWORK_RECOVERY_REPORT.md')
if (existsSync(netMd)) {
  const { readFileSync } = await import('node:fs')
  let t = readFileSync(netMd, 'utf8')
  const block = `
## Day-0 automated results (${report.ts})

| Probe | OK | Class | ms |
| --- | --- | --- | --- |
${lanResults
  .map((p) => `| ${p.label} | ${p.ok} | ${p.class} | ${p.ms} |`)
  .join('\n')}

Cold launch: **${launchClass.ok ? 'PASS' : 'FAIL'}** (${launchClass.class}/${launchClass.reason})
`
  if (!t.includes('Day-0 automated results')) t = t.trimEnd() + '\n' + block + '\n'
  writeFileSync(netMd, t)
}

event('stabilization_smoke_end', {
  lanOk: report.lan.allCriticalOk,
  coldLaunchOk: launchClass.ok,
})

console.log(JSON.stringify(report, null, 2))
process.exit(launchClass.ok && report.lan.allCriticalOk ? 0 : 1)
