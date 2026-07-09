import { parseLifeEvent } from '@life-os/contracts/events'
import { createTask, updateTask } from '../domain/tasks.js'
import { S } from '../state.svelte.js'
import { SYSTEM_LIST_INBOX } from '../types.js'
import { supabase, isSupabaseConfigured } from '../supabase.js'

const BATCH_LIMIT = 50

const CONSUMED_EVENT_TYPES = ['finance.bill_due', 'fitness.workout_logged']

const FITNESS_DAY_LABELS = /** @type {Record<string, string>} */ ({
  chest: '胸',
  back: '背',
  legs: '腿',
  arms: '臂',
})

/** @param {string} dayId */
function fitnessDayLabel(dayId) {
  if (!dayId) return '训练'
  return FITNESS_DAY_LABELS[dayId] ?? dayId
}

/**
 * @param {string} occurrenceId
 * @returns {import('../types.js').Task | undefined}
 */
export function findTaskByFinanceOccurrenceId(occurrenceId) {
  return S.tasks.find(
    (task) =>
      !task.deletedAt &&
      task.meta?.lifeEventRef?.domain === 'finance' &&
      task.meta.lifeEventRef.occurrenceId === occurrenceId,
  )
}

/**
 * @param {string} sessionId
 * @returns {import('../types.js').Task | undefined}
 */
export function findTaskByFitnessSessionId(sessionId) {
  return S.tasks.find(
    (task) =>
      !task.deletedAt &&
      task.meta?.lifeEventRef?.domain === 'fitness' &&
      task.meta.lifeEventRef.sessionId === sessionId,
  )
}

/**
 * @param {import('@life-os/contracts/events').FinanceBillDueEvent['payload']} payload
 * @returns {import('../types.js').Task}
 */
export function upsertTaskFromFinanceBillDue(payload) {
  const existing = findTaskByFinanceOccurrenceId(payload.occurrence_id)
  if (existing) return existing

  const amountNote =
    payload.expected_amount != null ? `预计金额：${payload.expected_amount}` : ''

  return createTask({
    title: payload.label,
    dueDate: payload.occurrence_date,
    listId: SYSTEM_LIST_INBOX,
    notes: amountNote,
    meta: {
      kind: 'standard',
      lifeEventRef: {
        domain: 'finance',
        occurrenceId: payload.occurrence_id,
      },
    },
  })
}

/**
 * @param {import('@life-os/contracts/events').FitnessWorkoutLoggedEvent['payload']} payload
 * @returns {import('../types.js').Task}
 */
export function upsertHabitFromFitnessWorkoutLogged(payload) {
  const existing = findTaskByFitnessSessionId(payload.session_id)
  if (existing) return existing

  const task = createTask({
    title: `健身 · ${fitnessDayLabel(payload.day_id)}`,
    dueDate: payload.session_date,
    listId: SYSTEM_LIST_INBOX,
    notes: '来自 Fitness 完练',
    meta: {
      kind: 'habit',
      lifeEventRef: {
        domain: 'fitness',
        sessionId: payload.session_id,
      },
    },
  })

  return updateTask(task.id, {
    completed: true,
    completedAt: payload.ended_at ? Date.parse(payload.ended_at) || Date.now() : Date.now(),
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} eventId
 * @param {'processed' | 'failed'} status
 */
export async function markLifeEventStatus(client, eventId, status) {
  const { error } = await client
    .from('life_events')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', eventId)

  if (error) throw error
}

/**
 * @param {import('@life-os/contracts/events').LifeEvent} event
 */
function applyLifeEvent(event) {
  if (event.type === 'finance.bill_due') {
    return upsertTaskFromFinanceBillDue(event.payload)
  }
  if (event.type === 'fitness.workout_logged') {
    return upsertHabitFromFitnessWorkoutLogged(event.payload)
  }
  return null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} [client]
 */
export async function consumePendingLifeEvents(client = supabase) {
  if (!isSupabaseConfigured) return { processed: 0, failed: 0, skipped: 0 }

  const { data: rows, error } = await client
    .from('life_events')
    .select('*')
    .eq('status', 'pending')
    .in('type', CONSUMED_EVENT_TYPES)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) throw error

  let processed = 0
  let failed = 0
  let skipped = 0

  for (const row of rows ?? []) {
    const result = parseLifeEvent(row)
    if (!result.ok) {
      if (result.reason === 'bad-payload') {
        await markLifeEventStatus(client, row.id, 'failed')
        failed += 1
      } else {
        skipped += 1
      }
      continue
    }

    if (!CONSUMED_EVENT_TYPES.includes(result.event.type)) {
      skipped += 1
      continue
    }

    try {
      applyLifeEvent(result.event)
      await markLifeEventStatus(client, result.envelope.id, 'processed')
      processed += 1
    } catch {
      // 保持 pending，下次重试
    }
  }

  return { processed, failed, skipped }
}
