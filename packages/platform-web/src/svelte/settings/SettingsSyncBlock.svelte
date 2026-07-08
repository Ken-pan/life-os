<script>
  import SettingsSection from './SettingsSection.svelte'
  import SettingsStackBlock from './SettingsStackBlock.svelte'
  import SettingsButtonGroup from './SettingsButtonGroup.svelte'
  import SettingsToggleRow from './SettingsToggleRow.svelte'

  /**
   * @type {{
   *   title: string,
   *   unavailableDesc?: string,
   *   signedOutDesc?: string,
   *   signedOutLabel?: string,
   *   signedInDesc?: string,
   *   email?: string,
   *   configured?: boolean,
   *   signedIn?: boolean,
   *   autoSync?: boolean,
   *   autoSyncLabel?: string,
   *   signInLabel?: string,
   *   signInHref?: string,
   *   signInClass?: string,
   *   onAutoSyncChange?: (checked: boolean) => void,
   *   actions?: import('svelte').Snippet,
   *   footer?: import('svelte').Snippet
   * }}
   */
  let {
    title,
    unavailableDesc = '',
    signedOutDesc = '',
    signedOutLabel = '',
    signedInDesc = '',
    email = '',
    configured = true,
    signedIn = false,
    autoSync = false,
    autoSyncLabel = '',
    signInLabel = '',
    signInHref = '/auth',
    signInClass = 'btn-primary auth-link',
    onAutoSyncChange,
    actions,
    footer,
  } = $props()
</script>

<SettingsSection {title} testId="settings-sync">
  {#if !configured}
    <p class="block-desc">{unavailableDesc}</p>
  {:else if signedIn}
    <SettingsStackBlock label={email} desc={signedInDesc}>
      <SettingsButtonGroup>
        {@render actions?.()}
      </SettingsButtonGroup>
    </SettingsStackBlock>
    {#if autoSyncLabel}
      <SettingsToggleRow
        label={autoSyncLabel}
        checked={autoSync}
        onchange={(checked) => onAutoSyncChange?.(checked)}
      />
    {/if}
    {@render footer?.()}
  {:else if signedOutLabel}
    <SettingsStackBlock label={signedOutLabel} desc={signedOutDesc}>
      <a class={signInClass} href={signInHref}>{signInLabel}</a>
    </SettingsStackBlock>
  {:else}
    <p class="block-desc">{signedOutDesc}</p>
    <a class={signInClass} href={signInHref}>{signInLabel}</a>
  {/if}
</SettingsSection>
