#!/usr/bin/env node
/**
 * Hostname / LAN origin regression.
 * CASE B (real DHCP renew) and CASE C/E true sleep/reboot stay OWNER — not forged PASS.
 */
import {
  appendEvent,
  ensureDirs,
  gitSha,
  kenosCtl,
  lanIp,
  launchApp,
  localHostName,
  nowIso,
  originBase,
  originIsStableHostname,
  probeUrl,
  readBuildMeta,
  sleep,
  writeJson,
  writeMd,
} from './lib.mjs'

ensureDirs()
const RUN_ID = `hostname-${nowIso().replace(/[:.]/g, '-')}`
const origin = originBase()
const mdns = localHostName()
const ip = lanIp()
const cases = []

function row(id, data) {
  const r = { id, ts: nowIso(), ...data }
  cases.push(r)
  appendEvent('hostname_case', { id, result: data.result })
  console.log(`${data.result} ${id}`)
  return r
}

// CASE A — normal hostname
{
  const stable = originIsStableHostname(origin)
  const health = probeUrl('shell', `${origin}/__health`)
  const host = (() => {
    try {
      return new URL(origin).hostname
    } catch {
      return ''
    }
  })()
  const plan = probeUrl('planner', `http://${host}:5188/__health`)
  const fit = probeUrl('fitness', `http://${host}:5190/__health`)
  const launch = launchApp(`${origin}/?iosNativeShell=1`)
  sleep(800)
  const asst = launchApp(`${origin}/assistant?iosNativeShell=1`)
  const inbox = launchApp(`${origin}/inbox?iosNativeShell=1`)
  row('CASE_A_normal', {
    result:
      stable && health.ok && plan.ok && fit.ok && launch.ok && asst.ok && inbox.ok
        ? 'PASS'
        : 'FAIL',
    origin,
    host,
    mdns,
    recordedIp: ip || null,
    note: 'Today/Assistant/Plan/Training/Inbox via hostname',
    owner: false,
  })
}

// CASE B — DHCP IP change (cannot safely automate)
{
  const host = (() => {
    try {
      return new URL(origin).hostname
    } catch {
      return mdns ? `${mdns}.local` : ''
    }
  })()
  const viaHost = probeUrl('shell_mdns', `http://${host}:5219/__health`)
  const viaIp = ip ? probeUrl('shell_ip', `http://${ip}:5219/__health`) : { ok: false }
  row('CASE_B_dhcp_ip_change', {
    result: viaHost.ok && originIsStableHostname(origin) ? 'PASS_HOST_INDEPENDENT_OF_IP' : 'FAIL',
    note: 'Hostname health independent of recorded IPv4; true DHCP renew = OWNER',
    recordedIp: ip || null,
    hostname: host,
    hostnameHealth: viaHost.ok,
    ipHealth: viaIp.ok,
    ownerAction:
      'Optional: renew Mac DHCP, confirm phone still loads without rebuild (hostname unchanged).',
    owner: true,
    forgedPass: false,
  })
}

// CASE C — Wi-Fi off/on OWNER
row('CASE_C_wifi_toggle', {
  result: 'OWNER_OPEN',
  note: 'Do not forge phone Wi-Fi toggle',
  ownerAction:
    'On iPhone: Wi‑Fi off 10s → on → open Kenos → tap Retry if shown. Auth/Continue must remain.',
  owner: true,
})

// CASE D — service restart under hostname
{
  kenosCtl('restart')
  sleep(2000)
  const host = (() => {
    try {
      return new URL(origin).hostname
    } catch {
      return ''
    }
  })()
  let ok = false
  for (let i = 0; i < 30; i++) {
    if (probeUrl('shell', `http://${host}:5219/__health`).ok) {
      ok = true
      break
    }
    sleep(1000)
  }
  const launch = launchApp(`${origin}/?iosNativeShell=1`)
  row('CASE_D_service_restart', {
    result: ok && launch.ok ? 'PASS' : 'FAIL',
    note: 'kenos-ctl restart; hostname unchanged',
    owner: false,
  })
}

// CASE E — Mac reboot OWNER (launchd path proxied earlier in soak)
row('CASE_E_mac_reboot', {
  result: 'OWNER_OPEN',
  note: 'True reboot not automated; launchd RunAtLoad rehearsed via ctl restart in CASE_D',
  ownerAction: 'Reboot Mac once; unlock; confirm Kenos opens without Settings change.',
  owner: true,
})

const report = {
  runId: RUN_ID,
  ts: nowIso(),
  head: gitSha(true),
  build: readBuildMeta(),
  origin,
  stableHostname: originIsStableHostname(origin),
  cases,
  summary: {
    automatedPass: cases.filter((c) => String(c.result).startsWith('PASS')).length,
    ownerOpen: cases.filter((c) => c.result === 'OWNER_OPEN').length,
    fail: cases.filter((c) => c.result === 'FAIL').length,
  },
}
report.verdict =
  report.summary.fail === 0 && originIsStableHostname(origin)
    ? 'PASS_AUTOMATED_HOSTNAME'
    : 'FAIL'

writeJson(`runs/${RUN_ID}.json`, report)
writeJson('smoke/hostname-regression-latest.json', report)
writeMd(
  'HOSTNAME_REGRESSION.md',
  `# HOSTNAME_REGRESSION

**run:** \`${RUN_ID}\`
**verdict:** \`${report.verdict}\`
**origin:** \`${origin}\`

| Case | Result | Owner? |
| --- | --- | --- |
${cases.map((c) => `| ${c.id} | ${c.result} | ${c.owner ? 'yes' : 'no'} |`).join('\n')}

## Owner-only (not forged)

- CASE_B true DHCP renew
- CASE_C Wi‑Fi toggle
- CASE_E Mac reboot
`,
)

console.log(JSON.stringify({ verdict: report.verdict, summary: report.summary, origin }, null, 2))
process.exit(report.verdict.startsWith('PASS') ? 0 : 1)
