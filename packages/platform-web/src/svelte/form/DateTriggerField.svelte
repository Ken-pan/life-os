<script>
  /**
   * Life OS DateTriggerField — 触发器风格日期字段（planner 风格）：
   * 可见的是一个按钮（显示格式化文案），点它唤起隐藏的原生 date picker。
   * 文案格式化留在 app 侧（display prop），i18n 不进共享层。
   */
  import Icon from '../icon/Icon.svelte'

  /**
   * @type {{
   *   id?: string,
   *   value?: string | null,
   *   display: string,
   *   compact?: boolean,
   *   lang?: string,
   *   placeholder?: boolean,
   *   onchange?: (value: string | null) => void
   * }}
   */
  let {
    id,
    value = null,
    display,
    compact = false,
    lang,
    placeholder = false,
    onchange,
  } = $props()

  /** @type {HTMLInputElement | null} */
  let inputEl = $state(null)

  function openPicker() {
    inputEl?.showPicker?.()
    inputEl?.focus()
  }

  /** @param {Event & { currentTarget: HTMLInputElement }} e */
  function handleInput(e) {
    onchange?.(e.currentTarget.value || null)
  }
</script>

<div class="date-field" class:date-field--compact={compact}>
  <button type="button" class="date-display" onclick={openPicker}>
    <span class:placeholder>{display}</span>
    <Icon name="calendar" size={18} strokeWidth={1.5} />
  </button>
  <input
    bind:this={inputEl}
    {id}
    type="date"
    class="date-native"
    {lang}
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
    color: var(--t1, var(--text));
    text-align: left;
  }
  .date-display .placeholder {
    color: var(--t3, var(--text-muted));
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
