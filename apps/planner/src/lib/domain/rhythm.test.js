import { describe, it, expect, vi } from 'vitest'
import {
  computeStreak,
  computeWeeklyRhythm,
  isGoodRhythmDay,
  planCompletionsOnDate,
} from './rhythm.js'

const baseTask = {
  notes: '',
  listId: 'inbox',
  priority: 0,
  dueTime: null,
  reminderMinutes: null,
  recurrence: null,
  tags: [],
  subtasks: [],
  deletedAt: null,
  sortOrder: 1,
  meta: { kind: 'standard' },
}

describe('rhythm', () => {
  it('counts plan completions on a date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 5, 12, 0, 0))
    const tasks = [
      {
        ...baseTask,
        id: '1',
        title: 'A',
        dueDate: '2026-07-05',
        completed: true,
        completedAt: Date.now(),
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    expect(planCompletionsOnDate(tasks, '2026-07-05')).toHaveLength(1)
    vi.useRealTimers()
  })

  it('marks good day when daily goal met', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 5, 12, 0, 0))
    const tasks = [
      {
        ...baseTask,
        id: '1',
        title: 'A',
        dueDate: '2026-07-05',
        completed: true,
        completedAt: Date.now(),
        createdAt: 1,
        updatedAt: 1,
      },
      {
        ...baseTask,
        id: '2',
        title: 'B',
        dueDate: '2026-07-05',
        completed: true,
        completedAt: Date.now(),
        createdAt: 2,
        updatedAt: 2,
      },
      {
        ...baseTask,
        id: '3',
        title: 'C',
        dueDate: '2026-07-05',
        completed: true,
        completedAt: Date.now(),
        createdAt: 3,
        updatedAt: 3,
      },
    ]
    const settings = { rhythmEnabled: true, dailyGoal: 3, rhythmRestDays: [] }
    expect(isGoodRhythmDay(tasks, '2026-07-05', settings)).toBe(true)
    expect(computeStreak(tasks, settings)).toBe(1)
    vi.useRealTimers()
  })

  it('builds weekly rhythm grid', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 5, 12, 0, 0))
    const weekly = computeWeeklyRhythm([], { rhythmEnabled: true, dailyGoal: 3 })
    expect(weekly.days).toHaveLength(7)
    expect(weekly.total).toBe(7)
    vi.useRealTimers()
  })
})
