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
  type: 'fitness.workout_logged',
  payload: { workout_id: 'w1' },
})
assert.equal(unknownType.ok, false)
if (!unknownType.ok) assert.equal(unknownType.reason, 'unknown-type')

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
