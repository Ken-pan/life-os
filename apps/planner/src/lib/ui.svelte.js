import { S } from './state.svelte.js';
import { SYSTEM_LIST_INBOX } from './types.js';

/** @param {import('./types.js').Task} task */
function cloneTask(task) {
  return JSON.parse(JSON.stringify(task));
}

export const toastState = $state({
  msg: '',
  show: false,
  tone: 'success',
  /** @type {string} 可选操作按钮文案（如「撤销」） */
  actionLabel: '',
  /** @type {(() => void) | null} */
  onAction: null
});

let toastTimer = null;
/**
 * @param {string} msg
 * @param {'success'|'error'|'warn'} [tone]
 * @param {{ actionLabel?: string, onAction?: () => void, duration?: number }} [options]
 */
export function toast(msg, tone = 'success', options = {}) {
  toastState.msg = msg;
  toastState.tone = tone;
  toastState.actionLabel = options.actionLabel ?? '';
  toastState.onAction = options.onAction ?? null;
  toastState.show = true;
  clearTimeout(toastTimer);
  const defaultDuration =
    tone === 'error' ? 4500 : tone === 'warn' ? 4000 : options.actionLabel ? 4000 : 2200;
  toastTimer = setTimeout(() => {
    toastState.show = false;
  }, options.duration ?? defaultDuration);
}

export function dismissToast() {
  clearTimeout(toastTimer);
  toastState.show = false;
}

export const taskEditor = $state({
  open: false,
  taskId: null,
  draft: null
});

/**
 * @param {import('./types.js').Task|null} task
 * @param {{ dueDate?: string | null, listId?: string }} [defaults] 新建任务时的默认值（如当前页面对应的日期）
 */
export function openTaskEditor(task = null, defaults = {}) {
  taskEditor.taskId = task?.id ?? null;
  taskEditor.draft = task
    ? cloneTask(task)
    : {
        title: '',
        notes: '',
        listId: defaults.listId || S.settings.defaultListId || SYSTEM_LIST_INBOX,
        priority: 0,
        dueDate: defaults.dueDate ?? null,
        dueTime: null,
        reminderMinutes: null,
        recurrence: null,
        tags: [],
        subtasks: []
      };
  taskEditor.open = true;
}

/** 日历页当前选中的日期，供 FAB 新建任务时作为默认截止日期 */
export const calendarView = $state({ selected: /** @type {string | null} */ (null) });

export function closeTaskEditor() {
  taskEditor.open = false;
  taskEditor.taskId = null;
  taskEditor.draft = null;
}

export const quickAdd = $state({ open: false, text: '' });

export function openQuickAdd() {
  quickAdd.open = true;
  quickAdd.text = '';
}

export function closeQuickAdd() {
  quickAdd.open = false;
  quickAdd.text = '';
}
