/**
 * Music Continuity adapter — single live accessory (MiniPlayer); no dual Now Playing chrome.
 */
import {
  buildResumeDescriptor,
  domainContinueStorageKey,
} from '@life-os/platform-web/kenos-space-continuity'

export const MUSIC_SPACE_ID = 'music'

function isBrowser() {
  return typeof window !== 'undefined'
}

export function suspendMusicSpace(opts = {}) {
  const pathname =
    opts.pathname ?? (isBrowser() ? window.location.pathname : '/')
  const search = opts.search ?? (isBrowser() ? window.location.search : '')
  const route = `${pathname}${search}`
  const subtitle =
    opts.trackTitle
      ? String(opts.trackTitle).slice(0, 80)
      : pathname.includes('discover')
        ? 'Discover'
        : pathname.includes('library') || pathname.includes('search')
          ? 'Library'
          : 'Now Playing'
  return buildResumeDescriptor({
    userId: opts.userId ?? null,
    spaceId: MUSIC_SPACE_ID,
    route: route || '/',
    entityId: opts.trackId || undefined,
    displayTitle: 'Music',
    displaySubtitle: subtitle,
    substate: { liveAccessory: 'miniplayer' },
  })
}

export async function resumeMusicSpace(descriptor = null) {
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

export function installMusicLeaveGuard() {
  if (!isBrowser()) return
  window.__KENOS_LEAVE_GUARD__ = {
    probe() {
      return { dirty: false, summary: '' }
    },
    discard() {},
    compose() {},
  }
}

export function persistMusicContinue(descriptor, userId = null) {
  const d = descriptor || suspendMusicSpace({ userId })
  try {
    localStorage.setItem(domainContinueStorageKey('music', userId), JSON.stringify(d))
  } catch {
    /* ignore */
  }
  return d
}
