<script>
  import { S, save, applyTheme } from '$lib/state.svelte.js'
  import { setLocale, t } from '$lib/i18n/index.js'
  import SettingsRow from '@life-os/platform-web/svelte/settings/row'
  import SettingsSegment from '@life-os/platform-web/svelte/settings/segment'
  import SettingsToggle from '@life-os/platform-web/svelte/settings/toggle'

  /** @type {{ onThemeChange?: (theme: string) => void, onLocaleChange?: (locale: string) => void }} */
  let { onThemeChange, onLocaleChange } = $props()

  const themeOptions = $derived([
    { value: 'light', label: t('settings.themeLight') },
    { value: 'dark', label: t('settings.themeDark') },
    { value: 'auto', label: t('settings.themeAuto') },
  ])

  const localeOptions = $derived([
    { value: 'zh', label: t('settings.langZh') },
    { value: 'en', label: t('settings.langEn') },
  ])

  function setTheme(theme) {
    S.settings.theme = theme
    save()
    applyTheme()
    onThemeChange?.(theme)
  }

  function onSetLocale(locale) {
    if (S.settings.locale === locale) return
    setLocale(locale)
    onLocaleChange?.(locale)
  }
</script>

<div>
  <SettingsRow label={t('settings.language')} desc={t('settings.languageDesc')}>
    <SettingsSegment
      options={localeOptions}
      value={S.settings.locale}
      onchange={onSetLocale}
      ariaLabel={t('settings.language')}
    />
  </SettingsRow>

  <SettingsRow label={t('settings.theme')} desc={t('settings.themeDesc')}>
    <SettingsSegment
      options={themeOptions}
      value={S.settings.theme || 'auto'}
      onchange={setTheme}
      ariaLabel={t('settings.theme')}
    />
  </SettingsRow>

  <SettingsRow
    label={t('settings.lockPortraitOnPhone')}
    desc={t('settings.lockPortraitOnPhoneDesc')}
  >
    <SettingsToggle
      checked={S.settings.lockPortraitOnPhone !== false}
      ariaLabel={t('settings.lockPortraitOnPhone')}
      onchange={(checked) => {
        S.settings.lockPortraitOnPhone = checked
        save()
      }}
    />
  </SettingsRow>
</div>
