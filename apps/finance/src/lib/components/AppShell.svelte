<script>
  // Port of src/components/AppShell.tsx navigation chrome. Per-tab views (HomeHubView,
  // AccountsView, RecordsView, ...) render via SvelteKit routes and are passed in as `children`.
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import {
    LayoutGrid,
    PieChart,
    Receipt,
    BarChart3,
    ClipboardList,
    LineChart,
    Scale,
    Settings,
    MoreHorizontal,
    ChevronRight,
    X,
  } from '@lucide/svelte'
  import {
    buildAppPath,
    parseAppPath,
  } from '@life-os/finance-core/routing/app-route'
  import { liquidCashLabel, netWorthLabel } from '@life-os/finance-core/copy/terminology'
  import { daysSince, formatDateForIntl } from '@life-os/finance-core/format/date'
  import { MOBILE_PRIMARY_TAB_IDS, isMoreNavActive } from '$lib/nav'
  import { t } from '$lib/i18n.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import {
    activateFocusTrap,
    resetScrollLock,
    DEFAULT_PWA_SETTINGS,
    normalizePwaSettings,
  } from '@life-os/theme'
  import SyncErrorBanner from '@life-os/platform-web/svelte/sync-error'
  import PortraitGate from '@life-os/platform-web/svelte/portrait-gate'
  import AppBrandSwitcher from '@life-os/platform-web/svelte/brand/switcher'
  import { subscribeSyncError } from '$lib/syncNotify'
  import ExtensionSyncBridge from './ExtensionSyncBridge.svelte'
  import AppBar from './AppBar.svelte'
  import { auth } from '$lib/auth.svelte.js'
  import { LIFE_OS_PERSONAL_OWNER_EMAIL } from '@life-os/sync'

  /** @type {{ children?: import('svelte').Snippet }} */
  let { children } = $props()

  const finance = getFinanceStore()

  const PWA_SETTINGS_STORAGE_KEY = 'fos-pwa-settings'

  function readPwaSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(PWA_SETTINGS_STORAGE_KEY) ?? 'null')
      return normalizePwaSettings(raw)
    } catch {
      return { ...DEFAULT_PWA_SETTINGS }
    }
  }

  let pwaSettings = $state(
    typeof localStorage === 'undefined' ? { ...DEFAULT_PWA_SETTINGS } : readPwaSettings(),
  )

  const ICON_BY_TAB = {
    home: LayoutGrid,
    accounts: PieChart,
    history: Receipt,
    stocks: BarChart3,
    forecast: LineChart,
    decision: Scale,
    review: ClipboardList,
    settings: Settings,
  }

  function navItem(tab) {
    return {
      id: tab,
      label: t(`nav.${tab}`),
      title: t(`nav.${tab}Title`),
      subtitle: t(`nav.${tab}Subtitle`),
      icon: ICON_BY_TAB[tab],
      href: buildAppPath({ tab }),
    }
  }

  const navGroups = $derived([
    { label: t('nav.groupHome'), items: [navItem('home')] },
    {
      label: t('nav.groupMoney'),
      items: [navItem('accounts'), navItem('history'), navItem('stocks')],
    },
    { label: t('nav.groupPlan'), items: [navItem('forecast'), navItem('decision')] },
    { label: t('nav.groupReview'), items: [navItem('review')] },
  ])
  const settingsNavTab = $derived(navItem('settings'))
  const allTabs = $derived([...navGroups.flatMap((g) => g.items), settingsNavTab])
  const mobilePrimaryTabs = $derived(
    MOBILE_PRIMARY_TAB_IDS.map((id) => allTabs.find((tab) => tab.id === id)).filter(Boolean),
  )
  const mobileMoreGroups = $derived([
    ...navGroups
      .map((group) => ({
        label: group.label,
        items: group.items.filter((tab) => !MOBILE_PRIMARY_TAB_IDS.includes(tab.id)),
      }))
      .filter((group) => group.items.length > 0),
    { label: t('nav.groupSettings'), items: [settingsNavTab] },
  ])

  const currentRoute = $derived(parseAppPath(page.url.pathname))
  const currentTab = $derived(currentRoute?.tab ?? 'home')
  const canSwitchApps = $derived(
    auth.user?.email?.toLowerCase() === LIFE_OS_PERSONAL_OWNER_EMAIL,
  )

  const pageHeader = $derived.by(() => {
    if (currentTab === 'home') {
      if (currentRoute?.section === 'overview') {
        return {
          title: t('nav.overviewTitle'),
          subtitle: t('nav.overviewSubtitle', {
            netWorth: netWorthLabel(),
            liquidCash: liquidCashLabel(),
          }),
        }
      }
      return { title: t('nav.todayTitle'), subtitle: t('nav.todaySubtitle') }
    }
    const activeTab = allTabs.find((tabItem) => tabItem.id === currentTab)
    return { title: activeTab?.title ?? t('nav.todayTitle'), subtitle: activeTab?.subtitle ?? '' }
  })

  const stale = $derived(
    Boolean(finance) &&
      daysSince(finance.data.updatedAt) > 30 &&
      finance.data.accounts.length > 0,
  )
  const updatedLabel = $derived(
    !finance
      ? ''
      : finance.data.accounts.length === 0
        ? t('nav.noAccountsYet')
        : t('nav.dataUpdated', { date: formatDateForIntl(finance.data.updatedAt) }),
  )

  let moreSheet = $state(false)
  /** @type {HTMLDivElement | null} */
  let moreSheetEl = $state(null)

  function switchTab(href) {
    moreSheet = false
    goto(href)
  }

  onMount(() => {
    const onStorage = (e) => {
      if (e.key !== PWA_SETTINGS_STORAGE_KEY) return
      pwaSettings = readPwaSettings()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      resetScrollLock()
      window.removeEventListener('storage', onStorage)
    }
  })

  $effect(() => {
    page.url.pathname
    moreSheet = false
  })

  $effect(() => {
    if (!moreSheet) return
    let releaseFocus
    const onKey = (e) => {
      if (e.key === 'Escape') moreSheet = false
    }
    window.addEventListener('keydown', onKey)
    const frame = requestAnimationFrame(() => {
      if (moreSheetEl) releaseFocus = activateFocusTrap(moreSheetEl)
    })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
      releaseFocus?.()
    }
  })
</script>

<PortraitGate
  enabled={pwaSettings.lockPortraitOnPhone}
  title={t('settings.rotatePortrait')}
  hint={t('settings.rotatePortraitHint')}
/>

<div class="app-shell">
  <div class="safari-chrome-tint-top" aria-hidden="true"></div>
  <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>
  <ExtensionSyncBridge />
  <aside class="sidebar">
    <AppBrandSwitcher
      appId="finance"
      tagline={t('nav.brandTag')}
      allowedAppIds={auth.allowedAppKeys}
      canSwitch={canSwitchApps}
    />
    <div class="sidebar-body">
      {#each navGroups as group, index (group.label)}
        <div class="nav-group{index > 0 ? ' nav-group-divider' : ''}">
          {#each group.items as item (item.id)}
            <button
              type="button"
              class="nav-item{currentTab === item.id ? ' active' : ''}"
              onclick={() => switchTab(item.href)}
              aria-current={currentTab === item.id ? 'page' : undefined}
            >
              <item.icon size={18} strokeWidth={1.75} />
              {item.label}
            </button>
          {/each}
        </div>
      {/each}
    </div>
    <button
      type="button"
      class="nav-item sidebar-foot-item{currentTab === settingsNavTab.id ? ' active' : ''}"
      onclick={() => switchTab(settingsNavTab.href)}
      aria-current={currentTab === settingsNavTab.id ? 'page' : undefined}
    >
      <Settings size={18} strokeWidth={1.75} />
      {settingsNavTab.label}
    </button>
  </aside>

  <div class="main-wrap" data-mobile-chrome="tabbar">
    <AppBar
      title={pageHeader.title}
      subtitle={pageHeader.subtitle}
      meta={updatedLabel || undefined}
    />

    <main class="content">
      <SyncErrorBanner
        subscribe={subscribeSyncError}
        formatMessage={(reason) => `${t('sync.bannerPrefix')}${reason}${t('sync.bannerSuffix')}`}
        dismissLabel={t('common.close')}
      />
      {#if stale}
        <div class="banner">{t('nav.staleBanner')}</div>
      {/if}
      {@render children?.()}
    </main>
  </div>

  <div class="bottom-shell">
    <nav
      class="mobile-tabbar{moreSheet ? ' is-backgrounded' : ''}"
      aria-label={t('nav.mainNavAria')}
    >
      <div class="mobile-tabbar-inner">
        {#each mobilePrimaryTabs as tabItem (tabItem.id)}
          <button
            type="button"
            class="mobile-tab{currentTab === tabItem.id ? ' active' : ''}"
            onclick={() => switchTab(tabItem.href)}
            aria-current={currentTab === tabItem.id ? 'page' : undefined}
            aria-label={tabItem.label}
          >
            <tabItem.icon size={17} strokeWidth={1.75} />
            <span>{tabItem.label}</span>
          </button>
        {/each}
        <button
          type="button"
          class="mobile-tab{moreSheet || isMoreNavActive(currentTab) ? ' active' : ''}"
          onclick={() => (moreSheet = !moreSheet)}
          aria-expanded={moreSheet}
          aria-haspopup="dialog"
          aria-label={t('common.more')}
        >
          <MoreHorizontal size={17} strokeWidth={1.75} />
          <span>{t('common.more')}</span>
        </button>
      </div>
    </nav>
  </div>

  {#if moreSheet}
    <div class="mobile-more-backdrop" onclick={() => (moreSheet = false)} aria-hidden="true"></div>
    <div
      bind:this={moreSheetEl}
      class="mobile-more-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-more-title"
    >
      <div class="mobile-more-handle" aria-hidden="true"></div>
      <div class="mobile-more-header">
        <h2 id="mobile-more-title" class="mobile-more-title">{t('common.more')}</h2>
        <button
          type="button"
          class="mobile-more-close"
          onclick={() => (moreSheet = false)}
          aria-label={t('common.close')}
        >
          <X size={20} strokeWidth={1.75} />
        </button>
      </div>
      <div class="mobile-more-body">
        {#each mobileMoreGroups as group (group.label)}
          <div class="mobile-more-section">
            {#each group.items as item (item.id)}
              <button
                type="button"
                role="menuitem"
                class="mobile-more-row{currentTab === item.id ? ' active' : ''}"
                aria-current={currentTab === item.id ? 'page' : undefined}
                onclick={() => switchTab(item.href)}
              >
                <span class="mobile-more-row-icon" aria-hidden="true">
                  <item.icon size={20} strokeWidth={1.75} />
                </span>
                <span class="mobile-more-row-label">{item.label}</span>
                {#if currentTab === item.id}
                  <span class="mobile-more-row-check" aria-hidden="true">✓</span>
                {:else}
                  <ChevronRight class="mobile-more-row-chevron" size={18} strokeWidth={1.75} aria-hidden="true" />
                {/if}
              </button>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
