// Repository-level production authorization gate (G2).
//
// Any production-mutating tool or script (migration apply, service-role RPC
// write, worker install, prod deploy) must be preceded by an explicit, scoped,
// time-bounded authorization artifact created by the Owner. The gate defaults
// to DENY. The artifact never contains credentials and is not a reusable bypass
// token: it binds a single environment + a set of operation classes + a project,
// has a hard-capped expiry, and a maximum execution count that the gate accounts
// for in a sibling usage ledger.
//
// Artifact:  ~/.kenos/prod-authorization.json   (Owner-created, chmod 600, gitignored location)
// Usage:     ~/.kenos/prod-authorization.usage.json  (gate-maintained; consumption per authorizationId)
//
// This module is pure/deterministic where it matters: `evaluateAuthorization`
// takes all inputs explicitly and returns an allow/deny decision, so it is fully
// unit-testable without touching the filesystem or clock.
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const ARTIFACT_PATH = join(homedir(), '.kenos', 'prod-authorization.json')
export const USAGE_PATH = join(homedir(), '.kenos', 'prod-authorization.usage.json')

// Recognised production operation classes. An artifact must allowlist explicit
// classes; there is no wildcard.
export const OPERATION_CLASSES = Object.freeze([
  'apply_migration',
  'service_role_rpc_write',
  'worker_install',
  'prod_deploy',
])

// Hard ceiling on how long any single authorization may live, regardless of the
// expiresAt the Owner writes. Prevents a long-lived standing bypass.
export const MAX_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/

/**
 * Pure decision. Returns { ok, reason }. Fail-closed on every ambiguity.
 * @param {object} p
 * @param {any} p.artifact                parsed artifact (or null/undefined if missing/malformed)
 * @param {number} p.nowMs                current time (ms)
 * @param {string} p.requestedOperation   the operation class being attempted
 * @param {string} p.requestedProject     the project/resource being mutated
 * @param {number} p.priorUsage           how many times this authorizationId has already been consumed
 */
export function evaluateAuthorization({ artifact, nowMs, requestedOperation, requestedProject, priorUsage = 0 }) {
  if (!artifact || typeof artifact !== 'object') return deny('missing_or_malformed')
  const {
    authorizationId, owner, environment, project, operations,
    issuedAt, expiresAt, maxExecutions, approvingMessage,
  } = artifact

  // structural validity — any missing/typewrong field is malformed → deny
  if (typeof authorizationId !== 'string' || authorizationId.length < 8) return deny('malformed_authorization_id')
  if (typeof owner !== 'string' || !owner) return deny('malformed_owner')
  if (environment !== 'production') return deny('not_production_environment')
  if (typeof project !== 'string' || !project) return deny('malformed_project')
  if (!Array.isArray(operations) || operations.length === 0) return deny('malformed_operations')
  if (operations.some((o) => !OPERATION_CLASSES.includes(o))) return deny('unknown_operation_class')
  if (typeof approvingMessage !== 'string' || approvingMessage.trim().length < 3) return deny('missing_approving_reference')
  if (!ISO.test(String(issuedAt || '')) || !ISO.test(String(expiresAt || ''))) return deny('malformed_timestamps')
  if (!Number.isInteger(maxExecutions) || maxExecutions < 1) return deny('malformed_max_executions')

  const issued = Date.parse(issuedAt)
  const expires = Date.parse(expiresAt)
  if (!(expires > issued)) return deny('expiry_not_after_issue')
  if (expires - issued > MAX_TTL_MS) return deny('ttl_exceeds_max') // over-long → treat as malformed

  // binding checks
  if (requestedProject && project !== requestedProject) return deny(`project_mismatch (auth=${project} req=${requestedProject})`)
  if (!operations.includes(requestedOperation)) return deny(`operation_not_authorized (${requestedOperation})`)

  // temporal
  if (nowMs >= expires) return deny('expired')
  if (nowMs < issued) return deny('not_yet_valid')

  // consumption
  if (priorUsage >= maxExecutions) return deny('executions_exhausted')

  return { ok: true, reason: 'authorized', authorizationId, remaining: maxExecutions - priorUsage - 1 }
}

function deny(reason) {
  return { ok: false, reason }
}

// ---- filesystem-backed helpers (thin; the decision logic stays in evaluateAuthorization) ----

export function readArtifact(path = ARTIFACT_PATH) {
  if (!existsSync(path)) return { artifact: null, permsSafe: true }
  let permsSafe = true
  try {
    const mode = statSync(path).mode & 0o077
    permsSafe = mode === 0 // no group/other access
  } catch { permsSafe = true }
  try {
    return { artifact: JSON.parse(readFileSync(path, 'utf8')), permsSafe }
  } catch {
    return { artifact: null, permsSafe }
  }
}

export function readUsage(authorizationId, path = USAGE_PATH) {
  if (!existsSync(path)) return 0
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'))
    return Number(j?.[authorizationId] || 0)
  } catch {
    return 0
  }
}

export function recordUsage(authorizationId, path = USAGE_PATH) {
  let j = {}
  if (existsSync(path)) {
    try { j = JSON.parse(readFileSync(path, 'utf8')) } catch { j = {} }
  }
  j[authorizationId] = Number(j[authorizationId] || 0) + 1
  writeFileSync(path, JSON.stringify(j, null, 2), { mode: 0o600 })
  return j[authorizationId]
}
