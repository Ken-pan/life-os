<script>
  import '../app.css'
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabase.js'
  import { createCoreIdentityHandler } from '@life-os/sync'
  import CommandPalette from '@life-os/platform-web/CommandPalette.svelte'
  import { bindViewportHeight } from '@life-os/theme'
  import DocumentHead from '@life-os/platform-web/svelte/head'
  import PortalAppBar from '$lib/components/PortalAppBar.svelte'
  import { PORTAL_APPS, getLauncherMeta } from '$lib/apps.js'

  let { children } = $props()

  let identityHandler = createCoreIdentityHandler(supabase, 'portal')
  let isReady = $state(false)
  /** @type {import('@supabase/supabase-js').Session | null} */
  let session = $state(null)
  let cpOpen = $state(false)

  const cpActions = $derived([
    ...PORTAL_APPS.map((app) => ({
      id: app.id,
      title: `打开 ${getLauncherMeta(app.id).name}`,
      icon: app.id === 'finance' ? 'wallet' : app.id === 'planner' ? 'check-square' : app.id === 'fitness' ? 'activity' : 'music',
      onSelect: () => {
        window.location.href = app.url
      },
    })),
    {
      id: 'sign-out',
      title: '退出登录',
      icon: 'log-out',
      onSelect: () => supabase.auth.signOut().then(() => window.location.reload()),
    },
  ])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.reload()
  }

  onMount(() => {
    const cleanupViewport = bindViewportHeight()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        session = newSession
        if (session?.user) {
          await identityHandler(event, session)
        }
        isReady = true
      },
    )

    supabase.auth.getSession().then(({ data }) => {
      session = data.session
      if (!session) isReady = true
    })

    return () => {
      authListener.subscription.unsubscribe()
      cleanupViewport()
    }
  })
</script>

<DocumentHead appId="portal" pageTitle={session ? '选择应用' : '登录'} />

{#if !isReady}
  <div class="portal-loading">正在初始化 Life OS…</div>
{:else if !session}
  <div class="app app-shell portal-shell">
    <div class="safari-chrome-tint-top" aria-hidden="true"></div>
    <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>
    <div class="main-col" data-mobile-chrome="minimal">
      <PortalAppBar />
      <div class="wrap portal-wrap">
        <div class="portal-unauth-wrap">
          <div class="settings-block">
            <h1 class="portal-unauth-title">欢迎使用 Life OS</h1>
            <p class="portal-unauth-desc">你尚未登录。请先在 Finance 完成登录，再返回此页切换应用。</p>
            <a href="https://finance.kenos.space" class="btn-primary portal-login-link">
              前往 Finance 登录
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
{:else}
  <div class="app app-shell portal-shell">
    <div class="safari-chrome-tint-top" aria-hidden="true"></div>
    <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>
    <div class="main-col" data-mobile-chrome="minimal">
      <PortalAppBar onSignOut={handleSignOut} />
      <div class="wrap portal-wrap">
        {@render children()}
      </div>
    </div>
  </div>
  <CommandPalette
    bind:open={cpOpen}
    actions={cpActions}
    placeholder="跳转到应用或操作…"
  />
{/if}

<style>
  .portal-login-link {
    display: inline-flex;
    text-decoration: none;
  }
</style>
