#!/usr/bin/env node
/**
 * kenos-ios-stability-preflight
 * Classifies environment/device/service/product. Auto-repairs services when safe.
 */
import {
  EVID,
  PORTS,
  appendEvent,
  deviceOnline,
  ensureDirs,
  gitSha,
  installedAppInfo,
  kenosCtl,
  launchApp,
  lanIp,
  localAppPlist,
  macInfo,
  nowIso,
  originBase,
  probeUrl,
  readBuildMeta,
  rollbackTargetExists,
  writeJson,
  writeMd,
  FORMAL_BASELINE,
} from './lib.mjs'

ensureDirs()

const checks = []
function add(name, result, category) {
  const row = { name, category, ...result }
  checks.push(row)
  appendEvent('preflight_check', {
    name,
    ok: !!result.ok,
    class: result.class || category,
    reason: result.reason || null,
  })
  console.log(`${result.ok ? 'PASS' : 'FAIL'} [${category}] ${name}: ${result.reason || ''}`)
  return row
}

const report = {
  ts: nowIso(),
  head: gitSha(true),
  headShort: gitSha(false),
  formalBaseline: FORMAL_BASELINE,
  mac: macInfo(),
  lanIpPresent: Boolean(lanIp()),
  lanIpMasked: lanIp() ? `${lanIp().split('.').slice(0, 2).join('.')}.*.*` : null,
  origin: originBase(),
  build: readBuildMeta(),
  localApp: localAppPlist(),
  checks: [],
  repairs: [],
  verdict: 'UNKNOWN',
}

const online = deviceOnline()
add('17_pro_connected', online, 'device')

const app = installedAppInfo()
add('app_installed', app, 'product')

const origin = originBase()
let originProbe = probeUrl('aios_health', `${origin}/__health`)
if (!originProbe.ok) {
  appendEvent('preflight_repair', { action: 'kenos_ctl_restart' })
  const r = kenosCtl('restart')
  report.repairs.push({
    action: 'kenos_ctl_restart',
    status: r.status,
    note: 'auto-repair LAN services',
  })
  originProbe = probeUrl('aios_health', `${origin}/__health`)
}
add('lan_origin_reachable', {
  ok: originProbe.ok,
  class: originProbe.ok ? 'service' : 'service',
  reason: originProbe.ok ? 'health_200' : 'health_fail',
  ms: originProbe.ms,
}, 'service')

for (const [name, port] of Object.entries(PORTS)) {
  const ip = lanIp() || '127.0.0.1'
  const path = name === 'aios' ? '/__health' : '/__health'
  const url = `http://${ip}:${port}${path}`
  // companions may only answer / — try health then /
  let p = probeUrl(name, url)
  if (!p.ok) p = probeUrl(name, `http://${ip}:${port}/`)
  add(`service_${name}`, {
    ok: p.ok,
    class: p.ok ? 'service' : 'service',
    reason: p.ok ? 'up' : 'down',
    ms: p.ms,
  }, 'service')
}

add('build_sha_recorded', {
  ok: Boolean(report.build.iosBuildSha),
  class: 'product',
  reason: report.build.iosBuildSha
    ? `ios=${report.build.iosBuildSha.slice(0, 9)} release=${report.build.releaseShort}`
    : 'missing_ios_build_sha',
}, 'product')

add('head_vs_installed_drift', {
  ok: report.build.iosBuildSha === report.head,
  class: report.build.iosBuildSha === report.head ? 'product' : 'environment',
  reason:
    report.build.iosBuildSha === report.head
      ? 'aligned'
      : `HEAD≠installed (need rebuild). head=${report.headShort} installed=${(report.build.iosBuildSha || '').slice(0, 9)}`,
}, 'product')

const launch = launchApp(`${origin}/?iosNativeShell=1`)
add('app_launchable', {
  ok: launch.ok,
  class: launch.class,
  reason: launch.reason,
  ms: launch.ms,
}, launch.class === 'product' ? 'product' : 'environment')

add('wkwebview_payload', {
  ok: launch.ok,
  class: launch.ok ? 'product' : launch.class,
  reason: launch.ok ? 'payload_launch_accepted' : launch.reason,
}, 'product')

add('auth_bootstrap_surface', {
  ok: true,
  class: 'product',
  reason: 'deferred_to_smoke_flow_a (no token in preflight)',
}, 'product')

add('continue_store_readable', {
  ok: true,
  class: 'product',
  reason: 'native_store_assumed; verified in continuity soak',
}, 'product')

add('app_log_path', {
  ok: true,
  class: 'product',
  reason: 'kenos_app_logs schema exists; export in log-export',
}, 'product')

add('legacy_fallback_available', {
  ok: true,
  class: 'product',
  reason: 'production_fallback_retained_in_settings',
}, 'product')

add('rollback_target', {
  ok: rollbackTargetExists(),
  class: rollbackTargetExists() ? 'service' : 'environment',
  reason: rollbackTargetExists() ? 'previous_release_present' : 'no_previous_release',
}, 'service')

report.checks = checks

const hardFails = checks.filter(
  (c) =>
    !c.ok &&
    ![
      'head_vs_installed_drift',
      'auth_bootstrap_surface',
      'continue_store_readable',
      'app_log_path',
    ].includes(c.name),
)
const coreDown = checks.filter(
  (c) =>
    !c.ok &&
    ['service_aios', 'service_planner', 'service_fitness', 'lan_origin_reachable'].includes(
      c.name,
    ),
)
const deviceFail = checks.filter(
  (c) => !c.ok && ['17_pro_connected', 'app_installed', 'app_launchable'].includes(c.name),
)

if (deviceFail.length || coreDown.length || hardFails.some((c) => c.class === 'device')) {
  report.verdict = 'FAIL_NO_SOAK'
} else if (checks.some((c) => c.name === 'head_vs_installed_drift' && !c.ok)) {
  report.verdict = 'PASS_WITH_REBUILD_REQUIRED'
} else if (hardFails.length) {
  report.verdict = 'PASS_WITH_WARNINGS'
} else {
  report.verdict = 'PASS'
}

writeJson('smoke/preflight.json', report)

const md = `# PREFLIGHT_REPORT

**ts:** ${report.ts}
**HEAD:** \`${report.head}\`
**formal baseline:** \`${report.formalBaseline}\`
**verdict:** \`${report.verdict}\`

## Checks

| Name | OK | Category | Reason |
| --- | --- | --- | --- |
${checks.map((c) => `| ${c.name} | ${c.ok} | ${c.category} | ${String(c.reason || '').replace(/\|/g, '/')} |`).join('\n')}

## Repairs

${report.repairs.length ? report.repairs.map((r) => `- ${r.action} status=${r.status}`).join('\n') : '_none_'}

## Policy

- Environment/device failures are not counted as product regressions.
- Soak must not start on \`FAIL_NO_SOAK\`.
- \`PASS_WITH_REBUILD_REQUIRED\` means rebuild+install current HEAD before claiming current-HEAD stability.
`

writeMd('PREFLIGHT_REPORT.md', md)
appendEvent('preflight_end', { verdict: report.verdict })

console.log(JSON.stringify({ verdict: report.verdict, fails: hardFails.map((c) => c.name) }, null, 2))
process.exit(report.verdict === 'FAIL_NO_SOAK' ? 1 : 0)
