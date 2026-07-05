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

/** @param {import('./types.js').Task|null} task */
export function openTaskEditor(task = null) {
  taskEditor.taskId = task?.id ?? null;
  taskEditor.draft = task
    ? cloneTask(task)
    : {
        title: '',
        notes: '',
        listId: S.settings.defaultListId || SYSTEM_LIST_INBOX,
        priority: 0,
        dueDate: null,
        dueTime: null,
        reminderMinutes: null,
        recurrence: null,
        tags: [],
        subtasks: []
      };
  taskEditor.open = true;
}

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
