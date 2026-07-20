/**
 * Planner Space Continuity adapter — suspend/resume via ResumeDescriptor + deep-link query.
 * Does not embed Kenos chrome; keeps native Planner UI.
 */
import { browser } from '$app/environment'
import {
  buildResumeDescriptor,
  buildKenosContinueHandoffUrl,
  domainContinueStorageKey,
  resolveKenosOrigin,
  resumeDescriptorToOpenUrl,
} from '@life-os/platform-web/kenos-space-continuity'
import { auth } from '$lib/auth.svelte.js'
import { S } from '$lib/state.svelte.js'
import { openTaskEditor, taskEditor, closeTaskEditor } from '$lib/ui.svelte.js'
import { goto } from '$app/navigation'

export const PLANNER_SPACE_ID = 'plan'
export const PLANNER_ACCENT = '#6FCF97'
export const PLANNER_ICON = 'calendar'

/**
 * @param {URL | Location | string} [url]
 */
export function readPlannerResumeQuery(url = browser ? window.location.href : '/') {
  try {
    const u = typeof url === 'string' ? new URL(url, 'https://local.invalid') : new URL(url.href)
    return {
      taskId: u.searchParams.get('kenosTask') || null,
      filter: u.searchParams.get('kenosFilter') || null,
      search: u.searchParams.get('kenosSearch') || null,
      projectId: u.searchParams.get('kenosProject') || null,
      detailOpen: u.searchParams.get('kenosDetail') === '1',
      scrollAnchor: u.searchParams.get('kenosScroll') || null,
    }
  } catch {
    return {
      taskId: null,
      filter: null,
      search: null,
      projectId: null,
      detailOpen: false,
      scrollAnchor: null,
    }
  }
}

/**
 * Build ResumeDescriptor from current Planner UI state.
 * @param {{
 *   pathname?: string,
 *   search?: string,
 *   filter?: string | null,
 *   searchQuery?: string | null,
 *   projectId?: string | null,
 *   scrollAnchor?: string | null,
 * }} [opts]
 */
export function suspendPlannerSpace(opts = {}) {
  const pathname =
    opts.pathname ??
    (browser ? window.location.pathname : '/upcoming')
  const search = opts.search ?? (browser ? window.location.search : '')
  const route = `${pathname}${search}`
  const entityId = taskEditor.open ? taskEditor.taskId : null
  const filter =
    opts.filter ??
    (pathname === '/' || pathname === '/upcoming'
      ? entityId
        ? 'Upcoming · Overdue · 任务详情'
        : null
      : null)
  const task =
    entityId && Array.isArray(S.tasks)
      ? S.tasks.find((t) => t.id === entityId && !t.deletedAt)
      : null
  const taskTitle = task?.title ? String(task.title).slice(0, 80) : null

  const displaySubtitle = [
    filter || opts.filter,
    taskTitle,
    opts.searchQuery ? `搜索 · ${opts.searchQuery}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return buildResumeDescriptor({
    userId: auth.user?.id ?? null,
    spaceId: PLANNER_SPACE_ID,
    route: route.startsWith('http') ? route : route || '/upcoming',
    entityId: entityId || undefined,
    displayTitle: 'Plan',
    displaySubtitle: displaySubtitle || 'Plan',
    substate: {
      filter: opts.filter || (entityId ? 'overdue' : undefined),
      search: opts.searchQuery || undefined,
      projectId: opts.projectId || undefined,
      detailOpen: Boolean(taskEditor.open),
      scrollAnchor: opts.scrollAnchor || entityId || undefined,
      progress: taskEditor.open
        ? '任务详情已打开'
        : opts.filter
          ? String(opts.filter)
          : undefined,
    },
  })
}

/**
 * Apply ResumeDescriptor / query restore into Planner.
 * @param {ReturnType<typeof buildResumeDescriptor> | null} [descriptor]
 * @param {{ replaceUrl?: boolean }} [opts]
 */
export async function resumePlannerSpace(descriptor = null, { replaceUrl = true } = {}) {
  if (!browser) return { ok: false, reason: 'ssr' }

  const fromQuery = readPlannerResumeQuery()
  const taskId = descriptor?.entityId || fromQuery.taskId
  const filter =
    /** @type {any} */ (descriptor?.substate)?.filter || fromQuery.filter
  const search =
    /** @type {any} */ (descriptor?.substate)?.search || fromQuery.search
  const projectId =
    /** @type {any} */ (descriptor?.substate)?.projectId || fromQuery.projectId
  const detailOpen =
    /** @type {any} */ (descriptor?.substate)?.detailOpen ||
    fromQuery.detailOpen ||
    Boolean(taskId)
  const scrollAnchor =
    /** @type {any} */ (descriptor?.substate)?.scrollAnchor ||
    fromQuery.scrollAnchor ||
    taskId

  let targetPath = '/upcoming'
  if (descriptor?.route) {
    try {
      const u = /^https?:\/\//i.test(descriptor.route)
        ? new URL(descriptor.route)
        : new URL(descriptor.route, window.location.origin)
      targetPath = `${u.pathname}${u.search}`
    } catch {
      targetPath = '/upcoming'
    }
  } else if (projectId) {
    targetPath = `/projects/${projectId}`
  } else if (search) {
    targetPath = `/search?q=${encodeURIComponent(search)}`
  } else if (filter === 'overdue') {
    // Overdue lives on Today groups; keep Upcoming as list + filter chip via query
    targetPath = `/upcoming?kenosFilter=overdue`
  }

  // Ensure restore query present when opening task detail
  if (taskId && detailOpen) {
    try {
      const u = new URL(targetPath, window.location.origin)
      u.searchParams.set('kenosTask', taskId)
      u.searchParams.set('kenosDetail', '1')
      if (filter) u.searchParams.set('kenosFilter', String(filter))
      targetPath = `${u.pathname}${u.search}`
    } catch {
      /* ignore */
    }
  }

  const current = `${window.location.pathname}${window.location.search}`
  if (targetPath !== current) {
    await goto(targetPath, { replaceState: replaceUrl, keepFocus: true, noScroll: true })
  }

  if (taskId && detailOpen) {
    /** @param {string} id */
    const findTask = (id) =>
      Array.isArray(S.tasks)
        ? S.tasks.find((t) => t.id === id && !t.deletedAt)
        : null

    let task = findTask(taskId)
    // Continuity cold open: entity may exist only in cloud until first sync.
    if (!task && auth.user) {
      try {
        const { syncNow } = await import('$lib/sync.js')
        await syncNow('merge')
      } catch {
        /* keep task_missing fallback below */
      }
      task = findTask(taskId)
    }

    if (task) {
      openTaskEditor(task)
      if (scrollAnchor) {
        queueMicrotask(() => {
          const el = document.querySelector(`[data-task-id="${CSS.escape(scrollAnchor)}"]`)
          el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
        })
      }
      return { ok: true, taskId, filter }
    }
    // Honest fallback: stay on list, keep descriptor intent without tech error
    closeTaskEditor()
    return { ok: true, fallback: 'task_missing', filter }
  }

  return { ok: true, filter }
}

/**
 * Persist domain-local mirror (user-scoped) + optional Kenos handoff navigation.
 * @param {{ handoffToKenos?: boolean, descriptor?: ReturnType<typeof buildResumeDescriptor> }} [opts]
 */
export function openPlannerContinue({ handoffToKenos = true, descriptor } = {}) {
  const d = descriptor || suspendPlannerSpace()
  try {
    const key = domainContinueStorageKey('planner', auth.user?.id)
    localStorage.setItem(key, JSON.stringify(d))
  } catch {
    /* ignore */
  }
  if (handoffToKenos && browser) {
    const url = buildKenosContinueHandoffUrl(resolveKenosOrigin(), {
      ...d,
      // Absolute route so Kenos can deep-link back
      route: new URL(
        resumeDescriptorToOpenUrl(
          {
            ...d,
            route: d.route.startsWith('http')
              ? d.route
              : `${window.location.origin}${d.route.startsWith('/') ? d.route : `/${d.route}`}`,
          },
          { origin: window.location.origin },
        ),
        window.location.origin,
      ).toString(),
    })
    window.location.assign(url)
  }
  return d
}

/**
 * Consume kenos* query on layout mount / navigation.
 */
export async function applyPlannerResumeFromLocation() {
  if (!browser) return
  const q = readPlannerResumeQuery()
  if (!q.taskId && !q.filter && !q.search && !q.projectId && !q.detailOpen) return
  await resumePlannerSpace(null, { replaceUrl: false })
}

export const plannerSpaceAdapter = {
  spaceId: PLANNER_SPACE_ID,
  title: 'Plan',
  icon: PLANNER_ICON,
  accent: PLANNER_ACCENT,
  async open(target) {
    if (target) await resumePlannerSpace(target)
    else if (browser) window.location.assign('/upcoming')
  },
  async suspend() {
    return suspendPlannerSpace()
  },
  async resume(descriptor) {
    await resumePlannerSpace(descriptor)
  },
  async getContext() {
    const d = suspendPlannerSpace()
    return {
      spaceId: PLANNER_SPACE_ID,
      title: 'Plan',
      route: d.route,
      entityId: d.entityId ?? null,
      summary: d.displaySubtitle,
    }
  },
  async clearUserState(userId) {
    try {
      localStorage.removeItem(domainContinueStorageKey('planner', userId))
    } catch {
      /* ignore */
    }
  },
}
