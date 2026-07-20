import { describe, expect, it } from 'vitest'
import {
  buildPlanUiUpdateTaskDueDateAction,
  isPlanUpdateTaskDueDateWriterCohortMember,
  isPlanUpdateTaskDueDateWriterEnabled,
  normalizePlanDueDatePayload,
} from './planUpdateTaskDueDateWriter.core.js'
import { areKenosWritersBlocked } from './prodWriteGuard.core.js'

const AUTH = '11111111-1111-4111-8111-111111111111'

describe('planUpdateTaskDueDateWriter.core', () => {
  it('requires dual flags and blocks compat/read canary', () => {
    expect(isPlanUpdateTaskDueDateWriterEnabled({})).toBe(false)
    expect(
      isPlanUpdateTaskDueDateWriterEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_PLAN_UPDATE_TASK_DUE_DATE_WRITER: '1',
      }),
    ).toBe(true)
    expect(
      isPlanUpdateTaskDueDateWriterEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_PLAN_UPDATE_TASK_DUE_DATE_WRITER: '1',
        VITE_KENOS_COMPAT_CANARY: '1',
      }),
    ).toBe(false)
  })

  it('honors Owner email cohort with create-writer fallback list', () => {
    const env = { VITE_KENOS_PLAN_CREATE_TASK_WRITER_OWNER_EMAILS: '334452284ken@gmail.com' }
    expect(isPlanUpdateTaskDueDateWriterCohortMember('334452284ken@gmail.com', env)).toBe(true)
    expect(isPlanUpdateTaskDueDateWriterCohortMember('other@example.com', env)).toBe(false)
  })

  it('normalizes dueDate and builds action', () => {
    expect(normalizePlanDueDatePayload(null)).toBe(null)
    expect(normalizePlanDueDatePayload('2026-07-21')).toBe('2026-07-21')
    expect(() => normalizePlanDueDatePayload('07/21/2026')).toThrow(/YYYY-MM-DD/)
    const action = buildPlanUiUpdateTaskDueDateAction(
      { taskId: 'task-1', dueDate: '2026-07-21' },
      { authUserId: AUTH, correlationId: '22222222-2222-4222-8222-222222222222' },
    )
    expect(action.actionType).toBe('plan.update_task_due_date')
    expect(action.payload).toEqual({ taskId: 'task-1', dueDate: '2026-07-21' })
  })

  it('unlocks writers when due-date flag is on with prod writes', () => {
    expect(
      areKenosWritersBlocked({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_PLAN_UPDATE_TASK_DUE_DATE_WRITER: '1',
      }),
    ).toBe(false)
  })
})
