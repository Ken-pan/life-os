<script>
  import SettingsRow from '@life-os/platform-web/svelte/settings/row';
  import SettingsToggleRow from '@life-os/platform-web/svelte/settings/toggle-row';
  import { toast } from '$lib/ui.svelte.js';
  import { t } from '$lib/i18n/index.js';

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
  const denied = $derived(permission === 'denied');

  function showDeniedHelp() {
    toast(t('settings.notifyDeniedHelp'), 'warn');
  }
</script>

<SettingsRow label={statusLabel}>
  {#if canRequest}
    <button type="button" class="btn-secondary" onclick={onEnable}>{enableLabel}</button>
  {/if}
</SettingsRow>

{#if denied}
  <p class="settings-permission-hint">{t('settings.notifyDenied')}</p>
  <button type="button" class="btn-secondary settings-permission-action" onclick={showDeniedHelp}>
    {t('settings.notifyDeniedAction')}
  </button>
{/if}

{#if granted}
  <SettingsToggleRow
    label={toggleLabel}
    ariaLabel={toggleAriaLabel || toggleLabel}
    checked={enabled}
    onchange={onToggle}
  />
{/if}

<style>
  .settings-permission-hint {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    color: var(--t3);
    line-height: 1.45;
  }
  .settings-permission-action {
    width: 100%;
    margin-bottom: var(--space-2);
  }
</style>
