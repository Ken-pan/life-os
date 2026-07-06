/** @typedef {'micro'|'standard'|'focus'|'habit'} TaskKind */

/** @type {TaskKind[]} */
export const TASK_KINDS = ['micro', 'standard', 'focus', 'habit']

/** @type {Record<TaskKind, number>} */
export const TASK_KIND_POINTS = {
  micro: 1,
  standard: 2,
  focus: 5,
  habit: 2,
}

/** @param {import('../types.js').Task} task */
export function getTaskKind(task) {
  const kind = task.meta?.kind
  if (kind === 'micro' || kind === 'focus' || kind === 'habit') return kind
  if (task.recurrence?.rule && task.recurrence.rule !== 'none') return 'habit'
  return 'standard'
}

/** @param {unknown} kind @returns {TaskKind} */
export function normalizeTaskKind(kind) {
  return TASK_KINDS.includes(/** @type {TaskKind} */ (kind))
    ? /** @type {TaskKind} */ (kind)
    : 'standard'
}

/** @param {import('../types.js').Task} task */
export function taskPoints(task) {
  return TASK_KIND_POINTS[getTaskKind(task)] ?? 2
}
