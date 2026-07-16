<script>
  import { S, save, applyTheme } from '$lib/state.svelte.js'
  import { t, setLocale } from '$lib/i18n/index.js'

  let importInput = $state(null)
  let mergedCount = $state(-1)

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
    <h2>{t('settings.dataTitle')}</h2>
    <p class="data-desc">{t('settings.dataDesc')}</p>
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
</style>
