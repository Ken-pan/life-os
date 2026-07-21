/**
 * Library (Knowledge OS) Continuity adapter.
 * No silent vault writes — Continuity only stores resume pointers.
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
import {
  discardLibraryEditor,
  getLibraryEditorSession,
  probeLibraryEditor,
} from './libraryEditorSession.js'

export const LIBRARY_SPACE_ID = 'library'
export const LIBRARY_ACCENT = '#5B6BBF'
export const LIBRARY_ICON = 'notebook'
/** Product home for Library domain (notes workbench). */
export const LIBRARY_HOME_PATH = '/library'

function isBrowser() {
  return typeof window !== 'undefined'
}

/**
 * @param {string} pathname
 * @returns {'inbox' | 'library' | 'recall' | 'more' | 'settings'}
 */
export function resolveLibraryActiveTab(pathname = '/') {
  const p = String(pathname || '/')
  if (p === '/' || p.startsWith('/inbox')) return 'inbox'
  if (p.startsWith('/library')) return 'library'
  if (p.startsWith('/recall')) return 'recall'
  if (p.startsWith('/settings')) return 'settings'
  if (
    p.startsWith('/projects') ||
    p.startsWith('/timeline') ||
    p.startsWith('/overview')
  ) {
    return 'more'
  }
  return 'library'
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
    opts.pathname ??
    (isBrowser() ? window.location.pathname : LIBRARY_HOME_PATH)
  const search = opts.search ?? (isBrowser() ? window.location.search : '')
  let noteId = opts.noteId || null
  if (!noteId && search) {
    try {
      const q = search.startsWith('?') ? search.slice(1) : search
      noteId = new URLSearchParams(q).get('note')
    } catch {
      noteId = null
    }
  } else if (!noteId && isBrowser()) {
    try {
      noteId = new URLSearchParams(window.location.search).get('note')
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
        ? 'Recall'
        : pathname.startsWith('/projects')
          ? 'Projects'
          : pathname === '/' || pathname.startsWith('/inbox')
            ? 'Inbox'
            : 'Library'

  return buildResumeDescriptor({
    userId: opts.userId ?? null,
    spaceId: LIBRARY_SPACE_ID,
    route: route || LIBRARY_HOME_PATH,
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
  let route = descriptor?.route || LIBRARY_HOME_PATH
  if (route.startsWith('http')) {
    try {
      const u = new URL(route)
      route = `${u.pathname}${u.search}`
    } catch {
      route = LIBRARY_HOME_PATH
    }
  }
  await goto(route, { replaceState: true, noScroll: true })
  return { ok: true, route }
}

/** @returns {{ domainId: string, path: string, title: string, activeTab: string, canGoBack: boolean, currentEntity: string, liveState: string, unsavedDraft: boolean, summary: string }} */
export function buildLibraryNavManifest() {
  const path = isBrowser()
    ? `${window.location.pathname}${window.location.search}`
    : LIBRARY_HOME_PATH
  const pathname = isBrowser() ? window.location.pathname : LIBRARY_HOME_PATH
  const d = suspendLibrarySpace()
  const probe = probeLibraryEditor()
  const activeTab = resolveLibraryActiveTab(pathname)
  // Never publish liveState=editing for note dirty — native hides Domain Dock on
  // `editing` but keeps 80px bottom pad (Planner sheet semantics). Dirty is
  // unsavedDraft + leave-guard probe only; open note stays `reading`.
  const liveState = d.entityId ? 'reading' : 'idle'
  return {
    domainId: LIBRARY_SPACE_ID,
    path,
    title: 'Library',
    activeTab,
    canGoBack: isBrowser() ? window.history.length > 1 : false,
    currentEntity: d.entityId ? String(d.entityId) : '',
    liveState,
    unsavedDraft: Boolean(probe.dirty),
    summary: probe.summary || d.displaySubtitle || 'Library',
  }
}

export function publishLibraryNavManifest() {
  return publishNavManifest(buildLibraryNavManifest())
}

/**
 * Leave probe must be read-only — never delete notes here (cancel cannot undo).
 * @returns {{ dirty: boolean, summary: string }}
 */
export function prepareLibraryLeave() {
  return probeLibraryEditor()
}

export function installLibraryLeaveGuard() {
  if (!isBrowser()) return
  window.__KENOS_LEAVE_GUARD__ = {
    probe() {
      return prepareLibraryLeave()
    },
    discard() {
      // Confirmed leave: revert edits, then drop untouched compose stubs only.
      discardLibraryEditor()
      try {
        getLibraryEditorSession()?.cleanupIfBlank?.()
      } catch {
        /* ignore */
      }
      void publishLibraryNavManifest()
    },
    compose() {
      void sensory('soft')
      // Match web 「新建」: create note + open workbench (not Inbox capture).
      void import('$lib/compose.svelte.js').then((m) => {
        m.startNote()
        void publishLibraryNavManifest()
      })
    },
  }
  window.__KENOS_DOMAIN_COMPOSE__ = () => {
    window.__KENOS_LEAVE_GUARD__?.compose?.()
  }
  void publishLibraryNavManifest()
  if (!window.__KENOS_LIBRARY_NAV_PUBLISHER__) {
    window.__KENOS_LIBRARY_NAV_PUBLISHER__ = installNavManifestPublisher(
      () => buildLibraryNavManifest(),
      { intervalMs: 700 },
    )
  }
}

export function persistLibraryContinue(descriptor, userId = null) {
  const d = descriptor || suspendLibrarySpace({ userId })
  try {
    writeDomainContinue(LIBRARY_SPACE_ID, userId, d)
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
    else if (isBrowser()) window.location.assign(LIBRARY_HOME_PATH)
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
      clearDomainContinue(LIBRARY_SPACE_ID, userId)
    } catch {
      /* ignore */
    }
  },
}
