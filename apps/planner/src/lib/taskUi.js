import { toggleComplete } from '$lib/domain/tasks.js'
import { getTaskKind } from '$lib/domain/taskKind.js'
import { openTaskEditor, toast } from '$lib/ui.svelte.js'
import { S } from '$lib/state.svelte.js'
import { t } from '$lib/i18n/index.js'

/** @param {import('$lib/types.js').Task} task */
export function editTask(task) {
  openTaskEditor(task)
}

/** @param {import('$lib/types.js').Task} task */
function completionToastMessage(task) {
  const kind = getTaskKind(task)
  if (kind === 'focus') return t('toast.completedFocus')
  if (kind === 'habit') return t('toast.completedHabit')
  if (kind === 'micro') return t('toast.completedMicro')
  return t('toast.completed')
}

/** @param {string} id */
export function completeTask(id) {
  const task = S.tasks.find((item) => item.id === id)
  if (!task) return

  const wasCompleted = task.completed
  toggleComplete(id)

  if (!wasCompleted) {
    toast(completionToastMessage(task), 'success', {
      actionLabel: t('common.undo'),
      onAction: () => {
        toggleComplete(id)
        toast(t('toast.restored'), 'success', {
          key: 'task-restored',
          dedupeMs: 2000,
        })
      },
      key: `complete-${id}`,
      dedupeMs: 400,
      duration: 5000,
    })
  }
}

export function tasksRef() {
  return S.tasks
}
