import { browser } from '$app/environment'
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme,
} from '@life-os/theme'

const SKEY = 'musicos_v1'

const defaultState = () => ({
  settings: {
    theme: 'auto',
    locale: 'zh',
    /** @deprecated Use crossfadeMs > 0 */
    crossfade: false,
    /** 0 = off; 500–12000 ms overlap between tracks */
    crossfadeMs: 0,
    gapless: true,
    volume: 1,
    muted: false,
    libraryDensity: 'comfortable',
    /** Tint player chrome from album artwork (progress, glow, spotlight). */
    albumAmbience: true,
    /** Now-playing panel: cover (player), lyrics, or queue. */
    immersiveViewMode: 'player',
    /** 队列播完时按相似 vibe 自动续播（需登录） */
    autoContinueSimilar: true,
  },
})

/** @param {'player' | 'lyrics' | 'queue'} mode */
export function setImmersiveViewMode(mode) {
  S.settings.immersiveViewMode = mode
  save()
}

/** @param {Record<string, unknown>} settings */
function normalizeSettings(settings) {
  const merged = { ...defaultState().settings, ...settings }
  if (merged.immersiveViewMode === 'ambient') merged.immersiveViewMode = 'queue'
  if (
    merged.immersiveViewMode !== 'player' &&
    merged.immersiveViewMode !== 'lyrics' &&
    merged.immersiveViewMode !== 'queue'
  ) {
    merged.immersiveViewMode = 'player'
  }
  if (merged.crossfadeMs == null || merged.crossfadeMs === false)
    merged.crossfadeMs = 0
  if (merged.crossfadeMs === true) merged.crossfadeMs = 3000
  if (merged.crossfade === true && !merged.crossfadeMs)
    merged.crossfadeMs = 3000
  merged.crossfadeMs = Math.max(
    0,
    Math.min(12_000, Math.round(Number(merged.crossfadeMs) || 0)),
  )
  merged.crossfade = merged.crossfadeMs > 0
  return merged
}

function load() {
  if (!browser) return defaultState()
  try {
    const raw = localStorage.getItem(SKEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw)
    return {
      ...defaultState(),
      ...parsed,
      settings: normalizeSettings(parsed.settings ?? {}),
    }
  } catch {
    return defaultState()
  }
}

export const S = $state(load())

/** Bumped after background cover repair so list pages can reload. */
export const librarySignals = $state({ epoch: 0 })

/** @type {ReturnType<typeof setTimeout> | null} */
let bumpTimer = null

export function bumpLibraryEpoch() {
  if (!browser) return
  if (bumpTimer) clearTimeout(bumpTimer)
  bumpTimer = setTimeout(() => {
    librarySignals.epoch += 1
    bumpTimer = null
    void import('./albumArtStore.js').then(({ refreshAlbumArtCache }) =>
      refreshAlbumArtCache(),
    )
  }, 250)
}

export function save() {
  if (!browser) return
  localStorage.setItem(SKEY, JSON.stringify(S))
}

const THEME_APPLY_OPTIONS = {
  themeColorMetaId: 'theme-color-meta',
  themeColorFallback: { light: '#faf5f4', dark: '#100a0c' },
}

export function applyTheme() {
  if (!browser) return
  applyResolvedTheme(
    resolveTheme(S.settings.theme, 'auto'),
    THEME_APPLY_OPTIONS,
  )
}

export function bindAppThemeSystemChange() {
  return bindSystemThemeChange(
    () => S.settings.theme,
    (resolved) => applyResolvedTheme(resolved, THEME_APPLY_OPTIONS),
    'auto',
  )
}
