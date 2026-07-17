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
  /* .set-group 契约:容器零内边距、行自担 --inset-inline。
     denied 态的 hint/action 是裸的直接子元素,必须自带横向 inset,
     否则会顶到卡片边缘(文字/按钮全宽出血,看着像溢出卡片外)。 */
  .settings-permission-hint {
    margin: 0 0 var(--space-2);
    padding-inline: var(--inset-inline);
    font-size: var(--text-sm);
    color: var(--t3);
    line-height: 1.45;
  }
  .settings-permission-action {
    box-sizing: border-box;
    width: calc(100% - 2 * var(--inset-inline));
    margin-inline: var(--inset-inline);
    margin-bottom: var(--space-2);
  }
</style>
