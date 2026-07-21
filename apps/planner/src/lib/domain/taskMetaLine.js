import {
  taskDurationMinutes,
  formatDurationCompact,
  parseTimeToMinutes,
  formatMinutesAsTime,
} from './schedule.js'
import { formatDateShort } from './dateFormat.js'
import { recurrenceLabel } from './recurrence.js'

/**
 * 任务行小字（meta line）——按视图矩阵只答一个问题（何时做 / 为何在这 / 还差什么）。
 * 规则见 docs/qa/planner-task-display-spec.md：
 * - kind / priority 不再进小字（改由 checkbox accent 与 focus 色条表达）
 * - contextDate（Today / Calendar 选中日）下不重复 recurrence 长文案
 * - 子任务进度以 `n/m` 结尾，列表可扫
 * - 一行最多一个警示：missed 时间在 gutter；普通逾期用低饱和短状态；未来中性
 * @param {import('../types.js').Task} task
 * @param {(key: string, params?: Record<string, unknown>) => string} t
 * @param {{
 *   contextDate?: string,
 *   minimal?: boolean,
 *   overdue?: boolean,
 *   urgencyTier?: 'missed' | 'overdue' | 'neutral',
 *   omitScheduleTime?: boolean,
 * }} [opts]
 */
export function buildTaskMetaLine(task, t, opts = {}) {
  const {
    contextDate,
    minimal = false,
    overdue = false,
    urgencyTier = overdue ? 'overdue' : 'neutral',
    omitScheduleTime = false,
  } = opts
  const onContextDay = Boolean(
    contextDate && task.dueDate === contextDate && urgencyTier === 'neutral',
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

  // Date-overdue: one muted status only — clock lives in the time gutter when present.
  if (urgencyTier === 'overdue' && task.dueDate) {
    parts.push(t('task.overdueShort', { date: formatDateShort(task.dueDate) }))
    appendSubtaskProgress(task, parts)
    return parts.join(' · ')
  }

  // Missed-today time: gutter owns the red signal; meta stays contextual/neutral.
  if (urgencyTier === 'missed') {
    if (contextDate && task.dueDate === contextDate) {
      parts.push(t('task.actionToday'))
    } else if (task.dueDate) {
      parts.push(formatDateShort(task.dueDate))
    }
    appendSubtaskProgress(task, parts)
    return parts.join(' · ')
  }

  if (task.scheduledStart && !omitScheduleTime) {
    const startMinutes = parseTimeToMinutes(task.scheduledStart)
    const duration = taskDurationMinutes(task)
    // Time range is enough; skip redundant “已安排 / 预计” labels on the row.
    parts.push(
      `${task.scheduledStart}–${formatMinutesAsTime(startMinutes + duration)}`,
    )
  } else if (omitScheduleTime) {
    // Clock lives in the leading gutter — meta answers context only.
    if (onContextDay || (contextDate && task.dueDate === contextDate)) {
      parts.push(t('task.actionToday'))
    } else if (task.dueDate && !contextDate) {
      parts.push(formatDateShort(task.dueDate))
    }
  } else {
    if (task.dueTime) parts.push(t('schedule.dueAt', { time: task.dueTime }))
    if (onContextDay || (!task.dueDate && contextDate)) {
      parts.push(t('task.unscheduledLine'))
    } else if (task.dueDate) {
      parts.push(formatDateShort(task.dueDate), t('task.unscheduledOnly'))
    } else {
      parts.push(t('task.unscheduledOnly'))
    }
    if (task.durationMinutes) {
      parts.push(
        t('schedule.estimatedDuration', {
          duration: formatDurationCompact(taskDurationMinutes(task), t),
        }),
      )
    }
  }

  // recurrence 长文案只在无 contextDate 的列表（Upcoming / Inbox / Project）出现
  if (
    !contextDate &&
    task.recurrence?.rule &&
    task.recurrence.rule !== 'none'
  ) {
    parts.push(recurrenceLabel(task.recurrence, t))
  }

  appendSubtaskProgress(task, parts)

  return parts.join(' · ')
}

/** @param {import('../types.js').Task} task @param {string[]} parts */
function appendSubtaskProgress(task, parts) {
  const total = task.subtasks?.length ?? 0
  if (!total) return
  const done = task.subtasks.filter((s) => s.done).length
  parts.push(`${done}/${total}`)
}
