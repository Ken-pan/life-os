import { dateKeyOf } from '../persist/migrate.js';
import { buildTaskIndex } from './taskIndex.js';
import { selectTodayGroups, selectUpcomingGroups } from './selectors.js';

/** @param {import('../types.js').Task[]} tasks */
export function groupUpcoming(tasks) {
  return selectUpcomingGroups(buildTaskIndex(tasks));
}

/** @param {import('../types.js').Task[]} tasks */
export function groupTodayView(tasks) {
  return selectTodayGroups(buildTaskIndex(tasks));
}

/** @param {string} startDate */
export function weekDates(startDate) {
  const dates = [];
  for (let i = 0; i < 7; i += 1) dates.push(addDays(startDate, i));
  return dates;
}

function addDays(dateKey, n) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dateKeyOf(dt);
}

export function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return dateKeyOf(d);
}
