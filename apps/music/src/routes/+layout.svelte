<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import AppBar from '$lib/components/AppBar.svelte';
  import SideNav from '$lib/components/SideNav.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import MiniPlayer from '$lib/components/MiniPlayer.svelte';
  import QueueDrawer from '$lib/components/QueueDrawer.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import DocumentHead from '$lib/components/DocumentHead.svelte';
  import { S, applyTheme, bindAppThemeSystemChange } from '$lib/state.svelte.js';
  import { applyLocale, t } from '$lib/i18n/index.js';
  import { resolvePageTitle, resolvePageBack, isNavChromeHidden } from '$lib/nav.js';
  import { pageChrome, resetPageChrome } from '$lib/pageChrome.svelte.js';
  import { player } from '$lib/player.svelte.js';
  import { applyTrackAmbience } from '$lib/trackAmbience.js';
  import { ensureBuiltinPlaylists } from '$lib/db.js';
  import { ensureArtRepaired, ensureMetadataRepaired, ensureLyricsRepaired } from '$lib/import.js';
  import { initAuth, auth } from '$lib/auth.svelte.js';
  import { bindVisibilitySync } from '@life-os/sync';
  import { syncBidirectional } from '$lib/sync.js';
  import { bindBackgroundPlayback } from '$lib/backgroundAudio.js';

  let { children } = $props();

  const appBarHidden = $derived(isNavChromeHidden(page.url.pathname));
  const pageTitle = $derived(
    pageChrome.title ?? (appBarHidden ? undefined : resolvePageTitle(page.url.pathname, t))
  );
  const appBarSubtitle = $derived(pageChrome.subtitle ?? undefined);
  const appBarBackHref = $derived(pageChrome.backHref ?? resolvePageBack(page.url.pathname) ?? undefined);
  const appBarBackLabel = $derived(pageChrome.backLabel ?? undefined);
  const playerChrome = $derived((player.queue[player.index] ?? null) ? 'mini' : 'none');

  onMount(() => {
    applyTheme();
    applyLocale();
    ensureBuiltinPlaylists();
    ensureArtRepaired().catch(() => {});
    const cleanupTheme = bindAppThemeSystemChange();
    const cleanupAuth = initAuth();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const cleanupBackground = bindBackgroundPlayback();
    return () => {
      cleanupTheme();
      cleanupAuth();
      cleanupBackground();
    };
  });

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    const from = navigation.from?.url.pathname ?? '';
    const to = navigation.to?.url.pathname ?? '';
    if (!from.startsWith('/now-playing') && !to.startsWith('/now-playing')) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  $effect(() => {
    page.url.pathname;
    resetPageChrome();
  });

  $effect(() => {
    if (!auth.ready || !auth.user) return;
    ensureMetadataRepaired().catch(() => {});
    ensureLyricsRepaired().catch(() => {});
    return bindVisibilitySync(() => syncBidirectional({ silent: true }), {
      when: () => Boolean(auth.user)
    });
  });

  $effect(() => {
    S.settings.locale;
    applyLocale();
  });

  $effect(() => {
    const track = player.queue[player.index] ?? null;
    applyTrackAmbience(track);
  });
</script>

<DocumentHead appId="music" pageTitle={pageTitle} />

<div class="app-shell">
  <SideNav />
  <div class="safari-chrome-tint-top" aria-hidden="true"></div>
  <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>

  <div class="main-wrap" data-mobile-chrome="tabbar" data-player-chrome={playerChrome === 'mini' ? 'mini' : undefined}>
    <AppBar
      hidden={appBarHidden}
      title={appBarHidden ? undefined : pageTitle}
      subtitle={appBarSubtitle}
      backHref={appBarBackHref}
      backLabel={appBarBackLabel}
    />
    <main id="main-content">{@render children()}</main>
  </div>
</div>

<MiniPlayer />
<QueueDrawer />
<BottomNav />
<Toast />
