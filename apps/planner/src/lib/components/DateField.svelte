<script>
  import { t, localeTag } from '$lib/i18n/index.js';
  import { formatDateDisplay, formatDateCompact } from '$lib/domain/dateFormat.js';
  import { todayKey } from '$lib/state.svelte.js';
  import Icon from '@life-os/platform-web/svelte/icon';

  /** @type {{
    id?: string,
    value?: string | null,
    placeholder?: string,
    compact?: boolean,
    onchange?: (value: string | null) => void
  }} */
  let { id, value = null, placeholder = '', compact = false, onchange } = $props();

  let inputEl = $state(null);

  function openPicker() {
    inputEl?.showPicker?.();
    inputEl?.focus();
  }

  function handleInput(e) {
    const next = e.currentTarget.value || null;
    onchange?.(next);
  }

  const displayLabel = $derived.by(() => {
    if (!value) return placeholder || t('task.pickDate');
    if (!compact) return formatDateDisplay(value);
    const datePart = formatDateCompact(value);
    if (value === todayKey()) return `${t('nav.today')} ${datePart}`;
    return datePart;
  });
</script>

<div class="date-field" class:date-field--compact={compact}>
  <button type="button" class="date-display" onclick={openPicker}>
    <span class:placeholder={!value}>{displayLabel}</span>
    <Icon name="calendar" size={18} strokeWidth={1.5} />
  </button>
  <input
    bind:this={inputEl}
    {id}
    type="date"
    class="date-native"
    lang={localeTag()}
    value={value || ''}
    oninput={handleInput}
    tabindex="-1"
    aria-hidden="true"
  />
</div>

<style>
  .date-field {
    position: relative;
  }
  .date-display {
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
  }
  .date-display .placeholder {
    color: var(--t3);
  }
  .date-field--compact .date-display {
    white-space: nowrap;
    font-size: var(--text-sm);
  }
  .date-native {
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
