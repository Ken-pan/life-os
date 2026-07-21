<script>
  import { S, save, applyTheme } from '$lib/state.svelte.js'
  import { t, setLocale } from '$lib/i18n/index.js'
  import SettingsAppearanceBlock from '@life-os/platform-web/svelte/settings/appearance-block'

  /** @param {string} value */
  function setTheme(value) {
    S.settings.theme = value
    save()
    applyTheme()
  }
</script>

<div class="wrap settings-page">
  <SettingsAppearanceBlock
    title={t('settings.appearance')}
    theme={S.settings.theme || 'auto'}
    onThemeChange={setTheme}
    themeOptions={[
      { value: 'light', label: t('settings.themeLight') },
      { value: 'dark', label: t('settings.themeDark') },
      { value: 'auto', label: t('settings.themeAuto') },
    ]}
    themeLabel={t('settings.theme')}
    themeDesc={t('settings.themeDesc')}
    locale={S.settings.locale}
    onLocaleChange={setLocale}
    localeOptions={[
      { value: 'zh', label: t('settings.langZh') },
      { value: 'en', label: t('settings.langEn') },
    ]}
    languageLabel={t('settings.language')}
    languageDesc={t('settings.languageDesc')}
  />
</div>
