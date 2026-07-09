import { S } from './state.svelte.js'
import { SYSTEM_LIST_INBOX } from './types.js'
import { createToastStore } from '@life-os/platform-web/svelte/toast-store'
import { updateTask } from './domain/tasks.js'

/** @param {import('./types.js').Task} task */
function cloneTask(task) {
  return JSON.parse(JSON.stringify(task))
}

const toastStore = createToastStore()
export const toastState = toastStore.toastState
export const toast = toastStore.toast
export const dismissToast = toastStore.dismissToast

export const taskEditor = $state({
  open: false,
  taskId: null,
  draft: null,
})

/**
 * @param {import('./types.js').Task|null} task
 * @param {{
 *   dueDate?: string | null,
 *   listId?: string,
 *   scheduledDate?: string | null,
 *   scheduledStart?: string | null,
 *   durationMinutes?: number | null,
 * }} [defaults] 新建任务时的默认值（如当前页面对应的日期）
 */
export function openTaskEditor(task = null, defaults = {}) {
  taskEditor.taskId = task?.id ?? null
  taskEditor.draft = task
    ? cloneTask(task)
    : {
        title: '',
        notes: '',
        listId:
          defaults.listId || S.settings.defaultListId || SYSTEM_LIST_INBOX,
        priority: 0,
        dueDate: defaults.dueDate ?? null,
        dueTime: null,
        scheduledDate: defaults.scheduledDate ?? null,
        scheduledStart: defaults.scheduledStart ?? null,
        durationMinutes: defaults.durationMinutes ?? null,
        reminderMinutes: null,
        recurrence: null,
        tags: [],
        subtasks: [],
        meta: { kind: 'standard' },
      }
  taskEditor.open = true
}

/** 日历页当前选中的日期，供 FAB 新建任务时作为默认截止日期 */
export const calendarView = $state({
  selected: /** @type {string | null} */ (null),
})

export function closeTaskEditor() {
  taskEditor.open = false
  taskEditor.taskId = null
  taskEditor.draft = null
}

export const quickAdd = $state({ open: false, text: '' })

export function openQuickAdd() {
  quickAdd.open = true
  quickAdd.text = ''
}

export function closeQuickAdd() {
  quickAdd.open = false
  quickAdd.text = ''
}

/** Mobile 任务模块清单抽屉（智能清单 + 用户清单） */
export const taskDrawer = $state({ open: false })

export function openTaskDrawer() {
  taskDrawer.open = true
}

export function closeTaskDrawer() {
  taskDrawer.open = false
}

export function toggleTaskDrawer() {
  taskDrawer.open = !taskDrawer.open
}

export const schedulePopover = $state({
  open: false,
  taskId: /** @type {string | null} */ (null),
  dateKey: /** @type {string | null} */ (null),
})

/** @param {string} taskId @param {string} dateKey */
export function openSchedulePopover(taskId, dateKey) {
  schedulePopover.taskId = taskId
  schedulePopover.dateKey = dateKey
  schedulePopover.open = true
}

export function closeSchedulePopover() {
  schedulePopover.open = false
  schedulePopover.taskId = null
  schedulePopover.dateKey = null
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('planner-schedule-modal-open')
  }
}

export const scheduleSlot = $state({
  open: false,
  dateKey: /** @type {string | null} */ (null),
  start: /** @type {string | null} */ (null),
  durationMinutes: 30,
})

/**
 * @param {string} dateKey
 * @param {string} start
 * @param {number} [durationMinutes]
 */
export function openScheduleSlot(dateKey, start, durationMinutes = 30) {
  scheduleSlot.dateKey = dateKey
  scheduleSlot.start = start
  scheduleSlot.durationMinutes = durationMinutes
  scheduleSlot.open = true
}

export function closeScheduleSlot() {
  scheduleSlot.open = false
  scheduleSlot.dateKey = null
  scheduleSlot.start = null
  scheduleSlot.durationMinutes = 30
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('planner-schedule-modal-open')
  }
}

/**
 * @param {string} taskId
 * @param {{ dateKey: string, start: string, durationMinutes: number }} payload
 */
export function applyTaskSchedule(taskId, payload) {
  updateTask(taskId, {
    scheduledDate: payload.dateKey,
    scheduledStart: payload.start,
    durationMinutes: payload.durationMinutes,
  })
  closeSchedulePopover()
}

/** @param {string} taskId */
export function clearTaskSchedule(taskId) {
  updateTask(taskId, {
    scheduledDate: null,
    scheduledStart: null,
    durationMinutes: null,
  })
  closeSchedulePopover()
}
