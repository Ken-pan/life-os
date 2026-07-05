import { dateKeyOf, uid } from '../state.svelte.js';
import { normalizeRecurrence } from '../types.js';

/** @param {string|null|undefined} dateKey @param {import('../types.js').TaskRecurrence|null|undefined} recurrence */
export function nextDueDate(dateKey, recurrence) {
  const rec = normalizeRecurrence(recurrence);
  if (!dateKey || !rec) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const step = rec.interval || 1;
  switch (rec.rule) {
    case 'daily':
      dt.setDate(dt.getDate() + step);
      break;
    case 'weekly':
      dt.setDate(dt.getDate() + 7 * step);
      break;
    case 'monthly':
      dt.setMonth(dt.getMonth() + step);
      break;
    case 'yearly':
      dt.setFullYear(dt.getFullYear() + step);
      break;
    default:
      return null;
  }
  const next = dateKeyOf(dt);
  if (rec.until && next > rec.until) return null;
  return next;
}

/** @param {import('../types.js').Task} task */
export function taskTemplateFrom(task) {
  const seriesId = task.recurrence?.seriesId || task.id;
  return {
    title: task.title,
    notes: task.notes,
    listId: task.listId,
    priority: task.priority,
    dueTime: task.dueTime,
    reminderMinutes: task.reminderMinutes,
    tags: [...task.tags],
    subtasks: task.subtasks.map((s) => ({ id: uid(), title: s.title, done: false })),
    recurrence: task.recurrence
      ? { ...task.recurrence, rule: task.recurrence.rule, seriesId }
      : null,
    meta: { ...task.meta }
  };
}

/** @param {import('../types.js').TaskRecurrence|null|undefined} recurrence */
export function recurrenceLabel(recurrence, t) {
  const rec = normalizeRecurrence(recurrence);
  if (!rec) return t('recurrence.none');
  const n = rec.interval > 1 ? ` ×${rec.interval}` : '';
  return `${t(`recurrence.${rec.rule}`)}${n}`;
}
