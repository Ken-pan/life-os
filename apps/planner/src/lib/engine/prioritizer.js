/** @typedef {'manual'|'priority'|'dueDate'|'smart'} SortStrategy */

/**
 * @param {import('../types.js').Task[]} tasks
 * @param {SortStrategy} strategy
 */
export function sortTasks(tasks, strategy = 'manual') {
  const copy = [...tasks];
  switch (strategy) {
    case 'priority':
      return copy.sort((a, b) => {
        const pa = a.priority || 5;
        const pb = b.priority || 5;
        if (pa !== pb) return pa - pb;
        return a.sortOrder - b.sortOrder;
      });
    case 'dueDate':
      return copy.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return a.sortOrder - b.sortOrder;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate) || a.sortOrder - b.sortOrder;
      });
    case 'smart':
      return smartSort(copy);
    default:
      return copy.sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

import { todayKey } from '../state.svelte.js';

/** @param {import('../types.js').Task[]} tasks */
function smartSort(tasks) {
  const today = todayKey();
  return tasks.sort((a, b) => {
    const score = (t) => {
      let s = 0;
      if (t.dueDate && t.dueDate < today) s += 100;
      if (t.dueDate === today) s += 50;
      if (t.priority === 1) s += 30;
      if (t.priority === 2) s += 20;
      return s;
    };
    const diff = score(b) - score(a);
    return diff || a.sortOrder - b.sortOrder;
  });
}
