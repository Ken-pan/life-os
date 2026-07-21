<script>
  import SettingsSection from './SettingsSection.svelte'
  import SettingsStackBlock from './SettingsStackBlock.svelte'
  import SettingsButtonGroup from './SettingsButtonGroup.svelte'
  import SettingsToggleRow from './SettingsToggleRow.svelte'

  /**
   * Shared Life OS account / sync settings block.
   * Use `signedOut` snippet for inline login forms (Home / Knowledge / AIOS).
   * Use `signInHref` for apps with a dedicated `/auth` route.
   *
   * @type {{
   *   title: string,
   *   id?: string,
   *   unavailableDesc?: string,
   *   signedOutDesc?: string,
   *   signedOutLabel?: string,
   *   ssoHint?: string,
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
   *   footer?: import('svelte').Snippet,
   *   signedOut?: import('svelte').Snippet
   * }}
   */
  let {
    title,
    id = 'cloud',
    unavailableDesc = '',
    signedOutDesc = '',
    signedOutLabel = '',
    ssoHint = '',
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
    signedOut,
  } = $props()
</script>

<SettingsSection {title} {id} testId="settings-sync">
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
  {:else if signedOut}
    {#if signedOutDesc}
      <p class="block-desc">{signedOutDesc}</p>
    {/if}
    {#if ssoHint}
      <p class="block-desc">{ssoHint}</p>
    {/if}
    {@render signedOut()}
  {:else if signedOutLabel}
    <SettingsStackBlock label={signedOutLabel} desc={signedOutDesc}>
      <a class={signInClass} href={signInHref}>{signInLabel}</a>
    </SettingsStackBlock>
    {#if ssoHint}
      <p class="block-desc">{ssoHint}</p>
    {/if}
  {:else}
    <p class="block-desc">{signedOutDesc}</p>
    {#if ssoHint}
      <p class="block-desc">{ssoHint}</p>
    {/if}
    <a class={signInClass} href={signInHref}>{signInLabel}</a>
  {/if}
</SettingsSection>
