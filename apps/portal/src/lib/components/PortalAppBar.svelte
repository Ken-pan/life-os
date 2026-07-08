<script>
  import AppBrand from '@life-os/platform-web/svelte/brand'

  /** @type {{ onSignOut?: () => void }} */
  let { onSignOut } = $props()
</script>

<header class="appbar portal-appbar">
  <div class="appbar-inner">
    <div class="appbar-leading">
      <AppBrand appId="portal" variant="appbar" ariaLabel="HOME.OS" />
    </div>
    <div class="appbar-trailing">
      {#if onSignOut}
        <button type="button" class="btn-secondary" onclick={onSignOut}>
          退出登录
        </button>
      {/if}
    </div>
  </div>
</header>
