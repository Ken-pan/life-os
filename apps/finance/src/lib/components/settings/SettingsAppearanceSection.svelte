<script>
  import { SUPPORTED_LOCALES, isAppLocale } from '@life-os/finance-core/i18n/types'
  import SettingsSection from '@life-os/platform-web/svelte/settings/section'
  import SettingsRow from '@life-os/platform-web/svelte/settings/row'
  import SettingsSegment from '@life-os/platform-web/svelte/settings/segment'
  import SettingsToggleRow from '@life-os/platform-web/svelte/settings/toggle-row'
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

<SettingsSection {title} testId="settings-appearance">
  <SettingsRow label={t('settings.language')} desc={t('settings.languageDesc')}>
    <SettingsSegment
      options={SUPPORTED_LOCALES}
      value={locale()}
      onchange={pickLocale}
      ariaLabel={t('settings.language')}
    />
  </SettingsRow>
  <SettingsRow label={t('settings.theme')} desc={t('settings.themeDesc')}>
    <SettingsSegment
      options={themeOptions}
      value={themePreference}
      onchange={pickTheme}
      ariaLabel={t('settings.theme')}
    />
  </SettingsRow>
  {#if onLockPortraitOnPhoneChange}
    <SettingsToggleRow
      label={t('settings.lockPortraitOnPhone')}
      desc={t('settings.lockPortraitOnPhoneDesc')}
      checked={lockPortraitOnPhone}
      ariaLabel={t('settings.lockPortraitOnPhone')}
      onchange={onLockPortraitOnPhoneChange}
    />
  {/if}
</SettingsSection>
