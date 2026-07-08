<script>
  import AppBrand from '@life-os/platform-web/svelte/brand'

  /** @type {{
   *   userEmail?: string | null,
   *   onSignOut?: () => void,
   *   onOpenCommandPalette?: () => void,
   * }} */
  let { userEmail = null, onSignOut, onOpenCommandPalette } = $props()
</script>

<header class="appbar portal-appbar">
  <div class="appbar-inner">
    <div class="appbar-leading">
      <AppBrand appId="portal" variant="appbar" ariaLabel="PORTAL.OS" />
    </div>
    <div class="appbar-trailing">
      {#if onOpenCommandPalette}
        <button
          type="button"
          class="btn-secondary portal-cmd-btn"
          onclick={onOpenCommandPalette}
          aria-label="打开命令面板（⌘K）"
        >
          <span class="portal-cmd-label">搜索</span>
          <kbd class="portal-cmd-kbd">⌘K</kbd>
        </button>
      {/if}
      {#if userEmail}
        <span class="portal-user-email" title={userEmail}>{userEmail}</span>
      {/if}
      {#if onSignOut}
        <button type="button" class="btn-secondary" onclick={onSignOut}>
          退出登录
        </button>
      {/if}
    </div>
  </div>
</header>
