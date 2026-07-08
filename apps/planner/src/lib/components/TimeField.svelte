<script>
  import { t } from '$lib/i18n/index.js';
  import Icon from '@life-os/platform-web/svelte/icon';

  /** @type {{
    id?: string,
    value?: string | null,
    placeholder?: string,
    onchange?: (value: string | null) => void
  }} */
  let { id, value = null, placeholder = '', onchange } = $props();

  /** @type {HTMLInputElement | null} */
  let inputEl = $state(null);

  function openPicker() {
    inputEl?.showPicker?.();
    inputEl?.focus();
  }

  function handleInput(e) {
    const next = e.currentTarget.value || null;
    onchange?.(next);
  }
</script>

<div class="time-field">
  <button type="button" class="time-display" onclick={openPicker}>
    <span class:placeholder={!value}>
      {value || placeholder || t('task.pickTime')}
    </span>
    <Icon name="clock" size={18} strokeWidth={1.5} />
  </button>
  <input
    bind:this={inputEl}
    {id}
    type="time"
    class="time-native"
    value={value || ''}
    oninput={handleInput}
    tabindex="-1"
    aria-hidden="true"
  />
</div>

<style>
  .time-field {
    position: relative;
  }
  .time-display {
    width: 100%;
    min-height: var(--control-h);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--control-radius);
    background: var(--card);
    color: var(--t1);
    text-align: left;
    font-variant-numeric: tabular-nums;
  }
  .time-display .placeholder {
    color: var(--t3);
  }
  .time-native {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    border: 0;
    padding: 0;
    pointer-events: none;
  }
</style>
