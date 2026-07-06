import { todayKey, dateKeyOf } from '../persist/migrate.js'
import { isDueToday, isOverdue } from './tasks.js'
import { sortTasks } from '../engine/prioritizer.js'

/** @param {import('../types.js').Task} task @param {string} today */
function isTodayPlanTask(task, today) {
  return Boolean(task.dueDate && task.dueDate <= today)
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectCompleted(index) {
  return [...index.completed].sort(
    (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0),
  )
}

/** @param {import('./taskIndex.js').TaskIndex} index @param {string} listId */
export function selectByList(index, listId) {
  return index.byListId.get(listId) ?? []
}

/** @param {import('./taskIndex.js').TaskIndex} index @param {string} dateKey */
export function selectByDate(index, dateKey) {
  return index.byDueDate.get(dateKey) ?? []
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectToday(index) {
  return index.active.filter((t) => isDueToday(t) || isOverdue(t))
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectUpcoming(index) {
  const today = todayKey()
  return index.active
    .filter((t) => t.dueDate && t.dueDate >= today)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
}

/** @param {import('./taskIndex.js').TaskIndex} index @param {string} query */
export function selectSearch(index, query) {
  const q = query.trim().toLowerCase()
  if (!q) return index.active
  return index.active.filter((t) => {
    const hay = [t.title, t.notes, ...t.tags, ...t.subtasks.map((s) => s.title)]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectAllTags(index) {
  return [...index.tagSet].sort()
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectCompletedToday(index) {
  const today = todayKey()
  return index.completed
    .filter(
      (t) => t.completedAt && dateKeyOf(new Date(t.completedAt)) === today,
    )
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
}

/**
 * Today 进度：逾期 + 今日到期任务的完成比例。
 * @param {import('./taskIndex.js').TaskIndex} index
 */
export function selectTodayProgress(index) {
  const today = todayKey()
  const groups = selectTodayGroups(index)
  const activePlan = groups.overdue.length + groups.today.length
  const donePlan = selectCompletedToday(index).filter((t) =>
    isTodayPlanTask(t, today),
  ).length
  const total = activePlan + donePlan
  return {
    done: donePlan,
    total,
    remaining: activePlan,
    doneToday: selectCompletedToday(index),
  }
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectTodayGroups(index) {
  const today = todayKey()
  /** @type {{ overdue: import('../types.js').Task[], today: import('../types.js').Task[], noDate: import('../types.js').Task[] }} */
  const groups = { overdue: [], today: [], noDate: [] }

  for (const t of index.active) {
    if (t.dueDate && t.dueDate < today) groups.overdue.push(t)
    else if (t.dueDate === today) groups.today.push(t)
    else if (!t.dueDate) groups.noDate.push(t)
  }

  return groups
}

const DAY_MS = 86400000

function addDays(dateKey, n) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectUpcomingGroups(index) {
  const today = todayKey()
  const tomorrow = addDays(today, 1)
  const weekEnd = addDays(today, 7)
  const upcoming = selectUpcoming(index)

  return {
    today: upcoming.filter((t) => t.dueDate === today),
    tomorrow: upcoming.filter((t) => t.dueDate === tomorrow),
    week: upcoming.filter(
      (t) => t.dueDate && t.dueDate > tomorrow && t.dueDate <= weekEnd,
    ),
    later: upcoming.filter((t) => t.dueDate && t.dueDate > weekEnd),
    nodate: index.active.filter((t) => !t.dueDate),
  }
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectDoneLogGroups(index) {
  /** @type {Map<string, import('../types.js').Task[]>} */
  const map = new Map()
  for (const task of selectCompleted(index)) {
    if (!task.completedAt) continue
    const key = dateKeyOf(new Date(task.completedAt))
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(task)
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectNextBestAction(index) {
  const groups = selectTodayGroups(index)
  const candidates = sortTasks(
    [...groups.overdue, ...groups.today],
    'smart',
  )
  return candidates[0] ?? null
}
