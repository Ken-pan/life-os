import { activeTasks, isOverdue } from '../domain/tasks.js';
import { filterToday } from '../domain/filters.js';

/** @typedef {{ kind: string, title: string, body?: string, taskId?: string, score: number }} Recommendation */

/** @type {((ctx: object) => Promise<Recommendation[]>)[]} */
const providers = [];

/** @param {(ctx: object) => Promise<Recommendation[]>} provider */
export function registerRecommendationProvider(provider) {
  providers.push(provider);
}

/** @param {{ tasks?: import('../types.js').Task[] }} context */
export async function getRecommendations(context = {}) {
  const tasks = context.tasks || activeTasks();
  const local = ruleBasedRecommendations(tasks);
  const remote = [];
  for (const p of providers) {
    try {
      remote.push(...(await p({ tasks })));
    } catch {
      /* ignore provider errors */
    }
  }
  return [...local, ...remote].sort((a, b) => b.score - a.score);
}

/** @param {import('../types.js').Task[]} tasks */
function ruleBasedRecommendations(tasks) {
  /** @type {Recommendation[]} */
  const out = [];
  const overdue = tasks.filter((t) => isOverdue(t));
  const today = filterToday(tasks);

  if (overdue.length) {
    out.push({
      kind: 'overdue',
      title: 'overdue_title',
      body: 'overdue_body',
      score: 90,
      taskId: overdue[0].id
    });
  }

  if (today.length > 5) {
    out.push({
      kind: 'focus',
      title: 'focus_title',
      body: 'focus_body',
      score: 60
    });
  }

  const noDue = tasks.filter((t) => !t.dueDate);
  if (noDue.length >= 3) {
    const pick = [...noDue].sort((a, b) => {
      const pa = a.priority || 5;
      const pb = b.priority || 5;
      if (pa !== pb) return pa - pb;
      return a.sortOrder - b.sortOrder;
    })[0];
    out.push({
      kind: 'schedule',
      title: 'schedule_title',
      body: 'schedule_body',
      score: 40,
      taskId: pick.id
    });
  }

  if (!out.length && tasks.length === 0) {
    out.push({
      kind: 'welcome',
      title: 'welcome_title',
      body: 'welcome_body',
      score: 10
    });
  }

  return out;
}
