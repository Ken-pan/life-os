import { getTaskKind } from './taskKind.js'
import { taskDurationMinutes, formatDurationCompact } from './schedule.js'
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
  const hasTime = Boolean(task.scheduledStart || task.dueTime)
  const onContextDay = Boolean(
    contextDate && task.dueDate === contextDate && !overdue,
  )

  if (minimal) {
    const time = task.scheduledStart || task.dueTime
    return time || ''
  }

  if (!hasTime) {
    /** @type {string[]} */
    const parts = []
    if (onContextDay || (!task.dueDate && contextDate)) {
      parts.push(t('task.unscheduledLine'))
    } else if (task.dueDate) {
      parts.push(formatDateShort(task.dueDate), t('task.unscheduledOnly'))
    } else {
      parts.push(t('task.unscheduledOnly'))
    }
    if (task.priority > 0 && task.priority <= 2) {
      parts.push(t(`task.p${task.priority}`))
    }
    if (task.recurrence?.rule && task.recurrence.rule !== 'none') {
      parts.push(recurrenceLabel(task.recurrence, t))
    }
    return parts.join(' · ')
  }

  /** @type {string[]} */
  const parts = []

  if (overdue && task.dueDate) {
    parts.push(formatDateShort(task.dueDate))
  }

  const time = task.scheduledStart || task.dueTime
  if (time) parts.push(time)

  if (onContextDay || task.scheduledStart || task.dueTime) {
    parts.push(formatDurationCompact(taskDurationMinutes(task), t))
  }

  if (kind === 'focus') parts.push(t('task.kindFocus'))

  if (task.priority > 0 && task.priority <= 2) {
    parts.push(t(`task.p${task.priority}`))
  }

  if (task.recurrence?.rule && task.recurrence.rule !== 'none') {
    parts.push(recurrenceLabel(task.recurrence, t))
  }

  return parts.join(' · ')
}
