<script>
  import '../app.css'
  import { onMount, setContext } from 'svelte'
  import { afterNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import LifeOsAppShell from '@life-os/platform-web/svelte/app-shell'
  import { ICON_REGISTRY_CONTEXT_KEY } from '@life-os/platform-web/icon-registry'
  import { bindViewportHeight, resetScrollLock } from '@life-os/theme'
  import AppBar from '$lib/components/AppBar.svelte'
  import SideNav from '$lib/components/SideNav.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import { ICONS } from '$lib/iconRegistry.js'
  import { S, applyTheme, bindAppThemeSystemChange, initBackend } from '$lib/state.svelte.js'
  import { t, applyLocale } from '$lib/i18n/index.js'

  let { children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p === '/settings') return t('settings.title')
    if (p.startsWith('/library')) return t('library.title')
    if (p.startsWith('/timeline')) return t('timeline.title')
    if (p.startsWith('/recall')) return t('nav.recall')
    return t('inbox.title')
  })

  onMount(() => {
    applyTheme()
    applyLocale()
    initBackend()
    const cleanupTheme = bindAppThemeSystemChange()
    const cleanupViewport = bindViewportHeight()
    return () => {
      cleanupTheme()
      cleanupViewport()
    }
  })

  $effect(() => {
    S.settings.locale
    applyLocale()
  })

  afterNavigate(() => {
    resetScrollLock()
  })
</script>

<svelte:head>
  <!-- 晋升为正式 app 后换成 <DocumentHead appId="…" {pageTitle} />（需先注册 site meta） -->
  <title>{pageTitle} · {t('app.name')}</title>
</svelte:head>

<LifeOsAppShell
  navigationKey={page.url.pathname}
  focusOnNavigate="main"
  skipLinkLabel={t('common.skipToContent')}
  testIdPrefix="knowledge-shell"
>
  {#snippet navigation(projection)}
    {#if projection === 'desktop'}
      <SideNav />
    {:else}
      <BottomNav />
    {/if}
  {/snippet}

  {#snippet header()}
    <AppBar title={pageTitle} />
  {/snippet}

  {#snippet main()}
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
