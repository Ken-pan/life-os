import { describe, it, expect, vi } from 'vitest'
import { buildTaskMetaLine } from './taskMetaLine.js'

vi.mock('../i18n/index.js', () => ({
  localeTag: () => 'zh-CN',
}))

const t = (key, params = {}) => {
  const map = {
    'task.unscheduledLine': '今天 · 未排程',
    'task.unscheduledOnly': '未排程',
    'task.kindFocus': '关键',
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
  it('formats timed today task as inline metadata', () => {
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
    expect(line).toBe('已安排 09:00–10:30 · 预计 1h30m · 关键 · 高')
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
})
