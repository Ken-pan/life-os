<script>
  // Port of src/main.tsx bootstrap (viewport/PWA bindings, legacy route migration, purchase
  // image base URL) + the AuthGate > AppShell > page nesting that used to live in App.tsx.
  import '../app.css'
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import DocumentHead from '@life-os/platform-web/svelte/head'
  import AuthGate, {
    notifyLocalePersist,
  } from '$lib/components/AuthGate.svelte'
  import AppShell from '$lib/components/AppShell.svelte'
  import { migrateLegacyRouteUrl } from '@life-os/finance-core/routing/app-route'
  import { bindViewportHeight, bindPwaForegroundResume } from '@life-os/theme'
  import { registerServiceWorker } from '@life-os/platform-web/sw-lifecycle'
  import { requestPersistentStorage } from '@life-os/platform-web/persistent-storage'
  import { ensureNativeUnlock } from '@life-os/platform-web/kenos-native-bridge'
  import { dev } from '$app/environment'
  import { setPurchaseImageBaseUrl } from '$lib/engine/purchaseEnrichment'
  import { supabase, supabaseUrl } from '$lib/supabase.js'
  import { t, initLocale } from '$lib/i18n.svelte.js'
  import {
    markIosNativeShellDom,
    isIosNativeShell,
  } from '@life-os/platform-web/ios-native-shell'
  import {
    installMoneyLeaveGuard,
    persistMoneyContinue,
    suspendMoneySpace,
  } from '$lib/kenos/financeSpaceAdapter.js'
  import { installKenosAppLogs } from '@life-os/platform-web/kenos-app-logs'
  import '$lib/repo'

  let { children } = $props()

  let unlockState = $state(/** @type {'pending'|'open'|'locked'} */ ('open'))

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p.startsWith('/home')) {
      return p.includes('overview')
        ? t('nav.overviewTitle')
        : t('nav.todayTitle')
    }
    if (p.startsWith('/accounts')) return t('nav.accountsTitle')
    if (p.startsWith('/stocks')) return t('nav.stocksTitle')
    if (p.startsWith('/history')) return t('nav.historyTitle')
    if (p.startsWith('/forecast')) return t('nav.forecastTitle')
    if (p.startsWith('/decision')) return t('nav.decisionTitle')
    if (p.startsWith('/review')) return t('nav.reviewTitle')
    if (p.startsWith('/settings')) return t('nav.settingsTitle')
    return t('nav.todayTitle')
  })

  onMount(() => {
    markIosNativeShellDom()
    if (isIosNativeShell()) {
      unlockState = 'pending'
      installMoneyLeaveGuard()
      persistMoneyContinue(suspendMoneySpace())
      void ensureNativeUnlock({
        storageKey: 'kenos.unlock.money',
        reason: 'Unlock Money',
      }).then((r) => {
        unlockState = r.ok || r.skipped ? 'open' : 'locked'
      })
    }

    const cleanupLocale = initLocale({
      onLocaleChange: (locale) => notifyLocalePersist(locale),
    })

    // migrateLegacyRouteUrl() rewrites `#/tab/section` and bare `/` via history.replaceState;
    // resync SvelteKit's client router so page.url reflects the corrected pathname.
    const beforeHref = window.location.href
    migrateLegacyRouteUrl()
    if (window.location.href !== beforeHref) {
      void goto(`${window.location.pathname}${window.location.search}`, {
        replaceState: true,
        noScroll: true,
        keepFocus: true,
      })
    }

    setPurchaseImageBaseUrl(supabaseUrl)

    const cleanupViewport = bindViewportHeight()
    const cleanupForeground = bindPwaForegroundResume()
    const cleanupServiceWorker = registerServiceWorker({ enabled: !dev })
    void requestPersistentStorage()
    const disposeAppLogs = installKenosAppLogs({
      app: 'finance',
      getSupabase: () => supabase,
    })

    return () => {
      cleanupLocale()
      cleanupViewport()
      cleanupForeground()
      cleanupServiceWorker()
      disposeAppLogs()
    }
  })
</script>

<DocumentHead appId="finance" {pageTitle} />

{#if unlockState === 'locked'}
  <main class="money-unlock-gate" data-testid="money-native-unlock-gate">
    <h1>Money locked</h1>
    <p>Use Face ID or passcode to open Money in Kenos.</p>
    <button
      type="button"
      onclick={() => {
        unlockState = 'pending'
        void ensureNativeUnlock({
          storageKey: 'kenos.unlock.money',
          reason: 'Unlock Money',
          force: true,
        }).then((r) => {
          unlockState = r.ok || r.skipped ? 'open' : 'locked'
        })
      }}
    >
      Unlock
    </button>
  </main>
{:else if unlockState === 'pending'}
  <main
    class="money-unlock-gate"
    data-testid="money-native-unlock-pending"
    aria-busy="true"
  >
    <p>Unlocking Money…</p>
  </main>
{:else}
  <AuthGate>
    <AppShell>
      {@render children()}
    </AppShell>
  </AuthGate>
{/if}

<style>
  .money-unlock-gate {
    box-sizing: border-box;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem 1.5rem;
    text-align: center;
    color: #e8e6e3;
    background: #121212;
  }

  .money-unlock-gate h1 {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 600;
  }

  .money-unlock-gate p {
    margin: 0;
    max-width: 22rem;
    font-size: 0.95rem;
    line-height: 1.45;
    color: #b8b4ae;
  }

  .money-unlock-gate button {
    margin-top: 0.5rem;
    padding: 0.65rem 1.25rem;
    border: 1px solid #3a3a3a;
    border-radius: 0.5rem;
    background: #1e1e1e;
    color: #e8e6e3;
    font: inherit;
    cursor: pointer;
  }

  .money-unlock-gate button:hover {
    background: #2a2a2a;
  }
</style>
