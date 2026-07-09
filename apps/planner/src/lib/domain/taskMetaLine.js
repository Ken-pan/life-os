import { getTaskKind } from './taskKind.js'
import {
  taskDurationMinutes,
  formatDurationCompact,
  parseTimeToMinutes,
  formatMinutesAsTime,
} from './schedule.js'
import { formatDateShort } from './dateFormat.js'
import { recurrenceLabel } from './recurrence.js'

/**
 * @param {import('../types.js').Task} task
 * @param {(key: string, params?: Record<string, unknown>) => string} t
 * @param {{
 *   contextDate?: string,
 *   minimal?: boolean,
 *   overdue?: boolean,
 * }} [opts]
 */
export function buildTaskMetaLine(task, t, opts = {}) {
  const { contextDate, minimal = false, overdue = false } = opts
  const kind = getTaskKind(task)
  const onContextDay = Boolean(
    contextDate && task.dueDate === contextDate && !overdue,
  )

  if (minimal) {
    if (task.scheduledStart) {
      return t('schedule.scheduledShort', { start: task.scheduledStart })
    }
    if (task.dueTime) return t('schedule.dueShort', { time: task.dueTime })
    return ''
  }

  /** @type {string[]} */
  const parts = []

  if (overdue && task.dueDate) {
    parts.push(formatDateShort(task.dueDate))
  }

  if (task.scheduledStart) {
    const startMinutes = parseTimeToMinutes(task.scheduledStart)
    const duration = taskDurationMinutes(task)
    parts.push(
      t('schedule.scheduledRange', {
        start: task.scheduledStart,
        end: formatMinutesAsTime(startMinutes + duration),
      }),
    )
    parts.push(
      t('schedule.estimatedDuration', {
        duration: formatDurationCompact(duration, t),
      }),
    )
  } else {
    if (task.dueTime) parts.push(t('schedule.dueAt', { time: task.dueTime }))
    if (onContextDay || (!task.dueDate && contextDate)) {
      parts.push(t('task.unscheduledLine'))
    } else if (task.dueDate) {
      parts.push(formatDateShort(task.dueDate), t('task.unscheduledOnly'))
    } else {
      parts.push(t('task.unscheduledOnly'))
    }
    if (task.dueTime && (onContextDay || task.durationMinutes)) {
      parts.push(
        t('schedule.estimatedDuration', {
          duration: formatDurationCompact(taskDurationMinutes(task), t),
        }),
      )
    }
  }

  if (task.scheduledStart && task.dueTime) parts.push(t('schedule.dueAt', { time: task.dueTime }))

  if (kind === 'focus') parts.push(t('task.kindFocus'))

  if (task.priority === 'P0' || task.priority === 1) {
    parts.push(t('task.priority_P0') || 'P0')
  } else if (task.priority === 'P1' || task.priority === 2) {
    parts.push(t('task.priority_P1') || 'P1')
  } else if (task.priority === 'P2' || task.priority === 3) {
    parts.push(t('task.priority_P2') || 'P2')
  }

  if (task.recurrence?.rule && task.recurrence.rule !== 'none') {
    parts.push(recurrenceLabel(task.recurrence, t))
  }

  return parts.join(' · ')
}
