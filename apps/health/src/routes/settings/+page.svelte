<script>
  import { onMount } from 'svelte'
  import { S, save, applyTheme } from '$lib/state.svelte.js'
  import { t, setLocale } from '$lib/i18n/index.js'
  import {
    publishShellTheme,
    publishShellLocale,
    publishNotificationCategoryEnabled,
  } from '@life-os/platform-web/kenos-shell-settings'
  import { AGENT_BASE } from '$lib/agent.svelte.js'
  import { scrollToSettingsHash } from '@life-os/platform-web/settings-hash'
  import SettingsSection from '@life-os/platform-web/svelte/settings/section'
  import SettingsAppearanceBlock from '@life-os/platform-web/svelte/settings/appearance-block'
  import SettingsRow from '@life-os/platform-web/svelte/settings/row'
  import SettingsToggle from '@life-os/platform-web/svelte/settings/toggle'
  import {
    canHostHealthLocalAlerts,
    requestHealthLocalAlertPermission,
  } from '$lib/healthLocalAlerts.js'

  let hostNative = $state(false)
  let permHint = $state(/** @type {string | null} */ (null))

  onMount(() => {
    scrollToSettingsHash('cloud')
    hostNative = canHostHealthLocalAlerts()
  })

  /** @param {string} value */
  function setTheme(value) {
    void publishShellTheme(value, (theme) => {
      S.settings.theme = theme
      save()
      applyTheme()
    })
  }

  /** @param {string} value */
  function setShellLocale(value) {
    void publishShellLocale(value, setLocale)
  }

  /** @param {boolean} checked */
  function setLocalAlerts(checked) {
    S.settings.localAlerts = checked
    save()
    void publishNotificationCategoryEnabled('health_focus_warn', checked)
    void publishNotificationCategoryEnabled('health_wind_down', checked)
    if (checked) {
      void requestHealthLocalAlertPermission().then((status) => {
        if (status === 'denied') permHint = t('settings.localAlertsDenied')
        else permHint = null
      })
    } else {
      permHint = null
    }
  }

</script>

<div class="wrap settings-page">
  <SettingsSection id="cloud" title={t('settings.localOnlyTitle')}>
    <p class="block-desc">{t('settings.localOnlyDesc')}</p>
  </SettingsSection>

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
    onLocaleChange={setShellLocale}
    localeOptions={[
      { value: 'zh', label: t('settings.langZh') },
      { value: 'en', label: t('settings.langEn') },
    ]}
    languageLabel={t('settings.language')}
    languageDesc={t('settings.languageDesc')}
  />

  {#if hostNative}
    <SettingsSection title={t('settings.localAlerts')}>
      <SettingsRow
        label={t('settings.localAlerts')}
        desc={t('settings.localAlertsDesc')}
      >
        <SettingsToggle
          checked={S.settings.localAlerts !== false}
          ariaLabel={t('settings.localAlerts')}
          onchange={setLocalAlerts}
        />
      </SettingsRow>
      {#if permHint}
        <p class="block-desc">{permHint}</p>
      {/if}
    </SettingsSection>
  {/if}

  <SettingsSection title={t('settings.agent')}>
    <dl class="agent-info">
      <div>
        <dt>{t('settings.agentEndpoint')}</dt>
        <dd><code>{AGENT_BASE}</code></dd>
      </div>
      <div>
        <dt>{t('settings.agentConfig')}</dt>
        <dd><code>~/Library/Application Support/HealthOS/config.json</code></dd>
      </div>
    </dl>
    <p class="block-desc">{t('settings.agentHint')}</p>
  </SettingsSection>
</div>

<style>
  .agent-info {
    display: grid;
    gap: var(--space-2, 8px);
  }
  .agent-info div {
    display: grid;
    gap: 2px;
  }
  .agent-info dt {
    font-size: 0.75rem;
    color: var(--t4);
  }
  .agent-info code {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.8125rem;
    color: var(--t2);
  }
</style>
