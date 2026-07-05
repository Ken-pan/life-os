<script>
  import SettingsSection from './SettingsSection.svelte';
  import SettingsBackupRows from './SettingsBackupRows.svelte';

  /**
   * @type {{
   *   title: string,
   *   desc?: string,
   *   exportLabel: string,
   *   importLabel: string,
   *   fileLabel: string,
   *   onExport?: () => void,
   *   onImport?: (event: Event) => void,
   *   importAccept?: string,
   *   disabled?: boolean,
   *   children?: import('svelte').Snippet
   * }}
   */
  let {
    title,
    desc = '',
    exportLabel,
    importLabel,
    fileLabel,
    onExport,
    onImport,
    importAccept,
    disabled = false,
    children
  } = $props();
</script>

<SettingsSection {title} {desc} testId="settings-backup" collapsible collapseOnMobile>
  <SettingsBackupRows {exportLabel} {importLabel} {fileLabel} {onExport} {onImport} {importAccept} {disabled} />
  {@render children?.()}
</SettingsSection>
