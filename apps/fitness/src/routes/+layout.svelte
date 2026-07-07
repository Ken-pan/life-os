<script>
  import '../app.css'
  import '$lib/styles/weight-controls.css'
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import AppBar from '$lib/components/AppBar.svelte'
  import SideNav from '$lib/components/SideNav.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import TimerWidget from '$lib/components/TimerWidget.svelte'
  import WeightModal from '$lib/components/WeightModal.svelte'
  import SetLogSheet from '$lib/components/SetLogSheet.svelte'
  import SkipModal from '$lib/components/SkipModal.svelte'
  import KnowledgeSheet from '$lib/components/KnowledgeSheet.svelte'
  import FitnessToolSheet from '$lib/components/FitnessToolSheet.svelte'
  import Toast from '$lib/components/Toast.svelte'
  import SyncErrorBanner from '$lib/components/SyncErrorBanner.svelte'
  import PortraitGate from '$lib/components/PortraitGate.svelte'
  import { S, applyTheme, bindAppThemeSystemChange } from '$lib/state.svelte.js'
  import { auth, initAuth } from '$lib/auth.svelte.js'
  import { bindViewportHeight, bindPwaForegroundResume } from '@life-os/theme'
  import { shouldDeferFitnessForegroundSync } from '$lib/pwaResume.js'
  import {
    scheduleAutoCloudPush,
    scheduleBidirectionalSync,
  } from '$lib/sync.js'
  import { initTimer, timer } from '$lib/timer.svelte.js'
  import { bindFitnessAudioCleanup } from '$lib/audio.js'
  import { getProgram } from '$lib/programRuntime.js'
  import { finalizeStaleSessions } from '$lib/session.js'
  import { todayDayId } from '$lib/state.svelte.js'
  import { toast } from '$lib/ui.svelte.js'
  import { t, applyLocale } from '$lib/i18n/index.js'
  import DocumentHead from '$lib/components/DocumentHead.svelte'

  let { children } = $props()

  const pageTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p === '/') return t('layout.titleToday')
    if (p === '/program') return t('layout.titleProgram')
    if (p === '/program/edit') return t('layout.titleProgramEdit')
    if (p === '/discover') return t('layout.titleDiscover')
    if (p === '/discover/tools') return t('layout.titleTools')
    if (p === '/discover/records') return t('layout.titleRecords')
    if (p === '/discover/stats') return t('layout.titleStats')
    if (p === '/library') return t('layout.titleLibrary')
    if (p === '/settings') return t('layout.titleSettings')
    if (p === '/auth') return t('layout.titleAuth')

    const dayMatch = p.match(/^\/day\/([^/]+)(?:\/(focus|summary))?$/)
    if (dayMatch) {
      const day = getProgram().days[dayMatch[1]]
      const cn = day?.cn ?? ''
      if (dayMatch[2] === 'focus') return t('layout.titleFocus', { day: cn })
      if (dayMatch[2] === 'summary')
        return t('layout.titleSummary', { day: cn })
      if (day) return t('layout.titleDayOverview', { day: cn })
    }

    return t('layout.titleDefault')
  })

  const documentLocale = $derived(S.settings.locale === 'en' ? 'en' : 'zh')

  const appBarHidden = $derived(
    /\/focus$|\/summary$|^\/day\/[^/]+$|^\/program\/edit$|^\/discover\/|^\/library$/.test(
      page.url.pathname,
    ),
  )

  const appBarTitle = $derived.by(() => {
    const p = page.url.pathname
    if (p === '/') return t('nav.today')
    if (p === '/program') return t('program.title')
    if (p === '/discover') return t('nav.discover')
    if (p === '/settings') return t('settings.title')
    if (p === '/auth') return t('auth.title')
    return ''
  })

  const appBarSubtitle = $derived.by(() => {
    if (page.url.pathname === '/program') return getProgram().meta.name
    return ''
  })

  const appBarMeta = $derived.by(() => {
    if (page.url.pathname !== '/') return ''
    const day = getProgram().days[todayDayId()]
    return t('home.appBarToday', { day: day?.cn ?? '' })
  })

  const appBarBack = $derived.by(() => {
    if (page.url.pathname === '/auth') {
      return { href: '/settings', label: t('nav.settings') }
    }
    return null
  })

  onMount(() => {
    applyTheme()
    applyLocale()

    const { finalized } = finalizeStaleSessions()
    if (finalized) {
      const msg = t('layout.autoFinalize', { count: finalized })
      setTimeout(() => toast(msg), 1400)
      scheduleAutoCloudPush()
    }
    let cleanupTimer = () => {}
    const cleanupTheme = bindAppThemeSystemChange()
    const cleanupViewport = bindViewportHeight()

    cleanupTimer = initTimer()
    const cleanupAuth = initAuth()
    const cleanupAudio = bindFitnessAudioCleanup()

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    return () => {
      cleanupTheme()
      cleanupViewport()
      cleanupTimer()
      cleanupAuth()
      cleanupAudio()
    }
  })

  $effect(() => {
    S.settings.locale
    applyLocale()
  })

  /** 已登录时回到前台：视口立刻校正；专注/计时中延后云同步 */
  $effect(() => {
    if (!auth.ready || !auth.user) return
    return bindPwaForegroundResume({
      onForeground: () => scheduleBidirectionalSync(),
      shouldDefer: () =>
        shouldDeferFitnessForegroundSync(page.url.pathname, timer),
    })
  })
</script>

<DocumentHead appId="fitness" {pageTitle} locale={documentLocale} />

<PortraitGate enabled={S.settings.lockPortraitOnPhone !== false} />

<a class="skip-link" href="#main-content">{t('common.skipToContent')}</a>

<div class="app-shell">
  <div class="safari-chrome-tint-top" aria-hidden="true"></div>
  <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>
  <SyncErrorBanner />
  <SideNav />

  <div class="main-wrap" data-mobile-chrome="tabbar">
    <AppBar
      title={appBarTitle}
      subtitle={appBarSubtitle}
      meta={appBarMeta}
      backHref={appBarBack?.href}
      backLabel={appBarBack?.label}
      hidden={appBarHidden}
    />

    <main id="main-content">
      {@render children()}
    </main>
  </div>
</div>

<TimerWidget />
<BottomNav />
<WeightModal />
<SetLogSheet />
<SkipModal />
<KnowledgeSheet />
<FitnessToolSheet />
<Toast />
