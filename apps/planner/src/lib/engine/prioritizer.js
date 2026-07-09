/** @typedef {'manual'|'priority'|'dueDate'|'smart'} SortStrategy */

function getPriorityWeight(p) {
  if (p === 'P0') return 0;
  if (p === 'P1') return 1;
  if (p === 'P2') return 2;
  if (p === 'P3') return 3;
  if (typeof p === 'number') {
    if (p === 1) return 0;
    if (p === 2) return 1;
    if (p === 3) return 2;
  }
  return 3;
}

/**
 * @param {import('../types.js').Task[]} tasks
 * @param {SortStrategy} strategy
 */
export function sortTasks(tasks, strategy = 'manual') {
  const copy = [...tasks];
  switch (strategy) {
    case 'priority':
      return copy.sort((a, b) => {
        const pa = getPriorityWeight(a.priority);
        const pb = getPriorityWeight(b.priority);
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
      if (t.priority === 'P0' || t.priority === 1) s += 30;
      if (t.priority === 'P1' || t.priority === 2) s += 20;
      return s;
    };
    const diff = score(b) - score(a);
    return diff || a.sortOrder - b.sortOrder;
  });
}
