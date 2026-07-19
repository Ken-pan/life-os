<script>
  import '../app.css'
  import 'katex/dist/katex.min.css'
  import { onMount, setContext } from 'svelte'
  import { afterNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import LifeOsAppShell from '@life-os/platform-web/svelte/app-shell'
  import LifeOsAppBar from '@life-os/platform-web/svelte/app-bar'
  import { ICON_REGISTRY_CONTEXT_KEY } from '@life-os/platform-web/icon-registry'
  import { bindViewportHeight, resetScrollLock } from '@life-os/theme'
  import { bindVisibilitySync } from '@life-os/sync'
  import ChatSidebar from '$lib/components/ChatSidebar.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import { ICONS } from '$lib/iconRegistry.js'
  import { S, applyTheme, bindAppThemeSystemChange } from '$lib/state.svelte.js'
  import { refreshGateway } from '$lib/chat.svelte.js'
  import { backfillVectors, seedDefaultMemories, dreamMemories } from '$lib/memory.svelte.js'
  import { initCloud, syncNow, CLOUD, isCloudAuthorized } from '$lib/cloud.svelte.js'
  import {
    startDailyBriefScheduler,
    stopDailyBriefScheduler,
    maybeSendDailyBrief,
  } from '$lib/proactive.svelte.js'
  import { CLOUD_BUILD } from '$lib/env.js'
  import CloudGate from '$lib/components/CloudGate.svelte'
  import { t, applyLocale } from '$lib/i18n/index.js'

  let { children } = $props()

  // 云端版:只有登录且是本人才放行,否则整个 app 用登录门禁盖住。
  // 本地形态(Tauri/5219/dev)CLOUD_BUILD 为 false,永不经过门禁。
  const gated = $derived(CLOUD_BUILD && !isCloudAuthorized())

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)

  const isAssistant = $derived(page.url.pathname === '/assistant')
  const hasCustomHeader = $derived(
    ['/', '/inbox', '/approvals', '/activity'].includes(page.url.pathname),
  )

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p === '/settings') return t('settings.title')
    if (p === '/history') return t('history.title')
    if (p === '/inbox') return t('nav.inbox')
    if (p === '/approvals') return t('nav.approvals')
    if (p === '/activity') return t('nav.activity')
    if (p === '/') return t('nav.today')
    return t('chat.title')
  })

  onMount(() => {
    applyTheme()
    applyLocale()
    refreshGateway()
    seedDefaultMemories()
    backfillVectors()
    // 云同步恢复后：自动写入 Life OS MCP 舰队，再发现工具
    initCloud().then(() =>
      import('$lib/mcp.js')
        .then((m) => m.refreshMcpTools())
        .catch(() => {}),
    )
    // 记忆 dreaming:启动稳定后空闲整理(内部限 24h 一次)
    const dreamTimer = setTimeout(() => dreamMemories(), 30000)
    const cleanupTheme = bindAppThemeSystemChange()
    const cleanupViewport = bindViewportHeight()
    // 回到前台时拉一次云端:让别的设备的改动无需手动/刷新就收敛过来
    const cleanupVisibility = bindVisibilitySync(
      () => {
        syncNow()
        maybeSendDailyBrief() // 追赶:当天首次切回时补送今日简报
      },
      { when: () => !!CLOUD.user },
    )
    // 早晨今日简报:运行时轮询 + 挂载即查(原生壳且开启才实际发通知)
    startDailyBriefScheduler()
    return () => {
      clearTimeout(dreamTimer)
      cleanupTheme()
      cleanupViewport()
      cleanupVisibility()
      stopDailyBriefScheduler()
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

{#if gated}
  <CloudGate />
{:else}
  <LifeOsAppShell
    navigationKey={page.url.pathname}
    focusOnNavigate="main"
    scrollMode={isAssistant ? 'locked' : 'content'}
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
      <LifeOsAppBar title={pageTitle} hidden={isAssistant || hasCustomHeader}>
        {#snippet leading()}
          <span class="page-title">{t('app.name')}</span>
        {/snippet}
      </LifeOsAppBar>
    {/snippet}

    {#snippet main()}
      {@render children()}
    {/snippet}
  </LifeOsAppShell>
{/if}
