<script>
  // Port of src/main.tsx bootstrap (viewport/PWA bindings, legacy route migration, purchase
  // image base URL) + the AuthGate > AppShell > page nesting that used to live in App.tsx.
  import '../app.css'
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import DocumentHead from '@life-os/platform-web/svelte/head'
  import AuthGate, { notifyLocalePersist } from '$lib/components/AuthGate.svelte'
  import AppShell from '$lib/components/AppShell.svelte'
  import { migrateLegacyRouteUrl } from '@life-os/finance-core/routing/app-route'
  import { bindViewportHeight, bindPwaForegroundResume } from '@life-os/theme'
  import { setPurchaseImageBaseUrl } from '$lib/engine/purchaseEnrichment'
  import { supabaseUrl } from '$lib/supabase.js'
  import { t, initLocale } from '$lib/i18n.svelte.js'
  import '$lib/repo'

  let { children } = $props()

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p.startsWith('/home')) {
      return p.includes('overview') ? t('nav.overviewTitle') : t('nav.todayTitle')
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

    return () => {
      cleanupLocale()
      cleanupViewport()
      cleanupForeground()
    }
  })
</script>

<DocumentHead appId="finance" {pageTitle} />

<AuthGate>
  <AppShell>
    {@render children()}
  </AppShell>
</AuthGate>
