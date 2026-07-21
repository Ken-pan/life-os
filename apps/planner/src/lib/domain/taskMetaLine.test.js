import { describe, it, expect, vi } from 'vitest'
import { buildTaskMetaLine } from './taskMetaLine.js'

vi.mock('../i18n/index.js', () => ({
  localeTag: () => 'zh-CN',
}))

const t = (key, params = {}) => {
  const map = {
    'task.unscheduledLine': '今天 · 未排程',
    'task.unscheduledOnly': '未排程',
    'task.overdueDue': '已逾期 · 截止 {date}',
    'task.overdueShort': '逾期 · {date}',
    'task.actionToday': '今天',
    'task.kindFocus': '关键',
    'task.priority_P0': '高',
    'task.p1': '高',
    'schedule.scheduledRange': '已安排 {start}–{end}',
    'schedule.estimatedDuration': '预计 {duration}',
    'schedule.dueAt': '截止 {time}',
    'schedule.scheduledShort': '已安排 {start}',
    'schedule.dueShort': '截止 {time}',
    'schedule.durationCompactMixed': '{hours}h{minutes}m',
    'schedule.durationCompactMinutes': '{minutes}m',
    'recurrence.daily': '每天',
  }
  let out = map[key] || key
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v))
  }
  return out
}

describe('buildTaskMetaLine', () => {
  it('keeps timed today task to schedule + duration (no kind/priority words)', () => {
    const line = buildTaskMetaLine(
      {
        dueDate: '2026-07-06',
        scheduledStart: '09:00',
        durationMinutes: 90,
        priority: 1,
        meta: { kind: 'focus' },
      },
      t,
      { contextDate: '2026-07-06' },
    )
    expect(line).toBe('09:00–10:30')
  })

  it('formats unscheduled task on today', () => {
    const line = buildTaskMetaLine({ dueDate: '2026-07-06' }, t, {
      contextDate: '2026-07-06',
    })
    expect(line).toBe('今天 · 未排程')
  })

  it('labels due time separately from schedule time', () => {
    const line = buildTaskMetaLine(
      { dueDate: '2026-07-06', dueTime: '20:00', durationMinutes: 30 },
      t,
      { contextDate: '2026-07-06' },
    )
    expect(line).toBe('截止 20:00 · 今天 · 未排程 · 预计 30m')
  })

  it('shows muted overdue date only — no stacked schedule range', () => {
    const line = buildTaskMetaLine(
      {
        dueDate: '2026-07-03',
        scheduledStart: '09:00',
        durationMinutes: 30,
        priority: 'P0',
      },
      t,
      { contextDate: '2026-07-06', overdue: true, urgencyTier: 'overdue' },
    )
    expect(line).toBe('逾期 · 7月3日')
  })

  it('missed-today keeps neutral context (gutter owns the red time)', () => {
    const line = buildTaskMetaLine(
      {
        dueDate: '2026-07-06',
        scheduledStart: '09:00',
        durationMinutes: 30,
      },
      t,
      {
        contextDate: '2026-07-06',
        urgencyTier: 'missed',
        omitScheduleTime: true,
      },
    )
    expect(line).toBe('今天')
  })

  it('omits schedule range when time gutter is present', () => {
    const line = buildTaskMetaLine(
      {
        dueDate: '2026-07-06',
        scheduledStart: '11:00',
        durationMinutes: 60,
      },
      t,
      { contextDate: '2026-07-06', omitScheduleTime: true },
    )
    expect(line).toBe('今天')
  })

  it('hides recurrence text on context-day views but keeps it in date-less lists', () => {
    const task = {
      dueDate: '2026-07-06',
      recurrence: { rule: 'daily' },
    }
    expect(
      buildTaskMetaLine(task, t, { contextDate: '2026-07-06' }),
    ).toBe('今天 · 未排程')
    expect(buildTaskMetaLine(task, t, {})).toContain('每天')
  })

  it('appends subtask progress n/m', () => {
    const line = buildTaskMetaLine(
      {
        dueDate: '2026-07-06',
        scheduledStart: '09:00',
        durationMinutes: 30,
        subtasks: [
          { id: 'a', title: 'a', done: true },
          { id: 'b', title: 'b', done: false },
        ],
      },
      t,
      { contextDate: '2026-07-06' },
    )
    expect(line).toBe('09:00–09:30 · 1/2')
  })
})
