<script>
  /**
   * Life OS DateField — 原生 date 输入字段（finance 风格）。
   * value 为 "YYYY-MM-DD"（带时间部分会被裁掉）；note 用于本地化日期回显。
   */

  /**
   * @type {{
   *   label?: string,
   *   value: string,
   *   onChange: (value: string) => void,
   *   min?: string,
   *   lang?: string,
   *   placeholder?: string,
   *   note?: string,
   *   hint?: string,
   *   error?: string,
   *   disabled?: boolean,
   *   inputClass?: string
   * }}
   */
  let {
    label = '',
    value,
    onChange,
    min,
    lang,
    placeholder = '',
    note = '',
    hint = '',
    error = '',
    disabled = false,
    inputClass = '',
  } = $props()

  const inputId = $props.id()
  const dateOnly = $derived(value ? value.slice(0, 10) : '')
</script>

<div class="field" class:field--error={Boolean(error)}>
  {#if label}<label for={inputId}>{label}</label>{/if}
  <div class="date-field-wrap{dateOnly ? '' : ' is-empty'}">
    <input
      id={inputId}
      class={inputClass}
      type="date"
      {lang}
      value={dateOnly}
      {min}
      {disabled}
      aria-invalid={error ? 'true' : undefined}
      onchange={(e) => onChange(e.currentTarget.value)}
    />
    {#if !dateOnly && placeholder}
      <span class="date-field-placeholder">{placeholder}</span>
    {/if}
  </div>
  {#if note}
    <span class="date-field-note">{note}</span>
  {/if}
  {#if error}
    <p class="field-error" role="alert">{error}</p>
  {:else if hint}
    <p class="field-hint">{hint}</p>
  {/if}
</div>
