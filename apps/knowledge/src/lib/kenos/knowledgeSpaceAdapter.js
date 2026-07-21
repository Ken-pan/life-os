/**
 * Library (Knowledge OS) Continuity adapter.
 * No silent vault writes — Continuity only stores resume pointers.
 */
import {
  buildResumeDescriptor,
  domainContinueStorageKey,
} from '@life-os/platform-web/kenos-space-continuity'

export const LIBRARY_SPACE_ID = 'library'
export const LIBRARY_ACCENT = '#5B6BBF'
export const LIBRARY_ICON = 'notebook'

function isBrowser() {
  return typeof window !== 'undefined'
}

/**
 * @param {{
 *   pathname?: string,
 *   search?: string,
 *   noteId?: string | null,
 *   noteTitle?: string | null,
 *   userId?: string | null,
 * }} [opts]
 */
export function suspendLibrarySpace(opts = {}) {
  const pathname =
    opts.pathname ?? (isBrowser() ? window.location.pathname : '/')
  const search = opts.search ?? (isBrowser() ? window.location.search : '')
  let noteId = opts.noteId || null
  if (!noteId && isBrowser()) {
    try {
      noteId = new URLSearchParams(search).get('note')
    } catch {
      noteId = null
    }
  }
  const route = `${pathname}${search}`
  const subtitle = opts.noteTitle
    ? String(opts.noteTitle).slice(0, 80)
    : pathname.startsWith('/library')
      ? 'Library'
      : pathname.startsWith('/recall')
        ? 'Search'
        : pathname.startsWith('/projects')
          ? 'Projects'
          : 'Notes'

  return buildResumeDescriptor({
    userId: opts.userId ?? null,
    spaceId: LIBRARY_SPACE_ID,
    route: route || '/',
    entityId: noteId || undefined,
    displayTitle: 'Library',
    displaySubtitle: subtitle,
    substate: {
      noteId: noteId || undefined,
      // Explicit: Continuity must never trigger vault write.
      vaultWrite: false,
    },
  })
}

export async function resumeLibrarySpace(descriptor = null) {
  if (!isBrowser()) return { ok: false, reason: 'ssr' }
  const { goto } = await import('$app/navigation')
  let route = descriptor?.route || '/'
  if (route.startsWith('http')) {
    try {
      const u = new URL(route)
      route = `${u.pathname}${u.search}`
    } catch {
      route = '/'
    }
  }
  await goto(route, { replaceState: true, noScroll: true })
  return { ok: true, route }
}

export function installLibraryLeaveGuard() {
  if (!isBrowser()) return
  window.__KENOS_LEAVE_GUARD__ = {
    probe() {
      // Editor dirty detection is page-owned; default clean for Space switch.
      return { dirty: false, summary: '' }
    },
    discard() {},
    compose() {
      // Capture opens inbox — never auto-writes vault.
      void resumeLibrarySpace({
        version: 1,
        userId: 'anonymous',
        spaceId: LIBRARY_SPACE_ID,
        route: '/',
        displayTitle: 'Library',
        displaySubtitle: 'Capture',
        updatedAt: new Date().toISOString(),
      })
    },
  }
  window.__KENOS_DOMAIN_COMPOSE__ = () => {
    window.__KENOS_LEAVE_GUARD__?.compose?.()
  }
}

export function persistLibraryContinue(descriptor, userId = null) {
  const d = descriptor || suspendLibrarySpace({ userId })
  try {
    localStorage.setItem(domainContinueStorageKey('knowledge', userId), JSON.stringify(d))
  } catch {
    /* ignore */
  }
  return d
}

export const knowledgeSpaceAdapter = {
  spaceId: LIBRARY_SPACE_ID,
  title: 'Library',
  icon: LIBRARY_ICON,
  accent: LIBRARY_ACCENT,
  async open(target) {
    if (target) await resumeLibrarySpace(target)
    else if (isBrowser()) window.location.assign('/')
  },
  async suspend() {
    return suspendLibrarySpace()
  },
  async resume(descriptor) {
    await resumeLibrarySpace(descriptor)
  },
  async getContext() {
    const d = suspendLibrarySpace()
    return {
      spaceId: LIBRARY_SPACE_ID,
      title: 'Library',
      route: d.route,
      entityId: d.entityId ?? null,
      summary: d.displaySubtitle,
    }
  },
  async clearUserState(userId) {
    try {
      localStorage.removeItem(domainContinueStorageKey('knowledge', userId))
    } catch {
      /* ignore */
    }
  },
}
