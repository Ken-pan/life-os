<script>
  import {
    SUPPORTED_LOCALES,
    isAppLocale,
  } from '@life-os/finance-core/i18n/types'
  import SettingsAppearanceBlock from '@life-os/platform-web/svelte/settings/appearance-block'
  import { t, locale, setLocale } from '$lib/i18n.svelte.js'

  /** @typedef {import('../../../lib/themePreference').ThemePreference} ThemePreference */

  /** @type {{
   *   title: string,
   *   themePreference: ThemePreference,
   *   onThemePreferenceChange: (preference: ThemePreference) => void,
   *   lockPortraitOnPhone?: boolean,
   *   onLockPortraitOnPhoneChange?: (enabled: boolean) => void,
   * }} */
  let {
    title,
    themePreference,
    onThemePreferenceChange,
    lockPortraitOnPhone = true,
    onLockPortraitOnPhoneChange,
  } = $props()

  /** @type {ThemePreference[]} */
  const THEME_OPTIONS = ['light', 'dark', 'auto']

  const themeOptions = $derived(
    THEME_OPTIONS.map((value) => ({
      value,
      label: t(
        value === 'light'
          ? 'settings.themeLight'
          : value === 'dark'
            ? 'settings.themeDark'
            : 'settings.themeAuto',
      ),
    })),
  )

  /** @param {string} next */
  function pickLocale(next) {
    if (isAppLocale(next)) setLocale(next)
  }

  /** @param {string} value */
  function pickTheme(value) {
    if (value === 'light' || value === 'dark' || value === 'auto') {
      onThemePreferenceChange(value)
    }
  }
</script>

<SettingsAppearanceBlock
  {title}
  theme={themePreference}
  onThemeChange={pickTheme}
  {themeOptions}
  themeLabel={t('settings.theme')}
  themeDesc={t('settings.themeDesc')}
  locale={locale()}
  onLocaleChange={pickLocale}
  localeOptions={SUPPORTED_LOCALES}
  languageLabel={t('settings.language')}
  languageDesc={t('settings.languageDesc')}
  {lockPortraitOnPhone}
  {onLockPortraitOnPhoneChange}
  lockPortraitLabel={t('settings.lockPortraitOnPhone')}
  lockPortraitDesc={t('settings.lockPortraitOnPhoneDesc')}
/>
