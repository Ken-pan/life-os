import { S, save, uid, todayKey } from '../state.svelte.js';
import { SYSTEM_LIST_INBOX, normalizeRecurrence } from '../types.js';
import { nextDueDate, taskTemplateFrom } from './recurrence.js';
import { syncRemindersToServiceWorker } from '../services/reminders.js';
import { executeCreateTaskCommand } from './planTaskCommand.js';
import {
  restoreAttachmentsForOwner,
  softDeleteAttachmentsForOwner,
} from '../services/attachmentService.js';
import { isPlanCreateTaskWriterCohortMember, isPlanCreateTaskWriterEnabled, markKenosCreatedTaskLegacyDirty } from '../kenos/planCreateTaskWriter.core.js';
import { createTaskViaHostedKenosWriter } from '../kenos/planCreateTaskWriter.host.js';
import { isPlanUpdateTaskTitleWriterCohortMember, isPlanUpdateTaskTitleWriterEnabled } from '../kenos/planUpdateTaskTitleWriter.core.js';
import { updateTaskTitleViaHostedKenosWriter } from '../kenos/planUpdateTaskTitleWriter.host.js';
import { isPlanUpdateTaskDueDateWriterCohortMember, isPlanUpdateTaskDueDateWriterEnabled } from '../kenos/planUpdateTaskDueDateWriter.core.js';
import { updateTaskDueDateViaHostedKenosWriter } from '../kenos/planUpdateTaskDueDateWriter.host.js';
import { isPlanUpdateTaskScheduleWriterCohortMember, isPlanUpdateTaskScheduleWriterEnabled } from '../kenos/planUpdateTaskScheduleWriter.core.js';
import { updateTaskScheduleViaHostedKenosWriter } from '../kenos/planUpdateTaskScheduleWriter.host.js';
import { isPlanUpdateTaskProjectWriterCohortMember, isPlanUpdateTaskProjectWriterEnabled } from '../kenos/planUpdateTaskProjectWriter.core.js';
import { updateTaskProjectViaHostedKenosWriter } from '../kenos/planUpdateTaskProjectWriter.host.js';
import { supabase } from '../supabase.js';

let reminderTimer = null;

function afterMutation() {
  save();
  clearTimeout(reminderTimer);
  reminderTimer = setTimeout(() => {
    syncRemindersToServiceWorker();
  }, 400);
}

/**
 * Legacy / local create path. Blocked when Plan create-task writer flags are on
 * so the same intent cannot dual-write via sync createTask.
 * @param {Partial<import('../types.js').Task>} input
 * @returns {import('../types.js').Task}
 */
export function createTask(input = {}) {
  if (isPlanCreateTaskWriterEnabled()) {
    throw new Error('Plan create-task writer is enabled; use createTaskAsync (no Legacy create fallback).');
  }
  const result = executeCreateTaskCommand({ source: 'plan_ui', ...input });
  if (!result.ok) throw new Error(result.error.message);
  clearTimeout(reminderTimer);
  reminderTimer = setTimeout(() => {
    syncRemindersToServiceWorker();
  }, 400);
  return result.task;
}

/**
 * Single create entry for UI. Routes to hosted Kenos writer when canary flags are on
 * and the signed-in user is in the Owner cohort (if cohort env is set).
 * @param {Partial<import('../types.js').Task> & { idempotencyKey?: string, correlationId?: string }} input
 * @returns {Promise<import('../types.js').Task>}
 */
export async function createTaskAsync(input = {}) {
  if (isPlanCreateTaskWriterEnabled()) {
    if (!supabase) {
      throw new Error('Supabase is not configured for Plan create-task writer')
    }
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const email = session?.user?.email
    if (isPlanCreateTaskWriterCohortMember(email)) {
      return createTaskViaHostedKenosWriter(input)
    }
    // Outside Owner cohort: Legacy create only (not a Kenos failure fallback).
    const result = executeCreateTaskCommand({ source: 'plan_ui', ...input })
    if (!result.ok) throw new Error(result.error.message)
    clearTimeout(reminderTimer)
    reminderTimer = setTimeout(() => {
      syncRemindersToServiceWorker()
    }, 400)
    return result.task
  }
  return createTask(input)
}


/** @param {string} id @param {Partial<import('../types.js').Task>} patch */
export function updateTask(id, patch) {
  const idx = S.tasks.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const prev = markKenosCreatedTaskLegacyDirty(S.tasks[idx]);
  const next = {
    ...prev,
    ...patch,
    id: prev.id,
    updatedAt: Date.now(),
    tags: patch.tags ? [...patch.tags] : prev.tags,
    subtasks: patch.subtasks ? JSON.parse(JSON.stringify(patch.subtasks)) : prev.subtasks,
    recurrence: patch.recurrence !== undefined ? normalizeRecurrence(patch.recurrence) : prev.recurrence,
    reminderMinutes: patch.reminderMinutes !== undefined ? patch.reminderMinutes : prev.reminderMinutes,
    meta: patch.meta
      ? { ...prev.meta, ...patch.meta, legacyDirty: prev.meta?.kenosWriterCreate ? true : patch.meta.legacyDirty }
      : prev.meta
  };
  S.tasks = S.tasks.map((t) => (t.id === id ? next : t));
  afterMutation();
  return next;
}

/**
 * Title update entry: Kenos writer when enabled+cohort, else Legacy updateTask.
 * @param {string} id
 * @param {string} title
 */
export async function updateTaskTitleAsync(id, title) {
  if (isPlanUpdateTaskTitleWriterEnabled()) {
    if (!supabase) throw new Error('Supabase is not configured for Plan title writer');
    const { data: { session } } = await supabase.auth.getSession();
    if (isPlanUpdateTaskTitleWriterCohortMember(session?.user?.email)) {
      return updateTaskTitleViaHostedKenosWriter(id, title);
    }
  }
  return updateTask(id, { title });
}

/**
 * Due-date update entry: Kenos writer when enabled+cohort, else Legacy updateTask.
 * @param {string} id
 * @param {string | null | undefined} dueDate
 */
export async function updateTaskDueDateAsync(id, dueDate) {
  if (isPlanUpdateTaskDueDateWriterEnabled()) {
    if (!supabase) throw new Error('Supabase is not configured for Plan due-date writer');
    const { data: { session } } = await supabase.auth.getSession();
    if (isPlanUpdateTaskDueDateWriterCohortMember(session?.user?.email)) {
      return updateTaskDueDateViaHostedKenosWriter(id, dueDate);
    }
  }
  return updateTask(id, { dueDate: dueDate ?? null });
}

/**
 * Schedule update entry: Kenos writer when enabled+cohort, else Legacy updateTask.
 * @param {string} id
 * @param {{ scheduledDate?: string | null, scheduledStart?: string | null, durationMinutes?: number | null }} schedule
 */
export async function updateTaskScheduleAsync(id, schedule = {}) {
  if (isPlanUpdateTaskScheduleWriterEnabled()) {
    if (!supabase) throw new Error('Supabase is not configured for Plan schedule writer');
    const { data: { session } } = await supabase.auth.getSession();
    if (isPlanUpdateTaskScheduleWriterCohortMember(session?.user?.email)) {
      return updateTaskScheduleViaHostedKenosWriter(id, schedule);
    }
  }
  return updateTask(id, {
    scheduledDate: schedule.scheduledDate ?? null,
    scheduledStart: schedule.scheduledStart ?? null,
    durationMinutes: schedule.durationMinutes ?? null,
  });
}

/**
 * Project relation update entry: Kenos writer when enabled+cohort, else Legacy updateTask.
 * @param {string} id
 * @param {string | null | undefined} projectId
 */
export async function updateTaskProjectAsync(id, projectId) {
  if (isPlanUpdateTaskProjectWriterEnabled()) {
    if (!supabase) throw new Error('Supabase is not configured for Plan project writer');
    const { data: { session } } = await supabase.auth.getSession();
    if (isPlanUpdateTaskProjectWriterCohortMember(session?.user?.email)) {
      return updateTaskProjectViaHostedKenosWriter(id, projectId);
    }
  }
  return updateTask(id, { projectId: projectId ?? null });
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
  if (isPlanCreateTaskWriterEnabled()) {
    void createTaskAsync({ ...tpl, dueDate: nextDate }).catch((error) => {
      console.error('[kenos] recurrence create via hosted writer failed', error);
    });
    return null;
  }
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
  S.tasks = S.tasks.map((t) => {
    if (t.id !== id) return t;
    const base = markKenosCreatedTaskLegacyDirty(t);
    return { ...base, deletedAt: now, updatedAt: now };
  });
  softDeleteAttachmentsForOwner('task', id);
  afterMutation();
}

/** 撤销删除（清除墓碑，任务重新出现在列表中） */
/** @param {string} id */
export function restoreTask(id) {
  const task = S.tasks.find((t) => t.id === id);
  if (!task?.deletedAt) return null;
  const next = updateTask(id, { deletedAt: null });
  restoreAttachmentsForOwner('task', id);
  return next;
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
