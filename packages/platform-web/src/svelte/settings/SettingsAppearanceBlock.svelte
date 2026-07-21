<script>
  import SettingsSection from './SettingsSection.svelte'
  import SettingsRow from './SettingsRow.svelte'
  import SettingsSegment from './SettingsSegment.svelte'
  import SettingsToggleRow from './SettingsToggleRow.svelte'

  /**
   * Shared appearance settings: language + theme + optional portrait lock.
   * Controlled + label-driven so each app keeps its own i18n and storage.
   *
   * @type {{
   *   title?: string,
   *   testId?: string,
   *   theme: string,
   *   onThemeChange: (theme: string) => void,
   *   themeOptions: { value: string, label: string }[],
   *   themeLabel: string,
   *   themeDesc?: string,
   *   locale?: string,
   *   onLocaleChange?: (locale: string) => void,
   *   localeOptions?: { value: string, label: string }[],
   *   languageLabel?: string,
   *   languageDesc?: string,
   *   lockPortraitOnPhone?: boolean,
   *   onLockPortraitOnPhoneChange?: (enabled: boolean) => void,
   *   lockPortraitLabel?: string,
   *   lockPortraitDesc?: string,
   * }}
   */
  let {
    title = '',
    testId = 'settings-appearance',
    theme,
    onThemeChange,
    themeOptions,
    themeLabel,
    themeDesc = '',
    locale = '',
    onLocaleChange,
    localeOptions = [],
    languageLabel = '',
    languageDesc = '',
    lockPortraitOnPhone = true,
    onLockPortraitOnPhoneChange,
    lockPortraitLabel = '',
    lockPortraitDesc = '',
  } = $props()

  const showLocale = $derived(
    Boolean(languageLabel && localeOptions?.length && onLocaleChange),
  )
  const showLock = $derived(
    Boolean(lockPortraitLabel && onLockPortraitOnPhoneChange),
  )

  /** @param {string} value */
  function pickTheme(value) {
    onThemeChange?.(value)
  }

  /** @param {string} value */
  function pickLocale(value) {
    if (value === locale) return
    onLocaleChange?.(value)
  }
</script>

{#snippet rows()}
  {#if showLocale}
    <SettingsRow label={languageLabel} desc={languageDesc}>
      <SettingsSegment
        options={localeOptions}
        value={locale}
        onchange={pickLocale}
        ariaLabel={languageLabel}
      />
    </SettingsRow>
  {/if}

  <SettingsRow label={themeLabel} desc={themeDesc}>
    <SettingsSegment
      options={themeOptions}
      value={theme}
      onchange={pickTheme}
      ariaLabel={themeLabel}
    />
  </SettingsRow>

  {#if showLock}
    <SettingsToggleRow
      label={lockPortraitLabel}
      desc={lockPortraitDesc}
      checked={lockPortraitOnPhone}
      ariaLabel={lockPortraitLabel}
      onchange={(checked) => onLockPortraitOnPhoneChange?.(checked)}
    />
  {/if}
{/snippet}

{#if title}
  <SettingsSection {title} {testId}>
    {@render rows()}
  </SettingsSection>
{:else}
  <div data-testid={testId || undefined}>
    {@render rows()}
  </div>
{/if}
