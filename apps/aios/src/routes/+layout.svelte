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
  import CaptureQuick from '$lib/components/CaptureQuick.svelte'
  import FocusSessionShell from '$lib/components/FocusSessionShell.svelte'
  import SpaceSwitcher from '$lib/components/SpaceSwitcher.svelte'
  import KenosSystemBar from '$lib/components/KenosSystemBar.svelte'
  import { FOCUS, focusFlags, hydrateFocusStore } from '$lib/kenos/focusStore.svelte.js'
  import {
    SPACE_SWITCHER,
    hydrateSpaceSwitcher,
    noteSpaceVisit,
    syncSpaceSwitcherOwner,
    openSpaceSwitcherSheet,
  } from '$lib/kenos/spaceSwitcher.svelte.js'
  import { ICONS } from '$lib/iconRegistry.js'
  import { S, applyTheme, bindAppThemeSystemChange } from '$lib/state.svelte.js'
  import { refreshGateway } from '$lib/chat.svelte.js'
  import {
    backfillVectors,
    dreamMemories,
    hydrateMemoryFromLocalStorage,
    seedDefaultMemories,
  } from '$lib/memory.svelte.js'
  import { initCloud, syncNow, CLOUD, isCloudAuthorized } from '$lib/cloud.svelte.js'
  import {
    startDailyBriefScheduler,
    stopDailyBriefScheduler,
    maybeSendDailyBrief,
  } from '$lib/proactive.svelte.js'
  import { CLOUD_BUILD } from '$lib/env.js'
  import CloudGate from '$lib/components/CloudGate.svelte'
  import { t, applyLocale } from '$lib/i18n/index.js'
  import { refreshControlCenter } from '$lib/kenos/controlCenter.svelte.js'
  import {
    canRetryReconnect,
    reconnectDelayMs,
    shouldReconnectAfterOnline,
  } from '$lib/kenos/networkStatus.core.js'
  import { AUTH_WALL_DOCUMENT_TITLE } from '$lib/kenos/clientSessionCleanup.core.js'

  let { children } = $props()

  // 云端版:只有登录且是本人才放行,否则整个 app 用登录门禁盖住。
  // 本地形态(Tauri/5219/dev)CLOUD_BUILD 为 false,永不经过门禁。
  const gated = $derived(CLOUD_BUILD && !isCloudAuthorized())

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)

  const isAssistant = $derived(page.url.pathname === '/assistant')
  const knownRoutes = new Set([
    '/',
    '/assistant',
    '/chat',
    '/spaces',
    '/spaces/training',
    '/spaces/work',
    '/spaces/plan',
    '/spaces/money',
    '/spaces/music',
    '/spaces/home',
    '/spaces/knowledge',
    '/focus',
    '/inbox',
    '/approvals',
    '/activity',
    '/work',
    '/history',
    '/settings',
    '/uiux-states',
  ])
  const hasCustomHeader = $derived(
    [
      '/',
      '/spaces',
      '/spaces/training',
      '/spaces/work',
      '/spaces/plan',
      '/spaces/money',
      '/spaces/music',
      '/spaces/home',
      '/spaces/knowledge',
      '/focus',
      '/inbox',
      '/approvals',
      '/activity',
      '/work',
      '/uiux-states',
    ].includes(page.url.pathname) || !knownRoutes.has(page.url.pathname),
  )
  const hideGlobalNav = $derived(focusFlags().hideGlobalNav && page.url.pathname === '/focus')
  const showReturnBanner = $derived(focusFlags().showReturnBanner)

  let captureOpen = $state(false)
  let online = $state(typeof navigator !== 'undefined' ? navigator.onLine : true)
  let wasOffline = $state(false)
  let reconnectAttempts = $state(0)
  let reconnectTimer = null

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p === '/settings') return t('settings.title')
    if (p === '/history') return t('history.title')
    if (p === '/inbox') return t('nav.inbox')
    if (p === '/approvals') return t('nav.approvals')
    if (p === '/activity') return t('nav.activity')
    if (p === '/spaces') return t('nav.spaces')
    if (p === '/spaces/training') return 'Training'
    if (p === '/spaces/work') return 'Deep Work'
    if (p === '/spaces/plan') return 'Plan'
    if (p === '/spaces/money') return 'Money'
    if (p === '/spaces/music') return 'Music'
    if (p === '/spaces/home') return 'Home'
    if (p === '/spaces/knowledge') return 'Knowledge'
    if (p === '/focus') return FOCUS.focus?.title || 'Focus'
    if (p === '/work') return 'Work'
    if (p === '/uiux-states') return 'UIUX States'
    if (p === '/') return t('nav.today')
    if (p === '/assistant' || p === '/chat') return t('chat.title')
    return '页面未找到'
  })

  // Auth wall must never leak prior route/entity titles (Work/Focus/Inbox…).
  const documentTitle = $derived(
    gated ? AUTH_WALL_DOCUMENT_TITLE : `${pageTitle} · ${t('app.name')}`,
  )

  function onGlobalKeydown(event) {
    if (gated) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      const tag = /** @type {HTMLElement | null} */ (event.target)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || /** @type {HTMLElement} */ (event.target)?.isContentEditable) {
        return
      }
      event.preventDefault()
      captureOpen = true
      return
    }
    // Continue / Space Switcher — Cmd/Ctrl + .
    if ((event.metaKey || event.ctrlKey) && event.key === '.') {
      const tag = /** @type {HTMLElement | null} */ (event.target)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || /** @type {HTMLElement} */ (event.target)?.isContentEditable) {
        return
      }
      event.preventDefault()
      openSpaceSwitcherSheet()
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  async function attemptReconnect(attempt = 0) {
    if (!canRetryReconnect(attempt, 5)) return
    const delay = reconnectDelayMs(attempt)
    const run = async () => {
      try {
        await refreshControlCenter({ force: true })
        if (CLOUD.user) await syncNow()
        wasOffline = false
        reconnectAttempts = 0
      } catch {
        reconnectAttempts = attempt + 1
        void attemptReconnect(attempt + 1)
      }
    }
    if (delay <= 0) {
      await run()
      return
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void run()
    }, delay)
  }

  function onWindowOffline() {
    online = false
    wasOffline = true
    clearReconnectTimer()
  }

  function onWindowOnline() {
    online = true
    if (shouldReconnectAfterOnline({ online: true, wasOffline })) {
      reconnectAttempts = 0
      void attemptReconnect(0)
    }
  }

  onMount(() => {
    hydrateFocusStore()
    hydrateSpaceSwitcher()
    applyTheme()
    applyLocale()
    refreshGateway()
    // 云同步恢复后：自动写入 Life OS MCP 舰队，再发现工具
    initCloud().then(() => {
      syncSpaceSwitcherOwner()
      if (CLOUD_BUILD && !isCloudAuthorized()) {
        // Auth wall: do not seed/hydrate prior-user memory
        return
      }
      if (!CLOUD_BUILD) hydrateMemoryFromLocalStorage()
      seedDefaultMemories()
      backfillVectors()
      return import('$lib/mcp.js')
        .then((m) => m.refreshMcpTools())
        .catch(() => {})
    })
    // 记忆 dreaming:启动稳定后空闲整理(内部限 24h 一次)
    const dreamTimer = setTimeout(() => {
      if (CLOUD_BUILD && !isCloudAuthorized()) return
      dreamMemories()
    }, 30000)
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

    online = typeof navigator !== 'undefined' ? navigator.onLine : true
    window.addEventListener('offline', onWindowOffline)
    window.addEventListener('online', onWindowOnline)
    if (typeof navigator !== 'undefined') {
      navigator.serviceWorker?.register('/service-worker.js').catch(() => {})
    }

    return () => {
      clearTimeout(dreamTimer)
      clearReconnectTimer()
      cleanupTheme()
      cleanupViewport()
      cleanupVisibility()
      stopDailyBriefScheduler()
      window.removeEventListener('offline', onWindowOffline)
      window.removeEventListener('online', onWindowOnline)
    }
  })

  $effect(() => {
    S.settings.locale
    applyLocale()
  })

  afterNavigate(() => {
    resetScrollLock()
    noteSpaceVisit(page.url.pathname)
  })
</script>

<svelte:head>
  <title>{documentTitle}</title>
</svelte:head>

<svelte:window onkeydown={onGlobalKeydown} />

{#if gated}
  <CloudGate />
{:else}
  {#if !online}
    <div class="offline-banner" data-testid="aios-offline-banner" role="status">
      <strong>当前离线</strong>
      <span> · 显示已缓存内容；恢复网络后将自动重试</span>
    </div>
  {/if}
  <CaptureQuick bind:open={captureOpen} />
  {#if showReturnBanner && page.url.pathname !== '/focus'}
    <FocusSessionShell />
  {/if}
  {#if !hideGlobalNav && !isAssistant}
    <KenosSystemBar title={pageTitle} onCapture={() => (captureOpen = true)} />
  {/if}
  <LifeOsAppShell
    navigationKey={page.url.pathname}
    focusOnNavigate="main"
    scrollMode={isAssistant ? 'locked' : 'content'}
    skipLinkLabel={t('common.skipToContent')}
    testIdPrefix="aios-shell"
    shellDataset={{
      'continue-open': SPACE_SWITCHER.sheetOpen ? 'true' : undefined,
    }}
  >
    {#snippet navigation(projection)}
      {#if hideGlobalNav}
        <!-- Focus Session: hide global Tab/Sidebar entirely -->
      {:else if projection === 'desktop'}
        <ChatSidebar
          onCapture={() => (captureOpen = true)}
          onSpaceSwitcher={openSpaceSwitcherSheet}
        />
      {:else}
        <BottomNav />
      {/if}
    {/snippet}

    {#snippet header()}
      <LifeOsAppBar title={pageTitle} hidden={isAssistant || hasCustomHeader || hideGlobalNav}>
        {#snippet trailing()}
          {#if !hideGlobalNav}
            <!-- Desktop AppBar only — mobile Continue lives in KenosSystemBar -->
            <button
              type="button"
              class="space-switcher-trigger desktop-only-continue"
              data-testid="kenos-space-switcher-trigger"
              aria-label="Continue to a recent Space"
              onclick={openSpaceSwitcherSheet}
            >
              Continue
            </button>
          {/if}
        {/snippet}
      </LifeOsAppBar>
    {/snippet}

    {#snippet main()}
      {@render children()}
    {/snippet}

    {#snippet transientOverlay()}
      <!-- Continue sheet hosts here so AppShell can set data-transient-overlay-open + scroll lock -->
      <SpaceSwitcher />
    {/snippet}
  </LifeOsAppShell>
{/if}

<style>
  .offline-banner {
    position: sticky;
    top: 0;
    z-index: 50;
    padding: 8px 16px;
    text-align: center;
    font-size: var(--text-sm, 13px);
    font-weight: 450;
    color: var(--t2);
    background: color-mix(in srgb, var(--t1) 4%, var(--bg));
    border-bottom: 1px solid var(--border);
  }
  .offline-banner strong {
    font-weight: 650;
    color: var(--t1);
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.space-switcher-trigger) {
      transition: none;
    }
  }
  :global(.space-switcher-trigger) {
    appearance: none;
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    background: var(--kenos-chrome-bg, color-mix(in srgb, var(--bg) 80%, transparent));
    backdrop-filter: blur(12px);
    color: var(--t1);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    padding: 6px 12px;
    min-height: 36px;
    border-radius: var(--radius-pill, 999px);
    cursor: pointer;
  }
  :global(.space-switcher-trigger:hover) {
    border-color: color-mix(in srgb, var(--t1) 22%, var(--border));
  }
  @media (max-width: 899px) {
    :global(.desktop-only-continue) {
      display: none !important;
    }
  }
</style>
