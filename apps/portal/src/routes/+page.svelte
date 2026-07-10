<script>
  import { PORTAL_APPS, PORTAL_PRODUCTION_APPS } from '$lib/apps.js'
  import { auth } from '$lib/auth.svelte.js'
  import { getLastApp } from '$lib/recentApp.svelte.js'
  import { portalPreferences } from '$lib/portalPreferences.svelte.js'
  import {
    getCommandPaletteShortcutLabel,
    getModKeyLabel,
  } from '$lib/keyboardShortcut.js'
  import PortalLauncherCard from '$lib/components/PortalLauncherCard.svelte'
  import PortalSettings from '$lib/components/PortalSettings.svelte'
  import PortalPwaGuide from '$lib/components/PortalPwaGuide.svelte'
  import PortalTodaySummary from '$lib/components/PortalTodaySummary.svelte'
  import PortalLoading from '$lib/components/PortalLoading.svelte'
  import { buildPlannerInboxUrl } from '$lib/commandPaletteActions.js'

  const plannerInboxUrl = buildPlannerInboxUrl()

  const allowedKeys = $derived(auth.allowedAppKeys ?? [])
  const canOpenPlanner = $derived(allowedKeys.includes('planner'))

  const recentApp = $derived(getLastApp())
  const allowedRecentApp = $derived(
    recentApp && allowedKeys.includes(recentApp.id) ? recentApp : null,
  )

  const allowedProductionApps = $derived(
    PORTAL_PRODUCTION_APPS.filter((app) => allowedKeys.includes(app.id)),
  )
  const productionCount = $derived(allowedProductionApps.length)

  const allowedExperimentalApps = $derived(
    PORTAL_APPS.filter((app) => app.experimental && allowedKeys.includes(app.id)),
  )

  const gridApps = $derived(
    allowedRecentApp && !allowedRecentApp.experimental
      ? allowedProductionApps.filter((app) => app.id !== allowedRecentApp.id)
      : allowedProductionApps,
  )
  const experimentalGridApps = $derived(
    allowedRecentApp?.experimental
      ? allowedExperimentalApps.filter((app) => app.id !== allowedRecentApp.id)
      : allowedExperimentalApps,
  )

  const shortcutLabel = getCommandPaletteShortcutLabel()
  const modKey = getModKeyLabel()
  const userId = $derived(auth.user?.id ?? '')
</script>

<header class="page-header page-header--in-flow portal-page-header">
  <div class="titles">
    <h1 class="page-title">选择应用</h1>
    <p class="subtitle">
      在同一账号下切换 {productionCount} 个生产应用
      {#if allowedExperimentalApps.length > 0}
        · {allowedExperimentalApps.length} 个实验
      {/if}
    </p>
  </div>
</header>

<div
  class="portal-status-summary"
  role="status"
  aria-label={`Life OS 连接状态：账号已连接，${productionCount} 个生产应用可用，跨站 SSO 已启用${portalPreferences.pendingEvents ? `，${portalPreferences.pendingEvents} 条待处理事件` : ''}`}
>
  <span class="chip portal-status-chip portal-status-chip--ok">账号已连接</span>
  <span
    class="portal-status-detail"
    title="同一账号在 .kenos.space 子域间单点登录"
  >
    {productionCount} 个生产应用 · 跨站 SSO
    {#if canOpenPlanner && portalPreferences.pendingEvents != null && portalPreferences.pendingEvents > 0}
      · <a href={plannerInboxUrl} class="portal-pending-link"
        >{portalPreferences.pendingEvents} 条待处理事件</a
      >
    {/if}
  </span>
</div>

{#if userId}
  <PortalTodaySummary {userId} allowedAppKeys={allowedKeys} />
{/if}

{#if auth.allowedAppKeys === null}
  <div style="display:flex; justify-content:center; padding: 3rem 0;">
    <PortalLoading />
  </div>
{:else}
  {#if allowedRecentApp}
    <section class="portal-continue" aria-labelledby="portal-continue-title">
      <h2 id="portal-continue-title" class="portal-section-label">继续</h2>
      <PortalLauncherCard app={allowedRecentApp} variant="hero" />
    </section>
  {/if}

  <section class="portal-app-section" aria-labelledby="portal-apps-title">
    <h2 id="portal-apps-title" class="portal-section-label">
      {allowedRecentApp ? '其他应用' : '全部应用'}
    </h2>
    <div class="portal-app-grid">
      {#each gridApps as app (app.id)}
        <PortalLauncherCard {app} />
      {/each}
    </div>
  </section>

  {#if experimentalGridApps.length > 0}
    <section
      class="portal-app-section"
      aria-labelledby="portal-experimental-title"
    >
      <h2 id="portal-experimental-title" class="portal-section-label">实验</h2>
      <div class="portal-app-grid portal-app-grid--experimental">
        {#each experimentalGridApps as app (app.id)}
          <PortalLauncherCard {app} />
        {/each}
      </div>
    </section>
  {/if}
{/if}

{#if userId}
  <PortalSettings {userId} allowedAppKeys={allowedKeys} />
{/if}

<PortalPwaGuide />

<p class="portal-hint">
  按 <kbd>{modKey}</kbd><kbd>K</kbd> 或顶栏「搜索」快速跳转（{shortcutLabel}）
</p>
