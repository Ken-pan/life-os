<script>
  import LogoMark from './LogoMark.svelte'

  /** @type {{ onSignOut?: () => void }} */
  let { onSignOut } = $props()
</script>

<header class="appbar portal-appbar">
  <div class="appbar-inner">
    <div class="appbar-leading">
      <div class="brand appbar-brand" aria-label="HOME.OS">
        <LogoMark size={24} class="appbar-brand-mark" />
        <span class="appbar-brand-copy">
          <span class="appbar-brand-name">
            HOME<span class="brand-dot">.</span>OS
          </span>
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
