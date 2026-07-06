<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import ListSidebar from '$lib/components/ListSidebar.svelte';
  import AppBar from '$lib/components/AppBar.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import TaskEditorSheet from '$lib/components/TaskEditorSheet.svelte';
  import Fab from '$lib/components/Fab.svelte';
  import SyncErrorBanner from '$lib/components/SyncErrorBanner.svelte';
  import DocumentHead from '$lib/components/DocumentHead.svelte';
  import { applyTheme, applyState, save, flushSave, bindAppThemeSystemChange, S, getListById } from '$lib/state.svelte.js';
  import { applyLocale, listLabel, t } from '$lib/i18n/index.js';
  import { auth, initAuth } from '$lib/auth.svelte.js';
  import { bindVisibilitySync } from '@life-os/sync';
  import { scheduleBidirectionalSync, initAutoSync } from '$lib/sync.js';
  import { registerServiceWorker } from '$lib/swRegister.js';
  import { syncRemindersToServiceWorker } from '$lib/services/reminders.js';
  import { peekSessionUserId, readCache, CACHE_SCOPES } from '$lib/localCache.js';
  import { openTaskEditor } from '$lib/ui.svelte.js';
  import { resolveMobileChromeInset, isFabVisible } from '$lib/nav.js';

  let { children } = $props();

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname;
    if (p === '/') return t('home.title');
    if (p === '/inbox') return t('inbox.title');
    if (p === '/upcoming') return t('upcoming.title');
    if (p === '/calendar') return t('calendar.title');
    if (p === '/search') return t('search.title');
    if (p === '/completed') return t('completed.title');
    if (p === '/settings') return t('settings.title');
    if (p === '/auth') return t('auth.title');

    const listMatch = p.match(/^\/lists\/([^/]+)$/);
    if (listMatch) {
      const list = getListById(listMatch[1]);
      return list ? listLabel(list) : t('nav.lists');
    }

    return t('app.name');
  });

  const documentLocale = $derived(S.settings.locale === 'en' ? 'en' : 'zh');

  const mobileChromeInset = $derived(resolveMobileChromeInset(page.url.pathname));
  const fabVisible = $derived(isFabVisible(page.url.pathname));

  onMount(() => {
    const cachedUserId = peekSessionUserId();
    if (cachedUserId) {
      const cached = readCache(CACHE_SCOPES.state, cachedUserId);
      if (cached) {
        applyState(cached, 'replace');
        save();
      }
    }

    applyTheme();
    applyLocale();
    const cleanupAuth = initAuth();
    registerServiceWorker();
    syncRemindersToServiceWorker();

    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('task');
    if (taskId) {
      const task = S.tasks.find((t) => t.id === taskId && !t.deletedAt);
      if (task) openTaskEditor(task);
      history.replaceState({}, '', window.location.pathname);
    }

    const onVisible = () => syncRemindersToServiceWorker();
    document.addEventListener('visibilitychange', onVisible);
    const onHide = () => flushSave();
    window.addEventListener('pagehide', onHide);

    const cleanupTheme = bindAppThemeSystemChange();
    return () => {
      cleanupTheme();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onHide);
      cleanupAuth();
    };
  });

  /** 已登录时：回到前台 debounce 双向同步 + 编辑后自动上云 / 离线恢复补同步 */
  $effect(() => {
    if (!auth.ready || !auth.user) return;
    const cleanupVisibility = bindVisibilitySync(() => scheduleBidirectionalSync(), {
      when: () => Boolean(auth.user)
    });
    const cleanupAutoSync = initAutoSync({ isSignedIn: () => Boolean(auth.user) });
    return () => {
      cleanupVisibility();
      cleanupAutoSync();
    };
  });
</script>

<DocumentHead appId="planner" pageTitle={pageTitle} locale={documentLocale} />

<div class="app-shell">
  <div class="safari-chrome-tint-top" aria-hidden="true"></div>
  <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>
  <SyncErrorBanner />
  <ListSidebar />
  <div class="main-col" data-mobile-chrome={mobileChromeInset} data-fab-visible={fabVisible ? 'true' : 'false'}>
    {@render children()}
    <Fab />
    <BottomNav />
  </div>
</div>

<Toast />
<TaskEditorSheet />
