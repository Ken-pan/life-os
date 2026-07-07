import { describe, it, expect } from 'vitest'
import {
  blockLayout,
  parseTimeToMinutes,
  defaultDurationMinutes,
  findScheduleConflicts,
  overlappingTaskIds,
  overlapBlockColumns,
  computeDayScheduleStats,
  snapMinutesFromTimelineTop,
  formatMinutesAsTime,
  HOUR_HEIGHT_PX,
  dayBoundsMinutes,
  moveBlockSchedule,
  resizeBlockBottom,
  resizeBlockTop,
  formatConflictLabel,
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
    expect(layout?.top).toBe(144)
    expect(layout?.height).toBe(96)
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

  it('assigns side-by-side columns for overlapping blocks', () => {
    const tasks = [
      task({ id: 'a', scheduledStart: '09:00', durationMinutes: 90 }),
      task({ id: 'b', scheduledStart: '09:30', durationMinutes: 30 }),
    ]
    const columns = overlapBlockColumns(tasks)
    expect(columns.get('a')).toEqual({ column: 0, columns: 2 })
    expect(columns.get('b')).toEqual({ column: 1, columns: 2 })
  })

  it('keeps single column for non-overlapping blocks', () => {
    const tasks = [
      task({ id: 'a', scheduledStart: '09:00', durationMinutes: 30 }),
      task({ id: 'b', scheduledStart: '10:00', durationMinutes: 30 }),
    ]
    const columns = overlapBlockColumns(tasks)
    expect(columns.get('a')).toEqual({ column: 0, columns: 1 })
    expect(columns.get('b')).toEqual({ column: 0, columns: 1 })
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

  it('snaps timeline drop position to 15-minute grid', () => {
    const topPx = HOUR_HEIGHT_PX * 1.25
    const minutes = snapMinutesFromTimelineTop(topPx)
    expect(formatMinutesAsTime(minutes)).toBe('09:15')
  })

  it('moves and resizes blocks within day bounds', () => {
    const bounds = dayBoundsMinutes()
    expect(moveBlockSchedule(540, 60, 30, bounds)).toEqual({
      startMinutes: 570,
      durationMinutes: 60,
    })
    expect(resizeBlockBottom(540, 60, 30, bounds)).toEqual({
      startMinutes: 540,
      durationMinutes: 90,
    })
    expect(resizeBlockTop(540, 60, 30, bounds)).toEqual({
      startMinutes: 570,
      durationMinutes: 30,
    })
  })

  it('formats conflict labels', () => {
    const tr = (key, params = {}) => {
      if (key === 'schedule.conflictItem') {
        return `${params.title} (${params.start}-${params.end})`
      }
      return key
    }
    expect(
      formatConflictLabel(
        task({
          title: 'Standup',
          scheduledStart: '09:00',
          durationMinutes: 30,
        }),
        tr,
      ),
    ).toBe('Standup (09:00-09:30)')
  })
})
