<script>
  import SettingsRow from '@life-os/platform-web/svelte/settings/row';
  import SettingsToggleRow from '@life-os/platform-web/svelte/settings/toggle-row';

  /**
   * @type {{
   *   statusLabel: string,
   *   enableLabel: string,
   *   toggleLabel: string,
   *   toggleAriaLabel?: string,
   *   permission?: 'granted' | 'denied' | 'default' | string,
   *   enabled?: boolean,
   *   onEnable?: () => void,
   *   onToggle?: (checked: boolean) => void
   * }}
   */
  let {
    statusLabel,
    enableLabel,
    toggleLabel,
    toggleAriaLabel = '',
    permission = 'default',
    enabled = false,
    onEnable,
    onToggle
  } = $props();

  const granted = $derived(permission === 'granted');
  const canRequest = $derived(permission === 'default');
</script>

<SettingsRow label={statusLabel}>
  {#if canRequest}
    <button type="button" class="btn-secondary" onclick={onEnable}>{enableLabel}</button>
  {/if}
</SettingsRow>

{#if granted}
  <SettingsToggleRow
    label={toggleLabel}
    ariaLabel={toggleAriaLabel || toggleLabel}
    checked={enabled}
    onchange={onToggle}
  />
{/if}
