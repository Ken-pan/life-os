import { todayKey } from '$lib/state.svelte.js'
import { calendarView } from '$lib/ui.svelte.js'

/**
 * @param {string} pathname
 * @param {string} [search]
 */
export function resolveTaskEditorDefaults(pathname, search = '') {
  void search
  if (pathname === '/') return { dueDate: todayKey() }
  if (pathname.startsWith('/calendar') || pathname.startsWith('/schedule')) {
    return { dueDate: calendarView.selected || todayKey() }
  }
  if (pathname.startsWith('/lists/')) {
    const listId = pathname.split('/')[2]
    return listId ? { listId, dueDate: null } : {}
  }
  if (pathname.startsWith('/inbox')) {
    return { listId: 'inbox', dueDate: null }
  }
  if (pathname.startsWith('/projects/')) {
    const projectId = pathname.split('/')[2]
    return projectId
      ? { projectId, dueDate: todayKey() }
      : { dueDate: todayKey() }
  }
  if (pathname.startsWith('/projects')) return { dueDate: todayKey() }
  if (pathname.startsWith('/upcoming')) return { dueDate: null }
  return {}
}
