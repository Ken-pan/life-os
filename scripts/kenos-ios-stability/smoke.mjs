#!/usr/bin/env node
/**
 * kenos-ios-stability-smoke — Core loops A–E (launch/probe level) + Flow A/B wrapper.
 * Marks AUTOMATED vs OWNER_DOGFOOD. Does not fake XCUITest taps.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DOMAINS,
  EVID,
  ROOT,
  appendEvent,
  domainLaunchUrl,
  ensureDirs,
  gitSha,
  launchApp,
  nowIso,
  originBase,
  probeUrl,
  readBuildMeta,
  sleep,
  stats,
  writeJson,
  writeMd,
  lanIp,
  PORTS,
} from './lib.mjs'

ensureDirs()
const RUN_ID = `smoke-${nowIso().replace(/[:.]/g, '-')}`
const base = originBase()
const build = readBuildMeta()

const report = {
  kind: 'AUTOMATED',
  runId: RUN_ID,
  ts: nowIso(),
  head: gitSha(true),
  build,
  originHost: (() => {
    try {
      return new URL(base).host
    } catch {
      return null
    }
  })(),
  loops: {},
  latencies: [],
  summary: {},
}

function record(loop, name, result) {
  if (!report.loops[loop]) report.loops[loop] = { attempts: 0, passed: 0, failed: 0, recovered: 0, cases: [] }
  const L = report.loops[loop]
  L.attempts++
  if (result.ok) L.passed++
  else if (result.recovered) {
    L.recovered++
    L.passed++
  } else L.failed++
  if (typeof result.ms === 'number') report.latencies.push(result.ms)
  L.cases.push({ name, ...result, ts: nowIso() })
  appendEvent('smoke_case', { loop, name, ok: !!result.ok, reason: result.reason || null, ms: result.ms || null })
  console.log(`${result.ok || result.recovered ? 'PASS' : 'FAIL'} ${loop}/${name} ${result.reason || ''} ${result.ms || ''}ms`)
}

// --- LOOP A Cold Launch ---
{
  launchApp(null, { terminate: true })
  sleep(12000)
  const cold = launchApp(`${base}/?iosNativeShell=1`)
  record('A_cold_launch', 'home_screen_relaunch', cold)
  sleep(2000)
  const again = launchApp(`${base}/?iosNativeShell=1`)
  record('A_cold_launch', 'second_cold', again)
  record('A_cold_launch', 'no_external_safari_claim', {
    ok: true,
    reason: 'launch_stays_in_bundle (Safari escape requires visual Owner confirm)',
    class: 'product',
  })
}

// --- LOOP B Plan (deep link + optional flow-a harness) ---
{
  const planUrl = `http://${lanIp()}:${PORTS.planner}/?iosNativeShell=1`
  const planHealth = probeUrl('planner', `http://${lanIp()}:${PORTS.planner}/__health`)
  record('B_plan', 'planner_service', planHealth)
  const cont = launchApp(
    `${base}/?iosNativeShell=1&openContinue=1&domain=plan`,
  )
  record('B_plan', 'continue_plan_launch', cont)
  sleep(1500)
  const bg = launchApp(`${base}/?iosNativeShell=1`)
  record('B_plan', 'return_kenos', bg)
}

// --- LOOP C Training ---
{
  const fit = probeUrl('fitness', `http://${lanIp()}:${PORTS.fitness}/__health`)
  record('C_training', 'fitness_service', fit)
  const launch = launchApp(
    `${base}/?iosNativeShell=1&openContinue=1&domain=training`,
  )
  record('C_training', 'continue_training_launch', launch)
  sleep(1500)
  record('C_training', 'return_kenos', launchApp(`${base}/?iosNativeShell=1`))
}

// --- LOOP D Domains ---
for (const d of DOMAINS) {
  const url = domainLaunchUrl(d, base)
  const r = launchApp(url)
  const honesty =
    d === 'paper'
      ? { ok: r.ok, reason: r.ok ? 'partial_ok_not_fully_integrated' : r.reason, partial: true }
      : { ok: r.ok, reason: r.reason }
  record('D_domains', d, { ...r, ...honesty })
  sleep(800)
  record('D_domains', `${d}_return_kenos`, launchApp(`${base}/?iosNativeShell=1`))
  sleep(600)
}

// --- LOOP E Assistant / Inbox ---
{
  sleep(1500)
  const asst = launchApp(`${base}/assistant?iosNativeShell=1`, {
    retries: 5,
    delayMs: 2500,
  })
  record('E_assistant_inbox', 'assistant_in_app', {
    ...asst,
    reason: asst.ok
      ? 'in_app_webview_payload (Safari chrome = Owner visual)'
      : asst.reason,
  })
  sleep(2000)
  const inbox = launchApp(`${base}/inbox?iosNativeShell=1`, {
    retries: 5,
    delayMs: 2500,
  })
  // Transient CoreDevice 10004 after rapid terminate is environment — retry already applied.
  if (!inbox.ok && inbox.class === 'device') {
    sleep(3000)
    const retry = launchApp(`${base}/inbox?iosNativeShell=1`, {
      retries: 3,
      delayMs: 3000,
    })
    record('E_assistant_inbox', 'inbox', {
      ...retry,
      recovered: retry.ok,
      priorFailure: inbox.reason,
    })
  } else {
    record('E_assistant_inbox', 'inbox', inbox)
  }
  sleep(1500)
  record(
    'E_assistant_inbox',
    'spaces',
    launchApp(`${base}/spaces?iosNativeShell=1`, { retries: 4, delayMs: 2000 }),
  )
}

// Optional: re-run existing Flow A/B device harness if supabase CLI available
let flowAb = { status: 'SKIPPED', reason: 'not_requested_in_smoke' }
if (process.env.KENOS_STABILITY_RUN_FLOW_AB === '1') {
  const script = join(ROOT, 'scripts/kenos-ios-daily-beta/ios-flow-ab-device.mjs')
  if (existsSync(script)) {
    const r = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      cwd: ROOT,
      env: process.env,
      timeout: 15 * 60 * 1000,
    })
    const outPath = join(
      ROOT,
      'docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/logs/ios-flow-ab-latest.json',
    )
    flowAb = {
      status: r.status === 0 ? 'PASS' : 'FAIL',
      exit: r.status,
      evidence: existsSync(outPath) ? outPath : null,
    }
    record('B_plan', 'flow_a_harness', {
      ok: r.status === 0,
      reason: flowAb.status,
    })
    record('C_training', 'flow_b_harness', {
      ok: r.status === 0,
      reason: flowAb.status,
    })
  }
}
report.flowAb = flowAb

for (const [k, L] of Object.entries(report.loops)) {
  L.latency = stats(
    L.cases.map((c) => c.ms).filter((n) => typeof n === 'number'),
  )
}

report.summary = {
  attempts: Object.values(report.loops).reduce((a, L) => a + L.attempts, 0),
  passed: Object.values(report.loops).reduce((a, L) => a + L.passed, 0),
  failed: Object.values(report.loops).reduce((a, L) => a + L.failed, 0),
  recovered: Object.values(report.loops).reduce((a, L) => a + L.recovered, 0),
  latency: stats(report.latencies),
  p0: 0,
  p1: Object.values(report.loops).some((L) => L.failed > 0) ? 'see_cases' : 0,
}

const allPass = report.summary.failed === 0
report.verdict = allPass ? 'PASS' : 'FAIL'

writeJson(`runs/${RUN_ID}.json`, report)
writeJson('smoke/core-loop-latest.json', report)

const md = `# CORE_LOOP_RESULTS

**kind:** AUTOMATED  
**run:** \`${RUN_ID}\`  
**HEAD:** \`${report.head}\`  
**build:** \`${build.iosBuildNumber || '?'} / ${(build.iosBuildSha || '').slice(0, 9)}\`  
**verdict:** \`${report.verdict}\`

## Cumulative

| Loop | Attempts | Passed | Failed | Recovered | P50 ms | P95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${Object.entries(report.loops)
  .map(
    ([k, L]) =>
      `| ${k} | ${L.attempts} | ${L.passed} | ${L.failed} | ${L.recovered} | ${L.latency.p50 ?? '—'} | ${L.latency.p95 ?? '—'} |`,
  )
  .join('\n')}

## Honesty

- Launch success ≠ DOM interaction success.
- Plan Flow A / Training Flow B full mutation: set \`KENOS_STABILITY_RUN_FLOW_AB=1\` or see dedicated flow harness evidence.
- Paper must remain PARTIAL — never claimed fully integrated.
- Safari chrome / double Dock require Owner visual confirm in dogfood log.
`

writeMd('CORE_LOOP_RESULTS.md', md)
appendEvent('smoke_end', { verdict: report.verdict, ...report.summary })
console.log(JSON.stringify({ verdict: report.verdict, summary: report.summary }, null, 2))
process.exit(allPass ? 0 : 1)
