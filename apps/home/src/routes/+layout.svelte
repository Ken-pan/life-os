<script>
  import '../app.css'
  import { onMount, setContext } from 'svelte'
  import { page } from '$app/state'
  import AppBar from '$lib/components/AppBar.svelte'
  import SideNav from '$lib/components/SideNav.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import Toast from '$lib/components/Toast.svelte'
  import DocumentHead from '@life-os/platform-web/svelte/head'
  import PortraitGate from '@life-os/platform-web/svelte/portrait-gate'
  import LifeOsAppShell from '@life-os/platform-web/svelte/app-shell'
  import { ICON_REGISTRY_CONTEXT_KEY } from '@life-os/platform-web/icon-registry'
  import { ICONS } from '$lib/iconRegistry.js'
  import {
    applyTheme,
    bindAppThemeSystemChange,
    S,
    getActiveProject,
    getPlanSubtitle,
    getPlanImmersiveEdit,
  } from '$lib/state.svelte.js'

  import { bindViewportHeight } from '@life-os/theme'
  import { bindNetworkResume } from '@life-os/platform-web/network-resume'
  import { initAuth, auth } from '$lib/auth.svelte.js'
  import { registerServiceWorker } from '$lib/serviceWorker.js'
  import { requestPersistentStorage } from '@life-os/platform-web/persistent-storage'
  import {
    bindLifeOsPresence,
    touchLifeOsPresence,
  } from '$lib/lifeOsPresence.js'
  import { scheduleHomePortalMetadataSync } from '$lib/homePortalMetadata.js'

  let { children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)

  const planRoute = $derived(page.url.pathname === '/plan')
  const planImmersive = $derived(planRoute && getPlanImmersiveEdit())
  const mainClass = $derived(
    planRoute
      ? `wrap plan-route${planImmersive ? ' plan-immersive-edit' : ''}`
      : 'wrap',
  )

  const pageMeta = $derived.by(() => {
    const p = page.url.pathname
    const project = getActiveProject()
    if (p === '/') {
      return {
        title: '空间概览',
        subtitle: project.meta.nameZh,
      }
    }
    if (p === '/plan') {
      const custom = getPlanSubtitle()
      return {
        title: '顶视平面',
        subtitle: planImmersive ? '' : custom || '储藏区可点击',
      }
    }
    if (p === '/storage') {
      return {
        title: '储藏审计',
        subtitle: `S1–S${project.storageZones.length} 物品清单`,
      }
    }
    if (p === '/settings') return { title: '设置', subtitle: '' }
    return { title: 'HOME.OS', subtitle: '' }
  })

  onMount(() => {
    applyTheme()
    const cleanupAuth = initAuth()
    const cleanupViewport = bindViewportHeight()
    const cleanupTheme = bindAppThemeSystemChange()
    const cleanupSw = registerServiceWorker()
    void requestPersistentStorage()
    const cleanupPresence = bindLifeOsPresence()
    const cleanupForeground = bindNetworkResume({
      onResume: () => {
        if (auth.ready && auth.user) {
          touchLifeOsPresence()
          scheduleHomePortalMetadataSync(getActiveProject().storageZones.length)
        }
      },
    })
    return () => {
      cleanupAuth()
      cleanupViewport()
      cleanupTheme()
      cleanupSw()
      cleanupPresence()
      cleanupForeground()
    }
  })

  $effect(() => {
    if (auth.ready && auth.user) {
      touchLifeOsPresence()
      scheduleHomePortalMetadataSync(getActiveProject().storageZones.length)
    }
  })
</script>

<DocumentHead appId="home" pageTitle={pageMeta.title} />

<LifeOsAppShell
  scrollMode={planImmersive ? 'locked' : 'content'}
  navigationKey={page.url.pathname}
  focusOnNavigate="main"
  {mainClass}
  mainLabel="HOME.OS 主内容"
  skipLinkLabel="跳到主内容"
  testIdPrefix="home-shell"
>
  {#snippet navigation(projection)}
    {#if projection === 'desktop'}
      <SideNav />
    {:else}
      <BottomNav hidden={planImmersive} />
    {/if}
  {/snippet}

  {#snippet header()}
    <AppBar
      title={pageMeta.title}
      subtitle={pageMeta.subtitle}
      hidden={planRoute}
    />
  {/snippet}

  {#snippet main()}
    {@render children()}
  {/snippet}

  {#snippet transientOverlay()}
    <Toast />
    {#if S.settings.lockPortraitOnPhone}
      <PortraitGate
        enabled={true}
        title="请旋转设备"
        hint="平面图在横屏下查看更清晰；可在设置中关闭竖屏锁定"
        ariaLabel="竖屏锁定提示"
      />
    {/if}
  {/snippet}
</LifeOsAppShell>
