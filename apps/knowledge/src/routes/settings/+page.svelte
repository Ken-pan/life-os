<script>
  import { onMount } from 'svelte'
  import { S, save, applyTheme } from '$lib/state.svelte.js'
  import { CLOUD, signInCloud, signOutCloud } from '$lib/cloud.svelte.js'
  import { t, setLocale } from '$lib/i18n/index.js'
  import { scrollToSettingsHash } from '@life-os/platform-web/settings-hash'
  import SettingsSection from '@life-os/platform-web/svelte/settings/section'
  import SettingsSyncBlock from '@life-os/platform-web/svelte/settings/sync-block'
  import SettingsAppearanceBlock from '@life-os/platform-web/svelte/settings/appearance-block'
  import SettingsRow from '@life-os/platform-web/svelte/settings/row'
  import SettingsButtonGroup from '@life-os/platform-web/svelte/settings/button-group'

  onMount(() => scrollToSettingsHash('cloud'))

  let importInput = $state(null)
  let mergedCount = $state(-1)
  let cloudEmail = $state('')
  let cloudPassword = $state('')

  async function handleSignIn(e) {
    e.preventDefault()
    const ok = await signInCloud(cloudEmail.trim(), cloudPassword)
    if (ok) cloudPassword = ''
  }

  function exportJson() {
    const blob = new Blob(
      [
        JSON.stringify(
          { app: 'knowledge', version: 1, items: S.items },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `knowledgeos-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importJson(file) {
    try {
      const data = JSON.parse(await file.text())
      const incoming = Array.isArray(data.items) ? data.items : []
      const known = new Set(S.items.map((i) => i.id))
      const fresh = incoming.filter((i) => i && i.id && !known.has(i.id))
      S.items.push(...fresh)
      S.items.sort((a, b) => b.createdAt - a.createdAt)
      save()
      mergedCount = fresh.length
    } catch {
      mergedCount = 0
    }
  }

  /** @param {string} value */
  function setTheme(value) {
    S.settings.theme = value
    save()
    applyTheme()
  }
</script>

<div class="wrap settings-page">
  <SettingsSyncBlock
    title={t('cloud.title')}
    signedOutDesc={t('cloud.desc')}
    ssoHint={t('cloud.ssoHint')}
    signedInDesc={t('cloud.desc')}
    email={CLOUD.user?.email}
    configured={CLOUD.configured}
    signedIn={!!CLOUD.user}
    unavailableDesc={t('cloud.desc')}
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn-secondary"
        disabled={CLOUD.busy}
        onclick={signOutCloud}
      >
        {t('cloud.signOut')}
      </button>
    {/snippet}
    {#snippet signedOut()}
      <form class="cloud-form" onsubmit={handleSignIn}>
        <SettingsRow label={t('cloud.email')}>
          <input
            id="cloud-email"
            type="email"
            autocomplete="email"
            bind:value={cloudEmail}
          />
        </SettingsRow>
        <SettingsRow label={t('cloud.password')}>
          <input
            id="cloud-password"
            type="password"
            autocomplete="current-password"
            bind:value={cloudPassword}
          />
        </SettingsRow>
        <SettingsButtonGroup>
          <button
            type="submit"
            class="btn-primary"
            disabled={CLOUD.busy || !cloudEmail || !cloudPassword}
          >
            {t('cloud.signIn')}
          </button>
        </SettingsButtonGroup>
      </form>
      {#if CLOUD.error}
        <p class="block-desc">
          <span class="badge badge--danger">{CLOUD.error}</span>
        </p>
      {/if}
    {/snippet}
  </SettingsSyncBlock>

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

  <SettingsSection title={t('settings.dataTitle')}>
    {#if S.backend === 'vault'}
      <p class="block-desc">
        <span class="badge badge--accent">Vault</span>
        {t('settings.vaultDesc')}
      </p>
      <ul class="list">
        <li class="list-item">
          <span class="list-item__body">
            <span class="list-item__title">{t('settings.vaultPath')}</span>
            <span class="list-item__desc">{S.vaultRoot}</span>
          </span>
          <span class="list-item__trailing">
            {#if S.vaultError}
              <span class="badge badge--danger">error</span>
            {:else if S.vaultReady}
              <span class="badge badge--success">{S.items.length}</span>
            {:else}
              <span class="spinner" aria-label="loading"></span>
            {/if}
          </span>
        </li>
        <li class="list-item">
          <span class="list-item__body">
            <span class="list-item__title">{t('settings.vaultWatch')}</span>
            <span class="list-item__desc">{t('settings.vaultWatchDesc')}</span>
          </span>
          <span class="list-item__trailing">
            {#if S.vaultWatching}
              <span class="badge badge--success">on</span>
            {:else}
              <span class="badge">off</span>
            {/if}
          </span>
        </li>
      </ul>
    {:else}
      <p class="block-desc">{t('settings.dataDesc')}</p>
    {/if}
    <div class="settings-actions">
      <button type="button" class="btn-secondary" onclick={exportJson}>
        {t('settings.exportButton')}
      </button>
      <button
        type="button"
        class="btn-secondary"
        onclick={() => importInput?.click()}
      >
        {t('settings.importButton')}
      </button>
    </div>
    <input
      bind:this={importInput}
      type="file"
      accept=".json"
      hidden
      onchange={(e) => {
        const file = e.currentTarget.files?.[0]
        if (file) importJson(file)
        e.currentTarget.value = ''
      }}
    />
    {#if mergedCount >= 0}
      <p class="block-desc">
        <span class="badge badge--success">
          {t('settings.importedCount', { count: mergedCount })}
        </span>
      </p>
    {/if}
  </SettingsSection>
</div>

<style>
  .settings-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .cloud-form {
    display: grid;
    gap: var(--space-2, 8px);
    max-width: 360px;
  }
</style>
