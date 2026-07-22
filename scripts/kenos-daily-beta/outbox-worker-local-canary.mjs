#!/usr/bin/env node
/**
 * Local (NON-PRODUCTION) outbox worker canary — claim → deliver → publish → metrics.
 *
 * A full-stack run needs Docker + `supabase start` (PostgREST + the plpgsql RPCs). When
 * Docker is unavailable, this harness drives the REAL worker decision core
 * (apps/planner/server/outboxWorker.core.mjs) through one canary record against an
 * in-process fake of the four worker RPCs whose behavior mirrors the SQL in
 * apps/finance/supabase/migrations/20260722191520_kenos_outbox_worker_delivery.sql:
 *   - claim: `created_at >= epoch` fence + status/lease eligibility, FOR UPDATE SKIP LOCKED
 *   - deliver: idempotent life_events projection deduped on outbox_id, processing→published
 *   - metrics: `new` vs `historicalQuarantined` split at the epoch
 *
 * It never touches production (no network, no Supabase client). Exit 0 on success.
 *
 * To run the true full stack instead:
 *   (cd apps/finance/supabase && supabase start)
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local> \
 *     KENOS_OUTBOX_EPOCH=<just-before-canary> node apps/planner/agent/outbox-worker.mjs --once
 */
import assert from 'node:assert/strict'
import {
  buildDeliveryEvent,
  shouldProcessRow,
  summarizeCycle,
  summarizeOutboxHealth,
} from '../../apps/planner/server/outboxWorker.core.mjs'

const EPOCH = '2026-07-22T17:00:00Z'
const NOW_MS = Date.parse('2026-07-22T23:10:00Z')
const USER = '9c3e7d1a-0000-4000-8000-000000000002'

// ---- In-process fake of kenos_plan_outbox + the four worker RPCs (SQL-faithful) --------
function makeFakeOutbox(rows) {
  const byId = new Map(rows.map((r) => [r.id, { ...r }]))
  const lifeEvents = []
  const deliveredOutboxIds = new Set() // models unique index life_events_kenos_outbox_dedupe

  return {
    // kenos_outbox_worker_claim: epoch fence + eligibility, flip to processing under lease.
    claim({ p_epoch, p_limit = 10, p_lease_seconds = 300 }, nowMs) {
      const epochMs = Date.parse(p_epoch)
      const eligible = [...byId.values()]
        .filter((r) => Date.parse(r.created_at) >= epochMs)
        .filter((r) => {
          const due = Date.parse(r.next_attempt_at) <= nowMs
          return (['pending', 'retry'].includes(r.status) && due) || (r.status === 'processing' && due)
        })
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
        .slice(0, Math.min(Math.max(p_limit, 1), 50))
      for (const r of eligible) {
        r.status = 'processing'
        r.next_attempt_at = new Date(nowMs + p_lease_seconds * 1000).toISOString()
      }
      return eligible.map((r) => ({ ...r }))
    },
    // kenos_outbox_worker_deliver: reject if not claimed; idempotent projection; publish.
    deliver({ p_outbox_id, p_event_type, p_event_payload }) {
      const row = byId.get(p_outbox_id)
      if (!row) throw new Error('outbox_row_not_found')
      if (row.status !== 'processing') throw new Error('outbox_not_claimed')
      let duplicate = false
      if (deliveredOutboxIds.has(p_outbox_id)) {
        duplicate = true
      } else {
        deliveredOutboxIds.add(p_outbox_id)
        lifeEvents.push({
          user_id: row.user_id,
          type: p_event_type,
          status: 'processed',
          payload: { ...p_event_payload, outbox_id: p_outbox_id, action_type: row.action_type, correlation_id: row.correlation_id },
        })
      }
      row.status = 'published' // private.kenos_transition_plan_outbox(processing → published)
      return { duplicate }
    },
    // kenos_outbox_worker_metrics: split at the epoch.
    metrics({ p_epoch }) {
      const epochMs = Date.parse(p_epoch)
      const agg = (pred) => {
        const o = {}
        for (const r of byId.values()) if (pred(r)) o[r.status] = (o[r.status] || 0) + 1
        return o
      }
      return {
        epoch: p_epoch,
        new: agg((r) => Date.parse(r.created_at) >= epochMs),
        historicalQuarantined: agg((r) => Date.parse(r.created_at) < epochMs),
      }
    },
    snapshot: () => [...byId.values()].map((r) => ({ ...r })),
    lifeEvents,
  }
}

// ---- Seed: ONE canary (post-epoch, eligible) + one quarantined historical row ----------
const canaryId = 'canary-0000-4000-8000-000000000001'
const seedRows = [
  {
    id: canaryId,
    user_id: USER,
    action_type: 'plan.create_task', // ∈ CANARY_ACTION_TYPES
    correlation_id: '9c3e7d1a-0000-4000-8000-000000000003',
    created_at: '2026-07-22T18:00:00Z', // post-epoch
    next_attempt_at: '2026-07-22T18:00:00Z', // due
    status: 'pending',
    attempts: 0,
    max_attempts: 5,
    payload: { taskId: 't-canary', title: 'canary create' },
  },
  {
    id: 'historical-0000-4000-8000-000000000009',
    user_id: USER,
    action_type: 'plan.create_task',
    correlation_id: '9c3e7d1a-0000-4000-8000-00000000000a',
    created_at: '2026-07-20T05:00:00Z', // pre-epoch → quarantined
    next_attempt_at: '2026-07-20T05:00:00Z',
    status: 'pending',
    attempts: 0,
    max_attempts: 5,
    payload: { taskId: 't-old', title: 'historical' },
  },
]

const db = makeFakeOutbox(seedRows)
const report = { steps: [] }
const step = (name, detail) => report.steps.push({ name, ...detail })

// ---- CLAIM ------------------------------------------------------------------------------
const claimed = db.claim({ p_epoch: EPOCH, p_limit: 10, p_lease_seconds: 300 }, NOW_MS)
step('claim', { claimed: claimed.map((r) => r.id) })
assert.equal(claimed.length, 1, 'exactly the post-epoch canary row is claimed')
assert.equal(claimed[0].id, canaryId, 'quarantined historical row is NOT claimed')

// ---- DELIVER (via the real core gate + projection) --------------------------------------
const outcomes = []
for (const row of claimed) {
  const gate = shouldProcessRow(row, { epoch: EPOCH })
  assert.equal(gate.process, true, `canary passes shouldProcessRow (${gate.reason})`)
  const ev = buildDeliveryEvent(row)
  const res = db.deliver({ p_outbox_id: row.id, p_event_type: ev.eventType, p_event_payload: ev.payload })
  outcomes.push({ id: row.id, outcome: res.duplicate ? 'duplicate' : 'delivered' })
}
const cycle = summarizeCycle(outcomes)
step('deliver', { cycle })
assert.equal(cycle.delivered, 1, 'canary delivered once')
assert.equal(db.lifeEvents.length, 1, 'exactly one life_events projection')
assert.equal(db.lifeEvents[0].payload.outbox_id, canaryId, 'projection carries outbox_id (dedupe key)')

// ---- PUBLISH (transition assertion) -----------------------------------------------------
const after = db.snapshot()
const canaryAfter = after.find((r) => r.id === canaryId)
const historicalAfter = after.find((r) => r.id !== canaryId)
step('publish', { canary: canaryAfter.status, historical: historicalAfter.status })
assert.equal(canaryAfter.status, 'published', 'canary transitioned processing → published')
assert.equal(historicalAfter.status, 'pending', 'quarantined row untouched (still pending)')

// ---- Re-deliver of an already-published row is rejected (state machine), and the
// life_events dedupe index means no second projection could occur regardless.
let rejected = false
try {
  db.deliver({ p_outbox_id: canaryId, p_event_type: 'kenos.plan.task_created', p_event_payload: {} })
} catch (e) {
  rejected = String(e.message) === 'outbox_not_claimed'
}
assert.equal(rejected, true, 'published row cannot be re-delivered')
assert.equal(db.lifeEvents.length, 1, 'still exactly one life_events row')

// ---- METRICS ----------------------------------------------------------------------------
const metrics = db.metrics({ p_epoch: EPOCH })
step('metrics', { metrics })
assert.equal(metrics.new.published, 1, 'metrics.new shows the published canary')
assert.equal(metrics.historicalQuarantined.pending, 1, 'metrics quarantines the historical row separately')

// ---- Health summary (the reporting split) ----------------------------------------------
const health = summarizeOutboxHealth(db.snapshot(), { epoch: EPOCH, nowMs: NOW_MS })
step('health', {
  actionableBacklog: health.actionable.backlogDepth,
  actionableStuck: health.actionable.stuck,
  quarantined: health.historicalQuarantined.total,
})
assert.equal(health.actionable.backlogDepth, 0, 'no actionable backlog after publish')
assert.equal(health.actionable.stuck, false, 'actionable queue not stuck')
assert.equal(health.historicalQuarantined.total, 1, 'historical row reported as quarantined, not backlog')

console.log(JSON.stringify({ ok: true, canary: canaryId, ...report }, null, 2))
console.log('outbox-worker-local-canary — OK (claim → deliver → publish → metrics)')
