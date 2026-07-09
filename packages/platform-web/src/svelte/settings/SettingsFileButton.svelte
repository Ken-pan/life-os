<script>
  /** @type {{ label: string, accept?: string, disabled?: boolean, onchange?: (event: Event) => void }} */
  let {
    label,
    accept = 'application/json',
    disabled = false,
    onchange,
  } = $props()
</script>

<label class="file-input-btn btn-secondary">
  {label}
  <input
    type="file"
    {accept}
    {disabled}
    {onchange}
    aria-hidden="true"
    tabindex="-1"
  />
</label>
