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
    installLibraryLeaveGuard,
    persistLibraryContinue,
    suspendLibrarySpace,
  } from '$lib/kenos/knowledgeSpaceAdapter.js'
  import { ICONS } from '$lib/iconRegistry.js'
  import {
    S,
    applyTheme,
    bindAppThemeSystemChange,
    initBackend,
    startVaultWatcher,
    stopVaultWatcher,
  } from '$lib/state.svelte.js'
  import { initCloud, sb } from '$lib/cloud.svelte.js'
  import { installKenosAppLogs } from '@life-os/platform-web/kenos-app-logs'
  import { t, applyLocale } from '$lib/i18n/index.js'

  let { children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)

  // 笔记工作台（/library）走 locked：路由自拥有满高双列、各列独立滚动；其余页维持内容滚动。
  const scrollMode = $derived(
    page.url.pathname.startsWith('/library') ? 'locked' : 'content',
  )

  // 窄屏（单列）+ 已打开某条笔记时，顶栏「全部笔记」与文档区「← 全部笔记」返回键重复。
  // 单列发生在 life-os-main < 840，即 viewport < 840 + 侧栏 228 ≈ 1067；此时隐藏顶栏，交给文档区自己的返回。
  let narrowLayout = $state(false)
  const libraryDetail = $derived(
    page.url.pathname.startsWith('/library') &&
      page.url.searchParams.has('note'),
  )
  const hideHeader = $derived(libraryDetail && narrowLayout)
  /** URL param is reactive; session/flag covers SPA navigations that drop ?iosNativeShell=1. */
  const nativeShell = $derived(
    page.url.searchParams.get('iosNativeShell') === '1' || isIosNativeShell(),
  )

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p === '/settings') return t('settings.title')
    if (p.startsWith('/overview')) return t('overview.title')
    if (p.startsWith('/library')) return t('library.title')
    if (p.startsWith('/projects')) return t('projects.title')
    if (p.startsWith('/timeline')) return t('timeline.title')
    if (p.startsWith('/recall')) return t('nav.recall')
    return t('inbox.title')
  })

  onMount(() => {
    markIosNativeShellDom()
    if (isIosNativeShell()) {
      installLibraryLeaveGuard()
      persistLibraryContinue(suspendLibrarySpace())
    }
    applyTheme()
    applyLocale()
    initBackend().then(() => startVaultWatcher())
    initCloud()
    const cleanupTheme = bindAppThemeSystemChange()
    const cleanupViewport = bindViewportHeight()
    let cleanupDeepLink = () => {}
    void import('$lib/deepLink.js').then((m) =>
      m.bindKnowledgeDeepLinks().then((unsub) => {
        cleanupDeepLink = unsub
      }),
    )
    const mq = window.matchMedia('(max-width: 1067px)')
    const syncNarrow = () => {
      narrowLayout = mq.matches
    }
    syncNarrow()
    mq.addEventListener('change', syncNarrow)
    const disposeAppLogs = installKenosAppLogs({
      app: 'knowledge',
      getSupabase: () => sb,
    })
    return () => {
      cleanupTheme()
      cleanupViewport()
      cleanupDeepLink()
      disposeAppLogs()
      mq.removeEventListener('change', syncNarrow)
      stopVaultWatcher()
    }
  })

  $effect(() => {
    S.settings.locale
    applyLocale()
  })

  afterNavigate(() => {
    resetScrollLock()
    if (isIosNativeShell()) {
      persistLibraryContinue(suspendLibrarySpace())
    }
  })
</script>

<svelte:head>
  <!-- 晋升为正式 app 后换成 <DocumentHead appId="…" {pageTitle} />（需先注册 site meta） -->
  <title>{pageTitle} · {t('app.name')}</title>
</svelte:head>

<LifeOsAppShell
  navigationKey={page.url.pathname}
  focusOnNavigate="main"
  {scrollMode}
  skipLinkLabel={t('common.skipToContent')}
  testIdPrefix="knowledge-shell"
>
  {#snippet navigation(projection)}
    {#if nativeShell}
      <!-- Domain Dock owns bottom chrome -->
    {:else if projection === 'desktop'}
      <SideNav />
    {:else}
      <BottomNav />
    {/if}
  {/snippet}

  {#snippet header()}
    {#if !nativeShell}
      <AppBar title={pageTitle} hidden={hideHeader} />
    {/if}
  {/snippet}

  {#snippet main()}
    {#if nativeShell}
      <!-- Note detail: compact chrome keeps Quick Switch; list keeps full title + compose. -->
      <DomainMusicHeader
        title={pageTitle}
        domainLabel="Library"
        showCompose={!libraryDetail && page.url.pathname !== '/settings'}
        compact={hideHeader}
        composeLabel={t('common.newNote')}
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
      html[data-ios-native-shell='true']
        [data-testid='knowledge-shell-bottom-nav']
    ) {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /*
    Scroll-root pad (54 / 80+safe) is owned by KenosWebSurfaceView injection,
    with platform-web ensureIosNativeShellChromeCss() as browser fallback.
    Do not redeclare padding here — dual sources drift.
  */
  :global(html[data-ios-native-shell='true']) {
    --mobile-tabbar-total-h: 0px;
    --bottom-chrome-h: 0px;
    --mobile-content-inset-tabbar: 0px;
    --safe-top-effective: 0px;
  }
  /* Anchor for compact DomainMusicHeader overlay (note detail Quick Switch). */
  :global(html[data-ios-native-shell='true'] .life-os-app-shell__main) {
    position: relative;
  }
  :global(html[data-ios-native-shell='true'] .domain-music-header) {
    padding-top: 0;
    padding-bottom: 8px;
    padding-inline: 16px;
  }
  :global(html[data-ios-native-shell='true'] .domain-music-header.is-compact) {
    padding-inline: 0;
  }
  :global(html[data-ios-native-shell='true'] .page-header),
  :global(html[data-ios-native-shell='true'] .topbar),
  :global(html[data-ios-native-shell='true'] header.app-header) {
    display: none !important;
  }
</style>
