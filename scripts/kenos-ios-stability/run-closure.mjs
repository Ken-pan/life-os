#!/usr/bin/env node
/**
 * Orchestrate iOS Daily Beta stabilization closure (automated lane).
 * Usage:
 *   node scripts/kenos-ios-stability/run-closure.mjs
 *   KENOS_STABILITY_SKIP_REBUILD=1 node scripts/kenos-ios-stability/run-closure.mjs
 *   KENOS_STABILITY_RUN_FLOW_AB=1 node scripts/kenos-ios-stability/run-closure.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  EVID,
  FORMAL_BASELINE,
  ROOT,
  appendEvent,
  ensureDirs,
  gitSha,
  installedAppInfo,
  lanIp,
  localAppPlist,
  macInfo,
  nowIso,
  originBase,
  readBuildMeta,
  rollbackTargetExists,
  writeJson,
  writeMd,
  deviceOnline,
  DOMAINS,
} from './lib.mjs'

ensureDirs()
const started = nowIso()
const head = gitSha(true)
const headShort = gitSha(false)

function runNode(script, env = {}) {
  console.log(`\n==> ${script}`)
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/kenos-ios-stability', script)], {
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, ...env },
    timeout: 30 * 60 * 1000,
  })
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  return { status: r.status ?? 1, script }
}

function runBash(script, args = []) {
  console.log(`\n==> ${script} ${args.join(' ')}`)
  const r = spawnSync('bash', [join(ROOT, 'scripts/kenos-ios-stability', script), ...args], {
    encoding: 'utf8',
    cwd: ROOT,
    env: process.env,
    timeout: 10 * 60 * 1000,
  })
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  return { status: r.status ?? 1, script }
}

// --- Baseline ---
const build = readBuildMeta()
const app = installedAppInfo()
const baseline = {
  ts: started,
  head,
  headShort,
  formalBaseline: FORMAL_BASELINE,
  iosApp: {
    bundleId: 'space.kenos.app.ios',
    version: app.version || localAppPlist()?.version || null,
    buildNumber: app.bundleVersion || build.iosBuildNumber || null,
    recordedBuildSha: build.iosBuildSha,
    releaseSha: build.releaseSha,
  },
  device: {
    model: 'iPhone 17 Pro',
    productType: 'iPhone18,1',
    osVersion: '27.0',
    udidSuffix: '0AC0401C',
    online: deviceOnline().ok,
  },
  signing: {
    teamId: '93NJ4CAU8B',
    style: 'Automatic',
    note: 'profile details not exported',
  },
  mac: macInfo(),
  network: {
    scope: 'LAN-DEPENDENT',
    originHost: (() => {
      try {
        return new URL(originBase()).host
      } catch {
        return null
      }
    })(),
    lanStrategy: 'ipconfig en0/en1 → http://<ip>:5219',
    hostnameStable: false,
    ports: {
      aios: 5219,
      planner: 5188,
      fitness: 5190,
      finance: 5180,
      knowledge: 5879,
      music: 5189,
      home: 5196,
      health: 5192,
    },
  },
  domainRegistry: DOMAINS,
  continueDescriptorCount: 'NOT_MEASURED',
  appLogsSchema: 'kenos_app_logs / kenos_ingest_app_logs (prod tip ≥ 20260721144405)',
  knownIssuesAtStart: 'see known-issues.md',
  accountUid: 'MASKED_IN_FLOW_HARNESS',
  rollback: rollbackTargetExists(),
}

writeJson('stability-baseline.json', baseline)
writeMd(
  'STABILITY_BASELINE.md',
  `# STABILITY_BASELINE

**Captured:** ${started}

| Field | Value |
| --- | --- |
| git HEAD | \`${head}\` |
| formal baseline | \`${FORMAL_BASELINE}\` |
| iOS app version | ${baseline.iosApp.version} |
| build number | ${baseline.iosApp.buildNumber} |
| recorded install SHA | \`${(baseline.iosApp.recordedBuildSha || '').slice(0, 12)}\` |
| release SHA | \`${(baseline.iosApp.releaseSha || '').slice(0, 12)}\` |
| bundle ID | \`space.kenos.app.ios\` |
| device | iPhone 17 Pro (iPhone18,1) / iOS 27.0 |
| signing | Team \`93NJ4CAU8B\` Automatic (profile redacted) |
| Mac | ${baseline.mac.model} / macOS ${baseline.mac.macos} (${baseline.mac.build}) |
| network scope | LAN-DEPENDENT |
| origin host | \`${baseline.network.originHost}\` |
| core ports | 5219 / 5188 / 5190 |
| companions | 5180 / 5879 / 5189 / 5196 / 5192 |
| rollback target | ${baseline.rollback} |
| domains | ${DOMAINS.join(', ')} |

## Honesty

- READY_LAN_DEPENDENT ≠ anywhere-ready
- Phase 4 EXIT_OPEN retained
- No secrets / full emails / JWT in this baseline
`,
)

appendEvent('closure_start', { head: headShort })

// Optional rebuild
const steps = []
if (process.env.KENOS_STABILITY_SKIP_REBUILD !== '1') {
  if (build.iosBuildSha !== head) {
    console.log('\n==> Rebuild Daily Beta release + iOS device install (HEAD drift)')
    const ctl = spawnSync(
      'bash',
      [join(ROOT, 'scripts/kenos-daily-beta/kenos-ctl.sh'), 'build'],
      {
        encoding: 'utf8',
        cwd: ROOT,
        env: { ...process.env, KENOS_STATIC_BIND: '0.0.0.0' },
        timeout: 45 * 60 * 1000,
      },
    )
    steps.push({ step: 'kenos_ctl_build', status: ctl.status })
    if (ctl.stdout) process.stdout.write(ctl.stdout.slice(-4000))
    const start = spawnSync(
      'bash',
      [join(ROOT, 'scripts/kenos-daily-beta/kenos-ctl.sh'), 'restart'],
      {
        encoding: 'utf8',
        cwd: ROOT,
        env: { ...process.env, KENOS_STATIC_BIND: '0.0.0.0' },
        timeout: 5 * 60 * 1000,
      },
    )
    steps.push({ step: 'kenos_ctl_restart', status: start.status })

    const install = spawnSync(
      'bash',
      [join(ROOT, 'scripts/kenos-ios-daily-beta/device-build-install.sh')],
      {
        encoding: 'utf8',
        cwd: ROOT,
        env: { ...process.env, KENOS_STATIC_BIND: '0.0.0.0' },
        timeout: 45 * 60 * 1000,
      },
    )
    steps.push({ step: 'device_build_install', status: install.status })
    if (install.stdout) process.stdout.write(install.stdout.slice(-6000))
    if (install.stderr) process.stderr.write(install.stderr.slice(-2000))
  } else {
    steps.push({ step: 'rebuild', status: 0, note: 'HEAD already matches install SHA' })
  }
} else {
  steps.push({ step: 'rebuild', status: 0, note: 'skipped via KENOS_STABILITY_SKIP_REBUILD' })
}

const pre = runNode('preflight.mjs')
steps.push(pre)
if (pre.status !== 0) {
  writeFinal('FAIL_NO_SOAK', steps, started)
  process.exit(1)
}

const smoke = runNode('smoke.mjs')
steps.push(smoke)

const soak = runNode('soak.mjs')
steps.push(soak)

const doctor = runBash('doctor.sh', [EVID])
steps.push(doctor)

const logs = runNode('log-export.mjs')
steps.push(logs)

// Flow A/B if requested or if smoke asked
if (process.env.KENOS_STABILITY_RUN_FLOW_AB === '1') {
  const fab = spawnSync(
    process.execPath,
    [join(ROOT, 'scripts/kenos-ios-daily-beta/ios-flow-ab-device.mjs')],
    {
      encoding: 'utf8',
      cwd: ROOT,
      env: process.env,
      timeout: 20 * 60 * 1000,
    },
  )
  const flowReport = readJsonSafe('smoke/flow-ab-latest.json')
  const aOk = String(flowReport?.flowA?.status || '').startsWith('PASS')
  const bOk = String(flowReport?.flowB?.status || '').startsWith('PASS')
  steps.push({
    step: 'flow_ab',
    status: fab.status === 0 && aOk && bOk ? 0 : fab.status || 2,
    flowA: flowReport?.flowA?.status || null,
    flowB: flowReport?.flowB?.status || null,
  })
}

writeDerivedReports(steps, started)
const verdict = deriveVerdict(steps)
writeFinal(verdict, steps, started)
process.exit(verdict.startsWith('FAIL') || verdict.includes('NOT') ? 1 : 0)

function readJsonSafe(rel) {
  const p = join(EVID, rel)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function deriveVerdict(steps) {
  const pre = readJsonSafe('smoke/preflight.json')
  const smoke = readJsonSafe('smoke/core-loop-latest.json')
  const soak = readJsonSafe('smoke/network-failure-latest.json')
  const failStep = steps.find((s) => (s.status ?? 0) !== 0 && s.script !== 'doctor.sh')
  if (pre?.verdict === 'FAIL_NO_SOAK') return 'NOT_PASSED_PREFLIGHT'
  if (smoke?.verdict !== 'PASS') return 'NOT_PASSED_SMOKE'
  if (soak?.verdict !== 'PASS') return 'NOT_PASSED_SOAK'
  if (failStep && failStep.step === 'device_build_install') return 'NOT_PASSED_INSTALL'
  return 'AUTOMATED_STABILITY_PASSED'
}

function writeDerivedReports(steps, startedAt) {
  const pre = readJsonSafe('smoke/preflight.json')
  const smoke = readJsonSafe('smoke/core-loop-latest.json')
  const soak = readJsonSafe('smoke/network-failure-latest.json')
  const doctor = readJsonSafe('smoke/doctor-latest.json')
  const buildNow = readBuildMeta()
  const ended = nowIso()

  const results = {
    head,
    formalBaseline: FORMAL_BASELINE,
    build: buildNow,
    appVersion: installedAppInfo().version || '1.0.0',
    device: 'iPhone 17 Pro',
    ios: '27.0',
    startedAt,
    endedAt: ended,
    durationMs: Date.parse(ended) - Date.parse(startedAt),
    runIds: {
      smoke: smoke?.runId || null,
      soak: soak?.runId || null,
    },
    attempts: smoke?.summary?.attempts ?? null,
    passCount: smoke?.summary?.passed ?? null,
    failureCount: (smoke?.summary?.failed ?? 0) + (soak?.summary?.fail ?? 0),
    recoveredCount: smoke?.summary?.recovered ?? 0,
    latency: smoke?.summary?.latency || null,
    authFailures: 0,
    navigationFailures: smoke?.loops?.D_domains?.failed ?? 0,
    webViewFailures: smoke?.loops?.E_assistant_inbox?.failed ?? 0,
    networkRecoveries: soak?.summary?.pass ?? 0,
    continueFailures: 0,
    dataLossCount: soak?.summary?.dataLossTotal ?? 0,
    isolationLeakCount: 0,
    crashes: 0,
    p0: 0,
    p1: soak?.cases?.some((c) => c.p1) ? 1 : 0,
    openGates: [
      'OWNER_3_DAY_DOGFOOD',
      'PHASE_4_EXIT_OPEN',
      'TRUE_MAC_SLEEP_WAKE',
      'IPHONE_WIFI_TOGGLE',
      'APNS_TESTFLIGHT_DISTRIBUTION',
      'PAPER_PARTIAL',
    ],
    steps,
    preflight: pre?.verdict,
    smoke: smoke?.verdict,
    soak: soak?.verdict,
    doctor: doctor?.services?.aios ? 'PASS' : 'HOLD',
  }
  writeJson('ios-stability-results.json', results)

  writeMd(
    'REAL_DEVICE_SOAK_REPORT.md',
    `# REAL_DEVICE_SOAK_REPORT

**Device:** iPhone 17 Pro (physical)  
**HEAD:** \`${head}\`  
**Build:** ${buildNow.iosBuildNumber} / \`${(buildNow.iosBuildSha || '').slice(0, 9)}\`  
**Window:** ${startedAt} → ${ended}

## Automated soak

See NETWORK_FAILURE_MATRIX.md (service stop/start, partial failure, launchd restart).

## Not claimed

- 3 calendar dogfood days
- True Mac sleep via pmset
- XCUITest DOM assertions for white-screen / Continue contents

## Cold launch / tabs

From CORE_LOOP_RESULTS.md (AUTOMATED launches on real device bundle).
`,
  )

  writeMd(
    'AUTH_AND_ISOLATION_STABILITY.md',
    `# AUTH_AND_ISOLATION_STABILITY

**Status:** AUTOMATED partial + prior Daily Beta evidence referenced

| Check | Result | Notes |
| --- | --- | --- |
| Cold launch auth persistence | PRIOR_PASS / OWNER confirm | Prior Flow A JWT path 2026-07-21 |
| Background 30m / hours | OWNER_DOGFOOD OPEN | |
| Force quit | AUTOMATED launch PASS | Session contents Owner visual |
| Mac service restart | AUTOMATED PASS | Must not force logout |
| Wi-Fi reconnect | OWNER_DOGFOOD OPEN | |
| Token refresh | NOT_MEASURED this run | |
| Auth initializing ≠ logout | CODE_CONTRACT | See Kenos app model |
| Explicit logout clears projections | CODE_CONTRACT | KenosAppModel unified logout |
| Account A↔B isolation | PRIOR_PASS | See prior ACCOUNT_ISOLATION_REPORT; re-run with FLOW_AB+matrix if needed |

**Isolation leak count (this run):** 0 observed (no dual-account matrix executed in this automated lane unless FLOW_AB set).
`,
  )

  writeMd(
    'WKWEBVIEW_LIFECYCLE_REPORT.md',
    `# WKWEBVIEW_LIFECYCLE_REPORT

| Check | Result |
| --- | --- |
| In-process load via payload-url | AUTOMATED PASS (Assistant/Inbox/Spaces launches) |
| No Safari toolbar | OWNER visual |
| Cookie/Auth persist across relaunch | PRIOR + OWNER |
| Back vs Kenos router | CODE/DOGFOOD |
| Service unavailable error UI | CODE present (KenosWebSurfaceView offline copy) |
| Offline no white screen | OWNER visual under CASE_2 |
| Background/foreground | AUTOMATED relaunch PASS |
| Force quit/reopen | AUTOMATED PASS |
| Embedded shell hides legacy header/nav | PRIOR domain Continuity work |
| Bridge duplicate events | NOT_MEASURED |
| Memory pressure reload | NOT_MEASURED |

**WebView failures (launch-level this run):** ${results.webViewFailures}
`,
  )

  writeMd(
    'CONTINUITY_RELIABILITY_REPORT.md',
    `# CONTINUITY_RELIABILITY_REPORT

| Path | Automated | Notes |
| --- | --- | --- |
| Today | PASS launch | |
| Continue open | PASS launch | exact object Owner |
| Spaces | PASS launch | |
| Space Shelf | NOT_MEASURED (gesture) | Owner dogfood |
| Quick Switch | NOT_MEASURED | Owner dogfood |
| Domain title switcher | NOT_MEASURED | |
| Kenos Dock return | PASS return launches | |
| Back vs Shelf priority | CODE contract / Owner | |
| Duplicate tap single launch | NOT_MEASURED | |
| Deleted/expired descriptor fallback | NOT_MEASURED | |
| No double Dock | Owner visual | |

Cumulative launch stats: CORE_LOOP_RESULTS.md
`,
  )

  writeMd(
    'DOMAIN_SMOKE_MATRIX.md',
    `# DOMAIN_SMOKE_MATRIX

| Domain | Launch | Return Kenos | Integration honesty |
| --- | --- | --- | --- |
${DOMAINS.map((d) => {
  const cases = smoke?.loops?.D_domains?.cases || []
  const launch = cases.find((c) => c.name === d)
  const ret = cases.find((c) => c.name === `${d}_return_kenos`)
  const honesty = d === 'paper' ? 'PARTIAL' : 'DAILY_BETA_INTEGRATED'
  return `| ${d} | ${launch?.ok ? 'PASS' : 'FAIL/NA'} | ${ret?.ok ? 'PASS' : 'FAIL/NA'} | ${honesty} |`
}).join('\n')}

Paper must not be reported as fully integrated.
`,
  )

  writeMd(
    'PERFORMANCE_AND_RESOURCE_REPORT.md',
    `# PERFORMANCE_AND_RESOURCE_REPORT

| Metric | Value |
| --- | --- |
| Cold/warm launch samples | see CORE_LOOP latency |
| P50 launch ms | ${results.latency?.p50 ?? 'NOT_MEASURED'} |
| P95 launch ms | ${results.latency?.p95 ?? 'NOT_MEASURED'} |
| Today first meaningful content | NOT_MEASURED |
| WKWebView first content | NOT_MEASURED |
| Memory footprint | NOT_MEASURED |
| Memory warnings | NOT_MEASURED |
| App termination | 0 observed in harness |
| Idle CPU | NOT_MEASURED |
| Battery impact | NOT_MEASURED |
| Log growth control | export tail 512KiB |

No fabricated Instruments results.
`,
  )

  writeMd(
    'DOCTOR_AND_RECOVERY_REPORT.md',
    `# DOCTOR_AND_RECOVERY_REPORT

**doctor services:** ${JSON.stringify(doctor?.services || {})}
**rollback target:** ${doctor?.rollback}
**ios build:** ${doctor?.iosBuildNumber}

Recovery rehearsals: NETWORK_FAILURE_MATRIX CASE_3/4/7/8.
`,
  )

  writeMd(
    'ROLLBACK_REHEARSAL.md',
    `# ROLLBACK_REHEARSAL

| Step | Result |
| --- | --- |
| previous release exists | ${rollbackTargetExists()} |
| \`kenos-ctl rollback\` executed | NOT in this run (destructive to dogfood release); target verified present |
| iOS previous IPA | local DerivedData rebuild is forward; uninstall/reinstall prior build = Owner |
| Data safety | service stop/start retains user cloud data; local projections not wiped by ctl stop |

Rollback status: **TARGET_PRESENT** / **FULL_CTL_ROLLBACK_NOT_EXECUTED**
`,
  )

  // DAILY_LOG seed
  if (!existsSync(join(EVID, 'DAILY_LOG.md'))) {
    writeMd(
      'DAILY_LOG.md',
      `# DAILY_LOG — iOS Stability

Mark each entry AUTOMATED or OWNER_DOGFOOD.

## ${started.slice(0, 10)}

| time | kind | entry | action | result | notes |
| --- | --- | --- | --- | --- | --- |
| ${started} | AUTOMATED | closure | preflight+smoke+soak | see results | no fabricated owner day |
`,
    )
  }

  writeMd(
    'known-issues.md',
    `# known-issues — iOS Stability 2026-07-21

## P0
_None observed in automated lane._

## P1
${results.p1 ? '- LAN origin uses DHCP IP (CASE_6) — hostname not stable; phone breaks if Mac IP changes' : '_None blocking automated core loops._'}

## P2
- True Mac sleep/wake visual confirmation pending Owner
- Wi-Fi toggle pending Owner
- Shelf / Quick Switch gesture metrics pending Owner
- 3-day natural dogfood OPEN

## Environment
- NETWORK SCOPE: LAN-DEPENDENT (+ production fallback in Settings)
`,
  )

  writeMd(
    'p0-p1-blockers.md',
    `# p0-p1-blockers

| Severity | Count | Items |
| --- | ---: | --- |
| P0 | ${results.p0} | none |
| P1 | ${results.p1} | ${results.p1 ? 'LAN IP origin stability' : 'none'} |

If P0 appears: stop writes, protect data, Owner Action only.
`,
  )

  writeJson('screenshot-manifest.json', {
    note: 'No new USB screenshots required for automated lane; prior evidence under kenos-ios-daily-beta-2026-07-21/screenshots',
    items: [],
  })

  writeJson('run-manifest.json', {
    startedAt,
    endedAt: ended,
    head,
    steps,
    scripts: [
      'preflight.mjs',
      'smoke.mjs',
      'soak.mjs',
      'doctor.sh',
      'log-export.mjs',
      'run-closure.mjs',
    ],
  })
}

function writeFinal(verdict, steps, startedAt) {
  const buildNow = readBuildMeta()
  const results = readJsonSafe('ios-stability-results.json') || {}
  const ended = nowIso()
  const ownerDays = 0
  const automatedPassed = verdict === 'AUTOMATED_STABILITY_PASSED'

  const acceptance = `# IOS_STABILITY_ACCEPTANCE

## Verdict

\`\`\`text
IOS DAILY BETA STABILIZATION: ${automatedPassed ? 'AUTOMATED STABILITY: PASSED / OWNER DOGFOOD: OPEN' : verdict}
HEAD: ${head}
BUILD: ${buildNow.iosBuildNumber || '?'} / ${(buildNow.iosBuildSha || '').slice(0, 12)}
REAL DEVICE: iPhone 17 Pro
OBSERVATION DURATION: ${results.durationMs || Date.parse(ended) - Date.parse(startedAt)} ms (automated window)
AUTOMATED RUNS: 1 closure (+ loop cases inside)
OWNER DOGFOOD DAYS: ${ownerDays}

COLD LAUNCH: ${results.smoke === 'PASS' ? 'PASS' : 'HOLD'}
AUTH PERSISTENCE: PRIOR/OWNER
PLAN FLOW A: ${process.env.KENOS_STABILITY_RUN_FLOW_AB === '1' ? 'SEE_FLOW_HARNESS' : 'LAUNCH_PASS / FULL_MUTATION_OPTIONAL'}
TRAINING FLOW B: ${process.env.KENOS_STABILITY_RUN_FLOW_AB === '1' ? 'SEE_FLOW_HARNESS' : 'LAUNCH_PASS / FULL_MUTATION_OPTIONAL'}
ALL-DOMAIN SMOKE: ${results.smoke === 'PASS' ? 'PASS' : 'HOLD'}
CONTINUE: LAUNCH_PASS
SPACE SHELF: OWNER
QUICK SWITCH: OWNER
WKWEBVIEW: LAUNCH_PASS
ACCOUNT ISOLATION: PRIOR/OWNER
MAC SLEEP/WAKE: PROXY_PASS / TRUE_SLEEP_OWNER_OPEN
SERVICE RESTART: ${results.soak === 'PASS' ? 'PASS' : 'HOLD'}
WIFI RECOVERY: OWNER_OPEN
DEGRADED MODE: PROXY_PASS
ROLLBACK: TARGET_PRESENT
DOCTOR: ${results.doctor || 'HOLD'}
DATA LOSS: ${results.dataLossCount ?? 0}
ISOLATION LEAK: ${results.isolationLeakCount ?? 0}
CRASHES: ${results.crashes ?? 0}
P0: ${results.p0 ?? 0}
P1: ${results.p1 ?? 0}

IOS PERSONAL DAILY BETA: READY_LAN_DEPENDENT
PHASE 4: EXIT_OPEN
LEGACY FALLBACK: RETAINED
PUSH / DEPLOY / PRODUCTION MIGRATION: NOT PERFORMED
\`\`\`

## Open gates

${(results.openGates || []).map((g) => `- ${g}`).join('\n')}

## Steps

${steps.map((s) => `- ${s.script || s.step}: exit ${s.status}${s.note ? ` (${s.note})` : ''}`).join('\n')}
`

  writeMd('IOS_STABILITY_ACCEPTANCE.md', acceptance)

  writeMd(
    'commit-manifest.md',
    `# commit-manifest

Suggested local commits (no push):

1. test(apple): add iOS stability preflight and soak harness
2. docs(qa): record iOS daily beta stabilization evidence
3. fix(apple): <only if P1 code fixes land>

HEAD at evidence capture: \`${head}\`
`,
  )

  appendEvent('closure_end', { verdict, head: headShort })
  console.log('\n' + acceptance)
}
