import { describe, it, expect } from 'vitest'
import {
  blockLayout,
  parseTimeToMinutes,
  defaultDurationMinutes,
  findScheduleConflicts,
  overlappingTaskIds,
  computeDayScheduleStats,
} from './schedule.js'

const task = (overrides = {}) => ({
  id: '1',
  title: 'Test',
  scheduledStart: '09:00',
  durationMinutes: 60,
  completed: false,
  deletedAt: null,
  meta: {},
  ...overrides,
})

describe('schedule', () => {
  it('parses HH:mm to minutes', () => {
    expect(parseTimeToMinutes('09:30')).toBe(570)
  })

  it('calculates block layout from start and duration', () => {
    const layout = blockLayout('09:30', 60)
    expect(layout).not.toBeNull()
    expect(layout?.top).toBe(96)
    expect(layout?.height).toBe(64)
  })

  it('defaults duration by task kind', () => {
    expect(defaultDurationMinutes({ meta: { kind: 'focus' } })).toBe(60)
    expect(defaultDurationMinutes({ meta: { kind: 'micro' } })).toBe(15)
  })

  it('detects overlapping blocks', () => {
    const tasks = [
      task({ id: 'a', scheduledStart: '09:00', durationMinutes: 60 }),
      task({ id: 'b', scheduledStart: '09:30', durationMinutes: 30 }),
    ]
    expect(findScheduleConflicts(tasks, '09:45', 30, 'c')).toHaveLength(2)
    expect(overlappingTaskIds(tasks).size).toBe(2)
  })

  it('summarizes planned day stats', () => {
    const stats = computeDayScheduleStats([
      task({ completed: true }),
      task({ id: '2', scheduledStart: '11:00', durationMinutes: 30 }),
    ])
    expect(stats.scheduled).toBe(2)
    expect(stats.completed).toBe(1)
    expect(stats.plannedMinutes).toBe(90)
  })
})
