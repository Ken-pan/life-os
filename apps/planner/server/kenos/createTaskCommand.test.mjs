import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  applyOutboxDeliveryFailure,
  createMemoryCreateTaskDatabase,
  executeServerCreateTaskAction,
  markOutboxProcessing,
  markOutboxPublished,
  nextBackoffMs,
} from './createTaskCommand.mjs'

const fixture = JSON.parse(readFileSync(new URL('../../../../packages/contracts/fixtures/kenos/create-task-action.json', import.meta.url), 'utf8'))
const USER_ID = fixture.actor.id

function action(overrides = {}) {
  return {
    ...fixture,
    id: overrides.id || fixture.id,
    idempotencyKey: overrides.idempotencyKey || 'idem_001',
    correlationId: overrides.correlationId || fixture.correlationId,
    payload: { ...fixture.payload, title: 'Server task', notes: 'private note', token: 'secret-token', ...overrides.payload },
    expiresAt: '2099-07-19T00:05:00.000Z',
    ...overrides,
  }
}

{
  const db = createMemoryCreateTaskDatabase()
  const first = executeServerCreateTaskAction(db, action(), { authUserId: USER_ID })
  assert.equal(first.ok, true)
  assert.equal(db.state.tasks.length, 1)
  assert.equal(db.state.outbox.length, 1)
  assert.equal(db.state.activity.length, 1)
  assert.equal(first.outbox.status, 'pending')
  assert.equal(first.activity.redactedPayload.notes, '[REDACTED]')
  assert.equal(first.activity.redactedPayload.token, '[REDACTED]')

  const replay = executeServerCreateTaskAction(db, action({ id: '10000000-0000-4000-8000-000000000002' }), { authUserId: USER_ID })
  assert.equal(replay.ok, true)
  assert.equal(replay.duplicate, true)
  assert.equal(replay.task.id, first.task.id)
  assert.equal(db.state.tasks.length, 1)
  assert.equal(db.state.outbox.length, 1)

  const reusedAction = executeServerCreateTaskAction(db, action({ idempotencyKey: 'idem_002' }), { authUserId: USER_ID })
  assert.equal(reusedAction.ok, false)
  assert.equal(reusedAction.error.code, 'action_id_reused')
  assert.equal(db.state.tasks.length, 1)
}

{
  const now = Date.parse('2026-07-19T00:10:00.000Z')
  for (const [overrides, code] of [
    [{ actor: { type: 'assistant', id: '20000000-0000-4000-8000-000000000002' } }, 'actor_user_mismatch'],
    [{ securityDomain: 'work', dataClassification: 'work_confidential' }, 'security_domain_not_allowed'],
    [{ expectedVersion: 1 }, 'version_conflict'],
    [{ expiresAt: '2026-07-19T00:05:00.000Z' }, 'action_expired'],
  ]) {
    const db = createMemoryCreateTaskDatabase()
    const result = executeServerCreateTaskAction(db, action(overrides), { authUserId: USER_ID, now })
    assert.equal(result.ok, false)
    assert.equal(result.error.code, code)
    assert.equal(db.state.tasks.length, 0)
  }
}

{
  const db = createMemoryCreateTaskDatabase()
  const invalid = executeServerCreateTaskAction(db, action({ schemaVersion: 1 }), { authUserId: USER_ID })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'schema_version_not_supported')
}

{
  const db = createMemoryCreateTaskDatabase()
  assert.throws(() => executeServerCreateTaskAction(db, action(), { authUserId: USER_ID, injectFailure: 'afterTaskBeforeOutbox' }))
  assert.equal(db.state.tasks.length, 0)
  assert.equal(db.state.outbox.length, 0)
  assert.equal(db.state.activity.length, 0)
}

{
  const db = createMemoryCreateTaskDatabase()
  const created = executeServerCreateTaskAction(db, action(), { authUserId: USER_ID })
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
  const work = executeServerCreateTaskAction(db, action({ producer: 'work', payload: { title: 'from work' } }), { authUserId: USER_ID })
  assert.equal(work.ok, false)
  assert.equal(work.error.class, 'permanent')
  assert.equal(db.state.tasks.length, 0)
}

{
  const db = createMemoryCreateTaskDatabase()
  const connector = executeServerCreateTaskAction(db, action({ producer: 'integration' }), { authUserId: USER_ID })
  assert.equal(connector.ok, false)
  assert.equal(connector.error.code, 'producer_not_allowed')
  assert.equal(db.state.tasks.length, 0)
}

console.log('planner server create-task command: ok')
