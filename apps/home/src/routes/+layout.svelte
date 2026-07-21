<script>
  import '../app.css'
  import { onMount, setContext } from 'svelte'
  import { page } from '$app/state'
  import AppBar from '$lib/components/AppBar.svelte'
  import DomainMusicHeader from '$lib/components/DomainMusicHeader.svelte'
  import SideNav from '$lib/components/SideNav.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import {
    markIosNativeShellDom,
    isIosNativeShell,
  } from '@life-os/platform-web/ios-native-shell'
  import {
    installHomeLeaveGuard,
    persistHomeContinue,
    suspendHomeSpace,
  } from '$lib/kenos/homeSpaceAdapter.js'
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
  /** URL param is reactive; session/flag covers SPA navigations that drop ?iosNativeShell=1. */
  const nativeShell = $derived(
    page.url.searchParams.get('iosNativeShell') === '1' || isIosNativeShell(),
  )

  const planRoute = $derived(page.url.pathname === '/plan')
  // /storage 也是「地图页」:满屏画布 + 浮动搜索/清单面板,AppBar 让位给沉浸式,
  // 与 /plan 共用 plan-route 这套全出血骨架。
  const storageRoute = $derived(page.url.pathname === '/storage')
  // /tidy 现在自己有页内顶栏(HomeTopBar,与 /plan /storage 同一套语言),
  // 全局 AppBar(居中样式)让位,否则标题会出现两遍且视觉不统一。
  const tidyRoute = $derived(page.url.pathname.startsWith('/tidy'))
  const planImmersive = $derived(planRoute && getPlanImmersiveEdit())
  const mainClass = $derived(
    planRoute || storageRoute
      ? `wrap plan-route${planImmersive ? ' plan-immersive-edit' : ''}`
      : tidyRoute
        ? 'wrap tidy-route'
        : 'wrap',
  )

  const pageMeta = $derived.by(() => {
    const p = page.url.pathname
    const project = getActiveProject()
    // 「/」是通往 /plan 的重定向;重定向落地前的那一帧用同一份标题,免得标题栏闪一下
    if (p === '/' || p === '/plan') {
      const custom = getPlanSubtitle()
      return {
        title: '顶视平面',
        subtitle: planImmersive ? '' : custom || project.meta.nameZh || '储藏区可点击',
      }
    }
    // 「储藏审计」→「东西放哪」。没有人想审计自己的家 —— 审计是这个系统内部的说法
    // (它确实在做一件审计的事:把买过的东西和柜子对上)。但用户打开这一页时脑子里
    // 的句子是「我那个压力锅放哪了」,标题就该是那句话。
    // 副标题原本是「S1–S21 物品清单」:S1–S21 是储藏区的内部编号,第一次看见的人
    // 只会愣住 —— 编号在卡片和平面图上有用,当副标题就是拿内部主键当介绍词。
    if (p === '/storage') {
      // 页面标题是「储藏」;「东西放哪」这句口语留给页内搜索当引导文案
      return {
        title: '储藏',
        subtitle: '每个柜子里有什么',
      }
    }
    // /tidy 曾经漏在这张表外,标题一直落到最下面那个兜底的「HOME.OS」—— 别的页都有
    // 正经标题,就它顶着产品名。兜底值长得像个正常标题,是这个 bug 能活这么久的原因:
    // 它不像缺失,像设计。往这张表加路由时记得连标题一起加。
    if (p === '/tidy') return { title: '整理', subtitle: '按顺序做,一次一件' }
    if (p === '/tidy/go') return { title: '专注模式', subtitle: '' }
    if (p === '/settings') return { title: '设置', subtitle: '' }
    return { title: 'HOME.OS', subtitle: '' }
  })

  // Continuity resume — refresh on every Home route (room/item/organize context).
  $effect(() => {
    if (!nativeShell) return
    const path = page.url.pathname
    const search = page.url.search
    void path
    void search
    persistHomeContinue(
      suspendHomeSpace({ pathname: path, search }),
    )
  })

  onMount(() => {
    markIosNativeShellDom()
    if (isIosNativeShell()) {
      installHomeLeaveGuard()
      persistHomeContinue(suspendHomeSpace())
    }
    applyTheme()
    const cleanupAuth = initAuth()
    // 开发免登录同步:未登录的 localhost 窗口自动跟进云端优化副本
    // (生产构建 DEV=false,动态 import 连 chunk 都不会打进去)
    if (import.meta.env.DEV) {
      void import('$lib/dev-canonical.js').then((m) => m.maybeDevSyncCanonical())
    }
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
    {#if nativeShell}
      <!-- Domain Dock owns bottom chrome; 3D/storage canvas stays in page -->
    {:else if projection === 'desktop'}
      <SideNav />
    {:else}
      <BottomNav hidden={planImmersive} />
    {/if}
  {/snippet}

  {#snippet header()}
    {#if !nativeShell}
      <AppBar
        title={pageMeta.title}
        subtitle={pageMeta.subtitle}
        hidden={planRoute || storageRoute || tidyRoute}
      />
    {/if}
  {/snippet}

  {#snippet main()}
    {#if nativeShell && !(planRoute || storageRoute || tidyRoute)}
      <DomainMusicHeader title={pageMeta.title} domainLabel="Home" />
    {/if}
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

<style>
  /* Kenos Domain Mode — native dock is the only bottom bar */
  :global(html[data-ios-native-shell='true'] nav.bottom-nav),
  :global(
      html[data-ios-native-shell='true'] [data-testid='home-shell-bottom-nav']
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
    padding-top: 2px;
    padding-bottom: 12px;
    padding-inline: 16px;
  }
  :global(html[data-ios-native-shell='true'] .page-header),
  :global(html[data-ios-native-shell='true'] .topbar),
  :global(html[data-ios-native-shell='true'] header.app-header) {
    display: none !important;
  }
</style>
