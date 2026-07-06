<script>
  import '../app.css'
  import { browser } from '$app/environment'
  import { onMount } from 'svelte'
  import { onNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import AppBar from '$lib/components/AppBar.svelte'
  import SideNav from '$lib/components/SideNav.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import MiniPlayer from '$lib/components/MiniPlayer.svelte'
  import QueueDrawer from '$lib/components/QueueDrawer.svelte'
  import UtilityPane from '$lib/components/UtilityPane.svelte'
  import Toast from '$lib/components/Toast.svelte'
  import DocumentHead from '$lib/components/DocumentHead.svelte'
  import { S, applyTheme, bindAppThemeSystemChange } from '$lib/state.svelte.js'
  import { applyLocale, t } from '$lib/i18n/index.js'
  import {
    resolvePageTitle,
    resolvePageBack,
    isNavChromeHidden,
    isWideContentRoute,
  } from '$lib/nav.js'
  import { pageChrome, resetPageChrome } from '$lib/pageChrome.svelte.js'
  import { player } from '$lib/player.svelte.js'
  import { applyTrackAmbience } from '$lib/trackAmbience.js'
  import { ensureBuiltinPlaylists, ensureAlbumArtCache } from '$lib/db.js'
  import {
    ensureArtRepaired,
    ensureMetadataRepaired,
    ensureLyricsRepaired,
  } from '$lib/import.js'
  import { initAuth, auth } from '$lib/auth.svelte.js'
  import { bindVisibilitySync } from '@life-os/sync'
  import { bindViewportHeight } from '@life-os/theme'
  import { syncBidirectional } from '$lib/sync.js'
  import { bindBackgroundPlayback } from '$lib/backgroundAudio.js'
  import { registerServiceWorker } from '$lib/serviceWorker.js'
  import {
    bindGlobalShortcuts,
    registerShortcutHandlers,
  } from '$lib/shortcuts.js'
  import {
    utilityPane,
    initRecDebug,
    installRecDebugConsole,
  } from '$lib/ui.svelte.js'

  let { children } = $props()

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
    (player.queue[player.index] ?? null) ? 'mini' : 'none',
  )
  const pageRoute = $derived(
    page.url.pathname.startsWith('/now-playing') ? 'now-playing' : undefined,
  )
  const immersiveMode = $derived(
    pageRoute === 'now-playing' ? S.settings.immersiveViewMode : undefined,
  )
  const wideContent = $derived(isWideContentRoute(page.url.pathname))
  const utilityOpen = $derived(utilityPane.open)

  onMount(() => {
    initRecDebug()
    installRecDebugConsole()
    applyTheme()
    applyLocale()
    ensureBuiltinPlaylists()
    ensureAlbumArtCache()
      .then(() => ensureArtRepaired())
      .catch(() => {})
    registerShortcutHandlers({
      searchInput,
      focusSearch: () => {
        const onSearchPage = page.url.pathname === '/search'
        const mobile =
          browser && window.matchMedia('(max-width: 860px)').matches
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
    const cleanupServiceWorker = registerServiceWorker()
    const cleanupBackground = bindBackgroundPlayback()
    return () => {
      cleanupShortcuts()
      cleanupTheme()
      cleanupAuth()
      cleanupViewport()
      cleanupServiceWorker()
      cleanupBackground()
    }
  })

  $effect(() => {
    registerShortcutHandlers({
      searchInput,
      focusSearch: () => {
        const onSearchPage = page.url.pathname === '/search'
        const mobile =
          browser && window.matchMedia('(max-width: 860px)').matches
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

  $effect.pre(() => {
    page.url.pathname
    resetPageChrome()
  })

  $effect(() => {
    if (!auth.ready || !auth.user) return
    ensureMetadataRepaired().catch(() => {})
    ensureLyricsRepaired().catch(() => {})
    return bindVisibilitySync(() => syncBidirectional({ silent: true }), {
      when: () => Boolean(auth.user),
    })
  })

  $effect(() => {
    S.settings.locale
    applyLocale()
  })

  $effect(() => {
    S.settings.albumAmbience
    S.settings.theme
    const track = player.queue[player.index] ?? null
    applyTrackAmbience(track)
  })
</script>

<DocumentHead appId="music" {pageTitle} />

<div
  class="app-shell music-app"
  data-page-route={pageRoute}
  data-immersive-mode={immersiveMode}
  data-wide-content={wideContent ? 'true' : undefined}
  data-utility-open={utilityOpen ? 'true' : undefined}
>
  <SideNav />
  <div class="safari-chrome-tint-top" aria-hidden="true"></div>
  <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>

  <div
    class="main-wrap"
    data-mobile-chrome="tabbar"
    data-player-chrome={playerChrome === 'mini' ? 'mini' : undefined}
  >
    <AppBar
      hidden={appBarHidden}
      title={appBarHidden ? undefined : pageTitle}
      subtitle={appBarSubtitle}
      backHref={appBarBackHref}
      backLabel={appBarBackLabel}
      bind:searchRef={searchInput}
    />
    <main id="main-content">{@render children()}</main>
  </div>

  <UtilityPane />
</div>

<div
  class="bottom-shell"
  data-player-chrome={playerChrome === 'mini' ? 'mini' : undefined}
>
  <MiniPlayer />
  <BottomNav />
</div>
<QueueDrawer />
<Toast />
