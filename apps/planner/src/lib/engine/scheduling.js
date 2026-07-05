/**
 * @param {import('../types.js').Task} task
 * @param {{ busyDates?: string[] }} [calendar]
 */
export function suggestDueDate(task, calendar = {}) {
  if (task.dueDate) {
    return {
      date: task.dueDate,
      reason: 'existing',
      confidence: 1
    };
  }

  const busy = new Set(calendar.busyDates || []);
  const d = new Date();
  for (let i = 0; i < 14; i += 1) {
    const key = d.toISOString().slice(0, 10);
    if (!busy.has(key)) {
      return {
        date: key,
        reason: task.priority === 1 ? 'high_priority_slot' : 'next_free_day',
        confidence: 0.4
      };
    }
    d.setDate(d.getDate() + 1);
  }

  return { date: null, reason: 'none', confidence: 0 };
}

/**
 * @param {import('../types.js').Task[]} tasks
 * @param {{ busyDates?: string[], limit?: number }} [options]
 * @returns {{ task: import('../types.js').Task, date: string, reason: string }[]}
 */
export function scheduleUndatedTasks(tasks, options = {}) {
  const limit = options.limit ?? 3;
  const busy = new Set(options.busyDates || []);
  /** @type {{ task: import('../types.js').Task, date: string, reason: string }[]} */
  const out = [];

  for (const task of tasks) {
    if (out.length >= limit || task.dueDate) continue;
    const suggestion = suggestDueDate(task, { busyDates: [...busy] });
    if (!suggestion.date) continue;
    busy.add(suggestion.date);
    out.push({ task, date: suggestion.date, reason: suggestion.reason });
  }

  return out;
}

/** @param {import('../types.js').Task[]} tasks */
export function sortUndatedTasks(tasks) {
  return [...tasks]
    .filter((t) => !t.dueDate)
    .sort((a, b) => {
      const pa = a.priority || 5;
      const pb = b.priority || 5;
      if (pa !== pb) return pa - pb;
      return a.sortOrder - b.sortOrder;
    });
}
