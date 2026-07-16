<script>
  /**
   * Life OS NumberField — 受控数字字段，可带后缀（kg / % / 円…）。
   * 后缀定位走 theme 的 .field-affix；空输入回调 0（对齐 finance 既有行为）。
   */

  /**
   * @type {{
   *   label?: string,
   *   value: number,
   *   onChange: (value: number) => void,
   *   step?: number,
   *   min?: number,
   *   max?: number,
   *   suffix?: string,
   *   placeholder?: string,
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
    step = 1,
    min,
    max,
    suffix = '',
    placeholder = '',
    hint = '',
    error = '',
    disabled = false,
    inputClass = '',
  } = $props()

  const inputId = $props.id()

  /** @param {Event & { currentTarget: HTMLInputElement }} e */
  function handleInput(e) {
    const raw = e.currentTarget.value
    onChange(raw === '' ? 0 : Number(raw))
  }
</script>

<div class="field" class:field--error={Boolean(error)}>
  {#if label}<label for={inputId}>{label}</label>{/if}
  <div class="field-affix">
    <input
      id={inputId}
      class={inputClass}
      type="number"
      inputmode="decimal"
      value={Number.isFinite(value) ? value : ''}
      {step}
      {min}
      {max}
      {placeholder}
      {disabled}
      aria-invalid={error ? 'true' : undefined}
      oninput={handleInput}
    />
    {#if suffix}
      <span class="field-affix__suffix">{suffix}</span>
    {/if}
  </div>
  {#if error}
    <p class="field-error" role="alert">{error}</p>
  {:else if hint}
    <p class="field-hint">{hint}</p>
  {/if}
</div>
