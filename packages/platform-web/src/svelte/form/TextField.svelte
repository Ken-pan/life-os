<script>
  /**
   * Life OS TextField — 受控文本字段。
   * 外观来自 theme components.css 的 .field 族；错误/提示走 .field-error / .field-hint。
   */

  /**
   * @type {{
   *   label?: string,
   *   value: string,
   *   onChange: (value: string) => void,
   *   placeholder?: string,
   *   type?: 'text' | 'email' | 'password' | 'url' | 'search',
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
    type = 'text',
    hint = '',
    error = '',
    disabled = false,
    inputClass = '',
  } = $props()

  const inputId = $props.id()
</script>

<div class="field" class:field--error={Boolean(error)}>
  {#if label}<label for={inputId}>{label}</label>{/if}
  <input
    id={inputId}
    class={inputClass}
    {type}
    {value}
    {placeholder}
    {disabled}
    aria-invalid={error ? 'true' : undefined}
    onchange={(e) => onChange(e.currentTarget.value)}
  />
  {#if error}
    <p class="field-error" role="alert">{error}</p>
  {:else if hint}
    <p class="field-hint">{hint}</p>
  {/if}
</div>
