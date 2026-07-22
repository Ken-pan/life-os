import { describe, expect, it, vi } from 'vitest'
import {
  areKenosWritersBlocked,
  assertKenosWriteRpcAllowed,
  isPlannerCompatCanaryMode,
} from './prodWriteGuard.core.js'
import {
  buildPlanUiCreateTaskAction,
  filterTasksForLegacySync,
  fitnessProgramTaskIdempotencyKey,
  isPlanCreateTaskWriterCohortMember,
  isPlanCreateTaskWriterEnabled,
  materializeHostedCreateTask,
  shouldSkipLegacyCreateSync,
} from './planCreateTaskWriter.core.js'

describe('plan create-task writer flags', () => {
  it('requires both flags and rejects compat canary', () => {
    expect(isPlanCreateTaskWriterEnabled({})).toBe(false)
    expect(
      isPlanCreateTaskWriterEnabled({
        VITE_KENOS_PROD_WRITES: '1',
      }),
    ).toBe(false)
    expect(
      isPlanCreateTaskWriterEnabled({
        VITE_KENOS_PLAN_CREATE_TASK_WRITER: '1',
      }),
    ).toBe(false)
    expect(
      isPlanCreateTaskWriterEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_PLAN_CREATE_TASK_WRITER: '1',
      }),
    ).toBe(true)
    expect(
      isPlanCreateTaskWriterEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_PLAN_CREATE_TASK_WRITER: '1',
        VITE_KENOS_COMPAT_CANARY: '1',
      }),
    ).toBe(false)
  })

  it('restricts optional owner email cohort', () => {
    expect(isPlanCreateTaskWriterCohortMember('a@b.com', {})).toBe(true)
    expect(
      isPlanCreateTaskWriterCohortMember('a@b.com', {
        VITE_KENOS_PLAN_CREATE_TASK_WRITER_OWNER_EMAILS: '334452284ken@gmail.com',
      }),
    ).toBe(false)
    expect(
      isPlanCreateTaskWriterCohortMember('334452284ken@gmail.com', {
        VITE_KENOS_PLAN_CREATE_TASK_WRITER_OWNER_EMAILS: '334452284ken@gmail.com',
      }),
    ).toBe(true)
  })

  it('unblocks create RPC only when both writer flags are on', () => {
    const blocked = { VITE_KENOS_PROD_WRITES: '1' }
    expect(areKenosWritersBlocked(blocked)).toBe(true)
    expect(assertKenosWriteRpcAllowed('kenos_create_plan_task_action', blocked).ok).toBe(false)

    const enabled = {
      VITE_KENOS_PROD_WRITES: '1',
      VITE_KENOS_PLAN_CREATE_TASK_WRITER: '1',
    }
    expect(areKenosWritersBlocked(enabled)).toBe(false)
    expect(assertKenosWriteRpcAllowed('kenos_create_plan_task_action', enabled).ok).toBe(true)

    const compat = {
      ...enabled,
      VITE_KENOS_COMPAT_CANARY: '1',
    }
    expect(isPlannerCompatCanaryMode(compat)).toBe(true)
    expect(areKenosWritersBlocked(compat)).toBe(true)
  })
})

describe('plan create-task writer contract', () => {
  const authUserId = '11111111-1111-4111-8111-111111111111'

  it('builds plan producer action with user actor', () => {
    const action = buildPlanUiCreateTaskAction(
      { title: 'KENOS PLAN WRITER CANARY — test' },
      {
        authUserId,
        idempotencyKey: 'idem-1',
        correlationId: '22222222-2222-4222-8222-222222222222',
        actionId: '33333333-3333-4333-8333-333333333333',
        deviceId: '44444444-4444-4444-8444-444444444444',
        now: Date.parse('2026-07-20T04:00:00.000Z'),
      },
    )
    expect(action.producer).toBe('plan')
    expect(action.actor).toEqual({ type: 'user', id: authUserId })
    expect(action.actionType).toBe('plan.create_task')
    expect(action.requestedRisk).toBe('R1')
    expect(action.payload.title).toContain('KENOS PLAN WRITER CANARY')
  })

  it('skips legacy create sync until lifecycle dirty', () => {
    const action = buildPlanUiCreateTaskAction(
      { title: 'Canary' },
      { authUserId, deviceId: '44444444-4444-4444-8444-444444444444' },
    )
    const task = materializeHostedCreateTask(
      { ok: true, taskId: 'task-1', activityId: 'a1', outboxId: 'o1', duplicate: false },
      { title: 'Canary' },
      action,
    )
    expect(shouldSkipLegacyCreateSync(task)).toBe(true)
    expect(filterTasksForLegacySync([task, { id: 'legacy', meta: {} }]).map((t) => t.id)).toEqual([
      'legacy',
    ])
    task.meta.legacyDirty = true
    expect(shouldSkipLegacyCreateSync(task)).toBe(false)
  })

  it('rejects work-sourced payloads', () => {
    expect(() =>
      buildPlanUiCreateTaskAction({ title: 'x', workSource: { body: 'no' } }, { authUserId }),
    ).toThrow(/Work-sourced/)
  })
})

describe('fitness program seed idempotency (regression for 2026-07-22 triplicate 健身 pollution)', () => {
  const authUserId = '11111111-1111-4111-8111-111111111111'
  const programCtx = {
    program: 'bro-split',
    version: 6,
    userId: authUserId,
    dueDate: '2026-06-30',
    muscle: 'legs',
  }

  it('derives one stable semantic key from program/version/user/dueDate/muscle', () => {
    const k1 = fitnessProgramTaskIdempotencyKey(programCtx)
    const k2 = fitnessProgramTaskIdempotencyKey({ ...programCtx })
    const k3 = fitnessProgramTaskIdempotencyKey({ ...programCtx, muscle: 'LEGS' }) // case-insensitive
    expect(k1).toBe('fitness_program:v6:bro-split:11111111-1111-4111-8111-111111111111:2026-06-30:legs')
    expect(k2).toBe(k1)
    expect(k3).toBe(k1)
    // Any identity dimension changing yields a different key.
    expect(fitnessProgramTaskIdempotencyKey({ ...programCtx, muscle: 'back' })).not.toBe(k1)
    expect(fitnessProgramTaskIdempotencyKey({ ...programCtx, dueDate: '2026-07-07' })).not.toBe(k1)
    expect(fitnessProgramTaskIdempotencyKey({ ...programCtx, version: 7 })).not.toBe(k1)
  })

  it('validates required identity fields', () => {
    expect(() => fitnessProgramTaskIdempotencyKey({ ...programCtx, program: '' })).toThrow(/program/)
    expect(() => fitnessProgramTaskIdempotencyKey({ ...programCtx, version: '' })).toThrow(/version/)
    expect(() => fitnessProgramTaskIdempotencyKey({ ...programCtx, userId: 'nope' })).toThrow(/userId/)
    expect(() => fitnessProgramTaskIdempotencyKey({ ...programCtx, dueDate: '06-30' })).toThrow(/dueDate/)
    expect(() => fitnessProgramTaskIdempotencyKey({ ...programCtx, muscle: '' })).toThrow(/muscle/)
  })

  // Models the governed RPC ledger: unique (user_id, action_type, idempotency_key) with
  // `on conflict do nothing` returning the existing task (kenos_create_plan_task_action).
  function makeGovernedLedger() {
    const byKey = new Map()
    let seq = 0
    return {
      created: 0,
      submit(action, userId) {
        const k = `${userId}|${action.actionType}|${action.idempotencyKey}`
        if (byKey.has(k)) return { taskId: byKey.get(k), duplicate: true }
        const taskId = `task-${++seq}`
        byKey.set(k, taskId)
        this.created += 1
        return { taskId, duplicate: false }
      },
    }
  }

  // One independent seed run: derives the deterministic key, builds the action with a FRESH
  // actionId/correlationId (writer defaults), and submits through the governed ledger.
  function seedRun(ledger) {
    const idempotencyKey = fitnessProgramTaskIdempotencyKey(programCtx)
    const action = buildPlanUiCreateTaskAction(
      { title: '健身 · 腿', dueDate: programCtx.dueDate },
      { authUserId, idempotencyKey },
    )
    expect(action.idempotencyKey).toBe(idempotencyKey) // stable key flowed through (not random plan_ui:uuid)
    return ledger.submit(action, authUserId)
  }

  it('three repeated runs create exactly one task', () => {
    const ledger = makeGovernedLedger()
    const r1 = seedRun(ledger)
    const r2 = seedRun(ledger)
    const r3 = seedRun(ledger)

    expect(ledger.created).toBe(1)
    expect(r1.duplicate).toBe(false)
    expect(r2.duplicate).toBe(true)
    expect(r3.duplicate).toBe(true)
    expect(r2.taskId).toBe(r1.taskId)
    expect(r3.taskId).toBe(r1.taskId)
  })

  it('contrast: the old random-key default would NOT dedupe (proves the fix matters)', () => {
    const ledger = makeGovernedLedger()
    // No idempotencyKey passed → writer falls back to plan_ui:${randomUuid}, distinct per run.
    for (let i = 0; i < 3; i += 1) {
      const action = buildPlanUiCreateTaskAction({ title: '健身 · 腿' }, { authUserId })
      ledger.submit(action, authUserId)
    }
    expect(ledger.created).toBe(3) // the bug: three tasks from three identical intents
  })
})
