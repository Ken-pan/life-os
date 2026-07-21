/**
 * Music Continuity adapter — single live accessory (MiniPlayer); no dual Now Playing chrome.
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

export const MUSIC_SPACE_ID = 'music'

/** @type {{ trackId?: string, trackTitle?: string, playing?: boolean }} */
let playbackSnapshot = {}

function isBrowser() {
  return typeof window !== 'undefined'
}

/**
 * Lightweight Continuity playback mirror (avoids importing player.svelte.js).
 * Wired from kenosNowPlaying / mediaSession updates.
 * @param {{ trackId?: string | null, trackTitle?: string | null, playing?: boolean }} [opts]
 */
export function noteMusicPlayback(opts = {}) {
  const trackId = opts.trackId ? String(opts.trackId) : ''
  if (!trackId) {
    if (!playbackSnapshot.trackId) return playbackSnapshot
    playbackSnapshot = {}
    return playbackSnapshot
  }
  const trackTitle = opts.trackTitle
    ? String(opts.trackTitle).slice(0, 80)
    : undefined
  const playing = Boolean(opts.playing)
  if (
    playbackSnapshot.trackId === trackId &&
    playbackSnapshot.playing === playing &&
    (trackTitle == null || playbackSnapshot.trackTitle === trackTitle)
  ) {
    return playbackSnapshot
  }
  playbackSnapshot = {
    trackId,
    trackTitle: trackTitle ?? playbackSnapshot.trackTitle,
    playing,
  }
  return playbackSnapshot
}

/** @returns {{ trackId?: string, trackTitle?: string, playing?: boolean }} */
export function getMusicPlaybackSnapshot() {
  return { ...playbackSnapshot }
}

export function suspendMusicSpace(opts = {}) {
  const pathname =
    opts.pathname ?? (isBrowser() ? window.location.pathname : '/')
  const search = opts.search ?? (isBrowser() ? window.location.search : '')
  const route = `${pathname}${search}`
  const snap = getMusicPlaybackSnapshot()
  const trackId = opts.trackId ?? snap.trackId
  const trackTitle = opts.trackTitle ?? snap.trackTitle
  const subtitle = trackTitle
    ? String(trackTitle).slice(0, 80)
    : pathname.includes('browse')
      ? 'Browse'
      : pathname.includes('search')
        ? 'Search'
        : pathname.includes('library') || pathname.includes('playlist')
          ? 'Library'
          : 'Home'
  return buildResumeDescriptor({
    userId: opts.userId ?? null,
    spaceId: MUSIC_SPACE_ID,
    route: route || '/',
    entityId: trackId || undefined,
    displayTitle: 'Music',
    displaySubtitle: subtitle,
    substate: {
      liveAccessory: 'miniplayer',
      playing: trackId ? Boolean(opts.playing ?? snap.playing) : undefined,
    },
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

/** @returns {{ domainId: string, path: string, title: string, activeTab: string, canGoBack: boolean, currentEntity: string, liveState: string, unsavedDraft: boolean, summary: string }} */
export function buildMusicNavManifest() {
  const path = isBrowser()
    ? `${window.location.pathname}${window.location.search}`
    : '/'
  const pathname = isBrowser() ? window.location.pathname : '/'
  // Align with KenosDomainRegistry Music dock: Home · Search · Library · More
  let activeTab = 'home'
  if (pathname.includes('search')) activeTab = 'search'
  else if (pathname.includes('library') || pathname.includes('playlist')) {
    activeTab = 'library'
  } else if (
    pathname.includes('liked') ||
    pathname.includes('browse') ||
    pathname.includes('import') ||
    pathname.includes('settings') ||
    pathname.includes('playlists')
  ) {
    activeTab = 'more'
  }
  const snap = getMusicPlaybackSnapshot()
  const d = suspendMusicSpace(snap)
  const liveState = d.entityId
    ? /** @type {any} */ (d.substate)?.playing
      ? 'playing'
      : 'paused'
    : 'idle'
  return {
    domainId: MUSIC_SPACE_ID,
    path,
    title: 'Music',
    activeTab,
    canGoBack: isBrowser() ? window.history.length > 1 : false,
    currentEntity: d.entityId ? String(d.entityId) : '',
    liveState,
    unsavedDraft: false,
    summary: d.displaySubtitle || 'Music',
  }
}

export function publishMusicNavManifest() {
  return publishNavManifest(buildMusicNavManifest())
}

export function installMusicLeaveGuard() {
  if (!isBrowser()) return
  window.__KENOS_LEAVE_GUARD__ = {
    probe() {
      return { dirty: false, summary: '' }
    },
    discard() {},
    compose() {
      void sensory('soft')
      void resumeMusicSpace({
        version: 1,
        userId: 'anonymous',
        spaceId: MUSIC_SPACE_ID,
        route: '/import',
        displayTitle: 'Music',
        displaySubtitle: 'Import',
        updatedAt: new Date().toISOString(),
      })
      void publishMusicNavManifest()
    },
  }
  window.__KENOS_DOMAIN_COMPOSE__ = () => {
    window.__KENOS_LEAVE_GUARD__?.compose?.()
  }
  void publishMusicNavManifest()
  if (!window.__KENOS_MUSIC_NAV_PUBLISHER__) {
    window.__KENOS_MUSIC_NAV_PUBLISHER__ = installNavManifestPublisher(
      () => buildMusicNavManifest(),
      { intervalMs: 700 },
    )
  }
}

export function persistMusicContinue(descriptor, userId = null) {
  const d =
    descriptor || suspendMusicSpace({ userId, ...getMusicPlaybackSnapshot() })
  try {
    writeDomainContinue(MUSIC_SPACE_ID, userId, d)
  } catch {
    /* ignore */
  }
  return d
}
