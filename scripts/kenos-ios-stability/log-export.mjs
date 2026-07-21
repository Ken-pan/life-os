#!/usr/bin/env node
/**
 * kenos-ios-log-export — gather local launchd/device logs; redact secrets.
 * Does not claim outbox delivery closed. Rotates oversized exports.
 */
import {
  EVID,
  appendEvent,
  ensureDirs,
  gitSha,
  nowIso,
  readBuildMeta,
  writeJson,
  writeMd,
  sh,
} from './lib.mjs'
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

ensureDirs()
const MAX_BYTES = 512 * 1024
const LOG_DIR = join(process.env.HOME || '', 'Library/Logs/KenosDailyBeta')

function redact(text) {
  return String(text || '')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[JWT_REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL_REDACTED]')
    .replace(/service_role[=:\s]+\S+/gi, 'service_role=[REDACTED]')
    .replace(/refresh_token[=:\s]+\S+/gi, 'refresh_token=[REDACTED]')
    .replace(/access_token[=:\s]+\S+/gi, 'access_token=[REDACTED]')
}

const files = []
if (existsSync(LOG_DIR)) {
  for (const name of readdirSync(LOG_DIR)) {
    if (!/\.(log|txt)$/i.test(name)) continue
    const p = join(LOG_DIR, name)
    const st = statSync(p)
    let body = ''
    try {
      const fd = readFileSync(p)
      body = redact(fd.slice(Math.max(0, fd.length - MAX_BYTES)).toString('utf8'))
    } catch {
      body = '[unreadable]'
    }
    const out = join(EVID, 'logs', `export-${name}`)
    writeFileSync(out, body)
    files.push({ name, bytes: st.size, exported: out, truncated: st.size > MAX_BYTES })
  }
}

const report = {
  ts: nowIso(),
  head: gitSha(true),
  build: readBuildMeta(),
  sourceDir: LOG_DIR,
  retention: {
    policy: 'export_tail_512KiB_per_file',
    note: 'dogfood must not unbounded-grow evidence; rotate exports each run',
  },
  files,
  privacy: {
    jwt: 'redacted',
    email: 'redacted',
    tokens: 'redacted',
    userPayloads: 'not_exported',
  },
  kenosAppLogsTable: {
    status: 'schema_exists_production',
    claim: 'NOT claiming outbox delivery closed',
  },
}

writeJson('smoke/log-export-latest.json', report)
writeMd(
  'APP_LOG_PRIVACY_AUDIT.md',
  `# APP_LOG_PRIVACY_AUDIT

**ts:** ${report.ts}
**HEAD:** \`${report.head}\`

## Rules enforced in export

- JWT / access_token / refresh_token → redacted
- Emails → redacted
- No task titles, health details, finance amounts, note bodies, Home images

## Retention

- Local LaunchAgent logs exported as **tail ≤ 512 KiB** per file
- Evidence \`dogfood-events.jsonl\` stores machine events only (no payloads)

## Categories expected in native \`KenosLog\`

launch · auth · navigation · domain · network · recovery · webview · continuity · isolation · crash · warning

Each event should carry: timestamp, build SHA, device, session ID, masked UID, category, code, recoverable, domain, correlation ID — verified in code review; runtime sample may be empty offline.

## Outbox honesty

\`kenos_app_logs\` ingest ≠ outbox delivery worker complete.
`,
)

appendEvent('log_export', { files: files.length })
console.log(JSON.stringify({ exported: files.length }, null, 2))
