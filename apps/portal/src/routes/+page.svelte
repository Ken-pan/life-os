<script>
  import { PORTAL_APPS } from '$lib/apps.js'
  import { getLastApp } from '$lib/recentApp.svelte.js'
  import { getCommandPaletteShortcutLabel, getModKeyLabel } from '$lib/keyboardShortcut.js'
  import PortalLauncherCard from '$lib/components/PortalLauncherCard.svelte'

  const recentApp = $derived(getLastApp())
  const gridApps = $derived(
    recentApp ? PORTAL_APPS.filter((app) => app.id !== recentApp.id) : PORTAL_APPS,
  )
  const shortcutLabel = getCommandPaletteShortcutLabel()
  const modKey = getModKeyLabel()
</script>

<header class="page-header portal-page-header">
  <div class="titles">
    <h1 class="page-title">选择应用</h1>
    <p class="subtitle">在同一账号下切换 {PORTAL_APPS.length} 个应用</p>
  </div>
</header>

  <div
  class="portal-status-summary"
  role="status"
  aria-label={`Life OS 连接状态：账号已连接，${PORTAL_APPS.length} 个应用可用，跨站 SSO 已启用`}
>
  <span class="chip portal-status-chip portal-status-chip--ok">账号已连接</span>
  <span class="portal-status-detail" title="同一账号在 .kenos.space 子域间单点登录">
    {PORTAL_APPS.length} 个应用可用 · 跨站 SSO
  </span>
</div>

{#if recentApp}
  <section class="portal-continue" aria-labelledby="portal-continue-title">
    <h2 id="portal-continue-title" class="portal-section-label">继续</h2>
    <PortalLauncherCard app={recentApp} variant="hero" />
  </section>
{/if}

<section class="portal-app-section" aria-labelledby="portal-apps-title">
  <h2 id="portal-apps-title" class="portal-section-label">
    {recentApp ? '其他应用' : '全部应用'}
  </h2>
  <div class="portal-app-grid">
    {#each gridApps as app (app.id)}
      <PortalLauncherCard {app} />
    {/each}
  </div>
</section>

<p class="portal-hint">
  按 <kbd>{modKey}</kbd><kbd>K</kbd> 或顶栏「搜索」快速跳转（{shortcutLabel}）
</p>
