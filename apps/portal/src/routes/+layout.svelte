<script>
  import '../app.css'
  import { onMount, setContext } from 'svelte'
  import { browser } from '$app/environment'
  import { page } from '$app/state'
  import CommandPalette from '@life-os/platform-web/CommandPalette.svelte'
  import { ICON_REGISTRY_CONTEXT_KEY } from '@life-os/platform-web/icon-registry'
  import { ICONS } from '$lib/iconRegistry.js'
  import { bindViewportHeight } from '@life-os/theme'
  import DocumentHead from '@life-os/platform-web/svelte/head'
  import PortalShell from '$lib/components/PortalShell.svelte'
  import PortalLoading from '$lib/components/PortalLoading.svelte'
  import PortalUnauth from '$lib/components/PortalUnauth.svelte'
  import { buildPortalCommandActions } from '$lib/commandPaletteActions.js'
  import { auth, initAuth, signOut } from '$lib/auth.svelte.js'
  import { applyRecentAppFromDb, initRecentApp } from '$lib/recentApp.svelte.js'
  import {
    hydratePortalFromCore,
    portalPreferences,
    redirectToDefaultApp,
    refreshPendingBadge,
    shouldAutoRedirect,
  } from '$lib/portalPreferences.svelte.js'
  import { initPortalTheme } from '$lib/theme.svelte.js'
  import { registerServiceWorker } from '$lib/serviceWorker.js'
  import { requestPersistentStorage } from '@life-os/platform-web/persistent-storage'
  import { installKenosAppLogs } from '@life-os/platform-web/kenos-app-logs'
  import { supabase } from '$lib/supabase.js'
  import {
    filterKenosExperimentalAccess,
    resolveKenosExperimentFlag,
  } from '$lib/kenosStrangler.js'

  let { children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)

  let cpOpen = $state(false)
  let cpQuery = $state(/** @type {string} */ (''))
  let coreHydrated = $state(false)
  let lastHydratedUserId = $state(/** @type {string | null} */ (null))
  let hydrateSeq = 0
  const kenosExperimentEnabled = $derived(
    resolveKenosExperimentFlag({
      search: page.url.search,
      hostname: browser ? location.hostname : '',
      environmentFlag: import.meta.env.VITE_KENOS_PHASE2_ENTRY,
    }),
  )
  const visibleAllowedAppKeys = $derived(
    filterKenosExperimentalAccess(
      auth.allowedAppKeys ?? [],
      kenosExperimentEnabled,
    ),
  )

  const cpActions = $derived(
    buildPortalCommandActions({
      signOut,
      query: cpQuery,
      allowedAppKeys: visibleAllowedAppKeys,
    }),
  )

  async function handleSignOut() {
    await signOut()
    window.location.reload()
  }

  function openCommandPalette() {
    cpOpen = true
  }

  $effect(() => {
    const userId = auth.session?.user?.id
    if (!auth.ready) return
    if (!userId) {
      coreHydrated = false
      lastHydratedUserId = null
      auth.allowedAppKeys = null
      return
    }
    if (auth.allowedAppKeys === null) return
    if (coreHydrated && lastHydratedUserId === userId) return

    const seq = ++hydrateSeq
    void (async () => {
      const allowed = auth.allowedAppKeys ?? []

      const lastApp = await hydratePortalFromCore(userId)
      if (seq !== hydrateSeq) return
      applyRecentAppFromDb(lastApp)
      coreHydrated = true
      lastHydratedUserId = userId

      const { defaultApp, skipAutoRedirect } = portalPreferences
      if (defaultApp && shouldAutoRedirect(defaultApp, skipAutoRedirect)) {
        if (allowed.includes(defaultApp)) {
          redirectToDefaultApp(
            /** @type {import('$lib/apps.js').LauncherAppId} */ (defaultApp),
          )
        }
      }
    })()
  })

  onMount(() => {
    const cleanupViewport = bindViewportHeight()
    const cleanupAuth = initAuth()
    const cleanupTheme = initPortalTheme()
    const cleanupRecent = initRecentApp()
    const cleanupSw = registerServiceWorker()
    void requestPersistentStorage()

    /** FINC.GROWTH.4：从 Planner 回来时刷新角标 */
    const onVis = () => {
      const uid = auth.session?.user?.id
      if (document.visibilityState === 'visible' && uid) {
        void refreshPendingBadge(uid)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    const disposeAppLogs = installKenosAppLogs({
      app: 'portal',
      getSupabase: () => supabase,
    })

    return () => {
      cleanupAuth()
      cleanupViewport()
      cleanupTheme()
      cleanupRecent()
      cleanupSw()
      disposeAppLogs()
      document.removeEventListener('visibilitychange', onVis)
    }
  })
</script>

<DocumentHead appId="portal" pageTitle={auth.session ? '选择应用' : '登录'} />

{#if !auth.ready}
  <PortalLoading />
{:else if !auth.session}
  <PortalShell centerContent>
    <PortalUnauth />
  </PortalShell>
{:else}
  <PortalShell
    userEmail={auth.user?.email}
    pendingEvents={portalPreferences.pendingEvents}
    onSignOut={handleSignOut}
    onOpenCommandPalette={openCommandPalette}
  >
    {@render children()}
  </PortalShell>
  <CommandPalette
    bind:open={cpOpen}
    bind:query={cpQuery}
    actions={cpActions}
    placeholder="跳转到应用、页面或操作…"
  />
{/if}
