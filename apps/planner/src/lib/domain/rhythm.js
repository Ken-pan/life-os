import { dateKeyOf, todayKey } from '../persist/migrate.js'
import { getTaskKind, taskPoints } from './taskKind.js'

/** @param {string} dateKey @param {number} n */
export function addDays(dateKey, n) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return dateKeyOf(dt)
}

/** @param {import('../types.js').Task[]} tasks @param {string} dateKey */
export function completedOnDate(tasks, dateKey) {
  return tasks.filter(
    (t) =>
      t.completed &&
      !t.deletedAt &&
      t.completedAt &&
      dateKeyOf(new Date(t.completedAt)) === dateKey,
  )
}

/** @param {import('../types.js').Task[]} tasks @param {string} dateKey */
export function planCompletionsOnDate(tasks, dateKey) {
  return completedOnDate(tasks, dateKey).filter(
    (t) => t.dueDate && t.dueDate <= dateKey,
  )
}

/** @param {Partial<import('../types.js').AppSettings>} settings */
export function normalizeRhythmSettings(settings) {
  return {
    enabled: settings.rhythmEnabled !== false,
    dailyGoal: Math.min(7, Math.max(1, settings.dailyGoal ?? 3)),
    paused: Boolean(settings.rhythmPaused),
    restDays: Array.isArray(settings.rhythmRestDays)
      ? settings.rhythmRestDays
      : [],
  }
}

/** @param {string} dateKey @param {Partial<import('../types.js').AppSettings>} settings */
export function isRestDay(dateKey, settings) {
  return normalizeRhythmSettings(settings).restDays.includes(dateKey)
}

/**
 * @param {import('../types.js').Task[]} tasks
 * @param {string} dateKey
 * @param {Partial<import('../types.js').AppSettings>} settings
 * @param {{ remaining?: number, total?: number } | null} [todayProgress]
 * @param {string} [today]
 */
export function isGoodRhythmDay(
  tasks,
  dateKey,
  settings,
  todayProgress = null,
  today = todayKey(),
) {
  const rhythm = normalizeRhythmSettings(settings)
  if (!rhythm.enabled || rhythm.paused) return null
  if (isRestDay(dateKey, settings)) return true

  const planDone = planCompletionsOnDate(tasks, dateKey).length
  if (planDone >= rhythm.dailyGoal) return true

  if (
    dateKey === today &&
    todayProgress &&
    todayProgress.total > 0 &&
    todayProgress.remaining === 0
  ) {
    return true
  }

  if (dateKey === today && planDone === 0) return null

  return planDone > 0 ? false : dateKey === today ? null : false
}

/**
 * @param {import('../types.js').Task[]} tasks
 * @param {Partial<import('../types.js').AppSettings>} settings
 * @param {{ remaining?: number, total?: number } | null} [todayProgress]
 * @param {string} [today]
 */
export function computeStreak(
  tasks,
  settings,
  todayProgress = null,
  today = todayKey(),
) {
  const rhythm = normalizeRhythmSettings(settings)
  if (!rhythm.enabled || rhythm.paused) return 0

  let streak = 0
  let dateKey = today
  let guard = 0

  while (guard++ < 400) {
    if (isRestDay(dateKey, settings)) {
      dateKey = addDays(dateKey, -1)
      continue
    }

    const good = isGoodRhythmDay(tasks, dateKey, settings, todayProgress, today)
    if (good === true) {
      streak++
      dateKey = addDays(dateKey, -1)
      continue
    }
    if (good === null && dateKey === today) {
      dateKey = addDays(dateKey, -1)
      continue
    }
    break
  }

  return streak
}

/**
 * @param {import('../types.js').Task[]} tasks
 * @param {Partial<import('../types.js').AppSettings>} settings
 * @param {{ remaining?: number, total?: number } | null} [todayProgress]
 * @param {string} [today]
 */
export function computeWeeklyRhythm(
  tasks,
  settings,
  todayProgress = null,
  today = todayKey(),
) {
  const rhythm = normalizeRhythmSettings(settings)
  /** @type {{ dateKey: string, good: boolean | null, label: string }[]} */
  const days = []

  for (let i = 6; i >= 0; i--) {
    const dateKey = addDays(today, -i)
    const dt = new Date(dateKey.replace(/-/g, '/'))
    const label = dt.toLocaleDateString(undefined, { weekday: 'narrow' })
    days.push({
      dateKey,
      label,
      good: rhythm.enabled
        ? isGoodRhythmDay(tasks, dateKey, settings, todayProgress, today)
        : null,
    })
  }

  const active = days.filter((d) => d.good === true).length
  return { active, total: 7, days }
}

/** @param {import('../types.js').Task[]} tasks @param {string} [today] */
export function computeFocusWins(tasks, today = todayKey()) {
  return completedOnDate(tasks, today).filter((t) => getTaskKind(t) === 'focus')
    .length
}

/** @param {import('../types.js').Task[]} tasks @param {string} [today] */
export function computeFocusWinsWeek(tasks, today = todayKey()) {
  const weekStart = addDays(today, -6)
  return tasks.filter(
    (t) =>
      t.completed &&
      !t.deletedAt &&
      t.completedAt &&
      getTaskKind(t) === 'focus' &&
      dateKeyOf(new Date(t.completedAt)) >= weekStart &&
      dateKeyOf(new Date(t.completedAt)) <= today,
  ).length
}

/** @param {import('../types.js').Task[]} tasks @param {string} [today] */
export function computeDoneThisWeek(tasks, today = todayKey()) {
  const weekStart = addDays(today, -6)
  return tasks.filter(
    (t) =>
      t.completed &&
      !t.deletedAt &&
      t.completedAt &&
      dateKeyOf(new Date(t.completedAt)) >= weekStart &&
      dateKeyOf(new Date(t.completedAt)) <= today,
  ).length
}

/** @param {number} completedCount */
export function computeMilestones(completedCount) {
  return [10, 50, 100].map((threshold) => ({
    threshold,
    reached: completedCount >= threshold,
  }))
}

/** @param {import('../types.js').Task[]} tasks @param {string} dateKey */
export function computeTodayClosedStats(tasks, dateKey) {
  const done = completedOnDate(tasks, dateKey)
  return {
    tasks: done.length,
    habits: done.filter((t) => getTaskKind(t) === 'habit').length,
    focus: done.filter((t) => getTaskKind(t) === 'focus').length,
    points: done.reduce((sum, t) => sum + taskPoints(t), 0),
  }
}

/**
 * @param {import('../types.js').Task[]} tasks
 * @param {Partial<import('../types.js').AppSettings>} settings
 * @param {{ remaining?: number, total?: number, doneToday?: import('../types.js').Task[] } | null} [todayProgress]
 */
export function computeRhythmSummary(tasks, settings, todayProgress = null) {
  const today = todayKey()
  const completedCount = tasks.filter((t) => t.completed && !t.deletedAt).length
  const planDoneToday = planCompletionsOnDate(tasks, today).length
  const rhythm = normalizeRhythmSettings(settings)

  return {
    enabled: rhythm.enabled,
    paused: rhythm.paused,
    dailyGoal: rhythm.dailyGoal,
    goalMet:
      rhythm.enabled &&
      !rhythm.paused &&
      (planDoneToday >= rhythm.dailyGoal ||
        (todayProgress?.total > 0 && todayProgress.remaining === 0)),
    streak: computeStreak(tasks, settings, todayProgress, today),
    weekly: computeWeeklyRhythm(tasks, settings, todayProgress, today),
    focusWinsToday: computeFocusWins(tasks, today),
    focusWinsWeek: computeFocusWinsWeek(tasks, today),
    doneThisWeek: computeDoneThisWeek(tasks, today),
    milestones: computeMilestones(completedCount),
    totalCompleted: completedCount,
    isRestDay: isRestDay(today, settings),
  }
}

/** @param {Partial<import('../types.js').AppSettings>} settings @param {string} [today] */
export function restDaysUsedThisWeek(settings, today = todayKey()) {
  const weekStart = addDays(today, -6)
  return normalizeRhythmSettings(settings).restDays.filter(
    (d) => d >= weekStart && d <= today,
  ).length
}

/** @param {Partial<import('../types.js').AppSettings>} settings @param {string} dateKey */
export function canMarkRestDay(settings, dateKey) {
  if (isRestDay(dateKey, settings)) return true
  return restDaysUsedThisWeek(settings, dateKey) < 2
}
