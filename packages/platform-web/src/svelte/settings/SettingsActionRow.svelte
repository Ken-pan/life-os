<script>
  import SettingsRow from './SettingsRow.svelte'

  /** @type {{ label: string, desc?: string, buttonLabel: string, disabled?: boolean, onclick?: () => void }} */
  let { label, desc = '', buttonLabel, disabled = false, onclick } = $props()
</script>

<SettingsRow {label} {desc}>
  <button type="button" class="btn-secondary" {disabled} {onclick}
    >{buttonLabel}</button
  >
</SettingsRow>
