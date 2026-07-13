import { browser } from '$app/environment'
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme,
} from '@life-os/theme'

const STORAGE_KEY = 'starteros_v1'

const DEFAULTS = {
  settings: {
    theme: 'auto', // 'light' | 'dark' | 'auto'
    locale: 'zh', // 'zh' | 'en'
  },
}

function load() {
  if (!browser) return structuredClone(DEFAULTS)
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULTS)
    const parsed = JSON.parse(raw)
    return {
      settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
    }
  } catch {
    return structuredClone(DEFAULTS)
  }
}

export const S = $state(load())

export function save() {
  if (!browser) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: S.settings }))
  } catch {}
}

const THEME_APPLY_OPTIONS = {
  themeColorFallback: { light: '#f4f4f3', dark: '#0d0d0e' },
}

/** @returns {'light'|'dark'} */
export function resolveAppTheme() {
  return resolveTheme(S.settings.theme, 'dark')
}

export function applyTheme() {
  if (!browser) return
  applyResolvedTheme(resolveAppTheme(), THEME_APPLY_OPTIONS)
}

/** @returns {() => void} */
export function bindAppThemeSystemChange() {
  return bindSystemThemeChange(
    () => S.settings.theme,
    (resolved) => applyResolvedTheme(resolved, THEME_APPLY_OPTIONS),
    'dark',
  )
}
