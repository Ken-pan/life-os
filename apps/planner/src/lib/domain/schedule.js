import { getTaskKind } from './taskKind.js'

/** @typedef {{ top: number, height: number, startMinutes: number, endMinutes: number }} BlockLayout */

export const DAY_START_HOUR = 8
export const DAY_END_HOUR = 23
export const HOUR_HEIGHT_PX = 64
export const MIN_BLOCK_HEIGHT_PX = 32

export const SCHEDULE_START_TIMES = [
  '09:00',
  '09:30',
  '10:00',
  '13:00',
  '15:00',
  '19:00',
]
export const SCHEDULE_DURATIONS = [30, 45, 60, 90, 120]

/** @type {{ key: string, time: string }[]} */
export const SCHEDULE_TIME_PRESETS = [
  { key: 'morning', time: '09:00' },
  { key: 'afternoon', time: '14:00' },
  { key: 'evening', time: '19:00' },
]

/** @param {string} time HH:mm */
export function parseTimeToMinutes(time) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** @param {number} minutes */
export function formatMinutesAsTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** @param {number} minutes */
export function formatDurationLabel(minutes, t) {
  if (minutes % 60 === 0 && minutes >= 60) {
    const h = minutes / 60
    return t('schedule.durationHours', { count: h })
  }
  if (minutes > 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return t('schedule.durationHoursMinutes', { hours: h, minutes: m })
  }
  return t('schedule.durationMinutes', { count: minutes })
}

/** @param {import('../types.js').Task} task */
export function defaultDurationMinutes(task) {
  const kind = getTaskKind(task)
  if (kind === 'focus') return 60
  if (kind === 'habit') return 30
  if (kind === 'micro') return 15
  return 30
}

/** @param {import('../types.js').Task} task */
export function taskDurationMinutes(task) {
  if (typeof task.durationMinutes === 'number' && task.durationMinutes > 0) {
    return task.durationMinutes
  }
  return defaultDurationMinutes(task)
}

/** @param {import('../types.js').Task} task @param {string} dateKey */
export function isScheduledOnDate(task, dateKey) {
  return Boolean(
    task.scheduledDate === dateKey && task.scheduledStart && !task.deletedAt,
  )
}

/**
 * @param {string} startTime HH:mm
 * @param {number} durationMinutes
 * @param {{ dayStart?: number, dayEnd?: number, hourHeight?: number, minHeight?: number }} [opts]
 * @returns {BlockLayout | null}
 */
export function blockLayout(startTime, durationMinutes, opts = {}) {
  const dayStart = opts.dayStart ?? DAY_START_HOUR
  const dayEnd = opts.dayEnd ?? DAY_END_HOUR
  const hourHeight = opts.hourHeight ?? HOUR_HEIGHT_PX
  const minHeight = opts.minHeight ?? MIN_BLOCK_HEIGHT_PX

  const startMinutes = parseTimeToMinutes(startTime)
  const dayStartMinutes = dayStart * 60
  const dayEndMinutes = dayEnd * 60
  const endMinutes = startMinutes + durationMinutes

  if (startMinutes >= dayEndMinutes || endMinutes <= dayStartMinutes)
    return null

  const top = ((startMinutes - dayStartMinutes) / 60) * hourHeight
  const height = Math.max(minHeight, (durationMinutes / 60) * hourHeight)

  return { top, height, startMinutes, endMinutes }
}

/** @param {number} startMinutes @param {number} endMinutes @param {(key: string, params?: Record<string, unknown>) => string} t */
export function formatTimeRange(startMinutes, endMinutes, t) {
  const start = formatMinutesAsTime(startMinutes)
  const end = formatMinutesAsTime(endMinutes)
  return t('schedule.timeRange', { start, end })
}

/** @param {string} dateKey @param {string} [todayKey] */
export function isTodayDate(dateKey, todayKey) {
  return dateKey === todayKey
}

/** @param {number} dayStart @param {number} dayEnd */
export function timelineHeightPx(
  dayStart = DAY_START_HOUR,
  dayEnd = DAY_END_HOUR,
) {
  return (dayEnd - dayStart) * HOUR_HEIGHT_PX
}

/** @param {number} [now] @param {number} [dayStart] @param {number} [dayEnd] */
export function currentTimeMarkerTop(
  now = Date.now(),
  dayStart = DAY_START_HOUR,
  dayEnd = DAY_END_HOUR,
) {
  const d = new Date(now)
  const minutes = d.getHours() * 60 + d.getMinutes()
  const dayStartMinutes = dayStart * 60
  const dayEndMinutes = dayEnd * 60
  if (minutes < dayStartMinutes || minutes > dayEndMinutes) return null
  return ((minutes - dayStartMinutes) / 60) * HOUR_HEIGHT_PX
}

/**
 * 时间轴 Y 坐标 → 分钟（15 分钟对齐，限制在可见日界内）
 * @param {number} topPx
 * @param {{ dayStart?: number, dayEnd?: number, hourHeight?: number, snapMinutes?: number, minDuration?: number }} [opts]
 */
export function snapMinutesFromTimelineTop(topPx, opts = {}) {
  const dayStart = opts.dayStart ?? DAY_START_HOUR
  const dayEnd = opts.dayEnd ?? DAY_END_HOUR
  const hourHeight = opts.hourHeight ?? HOUR_HEIGHT_PX
  const snapMinutes = opts.snapMinutes ?? 15
  const minDuration = opts.minDuration ?? 30

  const rawMinutes = dayStart * 60 + (topPx / hourHeight) * 60
  const snapped = Math.round(rawMinutes / snapMinutes) * snapMinutes
  const dayStartMinutes = dayStart * 60
  const dayEndMinutes = dayEnd * 60 - minDuration
  const clamped = Math.max(dayStartMinutes, Math.min(dayEndMinutes, snapped))
  return clamped
}

export const MIN_BLOCK_DURATION = 15
export const SCHEDULE_SNAP_MINUTES = 15

/** @param {number} deltaPx @param {number} [hourHeight] @param {number} [snapMinutes] */
export function snapMinutesDelta(
  deltaPx,
  hourHeight = HOUR_HEIGHT_PX,
  snapMinutes = SCHEDULE_SNAP_MINUTES,
) {
  const raw = (deltaPx / hourHeight) * 60
  return Math.round(raw / snapMinutes) * snapMinutes
}

/** @param {number} [dayStart] @param {number} [dayEnd] */
export function dayBoundsMinutes(
  dayStart = DAY_START_HOUR,
  dayEnd = DAY_END_HOUR,
) {
  return { start: dayStart * 60, end: dayEnd * 60 }
}

/** @param {number} minutes @param {number} [dayStart] @param {number} [hourHeight] */
export function timelineTopFromMinutes(
  minutes,
  dayStart = DAY_START_HOUR,
  hourHeight = HOUR_HEIGHT_PX,
) {
  return ((minutes - dayStart * 60) / 60) * hourHeight
}

/**
 * @param {number} startMinutes
 * @param {number} durationMinutes
 * @param {number} deltaMinutes
 * @param {{ start: number, end: number }} bounds
 */
export function moveBlockSchedule(
  startMinutes,
  durationMinutes,
  deltaMinutes,
  bounds,
) {
  const duration = Math.max(MIN_BLOCK_DURATION, durationMinutes)
  const start = Math.max(
    bounds.start,
    Math.min(bounds.end - duration, startMinutes + deltaMinutes),
  )
  return { startMinutes: start, durationMinutes: duration }
}

/**
 * @param {number} startMinutes
 * @param {number} durationMinutes
 * @param {number} deltaMinutes
 * @param {{ start: number, end: number }} bounds
 */
export function resizeBlockBottom(
  startMinutes,
  durationMinutes,
  deltaMinutes,
  bounds,
) {
  const duration = Math.max(
    MIN_BLOCK_DURATION,
    Math.min(bounds.end - startMinutes, durationMinutes + deltaMinutes),
  )
  return { startMinutes, durationMinutes: duration }
}

/**
 * @param {number} startMinutes
 * @param {number} durationMinutes
 * @param {number} deltaMinutes
 * @param {{ start: number, end: number }} bounds
 */
export function resizeBlockTop(
  startMinutes,
  durationMinutes,
  deltaMinutes,
  bounds,
) {
  const endMinutes = startMinutes + durationMinutes
  let start = Math.max(bounds.start, startMinutes + deltaMinutes)
  start = Math.min(start, endMinutes - MIN_BLOCK_DURATION)
  return { startMinutes: start, durationMinutes: endMinutes - start }
}

/** @param {import('../types.js').Task} a @param {import('../types.js').Task} b */
export function compareScheduledTasks(a, b) {
  const am = parseTimeToMinutes(a.scheduledStart || '00:00')
  const bm = parseTimeToMinutes(b.scheduledStart || '00:00')
  return am - bm || a.title.localeCompare(b.title)
}

/** @param {string} startTime @param {number} durationMinutes */
export function blockInterval(startTime, durationMinutes) {
  const start = parseTimeToMinutes(startTime)
  return { start, end: start + durationMinutes }
}

/** @param {{ start: number, end: number }} a @param {{ start: number, end: number }} b */
export function intervalsOverlap(a, b) {
  return a.start < b.end && b.start < a.end
}

/**
 * @param {import('../types.js').Task[]} tasks
 * @param {string} startTime
 * @param {number} durationMinutes
 * @param {string | null} [excludeId]
 */
export function findScheduleConflicts(
  tasks,
  startTime,
  durationMinutes,
  excludeId = null,
) {
  const candidate = blockInterval(startTime, durationMinutes)
  return tasks.filter((t) => {
    if (t.id === excludeId || !t.scheduledStart) return false
    const other = blockInterval(t.scheduledStart, taskDurationMinutes(t))
    return intervalsOverlap(candidate, other)
  })
}

/** @param {import('../types.js').Task[]} tasks */
export function computeDayScheduleStats(tasks) {
  let plannedMinutes = 0
  let scheduled = 0
  let completed = 0
  for (const t of tasks) {
    if (!t.scheduledStart) continue
    scheduled += 1
    if (t.completed) completed += 1
    plannedMinutes += taskDurationMinutes(t)
  }
  return { scheduled, completed, plannedMinutes }
}

/**
 * @param {import('../types.js').Task[]} tasks
 * @returns {Set<string>} task ids that overlap another block
 */
export function overlappingTaskIds(tasks) {
  /** @type {Set<string>} */
  const ids = new Set()
  const scheduled = tasks.filter((t) => t.scheduledStart)
  for (let i = 0; i < scheduled.length; i++) {
    const a = scheduled[i]
    const ai = blockInterval(a.scheduledStart, taskDurationMinutes(a))
    for (let j = i + 1; j < scheduled.length; j++) {
      const b = scheduled[j]
      const bi = blockInterval(b.scheduledStart, taskDurationMinutes(b))
      if (intervalsOverlap(ai, bi)) {
        ids.add(a.id)
        ids.add(b.id)
      }
    }
  }
  return ids
}

/** @param {import('../types.js').Task} task @param {(key: string, params?: Record<string, unknown>) => string} t */
export function formatConflictLabel(task, t) {
  const start = task.scheduledStart || '00:00'
  const end = formatMinutesAsTime(
    parseTimeToMinutes(start) + taskDurationMinutes(task),
  )
  return t('schedule.conflictItem', { title: task.title, start, end })
}

/** @param {number} minutes @param {(key: string, params?: Record<string, unknown>) => string} t */
export function formatPlannedTotal(minutes, t) {
  if (minutes < 60) {
    return t('schedule.plannedMinutes', { count: minutes })
  }
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return t('schedule.plannedHours', { count: h })
  return t('schedule.plannedHoursMinutes', { hours: h, minutes: m })
}
