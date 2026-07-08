<script>
  import SettingsSection from '@life-os/platform-web/svelte/settings/section';
  import SettingsBackupRows from '@life-os/platform-web/svelte/settings/backup-rows';

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

<SettingsSection {title} {desc} testId="settings-backup">
  <SettingsBackupRows {exportLabel} {importLabel} {fileLabel} {onExport} {onImport} {importAccept} {disabled} />
  {@render children?.()}
</SettingsSection>
