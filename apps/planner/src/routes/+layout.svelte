<script>
  import '../app.css'
  import { onMount, setContext } from 'svelte'
  import { afterNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import ListSidebar from '$lib/components/ListSidebar.svelte'
  import AppBar from '$lib/components/AppBar.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import Toast from '$lib/components/Toast.svelte'
  import TaskEditorSheet from '$lib/components/TaskEditorSheet.svelte'
  import QuickSchedulePopover from '$lib/components/schedule/QuickSchedulePopover.svelte'
  import ScheduleSlotSheet from '$lib/components/schedule/ScheduleSlotSheet.svelte'
  import Fab from '$lib/components/Fab.svelte'
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
  import { syncRemindersToServiceWorker } from '$lib/services/reminders.js'
  import { consumePendingLifeEvents } from '$lib/services/lifeEventsInbox.js'
  import {
    peekSessionUserId,
    readCache,
    CACHE_SCOPES,
  } from '$lib/localCache.js'
  import { openTaskEditor } from '$lib/ui.svelte.js'
  import { resolveMobileChromeInset, isFabVisible } from '$lib/nav.js'

  let { children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p === '/') return t('home.title')
    if (p === '/inbox') return t('inbox.title')
    if (p === '/upcoming') return t('upcoming.title')
    if (p === '/schedule') return t('schedule.title')
    if (p === '/calendar') return t('calendar.title')
    if (p === '/search') return t('search.title')
    if (p === '/completed') return t('completed.title')
    if (p === '/settings') return t('settings.title')
    if (p === '/auth') return t('auth.title')

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

  onMount(() => {
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

    const params = new URLSearchParams(window.location.search)
    const taskId = params.get('task')
    if (taskId) {
      const task = S.tasks.find((t) => t.id === taskId && !t.deletedAt)
      if (task) openTaskEditor(task)
      history.replaceState({}, '', window.location.pathname)
    }

    const onHide = () => flushSave()
    window.addEventListener('pagehide', onHide)

    const cleanupTheme = bindAppThemeSystemChange()
    const cleanupViewport = bindViewportHeight()
    const cleanupForeground = bindPwaForegroundResume({
      onForeground: () => syncRemindersToServiceWorker(),
    })
    return () => {
      cleanupTheme()
      cleanupViewport()
      cleanupForeground()
      window.removeEventListener('pagehide', onHide)
      cleanupAuth()
    }
  })

  /** 已登录时：回到前台 debounce 双向同步 + life_events 消费 + 编辑后自动上云 */
  $effect(() => {
    if (!auth.ready || !auth.user) return

    consumePendingLifeEvents().catch(() => {})

    const cleanupVisibility = bindPwaForegroundResume({
      onForeground: () => {
        scheduleBidirectionalSync()
        consumePendingLifeEvents().catch(() => {})
      },
    })
    const cleanupAutoSync = initAutoSync({
      isSignedIn: () => Boolean(auth.user),
    })
    return () => {
      cleanupVisibility()
      cleanupAutoSync()
    }
  })

  afterNavigate(() => {
    resetScrollLock()
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
    class="main-col"
    data-mobile-chrome={mobileChromeInset}
    data-fab-visible={fabVisible ? 'true' : 'false'}
  >
    {@render children()}
    <Fab />
    <BottomNav />
  </div>
</div>

<Toast />
<TaskEditorSheet />
<QuickSchedulePopover />
<ScheduleSlotSheet />
