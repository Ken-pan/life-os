/**
 * Work Space Continuity adapter — AIOS-hosted Work + Deep Work.
 * Resume via route/query; no second Work DB; writes stay on aios-work owner.
 */
import {
  buildResumeDescriptor,
  clearDomainContinue,
  writeDomainContinue,
} from '@life-os/platform-web/kenos-space-continuity'
import {
  installNavManifestPublisher,
  publishNavManifest,
} from '@life-os/platform-web/kenos-native-bridge'
import { sensory } from '@life-os/platform-web/kenos-sensory'
import { getDomainDefinition } from './domainIntegration.core.js'

export const WORK_SPACE_ID = 'work'
export const WORK_ACCENT = getDomainDefinition('work')?.accent || '#6A9BE0'
export const WORK_ICON = 'briefcase'

function isBrowser() {
  return typeof window !== 'undefined'
}

/**
 * @param {URL | Location | string} [url]
 */
export function readWorkResumeQuery(
  url = isBrowser() ? window.location.href : '/',
) {
  try {
    const u =
      typeof url === 'string'
        ? new URL(url, 'https://local.invalid')
        : new URL(url.href)
    return {
      projectId: u.searchParams.get('kenosProject') || null,
      focus: u.searchParams.get('kenosFocus') === '1',
      scrollAnchor: u.searchParams.get('kenosScroll') || null,
    }
  } catch {
    return { projectId: null, focus: false, scrollAnchor: null }
  }
}

/**
 * @param {{
 *   pathname?: string,
 *   search?: string,
 *   projectId?: string | null,
 *   projectTitle?: string | null,
 *   focusActive?: boolean,
 *   scrollAnchor?: string | null,
 *   userId?: string | null,
 * }} [opts]
 */
export function suspendWorkSpace(opts = {}) {
  const pathname =
    opts.pathname ?? (isBrowser() ? window.location.pathname : '/work')
  const search = opts.search ?? (isBrowser() ? window.location.search : '')
  const route = `${pathname}${search}`
  const onFocus =
    pathname.startsWith('/spaces/work') || pathname.startsWith('/focus')
  const displaySubtitle = [
    opts.focusActive || onFocus ? 'Deep Work' : null,
    opts.projectTitle || null,
  ]
    .filter(Boolean)
    .join(' · ')

  return buildResumeDescriptor({
    userId: opts.userId ?? null,
    spaceId: WORK_SPACE_ID,
    route: route.startsWith('http') ? route : route || '/work',
    entityId: opts.projectId || undefined,
    displayTitle: 'Work',
    displaySubtitle: displaySubtitle || 'Projects and decisions',
    substate: {
      projectId: opts.projectId || undefined,
      focusActive: Boolean(opts.focusActive || onFocus),
      scrollAnchor: opts.scrollAnchor || undefined,
    },
  })
}

/**
 * @param {ReturnType<typeof buildResumeDescriptor> | null} [descriptor]
 * @param {{ replaceUrl?: boolean }} [opts]
 */
export async function resumeWorkSpace(
  descriptor = null,
  { replaceUrl = true } = {},
) {
  if (!isBrowser()) return { ok: false, reason: 'ssr' }
  const { goto } = await import('$app/navigation')
  const fromQuery = readWorkResumeQuery()
  const projectId = descriptor?.entityId || fromQuery.projectId
  const focusActive =
    /** @type {any} */ (descriptor?.substate)?.focusActive || fromQuery.focus
  let route = descriptor?.route || (focusActive ? '/spaces/work' : '/work')
  if (route.startsWith('http')) {
    try {
      const u = new URL(route)
      route = `${u.pathname}${u.search}`
    } catch {
      route = '/work'
    }
  }
  if (projectId && !route.includes('kenosProject=')) {
    const sep = route.includes('?') ? '&' : '?'
    route = `${route}${sep}kenosProject=${encodeURIComponent(projectId)}`
  }
  await goto(route, { replaceState: replaceUrl, noScroll: true })
  return { ok: true, route, projectId }
}

export async function applyWorkResumeFromLocation() {
  if (!isBrowser()) return
  const q = readWorkResumeQuery()
  if (!q.projectId && !q.focus) return
  await resumeWorkSpace(null, { replaceUrl: false })
}

/** @returns {{ domainId: string, path: string, title: string, activeTab: string, canGoBack: boolean, currentEntity: string, liveState: string, unsavedDraft: boolean, summary: string }} */
export function buildWorkNavManifest() {
  const path = isBrowser()
    ? `${window.location.pathname}${window.location.search}`
    : '/work'
  const pathname = isBrowser() ? window.location.pathname : '/work'
  const d = suspendWorkSpace()
  const onFocus =
    pathname.startsWith('/spaces/work') ||
    pathname.startsWith('/focus') ||
    Boolean(/** @type {any} */ (d.substate)?.focusActive)
  let activeTab = 'today'
  if (onFocus) activeTab = 'focus'
  else if (pathname.includes('inbox')) activeTab = 'inbox'
  else if (pathname.includes('assistant')) activeTab = 'assistant'
  else if (pathname.includes('settings')) activeTab = 'settings'
  return {
    domainId: WORK_SPACE_ID,
    path,
    title: 'Work',
    activeTab,
    canGoBack: isBrowser() ? window.history.length > 1 : false,
    currentEntity: d.entityId ? String(d.entityId) : '',
    liveState: onFocus ? 'focus' : 'idle',
    unsavedDraft: false,
    summary: d.displaySubtitle || 'Work',
  }
}

export function publishWorkNavManifest() {
  return publishNavManifest(buildWorkNavManifest())
}

/** Leave-guard / compose hooks for KenosDomainWebBridge. */
export function installWorkLeaveGuard() {
  if (!isBrowser()) return
  window.__KENOS_LEAVE_GUARD__ = {
    probe() {
      return { dirty: false, summary: '' }
    },
    discard() {},
    compose() {
      void sensory('soft')
      void resumeWorkSpace({
        version: 1,
        userId: 'anonymous',
        spaceId: WORK_SPACE_ID,
        route: '/assistant?scope=work',
        displayTitle: 'Work',
        updatedAt: new Date().toISOString(),
      })
      void publishWorkNavManifest()
    },
  }
  window.__KENOS_DOMAIN_COMPOSE__ = () => {
    window.__KENOS_LEAVE_GUARD__?.compose?.()
  }
  void publishWorkNavManifest()
  if (!window.__KENOS_WORK_NAV_PUBLISHER__) {
    window.__KENOS_WORK_NAV_PUBLISHER__ = installNavManifestPublisher(
      () => buildWorkNavManifest(),
      { intervalMs: 700 },
    )
  }
}

/**
 * Persist Continuity mirror for Continue / Shelf.
 * @param {ReturnType<typeof buildResumeDescriptor>} [descriptor]
 * @param {string | null} [userId]
 */
export function persistWorkContinue(descriptor, userId = null) {
  const d = descriptor || suspendWorkSpace({ userId })
  try {
    writeDomainContinue(WORK_SPACE_ID, userId, d)
  } catch {
    /* ignore */
  }
  return d
}

export const workSpaceAdapter = {
  spaceId: WORK_SPACE_ID,
  title: 'Work',
  icon: WORK_ICON,
  accent: WORK_ACCENT,
  async open(target) {
    if (target) await resumeWorkSpace(target)
    else if (isBrowser()) window.location.assign('/work')
  },
  async suspend() {
    return suspendWorkSpace()
  },
  async resume(descriptor) {
    await resumeWorkSpace(descriptor)
  },
  async getContext() {
    const d = suspendWorkSpace()
    return {
      spaceId: WORK_SPACE_ID,
      title: 'Work',
      route: d.route,
      entityId: d.entityId ?? null,
      summary: d.displaySubtitle,
    }
  },
  async clearUserState(userId) {
    try {
      clearDomainContinue(WORK_SPACE_ID, userId)
    } catch {
      /* ignore */
    }
  },
}
