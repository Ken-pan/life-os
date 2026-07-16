<script>
  /**
   * Life OS RadioGroupField — 受控单选组。
   * 外观来自 theme 的 .radio / .option-row；fieldset+legend 提供组语义。
   */

  /**
   * @type {{
   *   label?: string,
   *   value: string,
   *   options: Array<{ value: string, label: string, description?: string, disabled?: boolean }>,
   *   onChange: (value: string) => void,
   *   disabled?: boolean
   * }}
   */
  let { label = '', value, options, onChange, disabled = false } = $props()

  const name = $props.id()
</script>

<fieldset class="field" {disabled}>
  {#if label}<legend>{label}</legend>{/if}
  {#each options as option (option.value)}
    <label class="option-row">
      <input
        class="radio"
        type="radio"
        {name}
        value={option.value}
        checked={value === option.value}
        disabled={disabled || option.disabled}
        onchange={() => onChange(option.value)}
      />
      <span>
        {option.label}
        {#if option.description}<span class="option-row__desc">{option.description}</span>{/if}
      </span>
    </label>
  {/each}
</fieldset>
