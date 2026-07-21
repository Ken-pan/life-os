import { browser } from '$app/environment'
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme,
} from '@life-os/theme'
import { createSettingsPersistence } from '@life-os/platform-web/persisted-state'

const persistence = createSettingsPersistence({
  key: 'healthos_v1',
  defaults: {
    settings: {
      theme: 'auto', // 'light' | 'dark' | 'auto'
      locale: 'zh', // 'zh' | 'en'
      /** Continuity local UN for focus warn / wind-down (default on). */
      localAlerts: true,
    },
  },
  serialize: (state) => ({ settings: state.settings }),
})

export const S = $state(persistence.load())

export function save() {
  if (!browser) return
  persistence.save(S)
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
