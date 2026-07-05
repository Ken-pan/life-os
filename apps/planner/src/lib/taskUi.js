import { toggleComplete } from '$lib/domain/tasks.js';
import { openTaskEditor } from '$lib/ui.svelte.js';
import { S } from '$lib/state.svelte.js';

/** @param {import('$lib/types.js').Task} task */
export function editTask(task) {
  openTaskEditor(task);
}

/** @param {string} id */
export function completeTask(id) {
  toggleComplete(id);
}

export function tasksRef() {
  return S.tasks;
}
