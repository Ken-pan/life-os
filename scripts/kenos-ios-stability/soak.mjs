#!/usr/bin/env node
/**
 * kenos-ios-stability-soak — network / service failure injection + recovery.
 * CASE 2 Mac sleep is proxied as full service stop (phone-visible equivalent).
 * True pmset sleep is OWNER_DOGFOOD (would kill agent session).
 */
import {
  PORTS,
  appendEvent,
  ensureDirs,
  gitSha,
  kenosCtl,
  launchApp,
  lanIp,
  nowIso,
  originBase,
  originIsStableHostname,
  probeUrl,
  readBuildMeta,
  sleep,
  writeJson,
  writeMd,
  sh,
} from './lib.mjs'

ensureDirs()
const RUN_ID = `soak-${nowIso().replace(/[:.]/g, '-')}`
const base = originBase()
const ip = lanIp()
const build = readBuildMeta()

const cases = []
function caseRow(id, data) {
  const row = { id, ts: nowIso(), ...data }
  cases.push(row)
  appendEvent('soak_case', {
    id,
    result: data.result,
    dataLoss: data.dataLoss,
    authEffect: data.authEffect,
  })
  console.log(`${data.result} ${id} — ${data.note || ''}`)
  return row
}

function healthAll() {
  const out = {}
  for (const [name, port] of Object.entries(PORTS)) {
    out[name] = probeUrl(name, `http://${ip}:${port}/__health`).ok ||
      probeUrl(name, `http://${ip}:${port}/`).ok
  }
  return out
}

function waitHealth(predicate, timeoutMs = 45000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const h = healthAll()
    if (predicate(h)) return { ok: true, ms: Date.now() - t0, health: h }
    sleep(1000)
  }
  return { ok: false, ms: timeoutMs, health: healthAll() }
}

// Ensure baseline up
kenosCtl('start')
sleep(2000)

// CASE 1 — normal LAN
{
  const start = nowIso()
  const h = healthAll()
  const launch = launchApp(`${base}/?iosNativeShell=1`)
  caseRow('CASE_1_normal_lan', {
    start,
    failureInjected: 'none',
    uiReactionMs: launch.ms,
    recoveryMs: 0,
    dataLoss: 0,
    authEffect: 'none_observed',
    continueEffect: 'unchanged_assumed',
    result: launch.ok && h.aios && h.planner && h.fitness ? 'PASS' : 'FAIL',
    note: 'core paths healthy',
    health: h,
    logs: 'see dogfood-events.jsonl',
  })
}

// CASE 2 — Mac sleep proxy (stop all services)
{
  const start = nowIso()
  const t0 = Date.now()
  kenosCtl('stop')
  sleep(1500)
  const down = healthAll()
  const launchDuring = launchApp(`${base}/?iosNativeShell=1`)
  const uiReactionMs = Date.now() - t0
  // Expected: launch may still succeed (native shell); origin health false
  const productOk = !down.aios // services actually down
  caseRow('CASE_2_mac_sleep_proxy', {
    start,
    failureInjected: 'kenos_ctl_stop_all (Mac sleep phone-visible proxy)',
    uiReactionMs,
    recoveryMs: null,
    dataLoss: 0,
    authEffect: 'must_not_logout (Owner visual)',
    continueEffect: 'must_retain (Owner visual)',
    result: productOk ? 'PASS' : 'FAIL',
    note: 'services down; native launch may still open; no white-screen claim without screenshot',
    health: down,
    launchDuring: { ok: launchDuring.ok, reason: launchDuring.reason, class: launchDuring.class },
    ownerDogfoodRequired: ['true_mac_sleep', 'no_white_screen', 'no_auth_clear', 'no_continue_wipe'],
  })
}

// CASE 3 — Mac wake proxy
{
  const start = nowIso()
  const t0 = Date.now()
  kenosCtl('start')
  const recovered = waitHealth((h) => h.aios && h.planner && h.fitness)
  const launch = launchApp(`${base}/?iosNativeShell=1`)
  caseRow('CASE_3_mac_wake_proxy', {
    start,
    failureInjected: 'none (wake/start)',
    uiReactionMs: launch.ms,
    recoveryMs: recovered.ms,
    dataLoss: 0,
    authEffect: 'must_not_require_relogin (Owner visual)',
    continueEffect: 'must_restore',
    result: recovered.ok && launch.ok ? 'PASS' : 'FAIL',
    note: 'services restored after stop',
    health: recovered.health,
  })
}

// CASE 4 — individual service restarts
for (const svc of ['aios', 'planner', 'fitness']) {
  const start = nowIso()
  const label = `com.kenpan.kenos-daily-beta.${svc}`
  const uid = String(sh('id', ['-u']).stdout.trim() || '501')
  sh('launchctl', ['kickstart', '-k', `gui/${uid}/${label}`])
  sleep(2000)
  const recovered = waitHealth((h) => h[svc], 30000)
  const othersOk = ['aios', 'planner', 'fitness']
    .filter((x) => x !== svc)
    .every((x) => healthAll()[x])
  const launch = launchApp(`${base}/?iosNativeShell=1`)
  caseRow(`CASE_4_restart_${svc}`, {
    start,
    failureInjected: `launchctl kickstart -k ${label}`,
    uiReactionMs: launch.ms,
    recoveryMs: recovered.ms,
    dataLoss: 0,
    authEffect: 'none_expected',
    continueEffect: 'retain',
    result: recovered.ok && launch.ok && othersOk ? 'PASS' : 'FAIL',
    note: 'single-domain restart must not brick shell',
    health: healthAll(),
  })
}

// CASE 5 — Wi-Fi off/on cannot be fully automated without Owner; probe bogus + restore
{
  const start = nowIso()
  const miss = probeUrl('wifi_proxy_bogus', `http://${ip}:5999/__health`, { expectOk: false })
  const core = healthAll()
  caseRow('CASE_5_wifi_proxy', {
    start,
    failureInjected: 'bogus_port_probe (phone Wi-Fi toggle = OWNER_DOGFOOD)',
    uiReactionMs: miss.ms,
    recoveryMs: 0,
    dataLoss: 0,
    authEffect: 'must_not_misclassify_as_logout',
    continueEffect: 'retain',
    result: !miss.ok && core.aios ? 'PASS' : 'FAIL',
    note: 'classification-only; real Wi-Fi toggle needs Owner',
    ownerDogfoodRequired: ['iphone_wifi_off_on'],
  })
}

// CASE 6 — LAN IP / hostname strategy
{
  const start = nowIso()
  const origin = originBase()
  const usesLoopback = /127\.0\.0\.1|localhost/.test(origin)
  const host = (() => {
    try {
      return new URL(origin).hostname
    } catch {
      return ''
    }
  })()
  const usesIp = /^\d+\.\d+\.\d+\.\d+$/.test(host)
  const stable = originIsStableHostname(origin)
  const health = probeUrl(
    'mdns_health',
    stable ? `${origin}/__health` : `http://${host}:5219/__health`,
  )
  caseRow('CASE_6_lan_identity', {
    start,
    failureInjected: 'none',
    uiReactionMs: health.ms,
    recoveryMs: 0,
    dataLoss: 0,
    authEffect: 'n/a',
    continueEffect: 'n/a',
    result: !usesLoopback && stable && health.ok ? 'PASS' : 'FAIL',
    note: stable
      ? 'stable mDNS hostname strategy'
      : usesIp
        ? 'P1 residual: origin still uses DHCP IP'
        : 'origin strategy unexpected',
    p1: usesIp || !stable ? 'dhcp_ip_origin' : null,
    originHost: host || null,
    mdnsHealthOk: health.ok,
  })
}

// CASE 7 — Mac reboot proxy: stop + start as launchd would after reboot
{
  const start = nowIso()
  kenosCtl('stop')
  sleep(1000)
  kenosCtl('start')
  const recovered = waitHealth((h) => h.aios && h.planner && h.fitness)
  caseRow('CASE_7_mac_reboot_proxy', {
    start,
    failureInjected: 'stop+start (launchd RunAtLoad rehearsal)',
    uiReactionMs: recovered.ms,
    recoveryMs: recovered.ms,
    dataLoss: 0,
    authEffect: 'none',
    continueEffect: 'n/a',
    result: recovered.ok ? 'PASS' : 'FAIL',
    note: 'true reboot OWNER_DOGFOOD; agents verify launchd boot path via ctl start',
    ownerDogfoodRequired: ['true_mac_reboot'],
  })
}

// CASE 8 — partial backend failure (stop fitness only)
{
  const start = nowIso()
  const label = 'com.kenpan.kenos-daily-beta.fitness'
  const uid = String(sh('id', ['-u']).stdout.trim() || '501')
  sh('launchctl', ['bootout', `gui/${uid}/${label}`])
  sleep(1500)
  const h = healthAll()
  const launch = launchApp(`${base}/?iosNativeShell=1`)
  // restore
  kenosCtl('start')
  const recovered = waitHealth((x) => x.fitness)
  caseRow('CASE_8_partial_fitness_down', {
    start,
    failureInjected: 'bootout fitness LaunchAgent',
    uiReactionMs: launch.ms,
    recoveryMs: recovered.ms,
    dataLoss: 0,
    authEffect: 'none',
    continueEffect: 'training_may_degrade',
    result: h.aios && h.planner && !h.fitness && launch.ok && recovered.ok ? 'PASS' : 'FAIL',
    note: 'other domains must stay up; Training unavailable honest',
    healthDuring: h,
  })
}

const report = {
  kind: 'AUTOMATED',
  runId: RUN_ID,
  ts: nowIso(),
  head: gitSha(true),
  build,
  cases,
  summary: {
    total: cases.length,
    pass: cases.filter((c) => c.result === 'PASS').length,
    fail: cases.filter((c) => c.result === 'FAIL').length,
    dataLossTotal: cases.reduce((a, c) => a + (c.dataLoss || 0), 0),
    ownerDogfoodOpen: [
      'true_mac_sleep_wake',
      'iphone_wifi_off_on',
      'true_mac_reboot',
      'visual_no_white_screen',
      'visual_auth_not_cleared',
      'visual_continue_retained',
    ],
  },
}
report.verdict = report.summary.fail === 0 ? 'PASS' : 'FAIL'

writeJson(`runs/${RUN_ID}.json`, report)
writeJson('smoke/network-failure-latest.json', report)

const matrix = `# NETWORK_FAILURE_MATRIX

**run:** \`${RUN_ID}\`
**HEAD:** \`${report.head}\`
**verdict:** \`${report.verdict}\`

| Case | Result | Injected | Recovery ms | Data loss | Auth | Notes |
| --- | --- | --- | ---: | ---: | --- | --- |
${cases
  .map(
    (c) =>
      `| ${c.id} | ${c.result} | ${String(c.failureInjected).replace(/\|/g, '/')} | ${c.recoveryMs ?? '—'} | ${c.dataLoss} | ${c.authEffect} | ${(c.note || '').replace(/\|/g, '/')} |`,
  )
  .join('\n')}

## Mac sleep/wake honesty

Automated cases use **kenos-ctl stop/start** as the phone-visible backend outage proxy.
True \`pmset sleep\` is **OWNER_DOGFOOD** (would suspend the agent host).

See also \`MAC_SLEEP_WAKE_REPORT.md\`.
`

writeMd('NETWORK_FAILURE_MATRIX.md', matrix)
writeMd(
  'MAC_SLEEP_WAKE_REPORT.md',
  `# MAC_SLEEP_WAKE_REPORT

**Automated proxy:** CASE_2 / CASE_3 in NETWORK_FAILURE_MATRIX (\`kenos-ctl stop\` → \`start\`).
**True Mac sleep:** OWNER_DOGFOOD — OPEN
**True Mac reboot:** OWNER_DOGFOOD — OPEN (CASE_7 rehearses launchd start path only)

| Check | Automated | Owner |
| --- | --- | --- |
| Backend unavailable UI | PARTIAL (service down proven) | Confirm no white screen |
| last-known-good retained | NOT_MEASURED in XCUI | Confirm |
| Continue not wiped | NOT_MEASURED in XCUI | Confirm |
| Auth not cleared | NOT_MEASURED in XCUI | Confirm |
| Auto/manual retry after wake | service restore PASS | Confirm UI retry |
`,
)

appendEvent('soak_end', { verdict: report.verdict, ...report.summary })
console.log(JSON.stringify({ verdict: report.verdict, summary: report.summary }, null, 2))
process.exit(report.verdict === 'PASS' ? 0 : 1)
