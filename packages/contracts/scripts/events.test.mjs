import assert from 'node:assert/strict'
import {
  FinanceBillDueSchema,
  LifeEventEnvelopeSchema,
  LifeEventSchema,
  parseLifeEvent,
} from '../src/events.ts'

const envelopeRow = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  user_id: '660e8400-e29b-41d4-a716-446655440001',
  type: 'finance.bill_due',
  payload: {
    occurrence_id: 'occ-smoke-1',
    label: 'Test Bill',
    expected_amount: '500',
    occurrence_date: '2026-08-01',
  },
  status: 'pending',
  created_at: '2026-07-08T00:00:00.000Z',
  updated_at: '2026-07-08T00:00:00.000Z',
}

assert.equal(LifeEventEnvelopeSchema.safeParse(envelopeRow).success, true)

const parsed = parseLifeEvent(envelopeRow)
assert.equal(parsed.ok, true)
if (parsed.ok) {
  assert.equal(parsed.event.type, 'finance.bill_due')
  assert.equal(parsed.event.payload.expected_amount, 500)
  assert.equal(parsed.event.payload.occurrence_date, '2026-08-01')
}

assert.equal(
  FinanceBillDueSchema.safeParse({
    type: 'finance.bill_due',
    payload: {
      occurrence_id: 'x',
      label: 'Bill',
      expected_amount: '123.45',
      occurrence_date: '2026-01-15',
    },
  }).success,
  true,
)

assert.equal(
  LifeEventSchema.safeParse({
    type: 'finance.bill_due',
    payload: {
      occurrence_id: 'x',
      label: 'Bill',
      expected_amount: 99,
      occurrence_date: '2026-01-15',
    },
  }).success,
  true,
)

const unknownType = parseLifeEvent({
  ...envelopeRow,
  type: 'planner.task_completed',
  payload: { task_id: 't1' },
})
assert.equal(unknownType.ok, false)
if (!unknownType.ok) assert.equal(unknownType.reason, 'unknown-type')

const fitnessRow = {
  ...envelopeRow,
  type: 'fitness.workout_logged',
  payload: {
    session_id: '770e8400-e29b-41d4-a716-446655440002',
    day_id: 'chest',
    session_date: '2026-07-08',
    ended_at: '2026-07-08T12:00:00.000Z',
  },
}
const fitnessParsed = parseLifeEvent(fitnessRow)
assert.equal(fitnessParsed.ok, true)
if (fitnessParsed.ok) {
  assert.equal(fitnessParsed.event.type, 'fitness.workout_logged')
  assert.equal(fitnessParsed.event.payload.session_id, '770e8400-e29b-41d4-a716-446655440002')
  assert.equal(fitnessParsed.event.payload.session_date, '2026-07-08')
}

const captureRow = {
  ...envelopeRow,
  type: 'core.task_captured',
  payload: {
    capture_id: '880e8400-e29b-41d4-a716-446655440003',
    title: '给妈妈打电话',
    due_date: '2026-07-15',
    source: 'aios',
  },
}
const captureParsed = parseLifeEvent(captureRow)
assert.equal(captureParsed.ok, true)
if (captureParsed.ok) {
  assert.equal(captureParsed.event.type, 'core.task_captured')
  assert.equal(captureParsed.event.payload.title, '给妈妈打电话')
  assert.equal(captureParsed.event.payload.due_date, '2026-07-15')
}

const captureNoTitle = parseLifeEvent({
  ...envelopeRow,
  type: 'core.task_captured',
  payload: { capture_id: '880e8400-e29b-41d4-a716-446655440004', title: '' },
})
assert.equal(captureNoTitle.ok, false)
if (!captureNoTitle.ok) assert.equal(captureNoTitle.reason, 'bad-payload')

const badPayload = parseLifeEvent({
  ...envelopeRow,
  payload: { occurrence_id: 'x' },
})
assert.equal(badPayload.ok, false)
if (!badPayload.ok) assert.equal(badPayload.reason, 'bad-payload')

const badEnvelope = parseLifeEvent({ id: 'not-uuid' })
assert.equal(badEnvelope.ok, false)
if (!badEnvelope.ok) assert.equal(badEnvelope.reason, 'bad-envelope')

console.log('events.test.mjs: all passed')
