<script>
  import '../app.css'
  import { browser } from '$app/environment'
  import { onMount, setContext } from 'svelte'
  import { onNavigate, afterNavigate } from '$app/navigation'
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
    installMusicLeaveGuard,
    persistMusicContinue,
    suspendMusicSpace,
  } from '$lib/kenos/musicSpaceAdapter.js'
  import MiniPlayer from '$lib/components/MiniPlayer.svelte'
  import QueueDrawer from '$lib/components/QueueDrawer.svelte'
  import UtilityPane from '$lib/components/UtilityPane.svelte'
  import Toast from '$lib/components/Toast.svelte'
  import NowPlayingOverlay from '$lib/components/NowPlayingOverlay.svelte'
  import ConnectivitySyncStatus from '$lib/components/ConnectivitySyncStatus.svelte'
  import SyncErrorBanner from '@life-os/platform-web/svelte/sync-error'
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
  import { applyLocale, setLocale, t } from '$lib/i18n/index.js'
  import { bindKenosShellSettings } from '@life-os/platform-web/kenos-shell-settings'
  import {
    resolvePageTitle,
    resolvePageBack,
    isNavChromeHidden,
    isMiniPlayerHidden,
    isWideContentRoute,
  } from '$lib/nav.js'
  import { pageChrome, resetPageChrome } from '$lib/pageChrome.svelte.js'
  import { player } from '$lib/player.svelte.js'
  import {
    applyTrackAmbience,
    refreshImmersiveChrome,
  } from '$lib/trackAmbience.js'
  import { ensureBuiltinPlaylists, ensureAlbumArtCache } from '$lib/db.js'
  import {
    scheduleLibraryMaintenance,
    scheduleAutoLyricsBackfill,
  } from '$lib/import.js'
  import { initAuth, auth } from '$lib/auth.svelte.js'
  import {
    bindViewportHeight,
    isLifeOsMobile,
    resetScrollLock,
  } from '@life-os/theme'
  import { flushPendingSync, syncBidirectional } from '$lib/sync.js'
  import { bindConnectivity } from '$lib/connectivity.svelte.js'
  import { bindBackgroundPlayback } from '$lib/backgroundAudio.js'
  import { registerServiceWorker } from '$lib/serviceWorker.js'
  import { bindNetworkResume } from '@life-os/platform-web/network-resume'
  import { setAppBadgeCount } from '@life-os/platform-web/app-badge'
  import { requestPersistentStorage } from '@life-os/platform-web/persistent-storage'
  import { installKenosAppLogs } from '@life-os/platform-web/kenos-app-logs'
  import { supabase } from '$lib/supabase.js'
  import { backgroundActivity } from '$lib/backgroundActivity.svelte.js'
  import { bindPrecacheActivityAck } from '$lib/audioPrecache.js'
  import { refreshExpiringSignedUrls } from '$lib/cloudAudio.js'
  import {
    bindGlobalShortcuts,
    registerShortcutHandlers,
  } from '$lib/shortcuts.js'
  import {
    utilityPane,
    closeUtilityPane,
    initRecDebug,
    installRecDebugConsole,
    initUtilityPaneWidth,
    nowPlaying,
  } from '$lib/ui.svelte.js'

  let { children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)

  /** @type {HTMLInputElement | null} */
  let searchInput = $state(null)

  const appBarHidden = $derived(isNavChromeHidden(page.url.pathname))
  const pageTitle = $derived(
    pageChrome.title ??
      (appBarHidden ? undefined : resolvePageTitle(page.url.pathname, t)),
  )
  const appBarSubtitle = $derived(pageChrome.subtitle ?? undefined)
  const appBarBackHref = $derived(
    pageChrome.backHref ?? resolvePageBack(page.url.pathname) ?? undefined,
  )
  const appBarBackLabel = $derived(pageChrome.backLabel ?? undefined)
  const playerChrome = $derived(
    (player.queue[player.index] ?? null) &&
      !isMiniPlayerHidden(page.url.pathname) &&
      !nowPlaying.open
      ? 'mini'
      : 'none',
  )
  const pageRoute = $derived(
    page.url.pathname.startsWith('/now-playing') ? 'now-playing' : undefined,
  )
  const immersiveMode = $derived(
    pageRoute === 'now-playing' ? S.settings.immersiveViewMode : undefined,
  )
  const wideContent = $derived(isWideContentRoute(page.url.pathname))
  const onNowPlaying = $derived(page.url.pathname.startsWith('/now-playing'))
  const utilityOpen = $derived(utilityPane.open && !onNowPlaying)
  /** URL param is reactive; session/flag covers SPA navigations that drop ?iosNativeShell=1. */
  const nativeShell = $derived(
    page.url.searchParams.get('iosNativeShell') === '1' || isIosNativeShell(),
  )
  /** Compose → Import; hide on import itself, settings, auth, now-playing, search. */
  const domainComposeVisible = $derived.by(() => {
    const p = page.url.pathname
    if (appBarHidden) return false
    if (
      p.startsWith('/import') ||
      p.startsWith('/settings') ||
      p.startsWith('/auth') ||
      p.startsWith('/search') ||
      p.startsWith('/now-playing')
    ) {
      return false
    }
    return (
      p === '/' ||
      p.startsWith('/library') ||
      p.startsWith('/playlists') ||
      p.startsWith('/browse') ||
      p.startsWith('/liked')
    )
  })

  const shellDataset = $derived({
    'page-route': pageRoute,
    'immersive-mode': immersiveMode,
    'wide-content': wideContent ? 'true' : undefined,
    'content-mode': wideContent ? 'span' : undefined,
    'utility-open': utilityOpen ? 'true' : undefined,
    'player-chrome': playerChrome === 'mini' ? 'mini' : undefined,
  })

  /** UtilityPane 宽度是根级布局变量；AppShell 拥有根节点，改挂到 html 上 */
  $effect(() => {
    document.documentElement.style.setProperty(
      '--utility-pane-w',
      `${utilityPane.width}px`,
    )
    return () => {
      document.documentElement.style.removeProperty('--utility-pane-w')
    }
  })

  $effect(() => {
    if (onNowPlaying && utilityPane.open) closeUtilityPane()
  })

  $effect(() => {
    if (onNowPlaying) {
      refreshImmersiveChrome()
    } else {
      applyTheme()
    }
  })

  onMount(() => {
    markIosNativeShellDom()
    const continuity = isIosNativeShell()
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
    /** @type {{ kind: 'ric' | 'timeout'; id: number }[]} */
    const idleHandles = []
    /** @param {() => void} fn */
    const runIdle = (fn) => {
      if (typeof requestIdleCallback === 'function') {
        idleHandles.push({
          kind: 'ric',
          id: requestIdleCallback(() => fn(), { timeout: 2500 }),
        })
      } else {
        idleHandles.push({ kind: 'timeout', id: setTimeout(fn, 1200) })
      }
    }
    if (continuity) {
      installMusicLeaveGuard()
      persistMusicContinue(suspendMusicSpace())
    }
    initRecDebug()
    initUtilityPaneWidth()
    installRecDebugConsole()
    applyTheme()
    applyLocale()
    ensureBuiltinPlaylists()
    ensureAlbumArtCache()
      .then(() => {
        if (continuity)
          runIdle(() => scheduleLibraryMaintenance({ lyrics: false }))
        else scheduleLibraryMaintenance({ lyrics: false })
      })
      .catch(() => {})
    // 后台自动补全歌词（幂等、限量、在线才跑）——取代设置里的手动按钮
    if (continuity) runIdle(() => scheduleAutoLyricsBackfill())
    else scheduleAutoLyricsBackfill()
    registerShortcutHandlers({
      searchInput,
      focusSearch: () => {
        const onSearchPage = page.url.pathname === '/search'
        const mobile = browser && isLifeOsMobile()
        if (onSearchPage && mobile) {
          document.querySelector('.search-page-input')?.focus()
        } else {
          searchInput?.focus()
        }
      },
    })
    const cleanupShortcuts = bindGlobalShortcuts(t)
    const cleanupTheme = bindAppThemeSystemChange()
    const cleanupAuth = initAuth()
    const cleanupViewport = bindViewportHeight()
    const cleanupConnectivity = bindConnectivity(() => {
      if (auth.user) flushPendingSync()
    })
    const cleanupServiceWorker = registerServiceWorker({
      shouldDeferUpdate: () => player.playing,
    })
    void requestPersistentStorage()
    const cleanupBackground = bindBackgroundPlayback()
    const cleanupForeground = bindNetworkResume()
    const cleanupPrecacheAck = bindPrecacheActivityAck()
    void refreshExpiringSignedUrls()
    const refreshTimer = setInterval(() => {
      void refreshExpiringSignedUrls()
    }, 10 * 60_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible')
        void refreshExpiringSignedUrls()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const disposeAppLogs = installKenosAppLogs({
      app: 'music',
      getSupabase: () => supabase,
    })
    return () => {
      for (const handle of idleHandles) {
        if (handle.kind === 'ric') cancelIdleCallback(handle.id)
        else clearTimeout(handle.id)
      }
      cleanupShellSettings()
      cleanupShortcuts()
      cleanupTheme()
      cleanupAuth()
      cleanupViewport()
      cleanupConnectivity()
      cleanupServiceWorker()
      cleanupBackground()
      cleanupForeground()
      cleanupPrecacheAck()
      disposeAppLogs()
      clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  })

  $effect(() => {
    registerShortcutHandlers({
      searchInput,
      focusSearch: () => {
        const onSearchPage = page.url.pathname === '/search'
        const mobile = browser && isLifeOsMobile()
        if (onSearchPage && mobile) {
          document.querySelector('.search-page-input')?.focus()
        } else {
          searchInput?.focus()
        }
      },
    })
  })

  onNavigate((navigation) => {
    if (!document.startViewTransition) return
    const from = navigation.from?.url.pathname ?? ''
    const to = navigation.to?.url.pathname ?? ''
    if (!from.startsWith('/now-playing') && !to.startsWith('/now-playing'))
      return

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve()
        await navigation.complete
      })
    })
  })

  afterNavigate(() => {
    resetScrollLock()
  })

  $effect.pre(() => {
    page.url.pathname
    resetPageChrome()
  })

  $effect(() => {
    if (!auth.ready || !auth.user) return
    scheduleLibraryMaintenance({ art: false })
    return bindNetworkResume({
      onResume: () => syncBidirectional({ silent: true }),
      when: () => Boolean(auth.user),
    })
  })

  $effect(() => {
    S.settings.locale
    applyLocale()
  })

  /** 后台音频预缓存 / 导入任务 → 主屏幕图标角标 */
  $effect(() => {
    const jobs = backgroundActivity.activeJobs
    void setAppBadgeCount(jobs)
    return () => {
      void setAppBadgeCount(0)
    }
  })

  $effect(() => {
    S.settings.albumAmbience
    S.settings.theme
    const track = player.queue[player.index] ?? null
    applyTrackAmbience(track)
  })
</script>

<DocumentHead appId="music" {pageTitle} />

<LifeOsAppShell
  navigationKey={page.url.pathname}
  focusOnNavigate="main"
  shellClass="music-app seg-tone-calm nav-tone-calm"
  {shellDataset}
  skipLinkLabel={t('common.skipToContent')}
  testIdPrefix="music-shell"
>
  {#snippet navigation(projection)}
    {#if nativeShell}
      <!-- Domain Dock; MiniPlayer remains the single live accessory -->
    {:else if projection === 'desktop'}
      <SideNav />
    {:else}
      <BottomNav />
    {/if}
  {/snippet}

  {#snippet header()}
    {#if !nativeShell}
      <AppBar
        hidden={appBarHidden}
        title={appBarHidden ? undefined : pageTitle}
        subtitle={appBarSubtitle}
        backHref={appBarBackHref}
        backLabel={appBarBackLabel}
        bind:searchRef={searchInput}
      />
    {/if}
  {/snippet}

  {#snippet main()}
    {#if nativeShell && !appBarHidden}
      <DomainMusicHeader
        title={pageTitle || 'Music'}
        domainLabel="Music"
        showCompose={domainComposeVisible}
        backHref={appBarBackHref || ''}
        backLabel={appBarBackLabel || t('common.back')}
      />
    {/if}
    {@render children()}
  {/snippet}

  {#snippet persistentOverlay()}
    <MiniPlayer />
  {/snippet}

  {#snippet transientOverlay()}
    <ConnectivitySyncStatus />
    <SyncErrorBanner
      subscribe={subscribeSyncError}
      formatMessage={(reason) => t('sync.banner', { reason })}
      dismissLabel={t('common.close')}
    />
    <UtilityPane />
    <QueueDrawer />
    <Toast />
  {/snippet}
</LifeOsAppShell>

<NowPlayingOverlay />

<style>
  /* Kenos Domain Mode — native dock is the only bottom bar */
  :global(html[data-ios-native-shell='true'] nav.bottom-nav),
  :global(
      html[data-ios-native-shell='true'] [data-testid='music-shell-bottom-nav']
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
    /* Continuity: dock + mini clearance (room for 2-line status hint) */
    --kenos-domain-dock-h: 80px;
    --kenos-mini-player-clearance: 96px;
  }
  :global(html[data-ios-native-shell='true'] .life-os-app-shell__main),
  :global(html[data-ios-native-shell='true'] #main-content) {
    padding-top: var(--kenos-chrome-top-inset, 54px) !important;
    padding-bottom: calc(
      var(--kenos-domain-dock-h) + env(safe-area-inset-bottom, 0px)
    ) !important;
    box-sizing: border-box !important;
  }
  /* MiniPlayer sits above Domain Dock — clear both when playing */
  :global(
      html[data-ios-native-shell='true']
        .life-os-app-shell[data-player-chrome='mini']
        .life-os-app-shell__main
    ),
  :global(
      html[data-ios-native-shell='true']
        .life-os-app-shell[data-player-chrome='mini']
        #main-content
    ) {
    padding-bottom: calc(
      var(--kenos-domain-dock-h) + var(--kenos-mini-player-clearance) +
        env(safe-area-inset-bottom, 0px)
    ) !important;
  }
  :global(html[data-ios-native-shell='true'] .domain-music-header) {
    padding-top: 0;
    padding-bottom: var(--kenos-chrome-header-pad-bottom, 8px);
    padding-inline: var(--kenos-chrome-inline, 16px);
  }
  :global(html[data-ios-native-shell='true'] .page-header),
  :global(html[data-ios-native-shell='true'] .topbar),
  :global(html[data-ios-native-shell='true'] header.app-header) {
    display: none !important;
  }
  /* MiniPlayer sits above Domain Dock (not a second tab bar) */
  :global(html[data-ios-native-shell='true'] .mini-player) {
    bottom: calc(
      var(--kenos-domain-dock-h) + env(safe-area-inset-bottom, 0px)
    ) !important;
  }
</style>
