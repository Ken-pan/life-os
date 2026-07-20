import { describe, expect, it, vi } from 'vitest'
import {
  areKenosWritersBlocked,
  assertKenosWriteRpcAllowed,
  isPlannerCompatCanaryMode,
} from './prodWriteGuard.core.js'
import {
  buildPlanUiCreateTaskAction,
  filterTasksForLegacySync,
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
