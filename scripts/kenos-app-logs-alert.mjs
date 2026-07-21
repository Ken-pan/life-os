#!/usr/bin/env node
/**
 * Kenos app-log analysis + alert scan (first-party, no SaaS APM).
 *
 * Default dry-run: print recent severity summary SQL + local rule fixtures.
 * `--apply`: run scan via ./scripts/supabase-sql.sh and print open alerts.
 * `--webhook`: POST new/open critical alerts to $KENOS_APP_LOG_ALERT_WEBHOOK
 *              (or --webhook=URL).
 *
 * Usage:
 *   node scripts/kenos-app-logs-alert.mjs
 *   node scripts/kenos-app-logs-alert.mjs --apply
 *   node scripts/kenos-app-logs-alert.mjs --apply --webhook
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateAppLogAlertRules } from '../packages/platform-web/src/kenosAppLogs.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APPLY = process.argv.includes('--apply')
const webhookArg = process.argv.find(
  (a) => a === '--webhook' || a.startsWith('--webhook='),
)
const WEBHOOK =
  (webhookArg &&
    webhookArg.includes('=') &&
    webhookArg.split('=').slice(1).join('=')) ||
  (webhookArg ? process.env.KENOS_APP_LOG_ALERT_WEBHOOK || '' : '')

function runSql(sql) {
  const script = join(ROOT, 'scripts/supabase-sql.sh')
  if (!existsSync(script))
    return { ok: false, error: 'supabase-sql.sh missing' }
  const r = spawnSync(script, [sql], { encoding: 'utf8', cwd: ROOT })
  if (r.status !== 0) {
    return {
      ok: false,
      error: (r.stderr || r.stdout || '').trim().slice(0, 400),
    }
  }
  const text = (r.stdout || '').trim()
  try {
    return { ok: true, rows: JSON.parse(text) }
  } catch {
    // Management API sometimes wraps scalar/json results oddly.
    return { ok: true, raw: text.slice(0, 2000) }
  }
}

console.log('=== Kenos app-log alert ===')
console.log(
  'rules:',
  JSON.stringify(
    evaluateAppLogAlertRules({
      faults: 1,
      errors: 5,
      warnings: 20,
      crashBugs: 1,
    }),
    null,
    2,
  ),
)

if (!APPLY) {
  console.log(
    'dry-run only. tip: node scripts/kenos-app-logs-alert.mjs --apply',
  )
  console.log(
    'optional webhook: KENOS_APP_LOG_ALERT_WEBHOOK=https://... --apply --webhook',
  )
  process.exit(0)
}

const scan = runSql(`select public.kenos_scan_app_log_alerts_all(30);`)
if (!scan.ok) {
  console.error('scan failed:', scan.error)
  console.error('Has migration 20260721180000 been applied?')
  process.exit(1)
}
console.log('scan:', JSON.stringify(scan.rows ?? scan.raw, null, 2))

const open = runSql(`
select id, severity, kind, app_name, title, created_at, status
from public.kenos_app_log_alerts
where status = 'open'
order by
  case severity when 'critical' then 0 else 1 end,
  created_at desc
limit 40;
`)
if (!open.ok) {
  console.error('list open alerts failed:', open.error)
  process.exit(1)
}
const alerts = Array.isArray(open.rows) ? open.rows : []
console.log(`open alerts: ${alerts.length}`)
for (const a of alerts.slice(0, 20)) {
  console.log(`- [${a.severity}] ${a.kind} · ${a.app_name || '?'} · ${a.title}`)
}

const summary = runSql(`
select
  s.app_name,
  count(*) filter (where l.level = 'fault') as faults,
  count(*) filter (where l.level = 'error') as errors,
  count(*) filter (where l.level = 'warning') as warnings
from public.kenos_app_logs l
join public.kenos_app_log_sessions s on s.id = l.session_id
where l.logged_at > now() - interval '24 hours'
  and l.level in ('warning', 'error', 'fault')
group by s.app_name
order by faults desc, errors desc;
`)
if (summary.ok) {
  console.log(
    'last 24h by app:',
    JSON.stringify(summary.rows ?? summary.raw, null, 2),
  )
}

if (WEBHOOK) {
  const critical = alerts.filter((a) => a.severity === 'critical')
  if (!critical.length) {
    console.log('webhook: no critical open alerts')
  } else {
    const body = {
      source: 'kenos-app-logs-alert',
      at: new Date().toISOString(),
      criticalCount: critical.length,
      alerts: critical.slice(0, 10),
    }
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    console.log(`webhook: ${res.status}`)
    if (!res.ok) process.exit(1)
  }
}
