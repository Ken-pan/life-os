#!/usr/bin/env node
// OWNER-ONLY issuer for a scoped, time-bounded production authorization (G2).
// Writes ~/.kenos/prod-authorization.json (chmod 600). Contains NO credentials.
// The gate (require-prod-authorization.mjs) consumes it.
//
//   npm run prod:authorize -- --operation apply_migration --operation worker_install \
//     --project iueozzuctstwvzbcxcyh --ttl 1h --max 3 --message "G5 worker role migration"
//
// TTL is hard-capped at 2h by the gate (MAX_TTL_MS). Re-running replaces the
// artifact with a fresh authorizationId (nonce), which resets the usage budget.
import { writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ARTIFACT_PATH, OPERATION_CLASSES, MAX_TTL_MS } from './lib/prodAuthorization.mjs'

function args(name) {
  const out = []
  process.argv.forEach((a, i) => { if (a === `--${name}`) out.push(process.argv[i + 1]) })
  return out
}
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}

const operations = args('operation')
const project = arg('project', 'iueozzuctstwvzbcxcyh')
const ttlRaw = arg('ttl', '1h')
const maxExecutions = Number(arg('max', '1'))
const message = arg('message', '')
const owner = arg('owner', process.env.LIFE_OS_PERSONAL_OWNER_EMAIL || process.env.USER || 'owner')

if (!operations.length) { console.error('prod-authorize: at least one --operation required (' + OPERATION_CLASSES.join('|') + ')'); process.exit(2) }
if (operations.some((o) => !OPERATION_CLASSES.includes(o))) { console.error('prod-authorize: unknown operation class'); process.exit(2) }
if (!message || message.trim().length < 3) { console.error('prod-authorize: --message "<approving reference>" required'); process.exit(2) }
if (!Number.isInteger(maxExecutions) || maxExecutions < 1) { console.error('prod-authorize: --max must be a positive integer'); process.exit(2) }

const ttlMs = parseTtl(ttlRaw)
if (ttlMs == null) { console.error('prod-authorize: --ttl like 30m / 1h / 90m'); process.exit(2) }
const cappedTtl = Math.min(ttlMs, MAX_TTL_MS)

// Date.now() is intentionally used here (issuer runtime), not in the pure gate.
const now = Date.now()
const artifact = {
  authorizationId: randomUUID(),
  owner,
  environment: 'production',
  project,
  operations,
  issuedAt: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  expiresAt: new Date(now + cappedTtl).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  maxExecutions,
  approvingMessage: message.trim(),
}

mkdirSync(dirname(ARTIFACT_PATH), { recursive: true })
writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2), { mode: 0o600 })
console.log(`Issued production authorization ${artifact.authorizationId}`)
console.log(`  operations: ${operations.join(', ')} | project: ${project}`)
console.log(`  expires: ${artifact.expiresAt} (ttl ${Math.round(cappedTtl / 60000)}m) | max executions: ${maxExecutions}`)
console.log(`  file: ${ARTIFACT_PATH} (chmod 600). Reset by re-issuing.`)

function parseTtl(s) {
  const m = String(s).match(/^(\d+)(m|h)$/)
  if (!m) return null
  return Number(m[1]) * (m[2] === 'h' ? 3600000 : 60000)
}
