<script>
  import PortalAppBar from './PortalAppBar.svelte'

  /** @type {{
   *   centerContent?: boolean,
   *   userEmail?: string | null,
   *   onSignOut?: () => void,
   *   onOpenCommandPalette?: () => void,
   *   children: import('svelte').Snippet,
   * }} */
  let {
    centerContent = false,
    userEmail = null,
    onSignOut,
    onOpenCommandPalette,
    children,
  } = $props()
</script>

<div class="app app-shell portal-shell">
  <a class="portal-skip-link" href="#portal-main">跳到主内容</a>
  <div class="safari-chrome-tint-top" aria-hidden="true"></div>
  <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>
  <div class="main-col" data-mobile-chrome="minimal" class:portal-main-col--center={centerContent}>
    <PortalAppBar {userEmail} {onSignOut} {onOpenCommandPalette} />
    {#if centerContent}
      <div class="portal-unauth-stage">
        <main id="portal-main" class="wrap portal-wrap portal-wrap--center">
          {@render children()}
        </main>
      </div>
    {:else}
      <main id="portal-main" class="wrap portal-wrap">
        {@render children()}
      </main>
    {/if}
  </div>
</div>
