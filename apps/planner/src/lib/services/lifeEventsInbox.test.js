import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  findTaskByFinanceOccurrenceId,
  upsertTaskFromFinanceBillDue,
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
  type: 'finance.bill_due',
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
          order() {
            return this
          },
          limit() {
            return Promise.resolve({
              data: [{ ...envelopeBase, payload: billPayload }],
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
          order() {
            return this
          },
          limit() {
            return Promise.resolve({
              data: [{ ...envelopeBase, payload: { occurrence_id: 'only-id' } }],
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
