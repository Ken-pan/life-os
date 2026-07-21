<script>
  import '../app.css'
  import { onMount, setContext } from 'svelte'
  import { afterNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import ListSidebar from '$lib/components/ListSidebar.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import Toast from '$lib/components/Toast.svelte'
  import TaskEditorSheet from '$lib/components/TaskEditorSheet.svelte'
  import QuickSchedulePopover from '$lib/components/schedule/QuickSchedulePopover.svelte'
  import ScheduleSlotSheet from '$lib/components/schedule/ScheduleSlotSheet.svelte'
  import Fab from '$lib/components/Fab.svelte'
  import TaskListDrawer from '$lib/components/TaskListDrawer.svelte'
  import SyncErrorBanner from '@life-os/platform-web/svelte/sync-error'
  import DocumentHead from '@life-os/platform-web/svelte/head'
  import { ICON_REGISTRY_CONTEXT_KEY } from '@life-os/platform-web/icon-registry'
  import { ICONS } from '$lib/iconRegistry.js'
  import { subscribeSyncError } from '$lib/syncNotify.js'
  import {
    applyTheme,
    applyState,
    save,
    flushSave,
    bindAppThemeSystemChange,
    S,
    getListById,
  } from '$lib/state.svelte.js'
  import { applyLocale, listLabel, t } from '$lib/i18n/index.js'
  import { auth, initAuth } from '$lib/auth.svelte.js'
  import {
    bindViewportHeight,
    bindPwaForegroundResume,
    resetScrollLock,
  } from '@life-os/theme'
  import PortraitGate from '@life-os/platform-web/svelte/portrait-gate'
  import { scheduleBidirectionalSync, initAutoSync } from '$lib/sync.js'
  import { registerServiceWorker } from '$lib/swRegister.js'
  import { bindNetworkResume } from '@life-os/platform-web/network-resume'
  import { setAppBadgeCount } from '@life-os/platform-web/app-badge'
  import { requestPersistentStorage } from '@life-os/platform-web/persistent-storage'
  import {
    markIosNativeShellDom,
    isIosNativeShell,
  } from '@life-os/platform-web/ios-native-shell'
  import {
    syncRemindersToServiceWorker,
    ensurePushSubscription,
  } from '$lib/services/reminders.js'
  import { consumePendingLifeEvents } from '$lib/services/lifeEventsInbox.js'
  import { selectTodayGroups } from '$lib/domain/selectors.js'
  import { taskIndex } from '$lib/taskIndex.svelte.js'
  import {
    peekSessionUserId,
    readCache,
    CACHE_SCOPES,
  } from '$lib/localCache.js'
  import { browser } from '$app/environment'
  import {
    openTaskEditor,
    taskEditor,
    taskDrawer,
    schedulePopover,
    scheduleSlot,
  } from '$lib/ui.svelte.js'
  import {
    resolveMobileChromeInset,
    isFabVisible,
    isDomainComposeVisible,
    isTaskModuleRoute,
  } from '$lib/nav.js'
  import DomainMusicHeader from '$lib/components/DomainMusicHeader.svelte'
  import {
    applyPlannerResumeFromLocation,
    installKenosLeaveGuard,
    publishPlannerNavManifest,
    resolvePlannerLiveState,
  } from '$lib/kenos/plannerSpaceAdapter.js'
  import { installKenosAppLogs } from '@life-os/platform-web/kenos-app-logs'
  import { supabase } from '$lib/supabase.js'

  let { children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p === '/') return t('home.title')
    if (p === '/inbox') return t('inbox.title')
    if (p === '/upcoming') return t('upcoming.title')
    if (p === '/calendar' || p === '/schedule') return t('calendar.title')
    if (p === '/search') return t('search.title')
    if (p === '/completed') return t('completed.title')
    if (p === '/settings') return t('settings.title')
    if (p === '/triage') return t('nav.triage')
    if (p === '/auth') return t('auth.title')
    if (p.startsWith('/projects')) return t('projects.title')
    if (p.startsWith('/insights')) return t('insights.title')

    const listMatch = p.match(/^\/lists\/([^/]+)$/)
    if (listMatch) {
      const list = getListById(listMatch[1])
      return list ? listLabel(list) : t('nav.lists')
    }

    return t('app.name')
  })

  const documentLocale = $derived(S.settings.locale === 'en' ? 'en' : 'zh')

  const mobileChromeInset = $derived(
    resolveMobileChromeInset(page.url.pathname, page.url.search),
  )
  const fabVisible = $derived(isFabVisible(page.url.pathname, page.url.search))
  const domainComposeVisible = $derived(
    isDomainComposeVisible(page.url.pathname, page.url.search),
  )
  const showListsMenu = $derived(
    isTaskModuleRoute(page.url.pathname) ||
      page.url.pathname.startsWith('/lists/'),
  )
  const showDomainBack = $derived(
    page.url.pathname.startsWith('/settings') ||
      page.url.pathname.startsWith('/auth') ||
      page.url.pathname.startsWith('/projects/'),
  )
  /** Native Continuity header on all domain routes (Settings/Auth/Triage included). */
  const showDomainHeader = $derived(isIosNativeShell())

  /** Drive CSS pad + native dock hide; keep dataset in sync with overlay chrome. */
  $effect(() => {
    if (!browser || !isIosNativeShell()) return
    // Touch overlay stores so liveState stays reactive.
    void taskEditor.open
    void taskDrawer.open
    void schedulePopover.open
    void scheduleSlot.open
    const live = resolvePlannerLiveState()
    document.documentElement.dataset.kenosLiveState = live
    return () => {
      delete document.documentElement.dataset.kenosLiveState
    }
  })

  onMount(() => {
    markIosNativeShellDom()
    const cachedUserId = peekSessionUserId()
    if (cachedUserId) {
      const cached = readCache(CACHE_SCOPES.state, cachedUserId)
      if (cached) {
        applyState(cached, 'replace')
        save()
      }
    }

    applyTheme()
    applyLocale()
    const cleanupAuth = initAuth()
    registerServiceWorker()
    syncRemindersToServiceWorker()
    void requestPersistentStorage()

    const params = new URLSearchParams(window.location.search)
    const taskId = params.get('task') || params.get('kenosTask')
    if (taskId) {
      const task = S.tasks.find((t) => t.id === taskId && !t.deletedAt)
      if (task) openTaskEditor(task)
      // Keep kenos* params until applyPlannerResumeFromLocation cleans intent;
      // strip only legacy `task` alone for back-compat.
      if (params.get('task') && !params.get('kenosTask')) {
        history.replaceState({}, '', window.location.pathname)
      }
    }
    void applyPlannerResumeFromLocation()
    installKenosLeaveGuard()

    const onHide = () => flushSave()
    window.addEventListener('pagehide', onHide)

    const cleanupTheme = bindAppThemeSystemChange()
    const cleanupViewport = bindViewportHeight()
    const cleanupForeground = bindPwaForegroundResume({
      onForeground: () => syncRemindersToServiceWorker(),
    })
    const disposeAppLogs = installKenosAppLogs({
      app: 'planner',
      getSupabase: () => supabase,
    })
    return () => {
      cleanupTheme()
      cleanupViewport()
      cleanupForeground()
      disposeAppLogs()
      window.removeEventListener('pagehide', onHide)
      cleanupAuth()
    }
  })

  /** 已登录时：回到前台 debounce 双向同步 + life_events 消费 + 编辑后自动上云 */
  $effect(() => {
    if (!auth.ready || !auth.user) return

    consumePendingLifeEvents().catch(() => {})

    const cleanupForeground = bindNetworkResume({
      onResume: () => {
        scheduleBidirectionalSync()
        consumePendingLifeEvents().catch(() => {})
      },
      when: () => Boolean(auth.user),
    })
    const cleanupAutoSync = initAutoSync({
      isSignedIn: () => Boolean(auth.user),
    })
    return () => {
      cleanupForeground()
      cleanupAutoSync()
    }
  })

  /** 逾期任务数 → 主屏幕图标角标（iOS 16.4+ 已安装 PWA） */
  $effect(() => {
    const overdue = selectTodayGroups(taskIndex()).overdue.length
    void setAppBadgeCount(overdue)
    return () => {
      void setAppBadgeCount(0)
    }
  })

  /** 已开启提醒时确保 Web Push 订阅（登录后 / 设置变更） */
  $effect(() => {
    if (!auth.ready || !auth.user || !S.settings.notificationsEnabled) return
    void ensurePushSubscription()
  })

  afterNavigate(() => {
    resetScrollLock()
    if (isIosNativeShell()) void publishPlannerNavManifest()
  })
</script>

<DocumentHead appId="planner" {pageTitle} locale={documentLocale} />

<PortraitGate
  enabled={S.settings.lockPortraitOnPhone !== false}
  title={t('settings.rotatePortrait')}
  hint={t('settings.rotatePortraitHint')}
/>

<div class="app-shell">
  <div class="safari-chrome-tint-top" aria-hidden="true"></div>
  <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>
  <SyncErrorBanner
    subscribe={subscribeSyncError}
    formatMessage={(reason) => t('sync.banner', { reason })}
    dismissLabel={t('common.close')}
  />
  <ListSidebar />
  <div
    class="main-col life-os-shell-column"
    data-mobile-chrome={mobileChromeInset}
    data-fab-visible={fabVisible ? 'true' : 'false'}
  >
    {#if showDomainHeader}
      <DomainMusicHeader
        title={pageTitle}
        domainLabel="Plan"
        showCompose={domainComposeVisible}
        showBack={showDomainBack}
        {showListsMenu}
      />
    {/if}
    {@render children()}
    {#if !showDomainHeader}
      <Fab />
    {/if}
  </div>

  {#if !showDomainHeader}
    <div class="bottom-shell">
      <BottomNav />
    </div>
  {/if}
</div>

<Toast />
<TaskListDrawer />
<TaskEditorSheet />
<QuickSchedulePopover />
<ScheduleSlotSheet />

<style>
  /* Kenos Domain Mode — native dock is the only bottom bar */
  :global(html[data-ios-native-shell='true'] .bottom-shell),
  :global(html[data-ios-native-shell='true'] nav.bottom-nav) {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  :global(html[data-ios-native-shell='true']) {
    --mobile-tabbar-total-h: 0px;
    --bottom-chrome-h: 0px;
    --mobile-content-inset-tabbar: 0px;
  }
  /*
    ONE scroll-root pad only (.main-col) — match KenosWebChrome topPad/bottomPad.
    Nested .app-shell / .life-os-page-workspace must stay 0 (avoid 54+54 stacking).
  */
  :global(html[data-ios-native-shell='true'] .main-col) {
    padding-top: 54px !important;
    padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
    box-sizing: border-box !important;
  }
  /* Overlays hide Domain dock — reclaim the 80px capsule reserve. */
  :global(
      html[data-ios-native-shell='true'][data-kenos-live-state='editing']
        .main-col
    ),
  :global(
      html[data-ios-native-shell='true'][data-kenos-live-state='sheet']
        .main-col
    ),
  :global(
      html[data-ios-native-shell='true'][data-kenos-live-state='drawer']
        .main-col
    ) {
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)) !important;
  }
  /* iPad desktop breakpoint would otherwise resurface the web sidebar under Continuity. */
  :global(html[data-ios-native-shell='true'] .sidebar) {
    display: none !important;
  }
  :global(html[data-ios-native-shell='true'] .app-shell),
  :global(html[data-ios-native-shell='true'] .life-os-page-workspace) {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }
  :global(html[data-ios-native-shell='true'] .domain-music-header) {
    padding-top: 0;
    padding-bottom: 8px;
    padding-inline: 16px;
  }
  /* Domain dock owns bottom; compose is DomainMusicHeader + — hide Material FAB. */
  :global(html[data-ios-native-shell='true'] .fab) {
    display: none !important;
  }
  /* DomainMusicHeader owns top chrome — hide web AppBar on settings/triage/etc. */
  :global(html[data-ios-native-shell='true'] .appbar),
  :global(html[data-ios-native-shell='true'] .life-os-app-bar),
  :global(html[data-ios-native-shell='true'] header.appbar) {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
</style>
