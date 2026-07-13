<script>
  import '../app.css'
  import { onMount, setContext } from 'svelte'
  import { afterNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import LifeOsAppShell from '@life-os/platform-web/svelte/app-shell'
  import LifeOsAppBar from '@life-os/platform-web/svelte/app-bar'
  import { ICON_REGISTRY_CONTEXT_KEY } from '@life-os/platform-web/icon-registry'
  import { bindViewportHeight, resetScrollLock } from '@life-os/theme'
  import ChatSidebar from '$lib/components/ChatSidebar.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import { ICONS } from '$lib/iconRegistry.js'
  import { S, applyTheme, bindAppThemeSystemChange } from '$lib/state.svelte.js'
  import { refreshGateway } from '$lib/chat.svelte.js'
  import { t, applyLocale } from '$lib/i18n/index.js'

  let { children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)

  const isChat = $derived(page.url.pathname === '/')

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p === '/settings') return t('settings.title')
    if (p === '/history') return t('history.title')
    return t('chat.title')
  })

  onMount(() => {
    applyTheme()
    applyLocale()
    refreshGateway()
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
  <title>{pageTitle} · {t('app.name')}</title>
</svelte:head>

<LifeOsAppShell
  navigationKey={page.url.pathname}
  focusOnNavigate="main"
  scrollMode={isChat ? 'locked' : 'content'}
  skipLinkLabel={t('common.skipToContent')}
  testIdPrefix="aios-shell"
>
  {#snippet navigation(projection)}
    {#if projection === 'desktop'}
      <ChatSidebar />
    {:else}
      <BottomNav />
    {/if}
  {/snippet}

  {#snippet header()}
    <LifeOsAppBar title={pageTitle} hidden={isChat}>
      {#snippet leading()}
        <span class="page-title">{t('app.name')}</span>
      {/snippet}
    </LifeOsAppBar>
  {/snippet}

  {#snippet main()}
    {@render children()}
  {/snippet}
</LifeOsAppShell>

