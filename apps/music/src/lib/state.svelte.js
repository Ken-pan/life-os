import { browser } from '$app/environment'
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme,
} from '@life-os/theme'
import {
  applyCloudSettingsPatch,
  applyLocalSettingsPatch,
  mergeCloudIntoLocal,
  normalizeCloudSettings,
} from './settingsPersistence.js'

const SKEY = 'musicos_v1'

/** @typedef {{
 *   theme: string,
 *   locale: string,
 *   crossfade: boolean,
 *   crossfadeMs: number,
 *   gapless: boolean,
 *   volume: number,
 *   muted: boolean,
 *   libraryDensity: string,
 *   albumAmbience: boolean,
 *   immersiveViewMode: 'player' | 'lyrics' | 'queue',
 *   autoContinueSimilar: boolean,
 *   updatedAt: number,
 * }} MusicSettings */

const defaultSettings = () => ({
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
  immersiveViewMode: /** @type {'player'} */ ('player'),
  /** 队列播完时按相似 vibe 自动续播（需登录） */
  autoContinueSimilar: true,
  /** Cloud settings LWW timestamp (ms) */
  updatedAt: 0,
})

const defaultState = () => ({
  settings: defaultSettings(),
})

/** @param {Record<string, unknown>} settings */
export function normalizeSettings(settings) {
  const merged = { ...defaultSettings(), ...settings }
  if (merged.immersiveViewMode === 'ambient') merged.immersiveViewMode = 'queue'
  if (
    merged.immersiveViewMode !== 'player' &&
    merged.immersiveViewMode !== 'lyrics' &&
    merged.immersiveViewMode !== 'queue'
  ) {
    merged.immersiveViewMode = 'player'
  }
  const cloudNorm = normalizeCloudSettings(merged)
  return /** @type {MusicSettings} */ ({
    ...merged,
    ...cloudNorm,
    updatedAt: cloudNorm.updatedAt ?? 0,
  })
}

function settingsCtx() {
  return {
    assign: (patch) => {
      S.settings = normalizeSettings({ ...S.settings, ...patch })
    },
    save,
  }
}

/** @param {Partial<MusicSettings>} patch */
export function patchCloudSettings(patch) {
  applyCloudSettingsPatch(patch, settingsCtx())
}

/** @param {Partial<MusicSettings>} patch */
export function patchLocalSettings(patch) {
  applyLocalSettingsPatch(patch, settingsCtx())
}

/** @param {Record<string, unknown> | null | undefined} cloudSettings */
export function applyCloudSettingsMerge(cloudSettings) {
  S.settings = mergeCloudIntoLocal(S.settings, cloudSettings)
  save()
}

/** @param {'player' | 'lyrics' | 'queue'} mode */
export function setImmersiveViewMode(mode) {
  patchLocalSettings({ immersiveViewMode: mode })
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
