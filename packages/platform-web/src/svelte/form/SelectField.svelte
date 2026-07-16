<script>
  /**
   * Life OS SelectField — 受控下拉选择字段。
   */

  /**
   * @type {{
   *   label?: string,
   *   value: string,
   *   options: Array<{ value: string, label: string, disabled?: boolean }>,
   *   onChange: (value: string) => void,
   *   hint?: string,
   *   error?: string,
   *   disabled?: boolean,
   *   inputClass?: string
   * }}
   */
  let {
    label = '',
    value,
    options,
    onChange,
    hint = '',
    error = '',
    disabled = false,
    inputClass = '',
  } = $props()

  const inputId = $props.id()
</script>

<div class="field" class:field--error={Boolean(error)}>
  {#if label}<label for={inputId}>{label}</label>{/if}
  <select
    id={inputId}
    class={inputClass}
    {value}
    {disabled}
    aria-invalid={error ? 'true' : undefined}
    onchange={(e) => onChange(e.currentTarget.value)}
  >
    {#each options as o (o.value)}
      <option value={o.value} disabled={o.disabled}>{o.label}</option>
    {/each}
  </select>
  {#if error}
    <p class="field-error" role="alert">{error}</p>
  {:else if hint}
    <p class="field-hint">{hint}</p>
  {/if}
</div>
