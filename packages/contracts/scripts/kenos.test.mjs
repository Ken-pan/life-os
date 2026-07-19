import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  KenosActionDecisionSchema,
  KenosActionRequestSchema,
  KenosActionResultSchema,
  KenosActivityRecordSchema,
  KenosApprovalRequestSchema,
  KenosCaptureEnvelopeSchema,
  KenosEntityMetadataSchema,
  KenosMutationEnvelopeSchema,
  KenosOutboxRecordSchema,
} from '../src/kenos.ts'

const fixture = JSON.parse(readFileSync(new URL('../fixtures/kenos/create-task-action.json', import.meta.url), 'utf8'))
assert.equal(KenosActionRequestSchema.safeParse(fixture).success, true)

for (const invalid of [
  { ...fixture, schemaVersion: 1 },
  { ...fixture, id: 'act_plan_create_task_001' },
  { ...fixture, targetDomain: 'unknown' },
  { ...fixture, dataClassification: 'unknown' },
  { ...fixture, expiresAt: fixture.requestedAt },
]) {
  assert.equal(KenosActionRequestSchema.safeParse(invalid).success, false)
}

const entityRef = {
  id: '50000000-0000-4000-8000-000000000001',
  type: 'plan.task',
  ownerDomain: 'plan',
  ownerId: '50000000-0000-4000-8000-000000000001',
  version: 1,
}

assert.equal(KenosEntityMetadataSchema.safeParse({
  ...entityRef,
  securityDomain: 'personal',
  dataClassification: 'personal',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
}).success, true)

const policy = {
  requestId: fixture.id,
  outcome: 'allow',
  evaluatedRisk: 'R1',
  policyVersion: 'kenos-phase1-2026-07-19',
  reasons: ['explicit user request'],
  decidedAt: '2026-07-19T00:00:00.000Z',
}
assert.equal(KenosActionDecisionSchema.safeParse(policy).success, true)

assert.equal(KenosActionResultSchema.safeParse({
  requestId: fixture.id,
  status: 'succeeded',
  result: { taskId: entityRef.id },
  affectedEntities: [entityRef],
  activityId: '70000000-0000-4000-8000-000000000001',
  completedAt: '2026-07-19T00:00:01.000Z',
}).success, true)
assert.equal(KenosActionResultSchema.safeParse({
  requestId: fixture.id,
  status: 'failed',
  affectedEntities: [],
  activityId: '70000000-0000-4000-8000-000000000001',
}).success, false)

assert.equal(KenosOutboxRecordSchema.safeParse({
  schemaVersion: '1',
  id: '60000000-0000-4000-8000-000000000001',
  topic: fixture.actionType,
  actionRequestId: fixture.id,
  idempotencyKey: fixture.idempotencyKey,
  correlationId: fixture.correlationId,
  aggregate: entityRef,
  status: 'retry',
  payload: { taskId: entityRef.id },
  attempts: 2,
  maxAttempts: 5,
  availableAt: '2026-07-19T00:01:00.000Z',
  occurredAt: '2026-07-19T00:00:00.000Z',
  lastErrorClass: 'transient',
  updatedAt: '2026-07-19T00:00:30.000Z',
}).success, true)
assert.equal(KenosOutboxRecordSchema.safeParse({
  schemaVersion: '1',
  id: '60000000-0000-4000-8000-000000000002',
  topic: fixture.actionType,
  idempotencyKey: 'dead-letter-without-reason',
  correlationId: fixture.correlationId,
  aggregate: entityRef,
  status: 'dead_letter',
  payload: {},
  attempts: 5,
  availableAt: '2026-07-19T00:01:00.000Z',
  occurredAt: '2026-07-19T00:00:00.000Z',
}).success, false)

const activity = {
  schemaVersion: '1',
  id: '70000000-0000-4000-8000-000000000001',
  eventType: 'plan.task_created',
  actionRequestId: fixture.id,
  correlationId: fixture.correlationId,
  actor: fixture.actor,
  targetRefs: [entityRef],
  securityDomain: 'personal',
  summary: 'Created Plan task',
  reason: fixture.reason,
  result: 'succeeded',
  policy,
  redactedPayload: { title: 'Fixture task', notes: '[REDACTED]' },
  undo: { supported: true, actionType: 'plan.delete_task' },
  occurredAt: '2026-07-19T00:00:00.000Z',
}
assert.equal(KenosActivityRecordSchema.safeParse(activity).success, true)
assert.equal(JSON.stringify(activity).includes('redacted before activity'), false)

assert.equal(KenosApprovalRequestSchema.safeParse({
  id: '80000000-0000-4000-8000-000000000001',
  actionRequestId: fixture.id,
  risk: 'R3',
  summary: 'Confirm high-risk action',
  impact: ['One Plan task will be changed'],
  sensitiveFieldsRedacted: true,
  reversible: true,
  expiresAt: '2026-07-19T00:05:00.000Z',
  createdAt: '2026-07-19T00:00:00.000Z',
}).success, true)

assert.equal(KenosMutationEnvelopeSchema.safeParse({
  schemaVersion: '1',
  mutationId: '90000000-0000-4000-8000-000000000001',
  idempotencyKey: 'fixture-mutation-001',
  entity: entityRef,
  actorId: fixture.actor.id,
  deviceId: fixture.deviceId,
  baseVersion: 1,
  operation: 'plan.rename_task',
  payload: { title: 'Updated fixture task' },
  occurredAt: '2026-07-19T00:02:00.000Z',
}).success, true)

assert.equal(KenosCaptureEnvelopeSchema.safeParse({
  schemaVersion: '1',
  id: 'a0000000-0000-4000-8000-000000000001',
  kind: 'url',
  source: {
    client: 'kenos-web',
    deviceId: fixture.deviceId,
    externalUrl: 'https://example.com/read',
  },
  actorId: fixture.actor.id,
  securityDomain: 'personal',
  dataClassification: 'personal',
  capturedAt: '2026-07-19T00:00:00.000Z',
  idempotencyKey: 'fixture-capture-001',
  payload: { title: 'Read later' },
}).success, true)

console.log('kenos contracts: ok')
