import assert from 'node:assert/strict'
import {
  OUTBOX_WORKER_EPOCH,
  buildDeliveryEvent,
  classifyDeliveryError,
  nextAttemptAtIso,
  resolveCredentialContract,
  shouldProcessRow,
  summarizeCycle,
  summarizeOutboxHealth,
} from './outboxWorker.core.mjs'

const baseRow = {
  id: '9c3e7d1a-0000-4000-8000-000000000001',
  user_id: '9c3e7d1a-0000-4000-8000-000000000002',
  action_type: 'plan.create_task',
  correlation_id: '9c3e7d1a-0000-4000-8000-000000000003',
  created_at: '2026-07-22T18:00:00Z',
  attempts: 0,
  payload: { taskId: 't-1', title: 'demo' },
}

// --- canary gate ------------------------------------------------------------
assert.deepEqual(shouldProcessRow(baseRow), { process: true, reason: 'canary' })

// Historical rows (pre-epoch) are quarantined, never processed.
assert.equal(shouldProcessRow({ ...baseRow, created_at: '2026-07-20T04:20:30Z' }).reason, 'historical_quarantine')
assert.equal(Date.parse(OUTBOX_WORKER_EPOCH) > Date.parse('2026-07-20T04:20:30Z'), true)

// Non-canary action types are never processed even if fresh.
assert.equal(shouldProcessRow({ ...baseRow, action_type: 'work.create_project' }).reason, 'not_canary')
assert.equal(shouldProcessRow({ ...baseRow, action_type: 'focus.start_context' }).reason, 'not_canary')

// Malformed rows fail closed.
assert.equal(shouldProcessRow(null).process, false)
assert.equal(shouldProcessRow({ ...baseRow, created_at: 'nope' }).process, false)
assert.equal(shouldProcessRow({ ...baseRow, id: undefined }).process, false)

// --- epoch-isolation bypass resistance (accountability review R4) -----------
// The worker path must never process a pre-epoch (historical) row regardless of
// what else is manipulated. Epoch is checked BEFORE the canary allowlist, so:
// (1) action-type change on a historical row cannot bypass isolation
assert.equal(
  shouldProcessRow({ ...baseRow, created_at: '2026-07-20T04:20:30Z', action_type: 'plan.create_task' }).reason,
  'historical_quarantine',
  'historical row relabelled to a canary type stays quarantined (epoch precedes canary check)',
)
// (2) a requeued historical dead_letter (status flips to pending, created_at unchanged) stays quarantined
assert.equal(
  shouldProcessRow({ ...baseRow, created_at: '2026-07-20T14:41:48Z', status: 'pending' }).reason,
  'historical_quarantine',
  'requeue moves status to pending but created_at is unchanged → still quarantined',
)
// (3) malformed/absent created_at fails closed (cannot masquerade as post-epoch)
assert.equal(shouldProcessRow({ ...baseRow, created_at: '' }).reason, 'invalid_created_at')
assert.equal(shouldProcessRow({ ...baseRow, created_at: null }).reason, 'invalid_created_at')
// (4) exact epoch boundary is inclusive (>= epoch processes; 1ms before does not)
assert.equal(shouldProcessRow({ ...baseRow, created_at: OUTBOX_WORKER_EPOCH }).process, true)
assert.equal(
  shouldProcessRow({ ...baseRow, created_at: new Date(Date.parse(OUTBOX_WORKER_EPOCH) - 1).toISOString() }).reason,
  'historical_quarantine',
)
// (5) the epoch constant itself is frozen to the reviewed value — a silent
// downgrade of this constant would be caught here (and server-side claim RPC
// enforces the same filter independently, so a downgraded worker cannot bypass it).
assert.equal(OUTBOX_WORKER_EPOCH, '2026-07-22T17:00:00Z', 'epoch constant must not drift silently')
// (6) clock skew: epoch is an absolute constant, not now()-relative, so shifting
// the caller's wall clock cannot move the boundary — pass an explicit epoch and
// confirm the row's own created_at is the sole determinant.
assert.equal(shouldProcessRow(baseRow, { epoch: '2100-01-01T00:00:00Z' }).reason, 'historical_quarantine')

// --- delivery event (consumer idempotency determinism) ----------------------
const eventA = buildDeliveryEvent(baseRow)
const eventB = buildDeliveryEvent({ ...baseRow })
assert.equal(eventA.eventType, 'plan.task_created')
assert.deepEqual(eventA, eventB, 'same row must build identical event (idempotent consumer)')
assert.deepEqual(eventA.payload, { taskId: 't-1', title: 'demo' })

assert.equal(buildDeliveryEvent({ ...baseRow, action_type: 'project.link_object', payload: { projectId: 'p' } }).eventType, 'project.link_added')
assert.equal(buildDeliveryEvent({ ...baseRow, action_type: 'plan.update_task_title' }).eventType, 'plan.task_updated')
assert.throws(() => buildDeliveryEvent({ ...baseRow, action_type: 'focus.start_context' }), /no life event mapping/)

// --- error classification ---------------------------------------------------
assert.equal(classifyDeliveryError(new Error('invalid_event_type')), 'permanent')
assert.equal(classifyDeliveryError(new Error('no life event mapping for x')), 'permanent')
assert.equal(classifyDeliveryError(new Error('fetch failed')), 'transient')
assert.equal(classifyDeliveryError(undefined), 'transient')

// --- retry schedule ---------------------------------------------------------
const t0 = Date.parse('2026-07-22T18:00:00Z')
assert.equal(nextAttemptAtIso(1, t0), new Date(t0 + 30_000).toISOString())
assert.equal(nextAttemptAtIso(2, t0), new Date(t0 + 120_000).toISOString())
assert.equal(nextAttemptAtIso(5, t0), new Date(t0 + 21_600_000).toISOString())
assert.equal(nextAttemptAtIso(9, t0), new Date(t0 + 21_600_000).toISOString())

// --- cycle summary ----------------------------------------------------------
assert.deepEqual(
  summarizeCycle([
    { outcome: 'delivered' }, { outcome: 'delivered' }, { outcome: 'duplicate' },
    { outcome: 'retry' }, { outcome: 'dead_letter' }, { outcome: 'skipped', reason: 'not_canary' },
  ]),
  { claimed: 6, delivered: 2, duplicates: 1, retried: 1, deadLettered: 1, skipped: 1 },
)

// --- least-privilege credential contract (G5) -------------------------------
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payloadpayloadpayload.sigsigsig'
const MODE_600 = 0o100600 // regular file, rw-------
const MODE_644 = 0o100644 // regular file, rw-r--r-- (group/other readable → unsafe)

// prefers the scoped worker JWT over service_role
assert.deepEqual(
  resolveCredentialContract({ env: { KENOS_WORKER_JWT: JWT, SUPABASE_SERVICE_ROLE_KEY: JWT }, argv: [], envFileMode: MODE_600 }),
  { ok: true, credential: 'worker_jwt', warnings: [] },
)
// service_role works but warns (migrate to least privilege)
const svc = resolveCredentialContract({ env: { SUPABASE_SERVICE_ROLE_KEY: JWT }, argv: [], envFileMode: MODE_600 })
assert.equal(svc.ok, true)
assert.equal(svc.credential, 'service_role')
assert.match(svc.warnings[0], /least privilege|KENOS_WORKER_JWT/)
// refuse when no credential
assert.equal(resolveCredentialContract({ env: {}, argv: [], envFileMode: null }).reason, 'no_credential')
// refuse a secret passed in argv (visible in ps)
assert.equal(resolveCredentialContract({ env: { KENOS_WORKER_JWT: JWT }, argv: ['node', 'w.mjs', '--key=' + JWT], envFileMode: MODE_600 }).reason, 'secret_in_argv')
assert.equal(resolveCredentialContract({ env: { KENOS_WORKER_JWT: JWT }, argv: ['node', 'w.mjs', JWT], envFileMode: MODE_600 }).reason, 'secret_in_argv')
// refuse an unsafe credential-file permission (group/world readable)
assert.equal(resolveCredentialContract({ env: { KENOS_WORKER_JWT: JWT }, argv: [], envFileMode: MODE_644 }).reason, 'credential_file_permissions_unsafe')
// malformed worker jwt
assert.equal(resolveCredentialContract({ env: { KENOS_WORKER_JWT: 'not-a-jwt' }, argv: [], envFileMode: MODE_600 }).reason, 'malformed_worker_jwt')
// no file (env-injected credential, e.g. launchd/CI) is allowed when perms n/a
assert.equal(resolveCredentialContract({ env: { KENOS_WORKER_JWT: JWT }, argv: [], envFileMode: null }).ok, true)

// --- summarizeOutboxHealth: quarantined history reported separately from backlog --------
{
  const EPOCH = '2026-07-22T17:00:00Z'
  const NOW = Date.parse('2026-07-22T23:10:00Z')
  // Reproduce the real production shape: 149 pre-epoch pending + 1 pre-epoch dead_letter
  // + 25 post-epoch published (all delivered, none stuck).
  const rows = []
  for (let i = 0; i < 149; i += 1) {
    rows.push({ status: 'pending', created_at: '2026-07-20T05:00:00Z', next_attempt_at: '2026-07-20T05:00:00Z' })
  }
  rows.push({ status: 'dead_letter', created_at: '2026-07-20T14:41:48Z' })
  for (let i = 0; i < 25; i += 1) {
    rows.push({ status: 'published', created_at: '2026-07-22T18:00:00Z' })
  }

  const h = summarizeOutboxHealth(rows, { epoch: EPOCH, nowMs: NOW })
  // The 149 pending + 1 dead_letter are quarantined — NOT actionable backlog.
  assert.equal(h.historicalQuarantined.total, 150)
  assert.equal(h.historicalQuarantined.byStatus.pending, 149)
  assert.equal(h.historicalQuarantined.byStatus.dead_letter, 1)
  assert.equal(h.historicalQuarantined.replayEligible, 0)
  // Actionable queue is healthy: 25 published, zero backlog, not stuck.
  assert.equal(h.actionable.byStatus.published, 25)
  assert.equal(h.actionable.backlogDepth, 0)
  assert.equal(h.actionable.stuck, false)
  assert.equal(h.invalid, 0)
}

// A genuinely stuck ACTIONABLE row (post-epoch, due, aged past threshold) raises the alarm —
// and it does so without the quarantined history inflating the count.
{
  const EPOCH = '2026-07-22T17:00:00Z'
  const NOW = Date.parse('2026-07-22T23:10:00Z')
  const rows = [
    { status: 'pending', created_at: '2026-07-22T18:00:00Z', next_attempt_at: '2026-07-22T18:05:00Z' }, // ~5h overdue
    ...Array.from({ length: 149 }, () => ({ status: 'pending', created_at: '2026-07-20T05:00:00Z', next_attempt_at: '2026-07-20T05:00:00Z' })),
  ]
  const h = summarizeOutboxHealth(rows, { epoch: EPOCH, nowMs: NOW, stuckThresholdSeconds: 900 })
  assert.equal(h.actionable.backlogDepth, 1) // only the post-epoch row counts as backlog
  assert.equal(h.actionable.stuck, true)
  assert.ok(h.actionable.oldestBacklogAgeSeconds > 900)
  assert.equal(h.historicalQuarantined.byStatus.pending, 149) // history stays in its own bucket
}

// A post-epoch pending row not yet due is not counted as backlog.
{
  const NOW = Date.parse('2026-07-22T20:00:00Z')
  const h = summarizeOutboxHealth(
    [{ status: 'retry', created_at: '2026-07-22T19:00:00Z', next_attempt_at: '2026-07-22T20:30:00Z' }],
    { nowMs: NOW },
  )
  assert.equal(h.actionable.backlogDepth, 0)
  assert.equal(h.actionable.stuck, false)
}

// Invalid created_at is fail-closed into `invalid`, never actionable.
{
  const h = summarizeOutboxHealth([{ status: 'pending', created_at: 'not-a-date' }], { nowMs: Date.now() })
  assert.equal(h.invalid, 1)
  assert.equal(h.actionable.backlogDepth, 0)
}

console.log('outboxWorker.core.test.mjs OK')
