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
  import {
    FOCUS,
    focusFlags,
    hydrateFocusStore,
  } from '$lib/kenos/focusStore.svelte.js'
  import {
    SPACE_SWITCHER,
    hydrateSpaceSwitcher,
    noteSpaceVisit,
    syncSpaceSwitcherOwner,
    openContinueSheet,
    openSwitchSpaceSheet,
  } from '$lib/kenos/spaceSwitcher.svelte.js'
  import { ICONS } from '$lib/iconRegistry.js'
  import {
    S,
    save,
    applyTheme,
    bindAppThemeSystemChange,
  } from '$lib/state.svelte.js'
  import { refreshGateway } from '$lib/chat.svelte.js'
  import { takeLayoutBoot } from '$lib/kenos/layoutBoot.core.js'
  import {
    backfillVectors,
    dreamMemories,
    hydrateMemoryFromLocalStorage,
    seedDefaultMemories,
  } from '$lib/memory.svelte.js'
  import {
    initCloud,
    syncNow,
    CLOUD,
    isCloudAuthorized,
  } from '$lib/cloud.svelte.js'
  import { installKenosAppLogs } from '@life-os/platform-web/kenos-app-logs'
  import { supabase } from '$lib/supabase.js'
  import {
    startDailyBriefScheduler,
    stopDailyBriefScheduler,
    maybeSendDailyBrief,
  } from '$lib/proactive.svelte.js'
  import { CLOUD_BUILD } from '$lib/env.js'
  import CloudGate from '$lib/components/CloudGate.svelte'
  import { t, applyLocale, setLocale } from '$lib/i18n/index.js'
  import { bindKenosShellSettings } from '@life-os/platform-web/kenos-shell-settings'
  import { refreshControlCenter } from '$lib/kenos/controlCenter.svelte.js'
  import {
    canRetryReconnect,
    reconnectDelayMs,
    shouldReconnectAfterOnline,
  } from '$lib/kenos/networkStatus.core.js'
  import { AUTH_WALL_DOCUMENT_TITLE } from '$lib/kenos/clientSessionCleanup.core.js'
  import {
    isIosNativeShell,
    markIosNativeShellDom,
  } from '$lib/kenos/iosNativeShell.js'

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
    '/spaces/paper',
    '/spaces/health',
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
  const hideGlobalNav = $derived(
    (focusFlags().hideGlobalNav && page.url.pathname === '/focus') ||
      isIosNativeShell(),
  )
  const showReturnBanner = $derived(focusFlags().showReturnBanner)

  let captureOpen = $state(false)
  let online = $state(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
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
    if (p === '/spaces/training') return t('nav.spaceTraining')
    if (p === '/spaces/work') return t('nav.spaceWork')
    if (p === '/spaces/plan') return t('nav.spacePlan')
    if (p === '/spaces/money') return t('nav.spaceMoney')
    if (p === '/spaces/music') return t('nav.spaceMusic')
    if (p === '/spaces/home') return t('nav.spaceHome')
    if (p === '/spaces/knowledge') return t('nav.spaceKnowledge')
    if (p === '/focus') return FOCUS.focus?.title || t('nav.focus')
    if (p === '/work') return t('nav.work')
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
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        /** @type {HTMLElement} */ (event.target)?.isContentEditable
      ) {
        return
      }
      event.preventDefault()
      captureOpen = true
      return
    }
    // Continue — Cmd/Ctrl + . (Space switching is Shelf-only; no Quick Switch shortcut)
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key === '.' &&
      !event.shiftKey
    ) {
      const tag = /** @type {HTMLElement | null} */ (event.target)?.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        /** @type {HTMLElement} */ (event.target)?.isContentEditable
      ) {
        return
      }
      event.preventDefault()
      openContinueSheet()
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
    markIosNativeShellDom()
    // Native shell Capture intent (kenos://compose) — expose a compose hook on every
    // shell page so the deep link works outside Domain Mode too.
    window.__KENOS_SHELL_COMPOSE__ = () => {
      if (gated) return
      captureOpen = true
    }
    const cleanupShellSettings = bindKenosShellSettings({
      getTheme: () => S.settings.theme,
      setTheme: (theme) => {
        S.settings.theme = theme
        save()
      },
      applyTheme,
      getLocale: () => S.settings.locale,
      setLocale,
    })
    hydrateFocusStore()
    hydrateSpaceSwitcher()
    applyTheme()
    applyLocale()
    // Cached ping — safe on remount; avoids Today↔Ask /v1/models storms.
    void refreshGateway()
    const firstBoot = takeLayoutBoot()
    // 云同步恢复后：自动写入 Life OS MCP 舰队，再发现工具
    initCloud().then(() => {
      syncSpaceSwitcherOwner()
      // Auth restore lands after the first mount read (which fails closed as
      // permission_denied) — force one refresh so cold boot doesn't sit on the
      // signed-out projection until the 30s throttle expires.
      if (isCloudAuthorized()) void refreshControlCenter({ force: true })
      if (CLOUD_BUILD && !isCloudAuthorized()) {
        // Auth wall: do not seed/hydrate prior-user memory
        return
      }
      if (!firstBoot) return
      if (!CLOUD_BUILD) hydrateMemoryFromLocalStorage()
      seedDefaultMemories()
      backfillVectors()
      return import('$lib/mcp.js')
        .then((m) => m.refreshMcpTools())
        .catch(() => {})
    })
    // 记忆 dreaming:启动稳定后空闲整理(内部限 24h 一次)
    const dreamTimer = firstBoot
      ? setTimeout(() => {
          if (CLOUD_BUILD && !isCloudAuthorized()) return
          dreamMemories()
        }, 30000)
      : null
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
    // HTTPS production only — HTTP LAN Daily Beta may not support Service Worker.
    if (
      typeof navigator !== 'undefined' &&
      typeof location !== 'undefined' &&
      location.protocol === 'https:'
    ) {
      navigator.serviceWorker?.register('/service-worker.js').catch(() => {})
    }
    const disposeAppLogs = installKenosAppLogs({
      app: 'aios',
      getSupabase: () => supabase,
    })

    return () => {
      clearTimeout(dreamTimer)
      clearReconnectTimer()
      cleanupShellSettings()
      cleanupTheme()
      cleanupViewport()
      cleanupVisibility()
      disposeAppLogs()
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
          onSpaceSwitcher={openContinueSheet}
          onSwitchSpace={openSwitchSpaceSheet}
        />
      {:else}
        <BottomNav />
      {/if}
    {/snippet}

    {#snippet header()}
      <LifeOsAppBar
        title={pageTitle}
        hidden={isAssistant || hasCustomHeader || hideGlobalNav}
      >
        {#snippet trailing()}
          {#if !hideGlobalNav}
            <!-- Desktop AppBar — Continue only (Switch Space is Shelf-only) -->
            <button
              type="button"
              class="space-switcher-trigger desktop-only-continue"
              data-testid="kenos-space-switcher-trigger"
              aria-label="Continue to a recent Space"
              title="Continue (⌘.)"
              onclick={openContinueSheet}
            >
              Continue
            </button>
          {/if}
        {/snippet}
      </LifeOsAppBar>
    {/snippet}

    {#snippet main()}
      {#if page.url.pathname !== '/focus' && !isAssistant}
        <!-- Music-style title chrome — Assistant owns its own floating chat top bar. -->
        <KenosSystemBar
          title={pageTitle}
          onCapture={() => (captureOpen = true)}
        />
      {/if}
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
    background: var(
      --kenos-chrome-bg,
      color-mix(in srgb, var(--bg) 80%, transparent)
    );
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
  /* iOS KenosIOS WKWebView — native TabView owns bottom IA (CSS belt + hideGlobalNav) */
  :global(html[data-ios-native-shell='true'] .bottom-nav-host),
  :global(html[data-ios-native-shell='true'] nav.bottom-nav),
  :global(
      html[data-ios-native-shell='true'] [data-testid='aios-shell-bottom-nav']
    ) {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /*
    Native TabView owns bottom IA. Top tools are no longer a fixed overlay —
    Music-style large title + bubble live in the scroll surface and scroll away.
  */
  :global(html[data-ios-native-shell='true']) {
    --kenos-system-bar-h: 0px;
    --kenos-mobile-bottom-pad: 0px;
    --kenos-space-inline: var(--kenos-chrome-inline, 16px);
    --kenos-space-page-top: 0px;
    --mobile-tabbar-total-h: 0px;
    --mobile-content-inset: 0px;
    --mobile-content-inset-tabbar: 0px;
    --bottom-chrome-h: 0px;
    --safe-top-effective: 0px;
    --safe-top: 0px;
  }
  :global(html[data-ios-native-shell='true'] body) {
    min-height: 100dvh;
    background: var(--bg, #f5f3f0);
  }
  :global(html[data-ios-native-shell='true'][data-theme='dark'] body) {
    background: var(--bg, #08090a);
  }
  /* Status-bar clearance only (was 72px for fixed floating tools). */
  :global(html[data-ios-native-shell='true'] .life-os-app-shell__main),
  :global(html[data-ios-native-shell='true'] #main-content) {
    padding-top: var(--kenos-chrome-top-inset, 54px) !important;
    padding-bottom: calc(
      env(safe-area-inset-bottom, 0px) + var(--kenos-dock-scroll-end-pad, 78px)
    ) !important;
    scroll-padding-bottom: calc(
      env(safe-area-inset-bottom, 0px) + var(--kenos-dock-scroll-end-pad, 78px)
    ) !important;
    box-sizing: border-box !important;
  }
  /* Assistant is scrollMode=locked with a pinned composer — bottom clearance
     belongs on the composer, not #main-content (Today scroll-end model). */
  :global(
    html[data-ios-native-shell='true']
      .life-os-app-shell[data-scroll-mode='locked']
      .life-os-app-shell__main
  ),
  :global(
    html[data-ios-native-shell='true']
      .life-os-app-shell[data-scroll-mode='locked']
      #main-content
  ) {
    padding-bottom: 0 !important;
    scroll-padding-bottom: 0 !important;
  }
  :global(html[data-ios-native-shell='true'] .today-page) {
    padding-top: 0 !important;
    padding-bottom: 12px !important;
  }
  :global(html[data-ios-native-shell='true'] .space-page) {
    padding-top: 0 !important;
  }
  /* SystemBar owns the page title on native — avoid double headings / kickers. */
  :global(html[data-ios-native-shell='true'] .today-header .kenos-page-title),
  :global(html[data-ios-native-shell='true'] .spaces-header .kenos-page-title),
  :global(html[data-ios-native-shell='true'] .control-page-header h1),
  :global(html[data-ios-native-shell='true'] .control-page-kicker),
  :global(html[data-ios-native-shell='true'] .spaces-header .kenos-page-title) {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    overflow: hidden !important;
    clip: rect(0 0 0 0) !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
  }
  :global(html[data-ios-native-shell='true'] .control-page-intro),
  :global(html[data-ios-native-shell='true'] .spaces-header .intro) {
    /* Keep one short line of context; tighten under Music title */
    margin-top: 0 !important;
    font-size: 15px !important;
    line-height: 1.4 !important;
    max-width: 34rem;
  }
  :global(html[data-ios-native-shell='true'] .today-header),
  :global(html[data-ios-native-shell='true'] .control-page-header),
  :global(html[data-ios-native-shell='true'] .spaces-header) {
    padding-top: 0 !important;
    padding-bottom: var(--kenos-chrome-title-to-content, 8px) !important;
    border-bottom: 0 !important;
  }
  :global(html[data-ios-native-shell='true'] .today-actions) {
    /* Refresh lives as content affordance — demote vs Music bubble */
    opacity: 0.55;
  }
  :global(html[data-ios-native-shell='true'] .kenos-page-title) {
    margin-top: 0;
    line-height: 1.15;
  }
  /* Assistant owns floating chrome — don't force a transparent strip that fights the veil. */
  :global(html[data-ios-native-shell='true'] .chat-top) {
    min-height: 0 !important;
    border-bottom: 0 !important;
  }

  /*
   * macOS KenosMac WKWebView — sidebar + native titlebar (no bottom dock).
   * WK sets both data-ios-native-shell and data-mac-native-shell; Mac rules
   * must win via higher-specificity attribute selectors.
   */
  :global(html[data-mac-native-shell='true']) {
    --kenos-chrome-top-inset: 8px;
    --kenos-dock-scroll-end-pad: 0px;
    --kenos-native-safe-bottom: 0px;
  }
  /* Assistant locked scroll — composer owns bottom clearance, not #main-content. */
  :global(
    html[data-mac-native-shell='true']
      .life-os-app-shell[data-scroll-mode='locked']
      .life-os-app-shell__main
  ),
  :global(
    html[data-mac-native-shell='true']
      .life-os-app-shell[data-scroll-mode='locked']
      #main-content
  ) {
    padding-bottom: 0 !important;
    scroll-padding-bottom: 0 !important;
  }
</style>
