import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { KenosActionResultSchema, KenosCommandFailureSchema } from '../../../../packages/contracts/src/kenos.ts'
import {
  applyOutboxDeliveryFailure,
  createMemoryCreateTaskDatabase,
  executeServerCreateTaskAction,
  markOutboxProcessing,
  markOutboxPublished,
  nextBackoffMs,
} from './createTaskCommand.mjs'

const corpus = JSON.parse(readFileSync(new URL('../../../../packages/contracts/fixtures/kenos/v1/corpus.json', import.meta.url), 'utf8'))
const validById = new Map(corpus.valid.map((fixture) => [fixture.id, fixture.value]))
const fixture = structuredClone(validById.get('action-create-task-r1'))
const USER_ID = fixture.actor.id

function materialize(invalid) {
  const base = structuredClone(validById.get(invalid.valueFrom))
  assert.ok(base, `unknown fixture base: ${invalid.valueFrom}`)
  return { ...base, ...invalid.patch }
}

function action(overrides = {}) {
  return {
    ...structuredClone(fixture),
    ...overrides,
    payload: { ...fixture.payload, title: 'Server task', notes: 'private note', token: 'secret-token', ...overrides.payload },
  }
}

{
  const db = createMemoryCreateTaskDatabase()
  const first = executeServerCreateTaskAction(db, action(), { authUserId: USER_ID, now: Date.parse(fixture.requestedAt) })
  assert.equal(first.ok, true)
  assert.equal(db.state.tasks.length, 1)
  assert.equal(db.state.outbox.length, 1)
  assert.equal(db.state.activity.length, 1)
  assert.equal(first.outbox.status, 'pending')
  assert.equal(first.activity.redactedPayload.notes, '[REDACTED]')
  assert.equal(first.activity.redactedPayload.token, '[REDACTED]')
  assert.equal(KenosActionResultSchema.safeParse(first.actionResult).success, true)

  const replay = executeServerCreateTaskAction(db, action({ id: '10000000-0000-4000-8000-000000000002' }), { authUserId: USER_ID, now: Date.parse(fixture.requestedAt) })
  assert.equal(replay.ok, true)
  assert.equal(replay.duplicate, true)
  assert.equal(replay.task.id, first.task.id)
  assert.equal(db.state.tasks.length, 1)
  assert.equal(db.state.outbox.length, 1)
}

for (const invalid of corpus.invalid.filter(({ contract }) => contract === 'actionRequest' || contract === 'serverAction')) {
  const db = createMemoryCreateTaskDatabase()
  const result = executeServerCreateTaskAction(db, materialize(invalid), { authUserId: USER_ID, now: Date.parse(fixture.requestedAt) })
  assert.equal(result.ok, false, `${invalid.id} should fail the server boundary`)
  assert.equal(result.error.code, invalid.expectedError, `${invalid.id} returned the wrong error`)
  assert.equal(KenosCommandFailureSchema.safeParse(result).success, true)
  assert.equal(db.state.tasks.length, 0)
}

{
  const scenario = corpus.invalid.find(({ id }) => id === 'conflicting-idempotency-replay')
  const db = createMemoryCreateTaskDatabase()
  const first = executeServerCreateTaskAction(db, fixture, { authUserId: USER_ID, now: Date.parse(fixture.requestedAt) })
  assert.equal(first.ok, true)
  const replay = executeServerCreateTaskAction(db, { ...fixture, ...scenario.value.replayPatch }, { authUserId: USER_ID, now: Date.parse(fixture.requestedAt) })
  assert.equal(replay.ok, false)
  assert.equal(replay.error.code, scenario.expectedError)
  assert.equal(db.state.tasks.length, 1)
}

{
  const db = createMemoryCreateTaskDatabase()
  assert.throws(() => executeServerCreateTaskAction(db, action(), { authUserId: USER_ID, now: Date.parse(fixture.requestedAt), injectFailure: 'afterTaskBeforeOutbox' }))
  assert.equal(db.state.tasks.length, 0)
  assert.equal(db.state.outbox.length, 0)
  assert.equal(db.state.activity.length, 0)
}

{
  const db = createMemoryCreateTaskDatabase()
  const created = executeServerCreateTaskAction(db, action(), { authUserId: USER_ID, now: Date.parse(fixture.requestedAt) })
  const processing = markOutboxProcessing(created.outbox, 1000)
  assert.equal(processing.status, 'processing')
  const retry = applyOutboxDeliveryFailure(processing, { code: 'network_timeout', message: 'network timeout' }, 2000)
  assert.equal(retry.status, 'retry')
  assert.equal(retry.lastErrorClass, 'transient')
  assert.equal(retry.attempts, 1)
  const terminal = applyOutboxDeliveryFailure(retry, { code: 'permission_denied', message: 'permission denied' }, 3000)
  assert.equal(terminal.status, 'dead_letter')
  assert.equal(terminal.lastErrorClass, 'permanent')
  assert.match(terminal.failureReason, /permission/)
  const published = markOutboxPublished(processing, 4000)
  assert.equal(published.status, 'published')
  assert.equal(nextBackoffMs(99, 99), 5 * 60 * 1000)
}

{
  const db = createMemoryCreateTaskDatabase()
  const missingAuth = executeServerCreateTaskAction(db, action(), { now: Date.parse(fixture.requestedAt) })
  assert.equal(missingAuth.ok, false)
  assert.equal(missingAuth.error.code, 'auth_required')

  const mismatch = executeServerCreateTaskAction(db, action(), {
    authUserId: '20000000-0000-4000-8000-000000000099',
    now: Date.parse(fixture.requestedAt),
  })
  assert.equal(mismatch.ok, false)
  assert.equal(mismatch.error.code, 'actor_user_mismatch')

  const understated = executeServerCreateTaskAction(
    db,
    action({ requestedRisk: 'R1', payload: { title: 'bulk', bulk: true, items: [1, 2] } }),
    { authUserId: USER_ID, now: Date.parse(fixture.requestedAt) },
  )
  assert.equal(understated.ok, false)
  assert.equal(understated.error.code, 'risk_understated')
}

console.log('planner server create-task command: canonical v1 corpus ok')
