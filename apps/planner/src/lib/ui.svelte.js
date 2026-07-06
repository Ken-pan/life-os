import { S } from './state.svelte.js';
import { SYSTEM_LIST_INBOX } from './types.js';

/** @param {import('./types.js').Task} task */
function cloneTask(task) {
  return JSON.parse(JSON.stringify(task));
}

export const toastState = $state({ msg: '', show: false, tone: 'success' });

let toastTimer = null;
/** @param {string} msg @param {'success'|'error'|'warn'} [tone] */
export function toast(msg, tone = 'success') {
  toastState.msg = msg;
  toastState.tone = tone;
  toastState.show = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastState.show = false;
  }, 1800);
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
