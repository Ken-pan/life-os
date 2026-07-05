import { S } from '../state.svelte.js';
import { activeTasks } from '../domain/tasks.js';
import { todayKey } from '../state.svelte.js';

/** @param {string} kind @param {string} [locale] */
export function buildAiPrompt(kind, locale = S.settings.locale) {
  const zh = locale !== 'en';
  const tasks = activeTasks(S.tasks);
  const today = todayKey();
  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today);
  const todayList = tasks.filter((t) => t.dueDate === today);
  const summary = tasks
    .slice(0, 30)
    .map((t) => `- ${t.title}${t.dueDate ? ` (${t.dueDate})` : ''}${t.priority ? ` P${t.priority}` : ''}`)
    .join('\n');

  if (kind === 'dailyBrief') {
    return {
      system: zh
        ? '你是 PLANNER.OS 任务教练。用 2-4 句中文给出今日优先建议，语气阳光、简洁，不要 markdown。'
        : 'You are PLANNER.OS task coach. Reply in 2-4 concise sunny sentences. No markdown.',
      user: zh
        ? `今天 ${today}。逾期 ${overdue.length} 项，今日到期 ${todayList.length} 项。\n任务：\n${summary || '（空）'}`
        : `Today ${today}. Overdue ${overdue.length}, due today ${todayList.length}.\nTasks:\n${summary || '(empty)'}`
    };
  }

  if (kind === 'taskBreakdown') {
    const title = kind.split('|')[1] || '';
    return {
      system: zh
        ? '把任务拆成 3-6 个可执行子步骤。每行一个步骤，不要编号以外的 markdown。'
        : 'Split into 3-6 actionable sub-steps. One per line, plain text.',
      user: zh ? `任务：${title}` : `Task: ${title}`
    };
  }

  return {
    system: zh ? '简洁回答。' : 'Be concise.',
    user: summary
  };
}

export function tasksFingerprint() {
  const slice = activeTasks(S.tasks)
    .slice(0, 40)
    .map((t) => `${t.id}:${t.updatedAt}:${t.completed}`)
    .join('|');
  return `${todayKey()}::${slice}`;
}
