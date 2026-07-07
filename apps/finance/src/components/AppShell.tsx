import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, ChevronRight, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  SquaresFour,
  ChartPie,
  ChartBar,
  Receipt,
  ClipboardText,
  ChartLine,
  Scales,
  SlidersHorizontal,
  DotsThreeOutline,
} from '@phosphor-icons/react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { useFinance } from '../store/store'
import { useDashboard } from '../hooks/useDashboard'
import { daysSince } from '../format'
import { SyncErrorBanner } from './SyncErrorBanner'
import { TodayView } from './TodayView'
import { OverviewView } from './OverviewView'
import { RecordsView, type RecordsSection } from './RecordsView'
import { ForecastHubView, type ForecastSection } from './ForecastHubView'
import { ReviewView, type ReviewTab } from './ReviewView'
import { DecisionStudioView } from './DecisionStudioView'
import { SettingsView, type SettingsSection } from './SettingsView'
import { SpendImpactDrawer } from './SpendImpactDrawer'
import { TxnEntryDrawer } from './TxnEntryDrawer'
import { CashflowQuickAddDrawer } from './CashflowQuickAddDrawer'
import { useTransactions } from '../store/transactions'
import { StocksView } from './StocksView'
import { ExtensionSyncBridge } from './ExtensionSyncBridge'
import { useLocale } from '../i18n/context'
import { formatDateForIntl } from '../format'
import { liquidCashLabel, netWorthLabel } from '../copy/terminology'
import {
  buildAppHash,
  parseAppHash,
  readAppRouteFromWindow,
  writeAppHash,
  type AppRoute,
} from '../lib/appRoute'
import { useThemePreference } from '../hooks/useThemePreference'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { isMoreNavActive, MOBILE_PRIMARY_TAB_IDS } from '../lib/nav'
import {
  activateFocusTrap,
  lockScroll,
  unlockScroll,
  bindViewportHeight,
  bindPwaForegroundResume,
} from '@life-os/theme'
import { PortraitGate } from './PortraitGate'
import { usePwaSettings } from '../hooks/usePwaSettings'

export type Tab =
  | 'today'
  | 'overview'
  | 'stocks'
  | 'history'
  | 'review'
  | 'forecast'
  | 'decision'
  | 'settings'

/** 跨页跳转：section 直达 hub 子页；ledgerSearch 预填流水搜索；focusEventId 高亮大额收支条目。 */
export type GoTabOptions = { ledgerSearch?: string; focusEventId?: string }
export type GoTab = (tab: Tab, section?: string, opts?: GoTabOptions) => void

type NavTab = {
  id: Tab
  label: string
  icon: PhosphorIcon
  title: string
  subtitle: string
}

function useNavConfig(): {
  navGroups: { label: string; items: NavTab[] }[]
  settingsTab: NavTab
  tabs: NavTab[]
  mobilePrimaryTabs: NavTab[]
  mobileMoreGroups: { label: string; items: NavTab[] }[]
} {
  const { t } = useLocale()
  const liquidCash = liquidCashLabel()
  const netWorth = netWorthLabel()

  return useMemo(() => {
    const navGroups: { label: string; items: NavTab[] }[] = [
      {
        label: t('nav.groupDaily'),
        items: [
          {
            id: 'today',
            label: t('nav.today'),
            icon: SquaresFour,
            title: t('nav.todayTitle'),
            subtitle: t('nav.todaySubtitle'),
          },
        ],
      },
      {
        label: t('nav.groupAssets'),
        items: [
          {
            id: 'overview',
            label: t('nav.overview'),
            icon: ChartPie,
            title: t('nav.overviewTitle'),
            subtitle: t('nav.overviewSubtitle', { netWorth, liquidCash }),
          },
          {
            id: 'stocks',
            label: t('nav.stocks'),
            icon: ChartBar,
            title: t('nav.stocksTitle'),
            subtitle: t('nav.stocksSubtitle'),
          },
        ],
      },
      {
        label: t('nav.groupCashflow'),
        items: [
          {
            id: 'history',
            label: t('nav.history'),
            icon: Receipt,
            title: t('nav.historyTitle'),
            subtitle: t('nav.historySubtitle'),
          },
          {
            id: 'review',
            label: t('nav.review'),
            icon: ClipboardText,
            title: t('nav.reviewTitle'),
            subtitle: t('nav.reviewSubtitle'),
          },
        ],
      },
      {
        label: t('nav.groupForward'),
        items: [
          {
            id: 'forecast',
            label: t('nav.forecast'),
            icon: ChartLine,
            title: t('nav.forecastTitle'),
            subtitle: t('nav.forecastSubtitle'),
          },
          {
            id: 'decision',
            label: t('nav.decision'),
            icon: Scales,
            title: t('nav.decisionTitle'),
            subtitle: t('nav.decisionSubtitle'),
          },
        ],
      },
    ]

    const settingsNavTab: NavTab = {
      id: 'settings',
      label: t('nav.settings'),
      icon: SlidersHorizontal,
      title: t('nav.settingsTitle'),
      subtitle: t('nav.settingsSubtitle'),
    }

    const mainTabs = navGroups.flatMap((group) => group.items)
    const tabs = [...mainTabs, settingsNavTab]
    const mobilePrimaryIds: Tab[] = [...MOBILE_PRIMARY_TAB_IDS]
    const mobilePrimaryTabs = mobilePrimaryIds.map(
      (id) => tabs.find((tab) => tab.id === id)!,
    )
    const mobileMoreGroups = [
      ...navGroups
        .map((group) => ({
          label: group.label,
          items: group.items.filter(
            (tab) => !mobilePrimaryIds.includes(tab.id),
          ),
        }))
        .filter((group) => group.items.length > 0),
      { label: t('nav.groupAccount'), items: [settingsNavTab] },
    ]

    return {
      navGroups,
      settingsTab: settingsNavTab,
      tabs,
      mobilePrimaryTabs,
      mobileMoreGroups,
    }
  }, [t, liquidCash, netWorth])
}

const ICON = { size: 18 } as const
const MOBILE_ICON = { size: 17 } as const

function shellRoute(
  tab: Tab,
  recordsTab: RecordsSection,
  forecastTab: ForecastSection,
  reviewTab: ReviewTab,
  settingsTab: SettingsSection,
): AppRoute {
  if (tab === 'history') return { tab, section: recordsTab }
  if (tab === 'forecast') return { tab, section: forecastTab }
  if (tab === 'review') return { tab, section: reviewTab }
  if (tab === 'settings') return { tab, section: settingsTab }
  return { tab }
}

function initialShellFromUrl(): {
  tab: Tab
  recordsTab: RecordsSection
  forecastTab: ForecastSection
  reviewTab: ReviewTab
  settingsTab: SettingsSection
} {
  const route = readAppRouteFromWindow()
  return {
    tab: route.tab as Tab,
    recordsTab:
      route.tab === 'history' && route.section
        ? (route.section as RecordsSection)
        : 'insights',
    forecastTab:
      route.tab === 'forecast' && route.section
        ? (route.section as ForecastSection)
        : 'forecast',
    reviewTab:
      route.tab === 'review' && route.section
        ? (route.section as ReviewTab)
        : 'import',
    settingsTab:
      route.tab === 'settings' && route.section
        ? (route.section as SettingsSection)
        : 'accounts',
  }
}

export function AppShell() {
  const { t, locale } = useLocale()
  const {
    navGroups,
    settingsTab: settingsNavTab,
    tabs,
    mobilePrimaryTabs,
    mobileMoreGroups,
  } = useNavConfig()
  const store = useFinance()
  const dashboard = useDashboard(store.data)
  const projection = dashboard.projection
  const initial = initialShellFromUrl()
  const [tab, setTab] = useState<Tab>(initial.tab)
  const [recordsTab, setRecordsTab] = useState<RecordsSection>(
    initial.recordsTab,
  )
  const [forecastTab, setForecastTab] = useState<ForecastSection>(
    initial.forecastTab,
  )
  const [reviewTab, setReviewTab] = useState<ReviewTab>(initial.reviewTab)
  const [settingsTab, setSettingsTab] = useState<SettingsSection>(
    initial.settingsTab,
  )
  const [drawer, setDrawer] = useState(false)
  const [txnDrawer, setTxnDrawer] = useState(false)
  const [planDrawer, setPlanDrawer] = useState(false)
  const [ledgerSearch, setLedgerSearch] = useState<string | undefined>()
  const [focusEventId, setFocusEventId] = useState<string | undefined>()
  const [themePreference, setThemePreference] = useThemePreference()
  const { settings: pwaSettings, setLockPortraitOnPhone } = usePwaSettings()
  const [moreSheet, setMoreSheet] = useState(false)
  const moreSheetRef = useRef<HTMLDivElement>(null)
  const { addTxn } = useTransactions()
  const skipHashSync = useRef(false)

  const documentPageTitle = useMemo(() => {
    const activeTab = tabs.find((tabItem) => tabItem.id === tab) ?? tabs[0]
    return activeTab?.title ?? t('nav.todayTitle')
  }, [tab, tabs, t])

  useDocumentMeta(documentPageTitle, locale)

  useEffect(() => {
    const cleanupViewport = bindViewportHeight()
    const cleanupForeground = bindPwaForegroundResume()
    return () => {
      cleanupViewport()
      cleanupForeground()
    }
  }, [])

  const syncHash = (
    nextTab: Tab,
    nextRecords: RecordsSection,
    nextForecast: ForecastSection,
    nextReview: ReviewTab,
    nextSettings: SettingsSection,
    mode: 'push' | 'replace' = 'push',
  ) => {
    skipHashSync.current = true
    writeAppHash(
      shellRoute(nextTab, nextRecords, nextForecast, nextReview, nextSettings),
      mode,
    )
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.location.hash) {
      syncHash(tab, recordsTab, forecastTab, reviewTab, settingsTab, 'replace')
    }

    const onRouteChange = () => {
      if (skipHashSync.current) {
        skipHashSync.current = false
        return
      }
      const route = parseAppHash(window.location.hash)
      if (!route) return
      setTab(route.tab as Tab)
      setMoreSheet(false)
      setDrawer(false)
      setTxnDrawer(false)
      setPlanDrawer(false)
      if (route.tab === 'history') {
        setRecordsTab((route.section as RecordsSection) ?? 'insights')
      }
      if (route.tab === 'forecast') {
        setForecastTab((route.section as ForecastSection) ?? 'forecast')
      }
      if (route.tab === 'review') {
        setReviewTab((route.section as ReviewTab) ?? 'import')
      }
      if (route.tab === 'settings') {
        setSettingsTab((route.section as SettingsSection) ?? 'accounts')
      }
      window.scrollTo(0, 0)
    }

    window.addEventListener('hashchange', onRouteChange)
    window.addEventListener('popstate', onRouteChange)
    return () => {
      window.removeEventListener('hashchange', onRouteChange)
      window.removeEventListener('popstate', onRouteChange)
    }
  }, [])

  useEffect(() => {
    if (!moreSheet) return
    lockScroll()
    let releaseFocus: (() => void) | undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreSheet(false)
    }
    window.addEventListener('keydown', onKey)
    const frame = requestAnimationFrame(() => {
      if (moreSheetRef.current) {
        releaseFocus = activateFocusTrap(moreSheetRef.current)
      }
    })
    return () => {
      cancelAnimationFrame(frame)
      unlockScroll()
      window.removeEventListener('keydown', onKey)
      releaseFocus?.()
    }
  }, [moreSheet])

  const switchTab: GoTab = (next, section, opts) => {
    let nextRecords = recordsTab
    let nextForecast = forecastTab
    let nextReview = reviewTab
    let nextSettings = settingsTab

    setTab(next)
    setDrawer(false)
    setTxnDrawer(false)
    setPlanDrawer(false)
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0)
    }
    if (next === 'history' && section) {
      nextRecords = section as RecordsSection
      setRecordsTab(nextRecords)
    }
    if (next === 'forecast' && section) {
      nextForecast = section as ForecastSection
      setForecastTab(nextForecast)
    }
    if (next === 'review' && section) {
      nextReview = section as ReviewTab
      setReviewTab(nextReview)
    }
    if (next === 'settings' && section) {
      nextSettings = section as SettingsSection
      setSettingsTab(nextSettings)
    }
    if (opts?.ledgerSearch) setLedgerSearch(opts.ledgerSearch)
    else if (next !== 'history' || section !== 'insights')
      setLedgerSearch(undefined)
    if (opts?.focusEventId) setFocusEventId(opts.focusEventId)
    else if (next !== 'history' || section !== 'oneoff')
      setFocusEventId(undefined)

    syncHash(next, nextRecords, nextForecast, nextReview, nextSettings)
  }

  const goStocks = (snapshotId?: string) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (snapshotId) url.searchParams.set('snapshot', snapshotId)
      else url.searchParams.delete('snapshot')
      url.hash = buildAppHash({ tab: 'stocks' })
      skipHashSync.current = true
      window.history.pushState(
        null,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      )
    }
    setTab('stocks')
    setMoreSheet(false)
    setDrawer(false)
    setTxnDrawer(false)
    setPlanDrawer(false)
    window.scrollTo(0, 0)
  }

  const stale =
    daysSince(store.data.updatedAt) > 30 && store.data.accounts.length > 0
  const active = tabs.find((tabItem) => tabItem.id === tab) ?? tabs[0]
  const updatedLabel =
    store.data.accounts.length === 0
      ? t('nav.noAccountsYet')
      : t('nav.dataUpdated', {
          date: formatDateForIntl(store.data.updatedAt),
        })

  // FAB：高频动作是「记一笔」，在今日/总览/记录-洞察都可直接记账；
  // 记录-大额收支保留快速登记入口（试算消费在「今日」页内有按钮）。
  let activeFab: {
    label: string
    icon: LucideIcon
    onClick: () => void
  } | null = null
  if (tab === 'history' && recordsTab === 'oneoff') {
    activeFab = {
      label: t('nav.fabLargeCashflow'),
      icon: Plus,
      onClick: () => setPlanDrawer(true),
    }
  } else if (tab === 'today' || tab === 'overview' || tab === 'history') {
    activeFab = {
      label: t('nav.fabLogTxn'),
      icon: Plus,
      onClick: () => setTxnDrawer(true),
    }
  }

  return (
    <div className="app">
      <PortraitGate
        enabled={pwaSettings.lockPortraitOnPhone}
        title={t('settings.rotatePortrait')}
        hint={t('settings.rotatePortraitHint')}
      />
      <div className="safari-chrome-tint-top" aria-hidden="true" />
      <div className="safari-chrome-tint-bottom" aria-hidden="true" />
      <ExtensionSyncBridge />
      <aside className="sidebar">
        <div className="brand">
          <img
            src="/assets/brand/mark-on-dark.svg"
            alt=""
            className="brand-mark"
            width={28}
            height={28}
          />
          <span className="brand-copy">
            <span className="brand-name">
              <span className="brand-name-base">Finance</span>
              <span className="brand-name-accent">OS</span>
            </span>
            <span className="brand-tag">{t('nav.brandTag')}</span>
          </span>
        </div>
        {navGroups.map((group, index) => (
          <div
            key={group.label}
            className={`nav-group${index > 0 ? ' nav-group-divider' : ''}`}
          >
            {group.items.map((t) => {
              const Icon = t.icon
              const activeTab = tab === t.id
              return (
                <button
                  key={t.id}
                  className={`nav-item${activeTab ? ' active' : ''}`}
                  onClick={() => switchTab(t.id)}
                  aria-current={activeTab ? 'page' : undefined}
                >
                  <Icon {...ICON} weight={activeTab ? 'fill' : 'regular'} />
                  {t.label}
                </button>
              )
            })}
          </div>
        ))}
        <span className="nav-spacer" />
        <button
          className={`nav-item${tab === settingsNavTab.id ? ' active' : ''}`}
          onClick={() => switchTab(settingsNavTab.id)}
          aria-current={tab === settingsNavTab.id ? 'page' : undefined}
        >
          <SlidersHorizontal
            {...ICON}
            weight={tab === settingsNavTab.id ? 'fill' : 'regular'}
          />
          {settingsNavTab.label}
        </button>
      </aside>

      <div className="main-wrap">
        <header className="page-header">
          <div className="page-header-brand" aria-label="Finance OS">
            <img
              src="/assets/brand/mark.svg"
              alt=""
              className="page-header-brand-mark"
              width={24}
              height={24}
            />
            <span className="page-header-brand-name">
              <span className="brand-name-base">Finance</span>
              <span className="brand-name-accent">OS</span>
            </span>
          </div>
          <div className="titles">
            <h1>{active.title}</h1>
            <span className="subtitle">{active.subtitle}</span>
          </div>
          <span className="spacer" />
          <span className="updated">{updatedLabel}</span>
        </header>

        <main className="content">
          <SyncErrorBanner />
          {stale && <div className="banner">{t('nav.staleBanner')}</div>}
          {tab === 'today' && (
            <TodayView
              data={store.data}
              dashboard={dashboard}
              onOpenSpend={() => setDrawer(true)}
              onGoTab={switchTab}
            />
          )}
          {tab === 'overview' && (
            <OverviewView
              data={store.data}
              projection={projection}
              dashboard={dashboard}
              onOpenSpend={() => setDrawer(true)}
              onGoTab={switchTab}
              onGoStocks={goStocks}
              tabActive
            />
          )}
          {tab === 'history' && (
            <RecordsView
              data={store.data}
              active={recordsTab}
              onChange={(section) => {
                setRecordsTab(section)
                syncHash(tab, section, forecastTab, reviewTab, settingsTab)
              }}
              onGoTab={switchTab}
              ledgerSearch={ledgerSearch}
              onLedgerSearchConsumed={() => setLedgerSearch(undefined)}
              focusEventId={focusEventId}
              onFocusEventConsumed={() => setFocusEventId(undefined)}
              onQuickAdd={() => setTxnDrawer(true)}
            />
          )}
          {tab === 'review' && (
            <ReviewView
              data={store.data}
              active={reviewTab}
              onChange={(section) => {
                setReviewTab(section)
                syncHash(tab, recordsTab, forecastTab, section, settingsTab)
              }}
            />
          )}
          {tab === 'forecast' && (
            <ForecastHubView
              data={store.data}
              projection={projection}
              displayLiquidCash={dashboard.derived.liquidCash}
              cashAnchors={dashboard.derived.cashAnchors}
              onGoTab={switchTab}
              active={forecastTab}
              onChange={(section) => {
                setForecastTab(section)
                syncHash(tab, recordsTab, section, reviewTab, settingsTab)
              }}
            />
          )}
          {tab === 'decision' && <DecisionStudioView />}
          <div hidden={tab !== 'stocks'} aria-hidden={tab !== 'stocks'}>
            <StocksView
              data={store.data}
              tabActive={tab === 'stocks'}
              onGoSettings={() => switchTab('settings')}
              savingCapacity={dashboard.derived.savingCapacity}
            />
          </div>
          {tab === 'settings' && (
            <SettingsView
              themePreference={themePreference}
              onThemePreferenceChange={setThemePreference}
              lockPortraitOnPhone={pwaSettings.lockPortraitOnPhone}
              onLockPortraitOnPhoneChange={setLockPortraitOnPhone}
              onGoStocks={() => goStocks()}
              section={settingsTab}
              onSectionChange={(section) => {
                setSettingsTab(section)
                syncHash(tab, recordsTab, forecastTab, reviewTab, section)
              }}
            />
          )}
        </main>
      </div>

      {!drawer && !txnDrawer && !planDrawer && activeFab && (
        <button
          className="fab"
          onClick={activeFab.onClick}
          aria-label={activeFab.label}
        >
          <activeFab.icon size={18} strokeWidth={2} />
          {activeFab.label}
        </button>
      )}
      {drawer && (
        <SpendImpactDrawer
          data={store.data}
          baseline={projection.baseline}
          onClose={() => setDrawer(false)}
        />
      )}
      {txnDrawer && (
        <TxnEntryDrawer
          onAdd={addTxn}
          onClose={() => setTxnDrawer(false)}
          privacy={store.data.privacy}
        />
      )}
      {planDrawer && tab === 'history' && recordsTab === 'oneoff' && (
        <CashflowQuickAddDrawer onClose={() => setPlanDrawer(false)} />
      )}

      <nav
        className={`mobile-tabbar${moreSheet ? ' is-backgrounded' : ''}`}
        aria-label={t('nav.mainNavAria')}
      >
        <div className="mobile-tabbar-inner">
          {mobilePrimaryTabs.map((tabItem) => {
            const Icon = tabItem.icon
            const activeTab = tab === tabItem.id
            return (
              <button
                key={tabItem.id}
                className={`mobile-tab${activeTab ? ' active' : ''}`}
                onClick={() => {
                  setMoreSheet(false)
                  switchTab(tabItem.id)
                }}
                aria-current={activeTab ? 'page' : undefined}
                aria-label={tabItem.label}
              >
                <Icon
                  {...MOBILE_ICON}
                  weight={activeTab ? 'fill' : 'regular'}
                />
                <span>{tabItem.label}</span>
              </button>
            )
          })}
          <button
            className={`mobile-tab${moreSheet || isMoreNavActive(tab) ? ' active' : ''}`}
            onClick={() => setMoreSheet((v) => !v)}
            aria-expanded={moreSheet}
            aria-haspopup="dialog"
            aria-label={t('common.more')}
          >
            <DotsThreeOutline
              {...MOBILE_ICON}
              weight={moreSheet || isMoreNavActive(tab) ? 'fill' : 'regular'}
            />
            <span>{t('common.more')}</span>
          </button>
        </div>
      </nav>

      {moreSheet && (
        <>
          <div
            className="mobile-more-backdrop"
            onClick={() => setMoreSheet(false)}
            aria-hidden="true"
          />
          <div
            ref={moreSheetRef}
            className="mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
          >
            <div className="mobile-more-handle" aria-hidden="true" />
            <div className="mobile-more-header">
              <h2 id="mobile-more-title" className="mobile-more-title">
                {t('common.more')}
              </h2>
              <button
                type="button"
                className="mobile-more-close"
                onClick={() => setMoreSheet(false)}
                aria-label={t('common.close')}
              >
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>
            <div className="mobile-more-body">
              {mobileMoreGroups.map((group) => (
                <div key={group.label} className="mobile-more-section">
                  {group.items.map((t) => {
                    const Icon = t.icon
                    const activeTab = tab === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="menuitem"
                        className={`mobile-more-row${activeTab ? ' active' : ''}`}
                        aria-current={activeTab ? 'page' : undefined}
                        onClick={() => {
                          setMoreSheet(false)
                          switchTab(t.id)
                        }}
                      >
                        <span
                          className="mobile-more-row-icon"
                          aria-hidden="true"
                        >
                          <Icon
                            size={20}
                            weight={activeTab ? 'fill' : 'regular'}
                          />
                        </span>
                        <span className="mobile-more-row-label">{t.label}</span>
                        {activeTab ? (
                          <span
                            className="mobile-more-row-check"
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                        ) : (
                          <ChevronRight
                            className="mobile-more-row-chevron"
                            size={18}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
