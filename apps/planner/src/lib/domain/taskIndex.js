import { activeTasks, completedTasks } from './tasks.js';

/**
 * @typedef {Object} TaskIndex
 * @property {Map<string, import('../types.js').Task>} byId
 * @property {Map<string, import('../types.js').Task[]>} byListId
 * @property {Map<string, import('../types.js').Task[]>} byDueDate
 * @property {import('../types.js').Task[]} active
 * @property {import('../types.js').Task[]} completed
 * @property {Set<string>} tagSet
 */

/** @param {import('../types.js').Task[]} tasks */
export function buildTaskIndex(tasks) {
  /** @type {TaskIndex} */
  const index = {
    byId: new Map(),
    byListId: new Map(),
    byDueDate: new Map(),
    active: activeTasks(tasks),
    completed: completedTasks(tasks),
    tagSet: new Set()
  };

  for (const task of tasks) {
    if (task.deletedAt) continue;
    index.byId.set(task.id, task);
    for (const tag of task.tags) index.tagSet.add(tag);

    if (task.completed) continue;

    const listBucket = index.byListId.get(task.listId) ?? [];
    listBucket.push(task);
    index.byListId.set(task.listId, listBucket);

    if (task.dueDate) {
      const dateBucket = index.byDueDate.get(task.dueDate) ?? [];
      dateBucket.push(task);
      index.byDueDate.set(task.dueDate, dateBucket);
    }
  }

  return index;
}
