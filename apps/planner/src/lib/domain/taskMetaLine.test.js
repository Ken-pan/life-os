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
    expect(line).toBe('09:00 · 1h30m · 关键 · 高')
  })

  it('formats unscheduled task on today', () => {
    const line = buildTaskMetaLine({ dueDate: '2026-07-06' }, t, {
      contextDate: '2026-07-06',
    })
    expect(line).toBe('今天 · 未排程')
  })
})
