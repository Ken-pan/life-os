<script>
  import '../app.css'
  import '$lib/styles/weight-controls.css'
  import { browser } from '$app/environment'
  import { onMount, setContext } from 'svelte'
  import { afterNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import AppBar from '$lib/components/AppBar.svelte'
  import DomainMusicHeader from '$lib/components/DomainMusicHeader.svelte'
  import SideNav from '$lib/components/SideNav.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import TimerWidget from '$lib/components/TimerWidget.svelte'
  import WeightModal from '$lib/components/WeightModal.svelte'
  import SetLogSheet from '$lib/components/SetLogSheet.svelte'
  import SkipModal from '$lib/components/SkipModal.svelte'
  import KnowledgeSheet from '$lib/components/KnowledgeSheet.svelte'
  import FitnessToolSheet from '$lib/components/FitnessToolSheet.svelte'
  import Toast from '$lib/components/Toast.svelte'
  import SyncErrorBanner from '@life-os/platform-web/svelte/sync-error'
  import PortraitGate from '@life-os/platform-web/svelte/portrait-gate'
  import DocumentHead from '@life-os/platform-web/svelte/head'
  import LifeOsAppShell from '@life-os/platform-web/svelte/app-shell'
  import { ICON_REGISTRY_CONTEXT_KEY } from '@life-os/platform-web/icon-registry'
  import { ICONS } from '$lib/iconRegistry.js'
  import { subscribeSyncError } from '$lib/syncNotify.js'
  import {
    S,
    save,
    applyTheme,
    bindAppThemeSystemChange,
  } from '$lib/state.svelte.js'
  import { auth, initAuth } from '$lib/auth.svelte.js'
  import { bindViewportHeight, resetScrollLock } from '@life-os/theme'
  import { bindNetworkResume } from '@life-os/platform-web/network-resume'
  import { shouldDeferFitnessForegroundSync } from '$lib/pwaResume.js'
  import {
    scheduleAutoCloudPush,
    scheduleBidirectionalSync,
  } from '$lib/sync.js'
  import { initTimer, timer } from '$lib/timer.svelte.js'
  import { registerServiceWorker } from '$lib/serviceWorker.js'
  import { requestPersistentStorage } from '@life-os/platform-web/persistent-storage'
  import { installKenosAppLogs } from '@life-os/platform-web/kenos-app-logs'
  import { supabase } from '$lib/supabase.js'
  import {
    markIosNativeShellDom,
    isIosNativeShell,
  } from '@life-os/platform-web/ios-native-shell'
  import { bindKenosShellSettings } from '@life-os/platform-web/kenos-shell-settings'
  import { installKenosFitnessBridge } from '$lib/kenos/fitnessSpaceAdapter.js'
  import { bindFitnessAudioCleanup } from '$lib/audio.js'
  import { getProgram } from '$lib/programRuntime.js'
  import { finalizeStaleSessions } from '$lib/session.js'
  import { todayDayId } from '$lib/state.svelte.js'
  import { toast } from '$lib/ui.svelte.js'
  import { t, applyLocale, setLocale } from '$lib/i18n/index.js'

  let { children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p === '/') return t('layout.titleToday')
    if (p === '/program') return t('layout.titleProgram')
    if (p === '/program/edit') return t('layout.titleProgramEdit')
    if (p === '/discover') return t('layout.titleDiscover')
    if (p === '/discover/tools') return t('layout.titleTools')
    if (p === '/discover/records') return t('layout.titleRecords')
    if (p === '/discover/stats') return t('layout.titleStats')
    if (p === '/library') return t('layout.titleLibrary')
    if (p === '/settings') return t('layout.titleSettings')
    if (p === '/auth') return t('layout.titleAuth')

    const dayMatch = p.match(/^\/day\/([^/]+)(?:\/(focus|summary))?$/)
    if (dayMatch) {
      const day = getProgram().days[dayMatch[1]]
      const cn = day?.cn ?? ''
      if (dayMatch[2] === 'focus') return t('layout.titleFocus', { day: cn })
      if (dayMatch[2] === 'summary')
        return t('layout.titleSummary', { day: cn })
      if (day) return t('layout.titleDayOverview', { day: cn })
    }

    return t('layout.titleDefault')
  })

  const documentLocale = $derived(S.settings.locale === 'en' ? 'en' : 'zh')

  /** True immersive surfaces — hide DomainMusicHeader; focus owns its own chrome. */
  const immersiveRoute = $derived(
    /\/focus$|\/summary$|^\/session$|^\/auth$/.test(page.url.pathname),
  )

  /** Web AppBar: hide on native shell, or on true immersive routes. */
  const appBarHidden = $derived(isIosNativeShell() || immersiveRoute)

  /** Drive native chrome-pad CSS (zero pad on immersive focus/summary/session). */
  $effect(() => {
    if (!browser) return
    const root = document.documentElement
    if (immersiveRoute) root.dataset.immersiveRoute = 'true'
    else delete root.dataset.immersiveRoute
    return () => {
      delete root.dataset.immersiveRoute
    }
  })

  /** Native DomainMusicHeader shares document title mapping (avoid empty → "Training"). */
  const appBarTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p === '/') return t('nav.today')
    if (p === '/program') return t('program.title')
    if (p === '/program/edit') return t('layout.titleProgramEdit')
    if (p === '/discover') return t('nav.discover')
    if (p === '/discover/tools') return t('layout.titleTools')
    if (p === '/discover/records') return t('layout.titleRecords')
    if (p === '/discover/stats') return t('layout.titleStats')
    if (p === '/library') return t('layout.titleLibrary')
    if (p === '/settings') return t('settings.title')
    if (p === '/auth') return t('auth.title')
    const dayMatch = p.match(/^\/day\/([^/]+)$/)
    if (dayMatch) {
      const day = getProgram().days[dayMatch[1]]
      if (day) return day.cn || day.name || pageTitle
    }
    return pageTitle
  })

  const appBarSubtitle = $derived.by(() => {
    if (page.url.pathname === '/program') return getProgram().meta.name
    return ''
  })

  const appBarMeta = $derived.by(() => {
    if (page.url.pathname !== '/') return ''
    const day = getProgram().days[todayDayId()]
    return t('home.appBarToday', { day: day?.cn ?? '' })
  })

  const appBarBack = $derived.by(() => {
    if (page.url.pathname === '/auth') {
      return { href: '/settings', label: t('nav.settings') }
    }
    return null
  })

  onMount(() => {
    markIosNativeShellDom()
    const cleanupShellSettings = bindKenosShellSettings({
      getTheme: () => S.settings.theme,
      setTheme: (theme) => {
        S.settings.theme = theme
        save()
      },
      applyTheme,
      getLocale: () => S.settings.locale,
      setLocale,
    })
    installKenosFitnessBridge()
    applyTheme()
    applyLocale()

    const { finalized } = finalizeStaleSessions()
    if (finalized) {
      const msg = t('layout.autoFinalize', { count: finalized })
      setTimeout(() => toast(msg), 1400)
      scheduleAutoCloudPush()
    }
    let cleanupTimer = () => {}
    const cleanupTheme = bindAppThemeSystemChange()
    const cleanupViewport = bindViewportHeight()

    cleanupTimer = initTimer()
    const cleanupAuth = initAuth()
    const cleanupAudio = bindFitnessAudioCleanup()

    const cleanupServiceWorker = registerServiceWorker()
    void requestPersistentStorage()
    const disposeAppLogs = installKenosAppLogs({
      app: 'fitness',
      getSupabase: () => supabase,
    })

    return () => {
      cleanupShellSettings()
      cleanupTheme()
      cleanupViewport()
      cleanupTimer()
      cleanupAuth()
      cleanupAudio()
      cleanupServiceWorker()
      disposeAppLogs()
    }
  })

  $effect(() => {
    S.settings.locale
    applyLocale()
  })

  /** 已登录时回到前台：视口立刻校正；专注/计时中延后云同步 */
  $effect(() => {
    if (!auth.ready || !auth.user) return
    return bindNetworkResume({
      onResume: () => scheduleBidirectionalSync(),
      shouldDefer: () =>
        shouldDeferFitnessForegroundSync(page.url.pathname, timer),
    })
  })

  afterNavigate(({ to }) => {
    resetScrollLock()

    // Standalone PWA scrolls inside #main-content, which SvelteKit does not
    // restore for us. Focus mode must always open at its own top chrome.
    if (to?.url.pathname.endsWith('/focus')) {
      const main = document.getElementById('main-content')
      if (main) {
        main.scrollTop = 0
        main.scrollLeft = 0
      }
    }
  })
</script>

<DocumentHead appId="fitness" {pageTitle} locale={documentLocale} />

<LifeOsAppShell
  navigationKey={page.url.pathname}
  focusOnNavigate="main"
  skipLinkLabel={t('common.skipToContent')}
  testIdPrefix="fitness-shell"
>
  {#snippet navigation(projection)}
    {#if projection === 'desktop'}
      <SideNav />
    {:else if !isIosNativeShell()}
      <BottomNav />
    {/if}
  {/snippet}

  {#snippet header()}
    {#if !isIosNativeShell()}
      <AppBar
        title={appBarTitle}
        subtitle={appBarSubtitle}
        meta={appBarMeta}
        backHref={appBarBack?.href}
        backLabel={appBarBack?.label}
        hidden={appBarHidden}
      />
    {/if}
  {/snippet}

  {#snippet main()}
    {#if isIosNativeShell() && !immersiveRoute}
      <!-- Training primary action is the Today CTA; space switching is Shelf-only — no add/search affordances in domain header. -->
      <DomainMusicHeader
        title={appBarTitle}
        domainLabel="Training"
        showCompose={false}
      />
    {/if}
    {@render children()}
  {/snippet}

  {#snippet persistentOverlay()}
    <TimerWidget />
  {/snippet}

  {#snippet transientOverlay()}
    <SyncErrorBanner
      subscribe={subscribeSyncError}
      formatMessage={(reason) => t('sync.banner', { reason })}
      dismissLabel={t('common.close')}
    />
    <PortraitGate
      enabled={S.settings.lockPortraitOnPhone !== false}
      title={t('settings.rotatePortrait')}
      hint={t('settings.rotatePortraitHint')}
      ariaLabel={t('settings.rotatePortrait')}
    />
    <WeightModal />
    <SetLogSheet />
    <SkipModal />
    <KnowledgeSheet />
    <FitnessToolSheet />
    <Toast />
  {/snippet}
</LifeOsAppShell>

<style>
  /* Kenos Domain Mode — native dock is the only bottom bar */
  :global(html[data-ios-native-shell='true'] nav.bottom-nav),
  :global(
      html[data-ios-native-shell='true']
        [data-testid='fitness-shell-bottom-nav']
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
    --mobile-content-inset: 0px;
    --mobile-content-inset-tabbar: 0px;
    /* Status clearance comes from shell padding-top:54 — don't also inflate safe-top. */
    --safe-top-effective: 0px;
  }
  /* Immersive focus/summary/session: no Kenos chrome pad; focus owns safe areas.
   * !important — must beat #kenos-ios-native-shell-css `--safe-top-effective:0`. */
  :global(html[data-ios-native-shell='true'][data-immersive-route='true']) {
    --safe-top-effective: env(safe-area-inset-top, 0px) !important;
    --safe-top: env(safe-area-inset-top, 0px) !important;
  }
  /* ONE scroll-root pad — match KenosWebChrome; never also pad nested .page. */
  :global(html[data-ios-native-shell='true'] .life-os-app-shell__main),
  :global(html[data-ios-native-shell='true'] #main-content) {
    padding-top: var(--kenos-chrome-top-inset, 54px) !important;
    padding-bottom: calc(
      env(safe-area-inset-bottom, 0px) + var(--kenos-dock-scroll-end-pad, 78px)
    ) !important;
    scroll-padding-bottom: calc(
      env(safe-area-inset-bottom, 0px) + var(--kenos-dock-scroll-end-pad, 78px)
    ) !important;
    box-sizing: border-box !important;
  }
  :global(
      html[data-ios-native-shell='true'][data-immersive-route='true']
        .life-os-app-shell__main
    ),
  :global(
      html[data-ios-native-shell='true'][data-immersive-route='true']
        #main-content
    ) {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }
  :global(html[data-ios-native-shell='true'] .page) {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }
  :global(html[data-ios-native-shell='true'] .domain-music-header) {
    padding-top: 0;
    padding-bottom: var(--kenos-chrome-header-pad-bottom, 8px);
    padding-inline: var(--kenos-chrome-inline, 16px);
  }
  :global(html[data-ios-native-shell='true'] .page-header),
  :global(html[data-ios-native-shell='true'] .topbar),
  :global(html[data-ios-native-shell='true'] header.app-header) {
    /* DomainMusicHeader owns top chrome — avoid double headers */
    display: none !important;
  }
</style>
