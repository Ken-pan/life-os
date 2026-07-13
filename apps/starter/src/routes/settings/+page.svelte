<script>
  import { S, save, applyTheme } from '$lib/state.svelte.js'
  import { t, setLocale } from '$lib/i18n/index.js'

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
</style>
