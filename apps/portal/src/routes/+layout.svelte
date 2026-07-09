<script>
  import '../app.css'
  import { onMount } from 'svelte'
  import CommandPalette from '@life-os/platform-web/CommandPalette.svelte'
  import { bindViewportHeight } from '@life-os/theme'
  import DocumentHead from '@life-os/platform-web/svelte/head'
  import PortalShell from '$lib/components/PortalShell.svelte'
  import PortalLoading from '$lib/components/PortalLoading.svelte'
  import PortalUnauth from '$lib/components/PortalUnauth.svelte'
  import { PORTAL_APPS, getLauncherMeta } from '$lib/apps.js'
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

  let cpOpen = $state(false)
  let coreHydrated = $state(false)
  let lastHydratedUserId = $state(/** @type {string | null} */ (null))
  let hydrateSeq = 0

  const cpActions = $derived([
    ...PORTAL_APPS.map((app) => ({
      id: app.id,
      title: `打开 ${getLauncherMeta(app.id).name}${app.experimental ? '（实验）' : ''}`,
      icon:
        app.id === 'finance'
          ? 'wallet'
          : app.id === 'planner'
            ? 'check-square'
            : app.id === 'fitness'
              ? 'activity'
              : app.id === 'home'
                ? 'home'
                : 'music',
      onSelect: () => {
        window.location.href = app.url
      },
    })),
    {
      id: 'sign-out',
      title: '退出登录',
      icon: 'log-out',
      onSelect: () => signOut().then(() => window.location.reload()),
    },
  ])

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
      if (shouldAutoRedirect(defaultApp, skipAutoRedirect)) {
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
    actions={cpActions}
    placeholder="跳转到应用或操作…"
  />
{/if}
