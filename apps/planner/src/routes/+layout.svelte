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
  import { scheduleBidirectionalSync } from '$lib/sync.js';
  import { registerServiceWorker } from '$lib/swRegister.js';
  import { syncRemindersToServiceWorker } from '$lib/services/reminders.js';
  import { peekSessionUserId, readCache, CACHE_SCOPES } from '$lib/localCache.js';
  import { openTaskEditor } from '$lib/ui.svelte.js';
  import { resolveMobileChromeInset } from '$lib/nav.js';

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
      const task = S.tasks.find((t) => t.id === taskId);
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

  /** 已登录时回到前台：debounce 双向同步（与 FitnessOS 一致） */
  $effect(() => {
    if (!auth.ready || !auth.user) return;
    return bindVisibilitySync(() => scheduleBidirectionalSync(), {
      when: () => Boolean(auth.user)
    });
  });
</script>

<DocumentHead appId="planner" pageTitle={pageTitle} locale={documentLocale} />

<div class="app-shell">
  <div class="safari-chrome-tint-top" aria-hidden="true"></div>
  <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>
  <SyncErrorBanner />
  <ListSidebar />
  <div class="main-col" data-mobile-chrome={mobileChromeInset}>
    {@render children()}
    <Fab />
    <BottomNav />
  </div>
</div>

<Toast />
<TaskEditorSheet />
