import assert from 'node:assert/strict'
import {
  applyOutboxDeliveryFailure,
  createMemoryCreateTaskDatabase,
  executeServerCreateTaskAction,
  markOutboxDelivered,
  markOutboxProcessing,
  nextBackoffMs,
} from './createTaskCommand.mjs'

function action(overrides = {}) {
  return {
    schemaVersion: 1,
    actionId: overrides.actionId || 'act_001',
    actionType: 'plan.create_task',
    producer: 'assistant',
    targetDomain: 'plan',
    actor: { type: 'assistant', userId: 'user_001' },
    idempotencyKey: overrides.idempotencyKey || 'idem_001',
    correlationId: overrides.correlationId || 'corr_001',
    securityDomain: 'personal',
    classification: 'personal',
    risk: 'R1',
    approval: { state: 'not_required' },
    payload: { title: 'Server task', notes: 'private note', token: 'secret-token', ...overrides.payload },
    createdAt: '2026-07-19T00:00:00.000Z',
    ...overrides,
  }
}

{
  const db = createMemoryCreateTaskDatabase()
  const first = executeServerCreateTaskAction(db, action())
  assert.equal(first.ok, true)
  assert.equal(db.state.tasks.length, 1)
  assert.equal(db.state.outbox.length, 1)
  assert.equal(db.state.activity.length, 1)
  assert.equal(first.outbox.status, 'pending')
  assert.equal(first.activity.redactedPayload.notes, '[REDACTED]')
  assert.equal(first.activity.redactedPayload.token, '[REDACTED]')

  const replay = executeServerCreateTaskAction(db, action({ actionId: 'act_002' }))
  assert.equal(replay.ok, true)
  assert.equal(replay.duplicate, true)
  assert.equal(replay.task.id, first.task.id)
  assert.equal(db.state.tasks.length, 1)
  assert.equal(db.state.outbox.length, 1)
}

{
  const now = Date.parse('2026-07-19T00:00:00.000Z')
  for (const [overrides, code] of [
    [{ actor: { type: 'assistant', userId: 'other-user' } }, 'actor_user_mismatch'],
    [{ securityDomain: 'work', classification: 'work_confidential' }, 'security_domain_not_allowed'],
    [{ expectedVersion: 1 }, 'version_conflict'],
    [{ expiresAt: '2026-07-18T23:59:59.000Z' }, 'action_expired'],
  ]) {
    const db = createMemoryCreateTaskDatabase()
    const result = executeServerCreateTaskAction(db, action(overrides), { authUserId: 'user_001', now })
    assert.equal(result.ok, false)
    assert.equal(result.error.code, code)
    assert.equal(db.state.tasks.length, 0)
  }
}

{
  const db = createMemoryCreateTaskDatabase()
  assert.throws(() => executeServerCreateTaskAction(db, action(), { injectFailure: 'afterTaskBeforeOutbox' }))
  assert.equal(db.state.tasks.length, 0)
  assert.equal(db.state.outbox.length, 0)
  assert.equal(db.state.activity.length, 0)
}

{
  const db = createMemoryCreateTaskDatabase()
  const created = executeServerCreateTaskAction(db, action())
  const processing = markOutboxProcessing(created.outbox, 1000)
  assert.equal(processing.status, 'processing')
  const retry = applyOutboxDeliveryFailure(processing, { code: 'network_timeout', message: 'network timeout' }, 2000)
  assert.equal(retry.status, 'retry')
  assert.equal(retry.lastErrorClass, 'transient')
  assert.equal(retry.attempts, 1)
  const terminal = applyOutboxDeliveryFailure(retry, { code: 'permission_denied', message: 'permission denied' }, 3000)
  assert.equal(terminal.status, 'terminal')
  assert.equal(terminal.lastErrorClass, 'permanent')
  assert.match(terminal.terminalReason, /permission/)
  const delivered = markOutboxDelivered(processing, 4000)
  assert.equal(delivered.status, 'delivered')
  assert.equal(nextBackoffMs(99, 99), 5 * 60 * 1000)
}

{
  const db = createMemoryCreateTaskDatabase()
  const work = executeServerCreateTaskAction(db, action({ producer: 'work', payload: { title: 'from work' } }))
  assert.equal(work.ok, false)
  assert.equal(work.error.class, 'permanent')
  assert.equal(db.state.tasks.length, 0)
}

console.log('planner server create-task command: ok')
