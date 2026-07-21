import { S, flushSave } from './state.svelte.js'
import { SYSTEM_LIST_INBOX } from './types.js'
import { createToastStore } from '@life-os/platform-web/svelte/toast-store'
import { updateTask, updateTaskScheduleAsync } from './domain/tasks.js'
import { DEFAULT_SLOT_DURATION_MINUTES } from './domain/schedule.js'
import { createTaskEditorDraft } from './taskEditorDraft.js'
import { t } from './i18n/index.js'

/** @param {import('./types.js').Task} task */
function cloneTask(task) {
  return JSON.parse(JSON.stringify(task))
}

const toastStore = createToastStore()
export const toastState = toastStore.toastState
export const toast = toastStore.toast
export const dismissToast = toastStore.dismissToast

/** HTML5 drag of an unscheduled task onto the day timeline (readable during dragover). */
export const scheduleDrag = $state({
  /** @type {string | null} */
  taskId: null,
})

/** @param {string} taskId */
export function beginScheduleDrag(taskId) {
  scheduleDrag.taskId = taskId
}

export function endScheduleDrag() {
  scheduleDrag.taskId = null
}

export const taskEditor = $state({
  open: false,
  taskId: null,
  draft: null,
  initialDraft: null,
})

/**
 * @param {import('./types.js').Task|null} task
 * @param {{
 *   dueDate?: string | null,
 *   listId?: string,
 *   scheduledDate?: string | null,
 *   scheduledStart?: string | null,
 *   durationMinutes?: number | null,
 *   projectId?: string | null,
 * }} [defaults] 新建任务时的默认值（如当前页面对应的日期）
 */
/** Notify Kenos Domain dock / pad without circular static import. */
function publishPlannerChromeSoon() {
  queueMicrotask(() => {
    import('$lib/kenos/plannerSpaceAdapter.js')
      .then((m) => m.publishPlannerNavManifest())
      .catch(() => {})
  })
}

export function openTaskEditor(task = null, defaults = {}) {
  taskEditor.taskId = task?.id ?? null
  taskEditor.draft = task
    ? cloneTask(task)
    : createTaskEditorDraft({
        ...defaults,
        listId:
          defaults.listId || S.settings.defaultListId || SYSTEM_LIST_INBOX,
      })
  taskEditor.initialDraft = cloneTask(taskEditor.draft)
  taskEditor.open = true
  publishPlannerChromeSoon()
}

/** 日历页当前选中的日期，供 FAB 新建任务时作为默认截止日期 */
export const calendarView = $state({
  selected: /** @type {string | null} */ (null),
})

export function closeTaskEditor() {
  taskEditor.open = false
  taskEditor.taskId = null
  taskEditor.draft = null
  taskEditor.initialDraft = null
  publishPlannerChromeSoon()
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
  publishPlannerChromeSoon()
}

export function closeTaskDrawer() {
  taskDrawer.open = false
  publishPlannerChromeSoon()
}

export function toggleTaskDrawer() {
  taskDrawer.open = !taskDrawer.open
  publishPlannerChromeSoon()
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
  publishPlannerChromeSoon()
}

export function closeSchedulePopover() {
  schedulePopover.open = false
  schedulePopover.taskId = null
  schedulePopover.dateKey = null
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('planner-schedule-modal-open')
  }
  publishPlannerChromeSoon()
}

export const scheduleSlot = $state({
  open: false,
  dateKey: /** @type {string | null} */ (null),
  start: /** @type {string | null} */ (null),
  durationMinutes: DEFAULT_SLOT_DURATION_MINUTES,
})

/**
 * @param {string} dateKey
 * @param {string} start
 * @param {number} [durationMinutes]
 */
export function openScheduleSlot(
  dateKey,
  start,
  durationMinutes = DEFAULT_SLOT_DURATION_MINUTES,
) {
  scheduleSlot.dateKey = dateKey
  scheduleSlot.start = start
  scheduleSlot.durationMinutes = durationMinutes
  scheduleSlot.open = true
  publishPlannerChromeSoon()
}

export function closeScheduleSlot() {
  scheduleSlot.open = false
  scheduleSlot.dateKey = null
  scheduleSlot.start = null
  scheduleSlot.durationMinutes = DEFAULT_SLOT_DURATION_MINUTES
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('planner-schedule-modal-open')
  }
  publishPlannerChromeSoon()
}

/**
 * Schedule apply — routes through Kenos writer when Owner cohort flags are On.
 * @param {string} taskId
 * @param {{ dateKey: string, start: string, durationMinutes: number }} payload
 */
export async function applyTaskSchedule(taskId, payload) {
  const previous = S.tasks.find((task) => task.id === taskId)
  if (!previous) return false
  try {
    await updateTaskScheduleAsync(taskId, {
      scheduledDate: payload.dateKey,
      scheduledStart: payload.start,
      durationMinutes: payload.durationMinutes,
    })
  } catch (error) {
    toast(t('toast.schedulePersistFailed'), 'error', {
      key: `schedule-persist-${taskId}`,
      dedupeMs: 2000,
    })
    console.error('[kenos] applyTaskSchedule failed', error)
    return false
  }
  if (!flushSave()) {
    S.tasks = S.tasks.map((task) => (task.id === taskId ? previous : task))
    toast(t('toast.schedulePersistFailed'), 'error', {
      key: `schedule-persist-${taskId}`,
      dedupeMs: 2000,
    })
    return false
  }
  closeSchedulePopover()
  return true
}

/** @param {string} taskId */
export async function clearTaskSchedule(taskId) {
  const previous = S.tasks.find((task) => task.id === taskId)
  if (!previous) return false
  try {
    await updateTaskScheduleAsync(taskId, {
      scheduledDate: null,
      scheduledStart: null,
      durationMinutes: null,
    })
  } catch (error) {
    toast(t('toast.schedulePersistFailed'), 'error', {
      key: `schedule-persist-${taskId}`,
      dedupeMs: 2000,
    })
    console.error('[kenos] clearTaskSchedule failed', error)
    return false
  }
  if (!flushSave()) {
    S.tasks = S.tasks.map((task) => (task.id === taskId ? previous : task))
    toast(t('toast.schedulePersistFailed'), 'error', {
      key: `schedule-persist-${taskId}`,
      dedupeMs: 2000,
    })
    return false
  }
  closeSchedulePopover()
  return true
}
