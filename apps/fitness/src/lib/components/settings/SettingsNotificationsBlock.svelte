<script>
  import SettingsSection from './SettingsSection.svelte';
  import SettingsNotificationsRows from './SettingsNotificationsRows.svelte';

  /**
   * @type {{
   *   title: string,
   *   desc?: string,
   *   statusLabel: string,
   *   enableLabel: string,
   *   toggleLabel: string,
   *   toggleAriaLabel?: string,
   *   permission?: string,
   *   enabled?: boolean,
   *   onEnable?: () => void,
   *   onToggle?: (checked: boolean) => void
   * }}
   */
  let {
    title,
    desc = '',
    statusLabel,
    enableLabel,
    toggleLabel,
    toggleAriaLabel = '',
    permission = 'default',
    enabled = false,
    onEnable,
    onToggle
  } = $props();
</script>

<SettingsSection {title} {desc} testId="settings-notifications">
  <SettingsNotificationsRows
    {statusLabel}
    {enableLabel}
    {toggleLabel}
    {toggleAriaLabel}
    {permission}
    {enabled}
    {onEnable}
    {onToggle}
  />
</SettingsSection>
