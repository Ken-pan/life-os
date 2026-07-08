<script>
  import SettingsRow from './SettingsRow.svelte'
  import SettingsToggle from './SettingsToggle.svelte'

  /** @type {{ label: string, desc?: string, checked?: boolean, disabled?: boolean, ariaLabel?: string, onchange?: (checked: boolean) => void }} */
  let {
    label,
    desc = '',
    checked = false,
    disabled = false,
    ariaLabel = '',
    onchange,
  } = $props()
</script>

<SettingsRow {label} {desc}>
  <SettingsToggle
    {checked}
    {disabled}
    ariaLabel={ariaLabel || label}
    {onchange}
  />
</SettingsRow>
