<script>
  import { S, save, applyTheme } from '$lib/state.svelte.js'
  import { t, setLocale } from '$lib/i18n/index.js'
  import { AGENT_BASE } from '$lib/agent.svelte.js'

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
    <h2>{t('settings.agent')}</h2>
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
    <p class="muted">{t('settings.agentHint')}</p>
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
  .muted {
    color: var(--t3);
    font-size: 0.8125rem;
  }
</style>
