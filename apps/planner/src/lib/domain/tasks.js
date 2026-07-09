import { S, save, uid, todayKey } from '../state.svelte.js';
import { SYSTEM_LIST_INBOX, normalizeRecurrence } from '../types.js';
import { nextDueDate, taskTemplateFrom } from './recurrence.js';
import { syncRemindersToServiceWorker } from '../services/reminders.js';

let reminderTimer = null;

function afterMutation() {
  save();
  clearTimeout(reminderTimer);
  reminderTimer = setTimeout(() => {
    syncRemindersToServiceWorker();
  }, 400);
}

/**
 * @param {Partial<import('../types.js').Task>} input
 * @returns {import('../types.js').Task}
 */
export function createTask(input = {}) {
  const now = Date.now();
  const maxOrder = S.tasks.reduce((m, t) => Math.max(m, t.sortOrder), 0);
  const recurrence = normalizeRecurrence(input.recurrence);
  const task = {
    id: uid(),
    title: input.title?.trim() || '',
    notes: input.notes || '',
    listId: input.listId || S.settings.defaultListId || SYSTEM_LIST_INBOX,
    priority: /** @type {import('../types.js').TaskPriority} */ (input.priority ?? 'P3'),
    urgency: input.urgency ?? 'normal',
    size: input.size ?? 'medium',
    area: input.area ?? 'other',
    effortMin: input.effortMin ?? null,
    nextAction: input.nextAction ?? null,
    aiContext: input.aiContext ?? null,
    projectId: input.projectId ?? null,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    scheduledDate: input.scheduledDate ?? null,
    scheduledStart: input.scheduledStart ?? null,
    durationMinutes: input.durationMinutes ?? null,
    reminderMinutes: input.reminderMinutes ?? null,
    recurrence: recurrence
      ? { ...recurrence, seriesId: recurrence.seriesId || uid() }
      : null,
    tags: input.tags ? [...input.tags] : [],
    subtasks: input.subtasks ? JSON.parse(JSON.stringify(input.subtasks)) : [],
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    sortOrder: maxOrder + 1,
    meta: input.meta ? { kind: 'standard', ...input.meta } : { kind: 'standard' }
  };
  S.tasks = [...S.tasks, task];
  afterMutation();
  return task;
}

/** @param {string} id @param {Partial<import('../types.js').Task>} patch */
export function updateTask(id, patch) {
  const idx = S.tasks.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const prev = S.tasks[idx];
  const next = {
    ...prev,
    ...patch,
    id: prev.id,
    updatedAt: Date.now(),
    tags: patch.tags ? [...patch.tags] : prev.tags,
    subtasks: patch.subtasks ? JSON.parse(JSON.stringify(patch.subtasks)) : prev.subtasks,
    recurrence: patch.recurrence !== undefined ? normalizeRecurrence(patch.recurrence) : prev.recurrence,
    reminderMinutes: patch.reminderMinutes !== undefined ? patch.reminderMinutes : prev.reminderMinutes,
    meta: patch.meta ? { ...prev.meta, ...patch.meta } : prev.meta
  };
  S.tasks = S.tasks.map((t) => (t.id === id ? next : t));
  afterMutation();
  return next;
}

/** @param {import('../types.js').Task} task */
function spawnNextRecurrence(task) {
  const nextDate = nextDueDate(task.dueDate, task.recurrence);
  if (!nextDate || !task.recurrence) return null;
  const seriesId = task.recurrence.seriesId || task.id;
  const duplicate = S.tasks.some(
    (t) => !t.completed && !t.deletedAt && t.recurrence?.seriesId === seriesId && t.dueDate === nextDate
  );
  if (duplicate) return null;
  const tpl = taskTemplateFrom(task);
  return createTask({ ...tpl, dueDate: nextDate });
}

/** @param {string} id */
export function toggleComplete(id) {
  const task = S.tasks.find((t) => t.id === id);
  if (!task) return null;
  const completed = !task.completed;
  const updated = updateTask(id, {
    completed,
    completedAt: completed ? Date.now() : null
  });
  if (completed && task.recurrence?.rule && task.recurrence.rule !== 'none') {
    spawnNextRecurrence(task);
  }
  return updated;
}

/**
 * 删除任务：写墓碑而非物理删除，保证跨设备删除可传播、不会被旧设备数据复活。
 * @param {string} id
 */
export function deleteTask(id) {
  const now = Date.now();
  S.tasks = S.tasks.map((t) => (t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t));
  afterMutation();
}

/** 撤销删除（清除墓碑，任务重新出现在列表中） */
/** @param {string} id */
export function restoreTask(id) {
  const task = S.tasks.find((t) => t.id === id);
  if (!task?.deletedAt) return null;
  return updateTask(id, { deletedAt: null });
}

/** @param {string} id @param {number} direction -1 up, 1 down */
export function moveTask(id, direction) {
  const active = activeTasks().sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = active.findIndex((t) => t.id === id);
  const swapIdx = idx + direction;
  if (idx < 0 || swapIdx < 0 || swapIdx >= active.length) return;
  const a = active[idx];
  const b = active[swapIdx];
  updateTask(a.id, { sortOrder: b.sortOrder });
  updateTask(b.id, { sortOrder: a.sortOrder });
}

/** @param {string} taskId @param {string} title */
export function addSubtask(taskId, title) {
  const task = S.tasks.find((t) => t.id === taskId);
  if (!task || !title.trim()) return null;
  const subtasks = [...task.subtasks, { id: uid(), title: title.trim(), done: false }];
  return updateTask(taskId, { subtasks });
}

/** @param {string} taskId @param {string} subtaskId */
export function toggleSubtask(taskId, subtaskId) {
  const task = S.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const subtasks = task.subtasks.map((s) =>
    s.id === subtaskId ? { ...s, done: !s.done } : s
  );
  return updateTask(taskId, { subtasks });
}

/** @param {import('../types.js').Task[]} tasks */
export function activeTasks(tasks = S.tasks) {
  return tasks.filter((t) => !t.completed && !t.deletedAt);
}

/** @param {import('../types.js').Task[]} tasks */
export function completedTasks(tasks = S.tasks) {
  return tasks.filter((t) => t.completed && !t.deletedAt);
}

export function isOverdue(task) {
  if (!task.dueDate || task.completed) return false;
  return task.dueDate < todayKey();
}

export function isDueToday(task) {
  if (!task.dueDate || task.completed) return false;
  return task.dueDate === todayKey();
}

export { recurrenceLabel } from './recurrence.js';
