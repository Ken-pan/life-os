import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  KenosActionRequestSchema,
  KenosActivityRecordSchema,
  KenosCaptureEnvelopeSchema,
  KenosOutboxRecordSchema,
} from '../src/kenos.ts'

const fixture = JSON.parse(readFileSync(new URL('../fixtures/kenos/create-task-action.json', import.meta.url), 'utf8'))
assert.equal(KenosActionRequestSchema.safeParse(fixture).success, true)

const badMajor = { ...fixture, schemaVersion: 2 }
assert.equal(KenosActionRequestSchema.safeParse(badMajor).success, false)

const badDomain = { ...fixture, targetDomain: 'work' }
assert.equal(KenosActionRequestSchema.safeParse(badDomain).success, false)

const entityRef = {
  domain: 'plan',
  type: 'task',
  id: 'task_001',
  ownerDomain: 'plan',
  version: 1,
  securityDomain: 'personal',
  classification: 'personal',
}

assert.equal(KenosOutboxRecordSchema.safeParse({
  schemaVersion: 1,
  id: 'outbox_001',
  actionId: fixture.actionId,
  actionType: fixture.actionType,
  idempotencyKey: fixture.idempotencyKey,
  correlationId: fixture.correlationId,
  entityRef,
  status: 'retry',
  payload: { taskId: 'task_001' },
  attempts: 2,
  maxAttempts: 5,
  nextAttemptAt: '2026-07-19T00:01:00.000Z',
  lastErrorClass: 'transient',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:30.000Z',
}).success, true)

const activity = {
  schemaVersion: 1,
  id: 'activity_001',
  actionId: fixture.actionId,
  actionType: fixture.actionType,
  correlationId: fixture.correlationId,
  actorType: 'assistant',
  source: 'assistant',
  policy: { allowed: true, risk: 'R1', approvalState: 'not_required', reason: 'explicit user request', decidedAt: '2026-07-19T00:00:00.000Z' },
  entityRef,
  summary: 'Created Plan task',
  redactedPayload: { title: 'Fixture task', notes: '[REDACTED_NOTES]' },
  undo: { supported: true, actionType: 'plan.delete_task' },
  createdAt: '2026-07-19T00:00:00.000Z',
}
assert.equal(KenosActivityRecordSchema.safeParse(activity).success, true)
assert.equal(JSON.stringify(activity).includes('redacted before activity'), false)

assert.equal(KenosCaptureEnvelopeSchema.safeParse({
  schemaVersion: 1,
  captureId: 'cap_001',
  source: 'library',
  securityDomain: 'personal',
  classification: 'personal',
  provenance: { url: 'https://example.com/read', capturedAt: '2026-07-19T00:00:00.000Z' },
  payload: { title: 'Read later' },
}).success, true)

console.log('kenos contracts: ok')
