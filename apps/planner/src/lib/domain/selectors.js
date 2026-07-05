import { todayKey } from '../persist/migrate.js';
import { isDueToday, isOverdue } from './tasks.js';

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectCompleted(index) {
  return [...index.completed].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}

/** @param {import('./taskIndex.js').TaskIndex} index @param {string} listId */
export function selectByList(index, listId) {
  return index.byListId.get(listId) ?? [];
}

/** @param {import('./taskIndex.js').TaskIndex} index @param {string} dateKey */
export function selectByDate(index, dateKey) {
  return index.byDueDate.get(dateKey) ?? [];
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectToday(index) {
  return index.active.filter((t) => isDueToday(t) || isOverdue(t));
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectUpcoming(index) {
  const today = todayKey();
  return index.active
    .filter((t) => t.dueDate && t.dueDate >= today)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
}

/** @param {import('./taskIndex.js').TaskIndex} index @param {string} query */
export function selectSearch(index, query) {
  const q = query.trim().toLowerCase();
  if (!q) return index.active;
  return index.active.filter((t) => {
    const hay = [t.title, t.notes, ...t.tags, ...t.subtasks.map((s) => s.title)]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectAllTags(index) {
  return [...index.tagSet].sort();
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectTodayGroups(index) {
  const today = todayKey();
  /** @type {{ overdue: import('../types.js').Task[], today: import('../types.js').Task[], noDate: import('../types.js').Task[] }} */
  const groups = { overdue: [], today: [], noDate: [] };

  for (const t of index.active) {
    if (t.dueDate && t.dueDate < today) groups.overdue.push(t);
    else if (t.dueDate === today) groups.today.push(t);
    else if (!t.dueDate) groups.noDate.push(t);
  }

  return groups;
}

const DAY_MS = 86400000;

function addDays(dateKey, n) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** @param {import('./taskIndex.js').TaskIndex} index */
export function selectUpcomingGroups(index) {
  const today = todayKey();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  const upcoming = selectUpcoming(index);

  return {
    today: upcoming.filter((t) => t.dueDate === today),
    tomorrow: upcoming.filter((t) => t.dueDate === tomorrow),
    week: upcoming.filter((t) => t.dueDate && t.dueDate > tomorrow && t.dueDate <= weekEnd),
    later: upcoming.filter((t) => t.dueDate && t.dueDate > weekEnd),
    nodate: index.active.filter((t) => !t.dueDate)
  };
}
