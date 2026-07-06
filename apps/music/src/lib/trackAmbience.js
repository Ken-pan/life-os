import { browser } from '$app/environment'
import { resolveTheme } from '@life-os/theme'
import { peekAlbumArt, artUrlForAlbumKey } from './albumArtStore.js'
import { extractArtPalette, paletteFromHash } from './artPalette.js'
import { S } from './state.svelte.js'

let lastKey = ''
let extractSeq = 0

/** @param {HTMLElement} root */
function clearAmbience(root) {
  root.style.removeProperty('--track-accent')
  root.style.removeProperty('--track-accent-muted')
  root.style.removeProperty('--player-glow')
  root.style.removeProperty('--album-glow-1')
  root.style.removeProperty('--album-glow-2')
  root.style.removeProperty('--album-glow-3')
  root.style.removeProperty('--album-ambient-base')
  root.dataset.trackAmbience = 'off'
}

/** @param {HTMLElement} root @param {{ accent: string, accentMuted: string, glow: string, glow1?: string, glow2?: string, glow3?: string, ambientBase?: string }} palette @param {'art' | 'hash'} kind */
function applyPalette(root, palette, kind) {
  root.style.setProperty('--track-accent', palette.accent)
  root.style.setProperty('--track-accent-muted', palette.accentMuted)
  root.style.setProperty('--player-glow', palette.glow)
  if (palette.glow1) root.style.setProperty('--album-glow-1', palette.glow1)
  if (palette.glow2) root.style.setProperty('--album-glow-2', palette.glow2)
  if (palette.glow3) root.style.setProperty('--album-glow-3', palette.glow3)
  if (palette.ambientBase)
    root.style.setProperty('--album-ambient-base', palette.ambientBase)
  root.dataset.trackAmbience = kind
  syncImmersiveThemeColor(palette.ambientBase)
}

/** Match iOS status bar / Dynamic Island chrome to album ambience on Now Playing. */
function syncImmersiveThemeColor(ambientBase) {
  const meta = document.getElementById('theme-color-meta')
  if (!(meta instanceof HTMLMetaElement)) return
  const onNowPlaying = document.querySelector(
    '.music-app[data-page-route="now-playing"]',
  )
  if (onNowPlaying && ambientBase) {
    meta.content = ambientBase
    meta.dataset.immersiveOverride = '1'
    return
  }
  if (meta.dataset.immersiveOverride) {
    delete meta.dataset.immersiveOverride
    import('./state.svelte.js').then(({ applyTheme }) => applyTheme())
  }
}

/** Re-sync theme-color when entering Now Playing (route change may skip palette re-extract). */
export function refreshImmersiveChrome() {
  if (!browser) return
  const onNowPlaying = document.querySelector(
    '.music-app[data-page-route="now-playing"]',
  )
  if (!onNowPlaying) return
  const base =
    getComputedStyle(document.documentElement)
      .getPropertyValue('--album-ambient-base')
      .trim() || '#0a0809'
  syncImmersiveThemeColor(base)
}

/**
 * Sync --track-accent / --player-glow to the current track.
 * Uses album pixel colors when enabled; falls back to deterministic hash.
 * @param {import('./types.js').Track | null} track
 */
export function applyTrackAmbience(track) {
  if (!browser) return

  const root = document.documentElement
  const albumAmbience = S.settings.albumAmbience !== false
  const theme = resolveTheme(S.settings.theme, 'auto')
  const key = track?.id ?? track?.albumKey ?? ''
  const coverUrl = track?.artUrl || (track ? artUrlForAlbumKey(track.albumKey) : '') || ''
  const stateKey = `${key}:${coverUrl}:${albumAmbience ? 'on' : 'off'}:${theme}`

  if (!track || !albumAmbience) {
    if (stateKey === lastKey) return
    lastKey = stateKey
    extractSeq += 1
    clearAmbience(root)
    syncImmersiveThemeColor(null)
    return
  }

  if (stateKey === lastKey) return
  lastKey = stateKey
  const seq = ++extractSeq

  void (async () => {
    const cacheKey = track.albumKey || track.id
    /** @type {{ accent: string, accentMuted: string, glow: string }} */
    let palette

    if (coverUrl) {
      try {
        palette = await extractArtPalette(coverUrl, cacheKey)
        if (seq !== extractSeq) return
        applyPalette(root, palette, 'art')
        return
      } catch {
        /* CORS / decode — fall through to hash */
      }
    }

    const albumArt = peekAlbumArt(track.albumKey)
    if (albumArt?.artBlob instanceof Blob) {
      try {
        palette = await extractArtPalette(albumArt.artBlob, cacheKey)
        if (seq !== extractSeq) return
        applyPalette(root, palette, 'art')
        return
      } catch {
        /* fall through */
      }
    }

    if (track.artBlob instanceof Blob) {
      try {
        palette = await extractArtPalette(track.artBlob, cacheKey)
        if (seq !== extractSeq) return
        applyPalette(root, palette, 'art')
        return
      } catch {
        /* fall through */
      }
    }

    if (seq !== extractSeq) return
    applyPalette(root, paletteFromHash(track.id || track.albumKey), 'hash')
  })()
}

/** Re-apply after settings change (same track, force refresh). */
export function refreshTrackAmbience(
  /** @type {import('./types.js').Track | null} */ track,
) {
  lastKey = ''
  applyTrackAmbience(track)
}
