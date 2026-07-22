// Kenos outbox canary worker — pure core (no I/O). The runtime lives in
// apps/planner/agent/outbox-worker.mjs; everything decision-shaped lives here
// so it can be unit-tested and reviewed:
//   * which rows the worker may touch (canary allowlist + quarantine epoch)
//   * how a claimed row projects onto public.life_events (idempotent payload)
//   * retry schedule / error classification
import {
  CANARY_ACTION_TYPES,
  LIFE_EVENT_TYPE_BY_ACTION,
  OUTBOX_WORKER_EPOCH,
  retryDelayMs,
} from '@life-os/contracts/kenos-actions'

export { OUTBOX_WORKER_EPOCH }

const CANARY_SET = new Set(CANARY_ACTION_TYPES)

/**
 * Gate for one claimed outbox row. Fail-closed: anything not explicitly
 * canary + post-epoch is skipped (released back via lease expiry, and
 * reported so the operator sees non-canary traffic).
 * @returns {{ process: boolean, reason: string }}
 */
export function shouldProcessRow(row, { epoch = OUTBOX_WORKER_EPOCH } = {}) {
  if (!row || typeof row !== 'object') return { process: false, reason: 'invalid_row' }
  if (!row.id || !row.action_type || !row.user_id) return { process: false, reason: 'missing_fields' }
  const created = Date.parse(row.created_at || '')
  if (!Number.isFinite(created)) return { process: false, reason: 'invalid_created_at' }
  if (created < Date.parse(epoch)) return { process: false, reason: 'historical_quarantine' }
  if (!CANARY_SET.has(row.action_type)) return { process: false, reason: 'not_canary' }
  return { process: true, reason: 'canary' }
}

/**
 * Build the life_events projection for a claimed outbox row.
 * Deterministic: same row → same event (dedup key = outbox_id, enforced by
 * the unique index life_events_kenos_outbox_dedupe + on-conflict-do-nothing).
 * @returns {{ eventType: string, payload: object }}
 */
export function buildDeliveryEvent(row) {
  const eventType = LIFE_EVENT_TYPE_BY_ACTION[row.action_type]
  if (!eventType) throw new Error(`no life event mapping for ${row.action_type}`)
  return {
    eventType,
    payload: {
      // outbox_id / action_type / correlation_id / entity_ref are appended
      // server-side by kenos_outbox_worker_deliver; here we pass the
      // action-specific payload through untouched.
      ...(row.payload && typeof row.payload === 'object' ? row.payload : {}),
    },
  }
}

/** Classify a delivery error. Anything schema/contract-shaped is permanent. */
export function classifyDeliveryError(error) {
  const message = String(error?.message || error || '')
  if (/invalid_event_type|invalid_event_payload|no life event mapping|outbox_row_not_found/.test(message)) {
    return 'permanent'
  }
  return 'transient'
}

/** Next attempt timestamp (ISO) for a failed row, per the fixed backoff schedule. */
export function nextAttemptAtIso(attempts, nowMs = Date.now()) {
  return new Date(nowMs + retryDelayMs(Math.max(attempts, 1))).toISOString()
}

/**
 * Least-privilege credential contract (G5). The worker prefers a scoped
 * `kenos_worker` JWT (KENOS_WORKER_JWT) over the full service_role key, and
 * refuses to start when the credential source is unsafe. Pure/deterministic:
 * takes the environment + the credential file's stat mode explicitly.
 *
 * @param {object} p
 * @param {Record<string,string|undefined>} p.env
 * @param {string[]} p.argv           process.argv (to reject secrets in argv)
 * @param {number|null} p.envFileMode fs.stat().mode of the credential file, or null if none
 * @returns {{ ok: true, credential: 'worker_jwt'|'service_role', warnings: string[] }
 *          | { ok: false, reason: string }}
 */
export function resolveCredentialContract({ env = {}, argv = [], envFileMode = null }) {
  // 1. never accept a secret passed on the command line (visible in `ps`)
  const argvSecret = argv.some((a) =>
    /^--?(key|token|jwt|service[-_]?role|secret)=/i.test(String(a)) ||
    /^eyJ[A-Za-z0-9._-]{20,}$/.test(String(a)))
  if (argvSecret) return { ok: false, reason: 'secret_in_argv' }

  // 2. if a credential file is used, it must not be group/world accessible
  if (envFileMode != null && (envFileMode & 0o077) !== 0) {
    return { ok: false, reason: 'credential_file_permissions_unsafe' }
  }

  const warnings = []
  const workerJwt = env.KENOS_WORKER_JWT
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY

  // 3. prefer the least-privilege worker JWT
  if (workerJwt) {
    if (!/^eyJ[A-Za-z0-9._-]{20,}$/.test(workerJwt)) return { ok: false, reason: 'malformed_worker_jwt' }
    return { ok: true, credential: 'worker_jwt', warnings }
  }
  if (serviceKey) {
    warnings.push('using full service_role key — migrate to KENOS_WORKER_JWT (least privilege, see PENDING_kenos_worker_role.sql.notapplied)')
    return { ok: true, credential: 'service_role', warnings }
  }
  return { ok: false, reason: 'no_credential' }
}

/**
 * Split outbox rows into ACTIONABLE queue health vs. intentionally-QUARANTINED history.
 *
 * The worker only ever claims rows with `created_at >= epoch` (SQL claim predicate +
 * shouldProcessRow both enforce it). Pre-epoch rows are frozen by design (never replayed;
 * see docs/productivity/OUTBOX_SEMANTICS.md) — counting them as "pending backlog" is a
 * false alarm. This reports the two populations in separate buckets so a health surface
 * never conflates 149 quarantined historical rows with actionable queue depth.
 *
 * Pure: takes rows + epoch + now explicitly, no I/O.
 *
 * @param {Array<{status:string, created_at:string, next_attempt_at?:string}>} rows
 * @param {{ epoch?: string, nowMs?: number, stuckThresholdSeconds?: number }} [opts]
 */
export function summarizeOutboxHealth(rows = [], { epoch = OUTBOX_WORKER_EPOCH, nowMs = Date.now(), stuckThresholdSeconds = 900 } = {}) {
  const epochMs = Date.parse(epoch)
  const actionable = { pending: 0, retry: 0, processing: 0, published: 0, dead_letter: 0 }
  const quarantined = { pending: 0, retry: 0, processing: 0, published: 0, dead_letter: 0 }
  let invalid = 0
  let backlogDepth = 0 // actionable pending/retry that are due now
  let oldestDueMs = null // oldest due next_attempt_at among actionable pending/retry

  for (const row of rows) {
    const created = Date.parse(row?.created_at || '')
    if (!Number.isFinite(created)) {
      invalid += 1
      continue
    }
    const bucket = created >= epochMs ? actionable : quarantined
    const status = row?.status
    if (status && status in bucket) bucket[status] += 1
    if (bucket === actionable && (status === 'pending' || status === 'retry')) {
      const due = Date.parse(row?.next_attempt_at || '')
      if (!Number.isFinite(due) || due <= nowMs) {
        backlogDepth += 1
        const at = Number.isFinite(due) ? due : created
        if (oldestDueMs == null || at < oldestDueMs) oldestDueMs = at
      }
    }
  }

  const oldestBacklogAgeSeconds = oldestDueMs == null ? 0 : Math.max(0, Math.floor((nowMs - oldestDueMs) / 1000))
  const quarantinedTotal = Object.values(quarantined).reduce((a, b) => a + b, 0)

  return {
    epoch,
    asOfMs: nowMs,
    // Actionable = the live queue the worker is responsible for.
    actionable: {
      byStatus: actionable,
      backlogDepth,
      oldestBacklogAgeSeconds,
      // A post-epoch row that is due but has aged past the threshold means the worker
      // is not draining — this is the only condition that should raise a queue alarm.
      stuck: backlogDepth > 0 && oldestBacklogAgeSeconds > stuckThresholdSeconds,
    },
    // Quarantined history is reported for visibility only — NEVER as actionable backlog.
    historicalQuarantined: {
      byStatus: quarantined,
      total: quarantinedTotal,
      replayEligible: 0, // pre-epoch rows are never auto-replayed (frozen by design)
    },
    invalid,
  }
}

/** Compact one poll cycle's outcomes for the structured log line. */
export function summarizeCycle(outcomes) {
  const summary = { claimed: outcomes.length, delivered: 0, duplicates: 0, retried: 0, deadLettered: 0, skipped: 0 }
  for (const o of outcomes) {
    if (o.outcome === 'delivered') summary.delivered += 1
    else if (o.outcome === 'duplicate') summary.duplicates += 1
    else if (o.outcome === 'retry') summary.retried += 1
    else if (o.outcome === 'dead_letter') summary.deadLettered += 1
    else summary.skipped += 1
  }
  return summary
}
