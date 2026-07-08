<script>
  import { PORTAL_APPS, getLauncherMeta } from '$lib/apps.js'
  import { getLastApp } from '$lib/recentApp.js'
  import PortalLauncherCard from '$lib/components/PortalLauncherCard.svelte'

  const recentApp = $derived(getLastApp())
</script>

<header class="page-header portal-page-header">
  <div class="titles">
    <h1 class="page-title">选择应用</h1>
    <p class="subtitle">在同一账号下切换 {PORTAL_APPS.length} 个应用</p>
  </div>
</header>

<div class="portal-status-chips" role="status" aria-label="Life OS 连接状态">
  <span class="chip portal-status-chip portal-status-chip--ok">账号已连接</span>
  {#each PORTAL_APPS as app (app.id)}
    {@const meta = getLauncherMeta(app.id)}
    <span class="chip portal-status-chip" style="--portal-app-accent: {app.accent}">
      {meta.shortName} · SSO 就绪
    </span>
  {/each}
</div>

{#if recentApp}
  <section class="portal-continue" aria-labelledby="portal-continue-title">
    <h2 id="portal-continue-title" class="portal-section-label">继续</h2>
    <PortalLauncherCard app={recentApp} compact />
  </section>
{/if}

<section class="portal-app-section" aria-labelledby="portal-apps-title">
  <h2 id="portal-apps-title" class="portal-section-label">全部应用</h2>
  <div class="portal-app-grid">
    {#each PORTAL_APPS as app (app.id)}
      <PortalLauncherCard {app} />
    {/each}
  </div>
</section>

<p class="portal-hint">
  按 <kbd>⌘</kbd><kbd>K</kbd> 或顶栏「搜索」快速跳转
</p>
