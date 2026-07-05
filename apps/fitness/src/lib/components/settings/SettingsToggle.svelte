<script>
  /** @type {{ checked?: boolean, disabled?: boolean, ariaLabel?: string, onchange?: (checked: boolean) => void }} */
  let { checked = false, disabled = false, ariaLabel = '', onchange } = $props();

  function toggle() {
    if (disabled) return;
    onchange?.(!checked);
  }
</script>

<div
  class="toggle settings-toggle"
  class:on={checked}
  class:disabled
  role="switch"
  aria-label={ariaLabel || undefined}
  aria-checked={checked}
  aria-disabled={disabled}
  tabindex={disabled ? -1 : 0}
  onclick={toggle}
  onkeydown={(e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  }}
></div>
