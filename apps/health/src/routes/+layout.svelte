<script>
  import '../app.css'
  import { onMount, setContext } from 'svelte'
  import { afterNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import LifeOsAppShell from '@life-os/platform-web/svelte/app-shell'
  import { ICON_REGISTRY_CONTEXT_KEY } from '@life-os/platform-web/icon-registry'
  import { bindViewportHeight, resetScrollLock } from '@life-os/theme'
  import AppBar from '$lib/components/AppBar.svelte'
  import DomainMusicHeader from '$lib/components/DomainMusicHeader.svelte'
  import SideNav from '$lib/components/SideNav.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import {
    markIosNativeShellDom,
    isIosNativeShell,
  } from '@life-os/platform-web/ios-native-shell'
  import {
    installHealthLeaveGuard,
    persistHealthContinue,
    suspendHealthSpace,
  } from '$lib/kenos/healthSpaceAdapter.js'
  import { ICONS } from '$lib/iconRegistry.js'
  import { S, applyTheme, bindAppThemeSystemChange } from '$lib/state.svelte.js'
  import { t, applyLocale } from '$lib/i18n/index.js'

  let { children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)
  /** URL param is reactive; session/flag covers SPA navigations that drop ?iosNativeShell=1. */
  const nativeShell = $derived(
    page.url.searchParams.get('iosNativeShell') === '1' || isIosNativeShell(),
  )

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p === '/settings') return t('settings.title')
    if (p.startsWith('/focus')) return t('focus.title')
    if (p.startsWith('/trends')) return t('trends.title')
    return t('now.title')
  })

  onMount(() => {
    markIosNativeShellDom()
    if (isIosNativeShell()) {
      installHealthLeaveGuard()
      persistHealthContinue(suspendHealthSpace())
    }
    applyTheme()
    applyLocale()
    const cleanupTheme = bindAppThemeSystemChange()
    const cleanupViewport = bindViewportHeight()
    return () => {
      cleanupTheme()
      cleanupViewport()
    }
  })

  $effect(() => {
    S.settings.locale
    applyLocale()
  })

  afterNavigate(() => {
    resetScrollLock()
  })
</script>

<svelte:head>
  <!-- 晋升为正式 app 后换成 <DocumentHead appId="…" {pageTitle} />（需先注册 site meta） -->
  <title>{pageTitle} · {t('app.name')}</title>
</svelte:head>

<LifeOsAppShell
  navigationKey={page.url.pathname}
  focusOnNavigate="main"
  skipLinkLabel={t('common.skipToContent')}
  testIdPrefix="health-shell"
>
  {#snippet navigation(projection)}
    {#if nativeShell}
      <!-- Single Health domain dock — do not split Focus/Status into separate domains -->
    {:else if projection === 'desktop'}
      <SideNav />
    {:else}
      <BottomNav />
    {/if}
  {/snippet}

  {#snippet header()}
    {#if !nativeShell}
      <AppBar title={pageTitle} />
    {/if}
  {/snippet}

  {#snippet main()}
    {#if nativeShell}
      <DomainMusicHeader
        title={pageTitle}
        domainLabel="Health"
        showCompose={page.url.pathname === '/'}
      />
    {/if}
    {@render children()}
  {/snippet}

  <!--
    扩展点（合同 v1.1，见 docs/architecture/life-os-app-shell.md）：
    - persistentOverlay：常驻底部部件（计时器 / 播放器），shell 自动为其量测底部清空
    - transientOverlay：Toast / 弹层 / 抽屉 / PortraitGate / SyncErrorBanner
    - shellClass + shellDataset：根级状态 CSS 钩子（沉浸路由、停靠面板等）
    - scrollMode="locked"：画布 / 编辑器类有界工作区
  -->
</LifeOsAppShell>

<style>
  /* Kenos Domain Mode — native dock is the only bottom bar */
  :global(html[data-ios-native-shell='true'] nav.bottom-nav),
  :global(
      html[data-ios-native-shell='true'] [data-testid='health-shell-bottom-nav']
    ) {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  :global(html[data-ios-native-shell='true']) {
    --mobile-tabbar-total-h: 0px;
    --bottom-chrome-h: 0px;
    --mobile-content-inset-tabbar: 0px;
    --safe-top-effective: 0px;
  }
  :global(html[data-ios-native-shell='true'] .life-os-app-shell__main),
  :global(html[data-ios-native-shell='true'] #main-content) {
    padding-top: 54px !important;
    padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
    box-sizing: border-box !important;
  }
  :global(html[data-ios-native-shell='true'] .domain-music-header) {
    padding-top: 0;
    padding-bottom: 8px;
    padding-inline: 16px;
  }
  :global(html[data-ios-native-shell='true'] .page-header),
  :global(html[data-ios-native-shell='true'] .topbar),
  :global(html[data-ios-native-shell='true'] header.app-header) {
    display: none !important;
  }
</style>
