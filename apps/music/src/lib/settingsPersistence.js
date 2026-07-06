/**
 * Music settings tiers:
 * - Cloud (Supabase music_user_state.settings): cross-device preferences
 * - Local (musicos_v1 + musicos_prefs_v1): device-only UI / playback chrome
 */

/** @typedef {import('./state.svelte.js').MusicSettings} MusicSettings */

/** @type {readonly (keyof MusicSettings)[]} */
export const CLOUD_SETTING_KEYS = [
  'theme',
  'locale',
  'gapless',
  'crossfadeMs',
  'crossfade',
  'albumAmbience',
  'autoContinueSimilar',
  'updatedAt',
]

/** @type {readonly (keyof MusicSettings)[]} */
export const LOCAL_SETTING_KEYS = [
  'volume',
  'muted',
  'libraryDensity',
  'immersiveViewMode',
]

const PREFS_KEY = 'musicos_prefs_v1'

/** @param {Record<string, unknown>} settings */
export function normalizeCloudSettings(settings) {
  /** @type {Record<string, unknown>} */
  const merged = { ...settings }
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
  if (merged.immersiveViewMode === 'ambient') merged.immersiveViewMode = 'queue'
  merged.updatedAt = Math.max(0, Math.round(Number(merged.updatedAt) || 0))
  return merged
}

/** @param {Partial<MusicSettings> | Record<string, unknown>} settings */
export function pickCloudSettings(settings) {
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const key of CLOUD_SETTING_KEYS) {
    if (key in settings) out[key] = settings[key]
  }
  return /** @type {Partial<MusicSettings>} */ (normalizeCloudSettings(out))
}

/** @param {Partial<MusicSettings> | Record<string, unknown>} settings */
export function pickLocalSettings(settings) {
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const key of LOCAL_SETTING_KEYS) {
    if (key in settings) out[key] = settings[key]
  }
  return /** @type {Partial<MusicSettings>} */ (out)
}

/**
 * Merge cloud snapshot into local settings; device-local keys always win.
 * @param {Partial<MusicSettings>} localSettings
 * @param {Record<string, unknown> | null | undefined} cloudSettings
 */
export function mergeCloudIntoLocal(localSettings, cloudSettings) {
  const local = /** @type {MusicSettings} */ ({ ...localSettings })
  const localOnly = pickLocalSettings(local)
  const localCloud = pickCloudSettings(local)
  const cloud = pickCloudSettings(cloudSettings ?? {})
  const useCloud = (cloud.updatedAt ?? 0) > (localCloud.updatedAt ?? 0)
  const mergedCloud = useCloud ? { ...localCloud, ...cloud } : localCloud
  return /** @type {MusicSettings} */ ({
    ...local,
    ...mergedCloud,
    ...localOnly,
    updatedAt: Math.max(localCloud.updatedAt ?? 0, cloud.updatedAt ?? 0),
  })
}

/**
 * @param {Partial<MusicSettings>} patch
 * @param {{
 *   save: () => void,
 *   assign: (next: Partial<MusicSettings>) => void,
 * }} ctx
 */
export function applyCloudSettingsPatch(patch, ctx) {
  ctx.assign({
    ...patch,
    updatedAt: Date.now(),
  })
  ctx.save()
  void import('./sync.js').then(({ scheduleAutoCloudPush }) =>
    scheduleAutoCloudPush(),
  )
}

/**
 * @param {Partial<MusicSettings>} patch
 * @param {{ save: () => void, assign: (next: Partial<MusicSettings>) => void }} ctx
 */
export function applyLocalSettingsPatch(patch, ctx) {
  ctx.assign(patch)
  ctx.save()
}

/** @returns {{ utilityPaneTab: 'queue' | 'lyrics' }} */
export function loadUiPrefs() {
  if (typeof localStorage === 'undefined') {
    return { utilityPaneTab: 'queue' }
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { utilityPaneTab: 'queue' }
    const parsed = JSON.parse(raw)
    const tab = parsed?.utilityPaneTab === 'lyrics' ? 'lyrics' : 'queue'
    return { utilityPaneTab: tab }
  } catch {
    return { utilityPaneTab: 'queue' }
  }
}

/** @param {{ utilityPaneTab?: 'queue' | 'lyrics' }} prefs */
export function saveUiPrefs(prefs) {
  if (typeof localStorage === 'undefined') return
  try {
    const prev = loadUiPrefs()
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prev, ...prefs }))
  } catch {
    /* ignore */
  }
}
