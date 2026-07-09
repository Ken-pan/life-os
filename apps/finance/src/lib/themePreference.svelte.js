// Port of src/hooks/useThemePreference.ts — module singleton for Svelte.
import { createThemePreferenceStoreWeb, fromWebThemePreference } from '@life-os/platform-web'
import { THEME_STORAGE_KEY } from './themePreference'

const themeStore = createThemePreferenceStoreWeb({
  storageKey: THEME_STORAGE_KEY,
  themeOptions: {
    themeColorFallback: { light: '#f2f4f2', dark: '#101211' },
  },
})

/** @type {import('./themePreference').ThemePreference} */
let preference = $state(themeStore.getWebPreference())

themeStore.subscribe(({ webPreference }) => {
  preference = webPreference
})

/** @returns {import('./themePreference').ThemePreference} */
export function themePreference() {
  return preference
}

/** @param {import('./themePreference').ThemePreference} next */
export function setThemePreference(next) {
  themeStore.setPreference(fromWebThemePreference(next))
}
