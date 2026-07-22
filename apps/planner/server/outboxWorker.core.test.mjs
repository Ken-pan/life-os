import assert from 'node:assert/strict'
import {
  OUTBOX_WORKER_EPOCH,
  buildDeliveryEvent,
  classifyDeliveryError,
  nextAttemptAtIso,
  shouldProcessRow,
  summarizeCycle,
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

console.log('outboxWorker.core.test.mjs OK')
