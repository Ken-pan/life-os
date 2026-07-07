import { toggleComplete } from '$lib/domain/tasks.js'
import { openTaskEditor, openSchedulePopover } from '$lib/ui.svelte.js'
import { S, todayKey } from '$lib/state.svelte.js'

/** @param {import('$lib/types.js').Task} task */
export function editTask(task) {
  openTaskEditor(task)
}

/** @param {string} id */
export function completeTask(id) {
  if (!S.tasks.find((item) => item.id === id)) return
  toggleComplete(id)
}

export function tasksRef() {
  return S.tasks
}

/** @param {import('$lib/types.js').Task} task @param {string} [dateKey] */
export function openScheduleForTask(task, dateKey = todayKey()) {
  openSchedulePopover(task.id, dateKey)
}
