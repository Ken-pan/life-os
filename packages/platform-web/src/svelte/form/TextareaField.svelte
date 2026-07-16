<script>
  /**
   * Life OS TextareaField — 受控多行文本字段。
   */

  /**
   * @type {{
   *   label?: string,
   *   value: string,
   *   onChange: (value: string) => void,
   *   placeholder?: string,
   *   rows?: number,
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
    placeholder = '',
    rows = 3,
    hint = '',
    error = '',
    disabled = false,
    inputClass = '',
  } = $props()

  const inputId = $props.id()
</script>

<div class="field" class:field--error={Boolean(error)}>
  {#if label}<label for={inputId}>{label}</label>{/if}
  <textarea
    id={inputId}
    class={inputClass}
    {value}
    {placeholder}
    {rows}
    {disabled}
    aria-invalid={error ? 'true' : undefined}
    onchange={(e) => onChange(e.currentTarget.value)}
  ></textarea>
  {#if error}
    <p class="field-error" role="alert">{error}</p>
  {:else if hint}
    <p class="field-hint">{hint}</p>
  {/if}
</div>
