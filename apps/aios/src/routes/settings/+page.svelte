<script>
  import { S, save, applyTheme } from '$lib/state.svelte.js'
  import { t, setLocale } from '$lib/i18n/index.js'
  import { MODELS } from '$lib/localai.js'
  import { C, refreshGateway, clearAllConversations } from '$lib/chat.svelte.js'

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

  function setModel(value) {
    S.settings.model = value
    save()
  }

  let checking = $state(false)
  async function checkGateway() {
    checking = true
    await refreshGateway()
    checking = false
  }

  function clearChats() {
    if (confirm(t('settings.clearChatsConfirm'))) clearAllConversations()
  }
</script>

<div class="wrap">
  <section class="card">
    <h2>{t('settings.ai')}</h2>

    <div class="row">
      <span class="row-label">{t('settings.gateway')}</span>
      <span class="row-value">
        <span
          class="status-dot"
          class:ok={C.gatewayOk === true}
          class:down={C.gatewayOk === false}
        ></span>
        {#if C.gatewayOk === true}{t('settings.gatewayOk')}
        {:else if C.gatewayOk === false}{t('settings.gatewayDown')}
        {:else}…{/if}
        <button type="button" class="mini-btn" disabled={checking} onclick={checkGateway}>
          {t('settings.gatewayCheck')}
        </button>
      </span>
    </div>

    <div class="row">
      <span class="row-label">{t('settings.defaultModel')}</span>
      <div class="seg" role="group" aria-label={t('settings.defaultModel')}>
        {#each MODELS as model (model.id)}
          <button
            type="button"
            class:on={S.settings.model === model.id}
            aria-pressed={S.settings.model === model.id}
            onclick={() => setModel(model.id)}
          >
            {t(model.nameKey)}
          </button>
        {/each}
      </div>
    </div>
    <p class="note">{t('settings.gatewayNote')}</p>
  </section>

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
    <h2>{t('settings.data')}</h2>
    <button type="button" class="danger-btn" onclick={clearChats}>
      {t('settings.clearChats')}
    </button>
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

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3, 12px);
    flex-wrap: wrap;
  }
  .row-label {
    color: var(--t2);
    font-size: var(--text-sm, 13px);
  }
  .row-value {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-sm, 13px);
    color: var(--t1);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--t4);
  }
  .status-dot.ok {
    background: var(--positive, #3fb950);
  }
  .status-dot.down {
    background: var(--critical, #f85149);
  }

  .mini-btn {
    border: 1px solid var(--border-l);
    background: var(--bg);
    color: var(--t1);
    border-radius: 8px;
    padding: 4px 10px;
    font-size: var(--text-xs, 12px);
    cursor: pointer;
  }
  .mini-btn:hover {
    background: var(--card-h);
  }
  .mini-btn:disabled {
    opacity: 0.5;
  }

  .note {
    margin: 0;
    font-size: var(--text-xs, 12px);
    color: var(--t3);
  }

  .danger-btn {
    justify-self: start;
    border: 1px solid var(--border-l);
    background: var(--bg);
    color: var(--critical, #f85149);
    border-radius: 10px;
    padding: 8px 14px;
    font-size: var(--text-sm, 13px);
    cursor: pointer;
  }
  .danger-btn:hover {
    background: var(--card-h);
  }
</style>
