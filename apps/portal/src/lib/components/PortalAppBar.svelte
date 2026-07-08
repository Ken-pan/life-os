<script>
  import LogoMark from './LogoMark.svelte'
  import AppBrandWordmark from '@life-os/platform-web/svelte/brand/wordmark'

  /** @type {{ onSignOut?: () => void }} */
  let { onSignOut } = $props()
</script>

<header class="appbar portal-appbar">
  <div class="appbar-inner">
    <div class="appbar-leading">
      <div class="brand appbar-brand" aria-label="HOME.OS">
        <LogoMark size={24} class="appbar-brand-mark" />
        <span class="appbar-brand-copy">
          <AppBrandWordmark base="HOME" class="appbar-brand-name" />
        </span>
      </div>
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
