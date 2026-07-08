<script>
  import SettingsRow from './SettingsRow.svelte'

  /** @type {{ label: string, desc?: string, buttonLabel: string, disabled?: boolean, variant?: 'default' | 'danger', onclick?: () => void }} */
  let {
    label,
    desc = '',
    buttonLabel,
    disabled = false,
    variant = 'default',
    onclick,
  } = $props()

  const buttonClass = $derived(variant === 'danger' ? 'btn-danger' : 'btn-secondary')
</script>

<SettingsRow {label} {desc}>
  <button type="button" class={buttonClass} {disabled} {onclick}
    >{buttonLabel}</button
  >
</SettingsRow>
