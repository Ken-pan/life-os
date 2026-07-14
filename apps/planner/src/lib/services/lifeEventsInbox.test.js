import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  findTaskByFinanceOccurrenceId,
  upsertTaskFromFinanceBillDue,
  findTaskByFitnessSessionId,
  upsertHabitFromFitnessWorkoutLogged,
  findTaskByCaptureId,
  upsertTaskFromCoreCapture,
  consumePendingLifeEvents,
} from './lifeEventsInbox.js'
import { S } from '../state.svelte.js'

vi.mock('../state.svelte.js', () => ({
  S: {
    tasks: [],
    settings: { defaultListId: 'inbox' },
  },
  save: vi.fn(),
  uid: vi.fn(() => 'task-new-1'),
}))

vi.mock('../services/reminders.js', () => ({
  syncRemindersToServiceWorker: vi.fn(),
}))

vi.mock('../supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {},
}))

const envelopeBase = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  user_id: '660e8400-e29b-41d4-a716-446655440001',
  status: 'pending',
  created_at: '2026-07-08T00:00:00.000Z',
  updated_at: '2026-07-08T00:00:00.000Z',
}

const billPayload = {
  occurrence_id: 'occ-123',
  label: 'Amex Statement',
  expected_amount: 500,
  occurrence_date: '2026-08-15',
}

const workoutPayload = {
  session_id: '770e8400-e29b-41d4-a716-446655440002',
  day_id: 'chest',
  session_date: '2026-07-08',
  ended_at: '2026-07-08T12:00:00.000Z',
}

const capturePayload = {
  capture_id: '880e8400-e29b-41d4-a716-446655440003',
  title: '给妈妈打电话',
  due_date: '2026-07-15',
  source: 'aios',
}

beforeEach(() => {
  S.tasks = []
})

describe('lifeEventsInbox', () => {
  it('creates inbox task from finance.bill_due payload', () => {
    const task = upsertTaskFromFinanceBillDue(billPayload)
    expect(task.title).toBe('Amex Statement')
    expect(task.dueDate).toBe('2026-08-15')
    expect(task.listId).toBe('inbox')
    expect(task.meta.lifeEventRef).toEqual({
      domain: 'finance',
      occurrenceId: 'occ-123',
    })
    expect(S.tasks).toHaveLength(1)
  })

  it('is idempotent by occurrence_id', () => {
    upsertTaskFromFinanceBillDue(billPayload)
    upsertTaskFromFinanceBillDue(billPayload)
    expect(S.tasks).toHaveLength(1)
    expect(findTaskByFinanceOccurrenceId('occ-123')?.id).toBe(S.tasks[0].id)
  })

  it('creates completed habit from fitness.workout_logged', () => {
    const task = upsertHabitFromFitnessWorkoutLogged(workoutPayload)
    expect(task.title).toBe('健身 · 胸')
    expect(task.dueDate).toBe('2026-07-08')
    expect(task.completed).toBe(true)
    expect(task.meta.kind).toBe('habit')
    expect(task.meta.lifeEventRef).toEqual({
      domain: 'fitness',
      sessionId: workoutPayload.session_id,
    })
  })

  it('is idempotent by fitness session_id', () => {
    upsertHabitFromFitnessWorkoutLogged(workoutPayload)
    upsertHabitFromFitnessWorkoutLogged(workoutPayload)
    expect(S.tasks).toHaveLength(1)
    expect(findTaskByFitnessSessionId(workoutPayload.session_id)?.id).toBe(S.tasks[0].id)
  })

  it('creates inbox task from core.task_captured payload', () => {
    const task = upsertTaskFromCoreCapture(capturePayload)
    expect(task.title).toBe('给妈妈打电话')
    expect(task.dueDate).toBe('2026-07-15')
    expect(task.listId).toBe('inbox')
    expect(task.notes).toContain('aios')
    expect(task.meta.lifeEventRef).toEqual({
      domain: 'core',
      captureId: capturePayload.capture_id,
    })
    expect(S.tasks).toHaveLength(1)
  })

  it('is idempotent by capture_id', () => {
    upsertTaskFromCoreCapture(capturePayload)
    upsertTaskFromCoreCapture(capturePayload)
    expect(S.tasks).toHaveLength(1)
    expect(findTaskByCaptureId(capturePayload.capture_id)?.id).toBe(S.tasks[0].id)
  })

  it('consumes pending events and marks processed', async () => {
    const updates = []
    const client = {
      from(table) {
        expect(table).toBe('life_events')
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          in() {
            return this
          },
          order() {
            return this
          },
          limit() {
            return Promise.resolve({
              data: [{ ...envelopeBase, type: 'finance.bill_due', payload: billPayload }],
              error: null,
            })
          },
          update(patch) {
            updates.push(patch)
            return {
              eq: () => Promise.resolve({ error: null }),
            }
          },
        }
      },
    }

    const result = await consumePendingLifeEvents(client)
    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)
    expect(updates[0]?.status).toBe('processed')
    expect(S.tasks).toHaveLength(1)
  })

  it('consumes fitness.workout_logged and marks processed', async () => {
    const updates = []
    const client = {
      from() {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          in() {
            return this
          },
          order() {
            return this
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  ...envelopeBase,
                  type: 'fitness.workout_logged',
                  payload: workoutPayload,
                },
              ],
              error: null,
            })
          },
          update(patch) {
            updates.push(patch)
            return {
              eq: () => Promise.resolve({ error: null }),
            }
          },
        }
      },
    }

    const result = await consumePendingLifeEvents(client)
    expect(result.processed).toBe(1)
    expect(updates[0]?.status).toBe('processed')
    expect(S.tasks[0]?.completed).toBe(true)
  })

  it('marks failed on bad payload for known type', async () => {
    const updates = []
    const client = {
      from() {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          in() {
            return this
          },
          order() {
            return this
          },
          limit() {
            return Promise.resolve({
              data: [{ ...envelopeBase, type: 'finance.bill_due', payload: { occurrence_id: 'only-id' } }],
              error: null,
            })
          },
          update(patch) {
            updates.push(patch)
            return {
              eq: () => Promise.resolve({ error: null }),
            }
          },
        }
      },
    }

    const result = await consumePendingLifeEvents(client)
    expect(result.processed).toBe(0)
    expect(result.failed).toBe(1)
    expect(updates[0]?.status).toBe('failed')
  })
})
