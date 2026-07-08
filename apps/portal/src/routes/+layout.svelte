<script>
  import '../app.css'
  import { onMount } from 'svelte'
  import CommandPalette from '@life-os/platform-web/CommandPalette.svelte'
  import { bindViewportHeight } from '@life-os/theme'
  import DocumentHead from '@life-os/platform-web/svelte/head'
  import BrandMark from '@life-os/platform-web/svelte/brand/mark'
  import PortalAppBar from '$lib/components/PortalAppBar.svelte'
  import { PORTAL_APPS, getLauncherMeta } from '$lib/apps.js'
  import { getLifeOsBrand } from '@life-os/theme/brand'
  import { auth, initAuth, signOut } from '$lib/auth.svelte.js'

  const portalBrand = getLifeOsBrand('portal')

  let { children } = $props()

  let cpOpen = $state(false)

  const cpActions = $derived([
    ...PORTAL_APPS.map((app) => ({
      id: app.id,
      title: `打开 ${getLauncherMeta(app.id).name}`,
      icon:
        app.id === 'finance'
          ? 'wallet'
          : app.id === 'planner'
            ? 'check-square'
            : app.id === 'fitness'
              ? 'activity'
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

  onMount(() => {
    const cleanupViewport = bindViewportHeight()
    const cleanupAuth = initAuth()
    return () => {
      cleanupAuth()
      cleanupViewport()
    }
  })
</script>

<DocumentHead appId="portal" pageTitle={auth.session ? '选择应用' : '登录'} />

{#if !auth.ready}
  <div class="portal-loading">正在初始化 Life OS…</div>
{:else if !auth.session}
  <div class="app app-shell portal-shell">
    <div class="safari-chrome-tint-top" aria-hidden="true"></div>
    <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>
    <div class="main-col" data-mobile-chrome="minimal">
      <PortalAppBar />
      <div class="wrap portal-wrap">
        <div class="portal-unauth-wrap">
          <div class="portal-unauth-hero" aria-hidden="true">
            <BrandMark
              size={72}
              lightSrc={portalBrand.light}
              darkSrc={portalBrand.dark}
              lightSrcSet={portalBrand.lightSrcSet}
              darkSrcSet={portalBrand.darkSrcSet}
            />
          </div>
          <div class="settings-block">
            <h1 class="portal-unauth-title">欢迎使用 Life OS</h1>
            <p class="portal-unauth-desc">
              你尚未登录。请先在 Finance 完成登录，再返回此页切换应用。
            </p>
            <a
              href="https://finance.kenos.space"
              class="btn-primary portal-login-link"
            >
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
