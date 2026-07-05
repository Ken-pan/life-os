<script>
  import SettingsRow from './SettingsRow.svelte';
  import SettingsFileButton from './SettingsFileButton.svelte';

  /**
   * @type {{
   *   exportLabel: string,
   *   importLabel: string,
   *   fileLabel: string,
   *   onExport?: () => void,
   *   onImport?: (event: Event) => void,
   *   importAccept?: string,
   *   disabled?: boolean
   * }}
   */
  let {
    exportLabel,
    importLabel,
    fileLabel,
    onExport,
    onImport,
    importAccept = 'application/json',
    disabled = false
  } = $props();
</script>

<SettingsRow label={exportLabel}>
  <button type="button" class="btn-secondary" {disabled} onclick={onExport}>{exportLabel}</button>
</SettingsRow>

<SettingsRow label={importLabel}>
  <SettingsFileButton label={fileLabel} accept={importAccept} {disabled} onchange={onImport} />
</SettingsRow>
