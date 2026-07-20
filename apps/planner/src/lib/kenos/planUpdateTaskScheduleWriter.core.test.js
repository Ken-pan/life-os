import { describe, expect, it } from 'vitest'
import {
  buildPlanUiUpdateTaskScheduleAction,
  isPlanUpdateTaskScheduleWriterEnabled,
  normalizePlanSchedulePayload,
} from './planUpdateTaskScheduleWriter.core.js'
import { areKenosWritersBlocked } from './prodWriteGuard.core.js'

const AUTH = '11111111-1111-4111-8111-111111111111'

describe('planUpdateTaskScheduleWriter.core', () => {
  it('requires dual flags', () => {
    expect(
      isPlanUpdateTaskScheduleWriterEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_PLAN_UPDATE_TASK_SCHEDULE_WRITER: '1',
      }),
    ).toBe(true)
    expect(isPlanUpdateTaskScheduleWriterEnabled({ VITE_KENOS_PROD_WRITES: '1' })).toBe(false)
  })

  it('normalizes schedule payload', () => {
    expect(
      normalizePlanSchedulePayload({
        scheduledDate: '2026-07-21',
        scheduledStart: '09:30',
        durationMinutes: 45,
      }),
    ).toEqual({ scheduledDate: '2026-07-21', scheduledStart: '09:30', durationMinutes: 45 })
    expect(() =>
      normalizePlanSchedulePayload({ scheduledDate: null, scheduledStart: '09:30', durationMinutes: null }),
    ).toThrow(/requires scheduledDate/)
  })

  it('builds action and unlocks guard', () => {
    const action = buildPlanUiUpdateTaskScheduleAction(
      { taskId: 't1', scheduledDate: '2026-07-21', scheduledStart: '10:00', durationMinutes: 30 },
      { authUserId: AUTH },
    )
    expect(action.actionType).toBe('plan.update_task_schedule')
    expect(
      areKenosWritersBlocked({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_PLAN_UPDATE_TASK_SCHEDULE_WRITER: '1',
      }),
    ).toBe(false)
  })
})
