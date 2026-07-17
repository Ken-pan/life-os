<script>
  import { S, save, applyTheme } from '$lib/state.svelte.js'
  import { CLOUD, signInCloud, signOutCloud } from '$lib/cloud.svelte.js'
  import { t, setLocale } from '$lib/i18n/index.js'

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
      [JSON.stringify({ app: 'knowledge', version: 1, items: S.items }, null, 2)],
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

  const themeOptions = $derived([
    { value: 'light', label: t('settings.themeLight') },
    { value: 'dark', label: t('settings.themeDark') },
    { value: 'auto', label: t('settings.themeAuto') },
  ])

  function setTheme(value) {
    S.settings.theme = value
    save()
    applyTheme()
  }
</script>

<div class="wrap">
  <section class="card">
    <h2>{t('settings.theme')}</h2>
    <div class="seg" role="group" aria-label={t('settings.theme')}>
      {#each themeOptions as option (option.value)}
        <button
          type="button"
          class:on={S.settings.theme === option.value}
          aria-pressed={S.settings.theme === option.value}
          onclick={() => setTheme(option.value)}
        >
          {option.label}
        </button>
      {/each}
    </div>
  </section>

  <section class="card">
    <h2>{t('settings.language')}</h2>
    <div class="seg" role="group" aria-label={t('settings.language')}>
      <button
        type="button"
        class:on={S.settings.locale === 'zh'}
        aria-pressed={S.settings.locale === 'zh'}
        onclick={() => setLocale('zh')}
      >
        中文
      </button>
      <button
        type="button"
        class:on={S.settings.locale === 'en'}
        aria-pressed={S.settings.locale === 'en'}
        onclick={() => setLocale('en')}
      >
        English
      </button>
    </div>
  </section>

  <section class="card">
    <h2>{t('cloud.title')}</h2>
    <p class="data-desc">{t('cloud.desc')}</p>
    {#if CLOUD.user}
      <p class="data-desc">
        <span class="badge badge--success">{t('cloud.signedInAs', { email: CLOUD.user.email })}</span>
      </p>
      <div class="settings-actions">
        <button type="button" class="btn-secondary" disabled={CLOUD.busy} onclick={signOutCloud}>
          {t('cloud.signOut')}
        </button>
      </div>
    {:else}
      <form class="cloud-form" onsubmit={handleSignIn}>
        <div class="field">
          <label for="cloud-email">{t('cloud.email')}</label>
          <input
            id="cloud-email"
            type="email"
            autocomplete="email"
            bind:value={cloudEmail}
          />
        </div>
        <div class="field">
          <label for="cloud-password">{t('cloud.password')}</label>
          <input
            id="cloud-password"
            type="password"
            autocomplete="current-password"
            bind:value={cloudPassword}
          />
        </div>
        <button type="submit" class="btn-primary" disabled={CLOUD.busy || !cloudEmail || !cloudPassword}>
          {t('cloud.signIn')}
        </button>
      </form>
      {#if CLOUD.error}
        <p class="data-desc"><span class="badge badge--danger">{CLOUD.error}</span></p>
      {/if}
    {/if}
  </section>

  <section class="card">
    <h2>{t('settings.dataTitle')}</h2>
    {#if S.backend === 'vault'}
      <p class="data-desc">
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
      <p class="data-desc">{t('settings.dataDesc')}</p>
    {/if}
    <div class="settings-actions">
      <button type="button" class="btn-secondary" onclick={exportJson}>
        {t('settings.exportButton')}
      </button>
      <button type="button" class="btn-secondary" onclick={() => importInput?.click()}>
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
      <p class="data-desc">
        <span class="badge badge--success">
          {t('settings.importedCount', { count: mergedCount })}
        </span>
      </p>
    {/if}
  </section>
</div>

<style>
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-5, 20px);
    margin-block: var(--space-4, 16px);
    display: grid;
    gap: var(--space-3, 12px);
  }
  .data-desc {
    margin: 0;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-sm);
  }
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
