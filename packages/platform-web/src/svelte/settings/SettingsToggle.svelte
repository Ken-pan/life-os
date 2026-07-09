<script>
  /** @type {{ checked?: boolean, disabled?: boolean, ariaLabel?: string, onchange?: (checked: boolean) => void }} */
  let { checked = false, disabled = false, ariaLabel = '', onchange } = $props()

  function toggle() {
    if (disabled) return
    onchange?.(!checked)
  }
</script>

<button
  type="button"
  class="toggle settings-toggle"
  class:on={checked}
  class:disabled
  role="switch"
  aria-label={ariaLabel || undefined}
  aria-checked={checked}
  {disabled}
  onclick={toggle}
></button>
