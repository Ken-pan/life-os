<script>
  import { SUPPORTED_LOCALES } from '@life-os/finance-core/i18n/types'
  import { t, locale, setLocale } from '$lib/i18n.svelte.js'
  import { notifyLocalePersist } from '$lib/components/AuthGate.svelte'
  import SettingsPrefRow from './SettingsPrefRow.svelte'

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

  /** @param {import('@life-os/finance-core/i18n/types').AppLocale} next */
  function pickLocale(next) {
    setLocale(next)
    notifyLocalePersist(next)
  }
</script>

<div class="card settings-section" data-testid="settings-appearance">
  <h3>{title}</h3>
  <SettingsPrefRow label={t('settings.language')} desc={t('settings.languageDesc')}>
    <div class="seg" role="group" aria-label={t('settings.language')}>
      {#each SUPPORTED_LOCALES as opt (opt.value)}
        <button
          type="button"
          class={locale() === opt.value ? 'active' : ''}
          aria-pressed={locale() === opt.value}
          onclick={() => pickLocale(opt.value)}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  </SettingsPrefRow>
  <SettingsPrefRow label={t('settings.theme')} desc={t('settings.themeDesc')}>
    <div class="seg" role="group" aria-label={t('settings.theme')}>
      {#each THEME_OPTIONS as value (value)}
        <button
          type="button"
          class={themePreference === value ? 'active' : ''}
          aria-pressed={themePreference === value}
          onclick={() => onThemePreferenceChange(value)}
        >
          {t(
            value === 'light'
              ? 'settings.themeLight'
              : value === 'dark'
                ? 'settings.themeDark'
                : 'settings.themeAuto',
          )}
        </button>
      {/each}
    </div>
  </SettingsPrefRow>
  {#if onLockPortraitOnPhoneChange}
    <SettingsPrefRow
      label={t('settings.lockPortraitOnPhone')}
      desc={t('settings.lockPortraitOnPhoneDesc')}
    >
      <div
        class="toggle settings-toggle{lockPortraitOnPhone ? ' on' : ''}"
        role="switch"
        aria-checked={lockPortraitOnPhone}
        aria-label={t('settings.lockPortraitOnPhone')}
        tabindex="0"
        onclick={() => onLockPortraitOnPhoneChange(!lockPortraitOnPhone)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onLockPortraitOnPhoneChange(!lockPortraitOnPhone)
          }
        }}
      ></div>
    </SettingsPrefRow>
  {/if}
</div>
