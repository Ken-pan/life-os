<script>
  /**
   * Life OS CheckboxField — 受控复选框行。
   * 外观来自 theme components.css 的 .checkbox / .option-row。
   */

  /**
   * @type {{
   *   label: string,
   *   checked: boolean,
   *   onChange: (checked: boolean) => void,
   *   description?: string,
   *   disabled?: boolean
   * }}
   */
  let { label, checked, onChange, description = '', disabled = false } = $props()
</script>

<label class="option-row">
  <input
    class="checkbox"
    type="checkbox"
    {checked}
    {disabled}
    onchange={(e) => onChange(e.currentTarget.checked)}
  />
  <span>
    {label}
    {#if description}<span class="option-row__desc">{description}</span>{/if}
  </span>
</label>
