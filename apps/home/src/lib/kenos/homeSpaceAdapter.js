/**
 * Home Continuity adapter — embedded plan/storage/tidy + HomeScan companion.
 *
 * Resume context is route + text only. Never put interior photo URLs / blobs
 * into shelf or Continue descriptors (privacy: hide_interior_images).
 */
import {
  buildResumeDescriptor,
  writeDomainContinue,
} from '@life-os/platform-web/kenos-space-continuity'
import {
  installNavManifestPublisher,
  publishNavManifest,
} from '@life-os/platform-web/kenos-native-bridge'
import { sensory } from '@life-os/platform-web/kenos-sensory'

export const HOME_SPACE_ID = 'home'

function isBrowser() {
  return typeof window !== 'undefined'
}

/**
 * @param {string} pathname
 * @param {string} [search]
 */
export function homeResumeSubtitle(pathname, search = '') {
  const path = String(pathname || '/')
  let params
  try {
    params = new URLSearchParams(
      search.startsWith('?') ? search.slice(1) : search,
    )
  } catch {
    params = new URLSearchParams()
  }
  const zone = params.get('zone') || params.get('room')
  const item = params.get('item') || params.get('q')
  if (path.startsWith('/tidy/go')) return 'Organize focus'
  if (path.startsWith('/tidy')) return zone ? `Organize · ${zone}` : 'Organize'
  if (path.startsWith('/storage')) {
    if (item) return `Items · ${item}`
    if (zone) return `Items · ${zone}`
    return 'Items'
  }
  if (path.startsWith('/plan') || path === '/') {
    return zone ? `Rooms · ${zone}` : 'Rooms'
  }
  if (path.startsWith('/settings')) return 'Settings'
  return 'Home'
}

/**
 * @param {string} pathname
 * @param {string} [search]
 */
export function homeResumeEntityId(pathname, search = '') {
  try {
    const params = new URLSearchParams(
      search.startsWith('?') ? search.slice(1) : search,
    )
    return (
      params.get('item') || params.get('zone') || params.get('room') || null
    )
  } catch {
    return null
  }
}

export function suspendHomeSpace(opts = {}) {
  const pathname =
    opts.pathname ?? (isBrowser() ? window.location.pathname : '/plan')
  const search = opts.search ?? (isBrowser() ? window.location.search : '')
  const route = `${pathname}${search}`
  const subtitle = homeResumeSubtitle(pathname, search)
  const entityId = homeResumeEntityId(pathname, search)
  return buildResumeDescriptor({
    userId: opts.userId ?? null,
    spaceId: HOME_SPACE_ID,
    route: route || '/plan',
    displayTitle: 'Home',
    displaySubtitle: subtitle,
    entityId: entityId || undefined,
    // Text-only substate — no photoRef / image URLs (Shelf privacy).
    substate: {
      surface: pathname.startsWith('/tidy')
        ? 'organize'
        : pathname.startsWith('/storage')
          ? 'items'
          : pathname.startsWith('/settings')
            ? 'settings'
            : 'rooms',
      zone: entityId && String(search).includes('zone=') ? entityId : undefined,
      focus: pathname.startsWith('/tidy/go') || undefined,
    },
  })
}

export async function resumeHomeSpace(descriptor = null) {
  if (!isBrowser()) return { ok: false, reason: 'ssr' }
  const { goto } = await import('$app/navigation')
  let route = descriptor?.route || '/plan'
  if (route.startsWith('http')) {
    try {
      const u = new URL(route)
      route = `${u.pathname}${u.search}`
    } catch {
      route = '/plan'
    }
  }
  // Never resume into a photo/blob URL — force text route.
  if (/^blob:|^data:|photoRef=/i.test(route)) {
    route = '/plan'
  }
  await goto(route, { replaceState: true, noScroll: true })
  return { ok: true, route }
}

/** @returns {{ domainId: string, path: string, title: string, activeTab: string, canGoBack: boolean, currentEntity: string, liveState: string, unsavedDraft: boolean, summary: string }} */
export function buildHomeNavManifest() {
  const pathname = isBrowser() ? window.location.pathname : '/plan'
  const search = isBrowser() ? window.location.search : ''
  const path = `${pathname}${search}`
  const d = suspendHomeSpace({ pathname, search })
  const surface = /** @type {any} */ (d.substate)?.surface || 'rooms'
  const onFocus = pathname.startsWith('/tidy/go')
  return {
    domainId: HOME_SPACE_ID,
    path,
    title: 'Home',
    activeTab: surface,
    canGoBack: isBrowser() ? window.history.length > 1 : false,
    currentEntity: d.entityId ? String(d.entityId) : '',
    liveState: onFocus ? 'active' : 'idle',
    unsavedDraft: false,
    summary: d.displaySubtitle || 'Home',
  }
}

export function publishHomeNavManifest() {
  return publishNavManifest(buildHomeNavManifest())
}

export function installHomeLeaveGuard() {
  if (!isBrowser()) return
  window.__KENOS_LEAVE_GUARD__ = {
    probe() {
      return { dirty: false, summary: '' }
    },
    discard() {},
    compose() {
      void sensory('soft')
      void resumeHomeSpace({
        version: 1,
        userId: 'anonymous',
        spaceId: HOME_SPACE_ID,
        route: '/tidy',
        displayTitle: 'Home',
        displaySubtitle: 'Organize',
        updatedAt: new Date().toISOString(),
      })
      void publishHomeNavManifest()
    },
  }
  window.__KENOS_DOMAIN_COMPOSE__ = () => {
    window.__KENOS_LEAVE_GUARD__?.compose?.()
  }
  void publishHomeNavManifest()
  if (!window.__KENOS_HOME_NAV_PUBLISHER__) {
    window.__KENOS_HOME_NAV_PUBLISHER__ = installNavManifestPublisher(
      () => buildHomeNavManifest(),
      { intervalMs: 700 },
    )
  }
}

export function persistHomeContinue(descriptor, userId = null) {
  const d = descriptor || suspendHomeSpace({ userId })
  try {
    writeDomainContinue(HOME_SPACE_ID, userId, d)
  } catch {
    /* ignore */
  }
  return d
}
