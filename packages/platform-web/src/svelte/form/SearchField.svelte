<script>
  /**
   * Life OS SearchField — 搜索输入，内嵌放大镜图标 + 清除按钮。
   * 外观来自 theme 的 .field / .field-search 族；oninput 实时回报（区别于 TextField 的 change 提交）。
   */

  /**
   * @type {{
   *   value: string,
   *   onChange: (value: string) => void,
   *   label?: string,
   *   placeholder?: string,
   *   disabled?: boolean,
   *   clearLabel?: string
   * }}
   */
  let {
    value,
    onChange,
    label = '',
    placeholder = '',
    disabled = false,
    clearLabel = 'Clear search',
  } = $props()

  const inputId = $props.id()
</script>

<div class="field">
  {#if label}<label for={inputId}>{label}</label>{/if}
  <div class="field-search">
    <svg
      class="field-search__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
    <input
      id={inputId}
      type="search"
      {value}
      {placeholder}
      {disabled}
      oninput={(e) => onChange(e.currentTarget.value)}
    />
    {#if value && !disabled}
      <button
        type="button"
        class="field-search__clear"
        aria-label={clearLabel}
        onclick={() => onChange('')}
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    {/if}
  </div>
</div>
