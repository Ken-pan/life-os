/** @typedef {{ id?: string, title?: string, dueDate?: string|null, dueTime?: string|null, reminderMinutes?: number|null, completed?: boolean, deletedAt?: number|null }} PlannerTaskLike */

/**
 * Compute when a task reminder should fire (ms since epoch), or null if none.
 * Mirrors apps/planner/src/lib/services/reminders.js.
 * @param {PlannerTaskLike} task
 * @param {number} [now]
 */
export function reminderFireAtMs(task, now = Date.now()) {
  if (task.completed || task.deletedAt || !task.dueDate || task.reminderMinutes == null) {
    return null
  }
  const [y, m, d] = task.dueDate.split('-').map(Number)
  let hours = 9
  let minutes = 0
  if (task.dueTime) {
    const [h, min] = task.dueTime.split(':').map(Number)
    hours = h
    minutes = min
  }
  const dueMs = new Date(y, m - 1, d, hours, minutes, 0, 0).getTime()
  return dueMs - task.reminderMinutes * 60_000
}

/**
 * Tasks whose reminder falls in [now - graceMs, now + windowMs].
 * @param {PlannerTaskLike[]} tasks
 * @param {{ now?: number, graceMs?: number, windowMs?: number }} [options]
 */
export function selectDueReminderJobs(tasks, options = {}) {
  const now = options.now ?? Date.now()
  const graceMs = options.graceMs ?? 60_000
  const windowMs = options.windowMs ?? 5 * 60_000
  /** @type {{ id: string, title: string, fireAt: number }[]} */
  const jobs = []

  for (const task of tasks) {
    if (!task?.id || !task.title) continue
    const fireAt = reminderFireAtMs(task, now)
    if (fireAt == null) continue
    if (fireAt < now - graceMs || fireAt > now + windowMs) continue
    jobs.push({ id: task.id, title: task.title, fireAt })
  }

  return jobs
}
