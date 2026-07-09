<script>
  import '../app.css'
  import { onMount, setContext } from 'svelte'
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
    shouldAutoRedirect,
  } from '$lib/portalPreferences.svelte.js'
  import { initPortalTheme } from '$lib/theme.svelte.js'

  let { children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)

  let cpOpen = $state(false)
  let cpQuery = $state('')
  let coreHydrated = $state(false)
  let lastHydratedUserId = $state(/** @type {string | null} */ (null))
  let hydrateSeq = 0

  const cpActions = $derived(
    buildPortalCommandActions({
      signOut,
      query: cpQuery,
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
      return
    }
    if (coreHydrated && lastHydratedUserId === userId) return

    const seq = ++hydrateSeq
    void (async () => {
      const lastApp = await hydratePortalFromCore(userId)
      if (seq !== hydrateSeq) return
      applyRecentAppFromDb(lastApp)
      coreHydrated = true
      lastHydratedUserId = userId

      const { defaultApp, skipAutoRedirect } = portalPreferences
      if (defaultApp && shouldAutoRedirect(defaultApp, skipAutoRedirect)) {
        redirectToDefaultApp(
          /** @type {import('$lib/apps.js').LauncherAppId} */ (defaultApp),
        )
      }
    })()
  })

  onMount(() => {
    const cleanupViewport = bindViewportHeight()
    const cleanupAuth = initAuth()
    const cleanupTheme = initPortalTheme()
    const cleanupRecent = initRecentApp()
    return () => {
      cleanupAuth()
      cleanupViewport()
      cleanupTheme()
      cleanupRecent()
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
