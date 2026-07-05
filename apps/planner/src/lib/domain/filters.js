import { buildTaskIndex } from './taskIndex.js';
import {
  selectByList,
  selectByDate,
  selectSearch,
  selectAllTags
} from './selectors.js';
import { activeTasks, completedTasks, isDueToday, isOverdue } from './tasks.js';
import { todayKey } from '../persist/migrate.js';

/** @param {import('../types.js').Task[]} tasks */
export function filterByList(tasks, listId) {
  return selectByList(buildTaskIndex(tasks), listId);
}

/** @param {import('../types.js').Task[]} tasks */
export function filterToday(tasks) {
  return activeTasks(tasks).filter((t) => isDueToday(t) || isOverdue(t));
}

/** @param {import('../types.js').Task[]} tasks */
export function filterUpcoming(tasks) {
  const today = todayKey();
  return activeTasks(tasks)
    .filter((t) => t.dueDate && t.dueDate >= today)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
}

/** @param {import('../types.js').Task[]} tasks @param {string} query */
export function searchTasks(tasks, query) {
  return selectSearch(buildTaskIndex(tasks), query);
}

/** @param {import('../types.js').Task[]} tasks @param {string|null} tag */
export function filterByTag(tasks, tag) {
  if (!tag) return activeTasks(tasks);
  return activeTasks(tasks).filter((t) => t.tags.includes(tag));
}

/** @param {import('../types.js').Task[]} tasks @param {import('../types.js').TaskPriority|null} priority */
export function filterByPriority(tasks, priority) {
  if (priority == null) return activeTasks(tasks);
  return activeTasks(tasks).filter((t) => t.priority === priority);
}

/** @param {import('../types.js').Task[]} tasks @param {string} dateKey */
export function filterByDate(tasks, dateKey) {
  return selectByDate(buildTaskIndex(tasks), dateKey);
}

export function allTags(tasks) {
  return selectAllTags(buildTaskIndex(tasks));
}

export { completedTasks };
