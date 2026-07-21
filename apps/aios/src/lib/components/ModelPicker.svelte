<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import { MODELS, modelById } from '$lib/localai.js'
  import { S, save } from '$lib/state.svelte.js'

  let open = $state(false)
  let root = $state(null)

  const current = $derived(modelById(S.settings.model))

  function choose(id) {
    S.settings.model = id
    save()
    open = false
  }

  function onWindowPointerDown(event) {
    if (open && root && !root.contains(event.target)) open = false
  }

  function onWindowKeydown(event) {
    if (event.key === 'Escape') open = false
  }
</script>

<svelte:window
  onpointerdown={onWindowPointerDown}
  onkeydown={onWindowKeydown}
/>

<div class="picker" bind:this={root}>
  <button
    type="button"
    class="trigger"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={t('model.label')}
    onclick={() => (open = !open)}
  >
    <span class="trigger-model">{t('model.modePrefix')}{t(current.nameKey)}</span>
    <Icon name="chevron-down" size={14} strokeWidth={2} />
  </button>

  {#if open}
    <div class="menu" role="listbox" aria-label={t('model.label')}>
      {#each MODELS as model (model.id)}
        <button
          type="button"
          class="option"
          role="option"
          aria-selected={S.settings.model === model.id}
          onclick={() => choose(model.id)}
        >
          <span class="option-text">
            <span class="option-name">{t(model.nameKey)}</span>
            <span class="option-desc">{t(model.descKey)}</span>
          </span>
          {#if S.settings.model === model.id}
            <Icon name="check" size={16} strokeWidth={2.25} />
          {/if}
        </button>
      {/each}

      <div class="divider"></div>

      <button
        type="button"
        class="option"
        aria-pressed={S.settings.thinking}
        onclick={() => {
          S.settings.thinking = !S.settings.thinking
          save()
        }}
      >
        <span class="option-text">
          <span class="option-name thinking-name">
            <Icon name="lightbulb" size={14} strokeWidth={2} />
            {t('model.thinking')}
          </span>
          <span class="option-desc">{t('model.thinkingDesc')}</span>
        </span>
        <span class="switch" class:on={S.settings.thinking}></span>
      </button>
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    border: none;
    background: transparent;
    color: var(--t1);
    padding: 6px 8px;
    border-radius: 999px;
    cursor: pointer;
    font-size: 12px;
  }
  .trigger:hover {
    background: color-mix(in srgb, var(--t1) 6%, transparent);
  }
  .trigger-model {
    color: var(--t2);
    font-weight: 500;
    max-width: 7.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .trigger :global(svg) {
    color: var(--t3);
  }

  .menu {
    position: absolute;
    top: calc(100% + 6px);
    inset-inline-start: 0;
    min-width: 260px;
    background: var(--bg);
    border: 1px solid var(--border-l);
    border-radius: 14px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
    padding: 6px;
    display: grid;
    gap: 2px;
    z-index: 50;
  }

  .option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3, 12px);
    width: 100%;
    border: none;
    background: transparent;
    border-radius: 9px;
    padding: 9px 10px;
    cursor: pointer;
    text-align: start;
    color: var(--t1);
  }
  .option:hover {
    background: var(--card);
  }

  .option-text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .option-name {
    font-size: var(--text-base, 15px);
    font-weight: 550;
  }
  .option-desc {
    font-size: var(--text-xs, 12px);
    color: var(--t3);
  }

  .divider {
    height: 1px;
    background: var(--border);
    margin: 4px 6px;
  }

  .thinking-name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  /* 命名避开主题包全局 .toggle 组件(settings-ext.css),防止样式互相泄漏 */
  .switch {
    flex: 0 0 auto;
    width: 34px;
    height: 20px;
    border-radius: 999px;
    background: var(--card-h);
    position: relative;
    transition: background var(--dur-fast) var(--ease, ease);
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--bg);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: transform var(--dur-fast) var(--ease, ease);
  }
  .switch.on {
    background: var(--accent);
  }
  .switch.on::after {
    transform: translateX(14px);
  }
</style>
