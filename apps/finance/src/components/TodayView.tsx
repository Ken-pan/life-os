import { useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  List,
} from 'lucide-react'
import type { FinanceData } from '../types'
import type { Dashboard } from '../hooks/useDashboard'
import {
  projectDaily,
  type DayEvent,
  timelineDailyOptions,
} from '../engine/daily'
import { baselineCategoryAverages } from '../engine/realityLoop'
import { useTransactions } from '../store/transactions'
import {
  displayStatusClass,
  displayStatusLabel,
  confirmOccurredLabel,
  occurrenceDisplayStatus,
  occurrencesInMonth,
  occurrenceNavHint,
  occurrenceNavLabel,
  type ExpectedOccurrence,
} from '../engine/timeline'
import { resolveCardPortalFromBillLabel } from '../lib/cardPortals'
import { CardPortalLink } from './CardPortalLink'
import { InstitutionLogo } from './InstitutionLogo'
import type { GoTab } from './AppShell'
import { money, signedMoney, depositDeltaClass } from '../format'
import {
  resolveCashPositionUiState,
  type LiquidCashAnchors,
} from '../engine/reconciliation'
import { useTimeline } from '../store/timeline'
import { AiBriefCard } from './AiBriefCard'
import { safeToSpendLabel, safeToSpendSubtitle } from '../copy/metrics'
import {
  bookBalanceLabel,
  clearedCashLabel,
  inTransitCashLabel,
  liquidCashLabel,
  quoteSafeToSpend,
  stsBreakdown,
  welcomeTitle,
} from '../copy/terminology'
import { useLocale } from '../i18n/context'
import { t as translate } from '../i18n/translate'

const SEV_CLASS: Record<string, string> = {
  critical: 'text-neg',
  warning: 'text-warn',
  info: 'text-secondary',
  ok: 'text-pos',
}

// 现金日历里的单笔进账/出账：进账绿、出账红。
function cashFlowClass(amount: number): string {
  return depositDeltaClass(amount)
}

// 把次要说明收进 help 图标的悬停/聚焦 tooltip，保持指标本身简洁。
function HelpTip({ text }: { text: string }) {
  return (
    <span className="help-tip" tabIndex={0} role="note" aria-label={text}>
      <HelpCircle size={14} aria-hidden="true" />
      <span className="help-tip-pop" role="tooltip">
        {text}
      </span>
    </span>
  )
}

function dayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${Number(m[2])}/${Number(m[3])}` : iso
}

const WEEKDAY_KEYS = [
  'today.weekdaySun',
  'today.weekdayMon',
  'today.weekdayTue',
  'today.weekdayWed',
  'today.weekdayThu',
  'today.weekdayFri',
  'today.weekdaySat',
] as const

function dayLabelWithWeekday(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${Number(m[2])}/${Number(m[3])}（${translate(WEEKDAY_KEYS[d.getDay()])}）`
}

function weekdayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return translate(WEEKDAY_KEYS[d.getDay()])
}

const EVENT_KIND_KEYS: Record<DayEvent['kind'], string> = {
  income: 'today.flowIncome',
  expense: 'today.flowExpense',
  card: 'today.flowCard',
  fee: 'today.flowFee',
  transfer: 'today.flowTransfer',
}

export function TodayView({
  data,
  dashboard,
  onOpenSpend,
  onGoTab,
}: {
  data: FinanceData
  dashboard: Dashboard
  onOpenSpend: () => void
  onGoTab: GoTab
}) {
  const { t } = useLocale()
  const safeToSpend = safeToSpendLabel()
  const safeToSpendSub = safeToSpendSubtitle()
  const privacy = data.privacy
  const { derived, outlook, actions } = dashboard
  const [showAllActions, setShowAllActions] = useState(false)
  const [calendarView, setCalendarView] = useState<'agenda' | 'calendar'>(
    'agenda',
  )
  const [monthOffset, setMonthOffset] = useState(0)
  const [showMoreQuickActions, setShowMoreQuickActions] = useState(false)
  const timeline = useTimeline()
  const { txns } = useTransactions()
  const calendarOutlook = useMemo(() => {
    if (outlook.days >= 180) return outlook
    let dailyBurnOverride: number | undefined
    if (dashboard.derived.cashAnchors.hasAnchoredAccounts && txns.length > 0) {
      const byCat = baselineCategoryAverages(txns, 3)
      const monthlyActual = Object.values(byCat).reduce((s, v) => s + v, 0)
      if (monthlyActual > 0) dailyBurnOverride = monthlyActual / 30
    }
    const opts = timelineDailyOptions({
      startLiquid: dashboard.derived.cashAnchors.hasAnchoredAccounts
        ? dashboard.derived.cashAnchors.totalStartLiquid
        : undefined,
      occurrences: timeline.occurrences,
      dailyBurnOverride,
      suppressTodayBurn: dashboard.derived.cashAnchors.hasAnchoredAccounts,
    })
    return projectDaily(data, 220, new Date(), opts)
  }, [data, outlook, dashboard.derived.cashAnchors, timeline.occurrences, txns])
  const monthPrefix = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])
  const monthOccurrences = useMemo(
    () => occurrencesInMonth(timeline.occurrences, monthPrefix),
    [timeline.occurrences, monthPrefix],
  )

  if (data.accounts.length === 0 && data.cashFlows.length === 0) {
    return (
      <div className="empty">
        <h2 className="mb-2">{welcomeTitle()}</h2>
        <p className="text-secondary">{t('today.emptyHint', { safeToSpend })}</p>
        <div className="flex-row-center mt-4">
          <button className="btn" onClick={() => onGoTab('settings')}>
            {t('today.addAccounts')}
          </button>
          <button
            className="btn ghost"
            onClick={() => onGoTab('history', 'fixed')}
          >
            {t('today.addCashflows')}
          </button>
        </div>
      </div>
    )
  }

  const primaryActions = showAllActions
    ? actions
    : actions
        .filter((a) => a.severity === 'critical' || a.severity === 'warning')
        .slice(0, 5)
  const monthBaseTs =
    calendarOutlook.dailyBalances[0]?.ts ??
    calendarOutlook.events[0]?.ts ??
    Date.now()
  const monthBaseDate = new Date(monthBaseTs)
  const monthStartTs = new Date(
    monthBaseDate.getFullYear(),
    monthBaseDate.getMonth() + monthOffset,
    1,
  ).getTime()
  const monthEndTs = new Date(
    monthBaseDate.getFullYear(),
    monthBaseDate.getMonth() + monthOffset + 1,
    1,
  ).getTime()
  const hasPrevMonth = monthOffset > 0
  const hasNextMonth = calendarOutlook.dailyBalances.some(
    (p) => p.ts >= monthEndTs,
  )
  const currentMonthLabel = t('today.currentMonthLabel', {
    month: new Date(monthStartTs).getMonth() + 1,
  })

  return (
    <div className="grid gap-4">
      <p className="muted-note mb-1">
        {t('today.intro', { safeToSpend })}
      </p>
      <div className="grid today-headline">
        <div className="card kpi kpi-accent today-hero">
          <span className="label">
            {safeToSpend}
            <HelpTip text={safeToSpendText(derived, outlook, privacy)} />
          </span>
          <span className="value">{money(derived.safeToSpend, privacy)}</span>
          <SafeToSpendContextNote
            derived={derived}
            privacy={privacy}
            onGoTab={onGoTab}
          />
          <span className="sub">{safeToSpendSub}</span>
        </div>
        <SavingPlanCard derived={derived} privacy={privacy} onGoTab={onGoTab} />
      </div>

      <AiBriefCard data={data} dashboard={dashboard} />

      <CashPositionCard
        anchors={derived.cashAnchors}
        privacy={privacy}
        onGoTab={onGoTab}
        onAlignCash={() => timeline.alignCashToAccountBalances()}
      />

      <PendingConfirmationsCard
        items={timeline.actionable}
        privacy={privacy}
        onGoTab={onGoTab}
        onSkip={(id) => void timeline.markSkipped(id)}
        onConfirmOccurred={(id) => void timeline.markConfirmedPaid(id)}
      />

      <div className="grid cols-2 today-main-panels">
        <div className="card today-calendar-card">
          <div className="today-card-head">
            <h3>{t('today.cashCalendar')}</h3>
            <div className="today-card-actions">
              <div className="today-calendar-pager inline">
                <button
                  className="icon-btn month-nav"
                  onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
                  disabled={!hasPrevMonth}
                  aria-label={t('today.prevMonth')}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="month-label">{currentMonthLabel}</span>
                <button
                  className="icon-btn month-nav"
                  onClick={() =>
                    setMonthOffset((m) => (hasNextMonth ? m + 1 : m))
                  }
                  disabled={!hasNextMonth}
                  aria-label={t('today.nextMonth')}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div
                className="seg seg-icons"
                role="tablist"
                aria-label={t('today.calendarViewMode')}
              >
                <button
                  className={calendarView === 'agenda' ? 'active' : ''}
                  role="tab"
                  aria-selected={calendarView === 'agenda'}
                  aria-label={t('today.listView')}
                  onClick={() => setCalendarView('agenda')}
                >
                  <List size={14} />
                </button>
                <button
                  className={calendarView === 'calendar' ? 'active' : ''}
                  role="tab"
                  aria-selected={calendarView === 'calendar'}
                  aria-label={t('today.calendarView')}
                  onClick={() => setCalendarView('calendar')}
                >
                  <CalendarDays size={14} />
                </button>
              </div>
            </div>
          </div>
          <CashCalendar
            events={calendarOutlook.events}
            dailyBalances={calendarOutlook.dailyBalances}
            privacy={privacy}
            buffer={calendarOutlook.buffer}
            view={calendarView}
            monthOffset={monthOffset}
          />
        </div>

        <div className="today-side-stack">
          <ProtectedReserveFallbackCard
            dashboard={dashboard}
            privacy={privacy}
            onGoTab={onGoTab}
          />

          <TimelineBillsCard
            occurrences={monthOccurrences}
            fallbackEvents={outlook.events}
            privacy={privacy}
          />

          <div className="card today-actions-card">
            <div className="today-card-head">
              <h3>{t('today.worthDoing')}</h3>
              <div className="today-card-actions">
                <button
                  className="icon-btn"
                  onClick={() => setShowAllActions((v) => !v)}
                >
                  {showAllActions ? t('today.showKeyOnly') : t('today.showAll')}
                </button>
                <button
                  className="icon-btn"
                  onClick={() => onGoTab('settings')}
                >
                  {t('today.manageAccounts')}
                </button>
              </div>
            </div>
            <div className="list">
              {primaryActions.map((a) => (
                <div className="item" key={a.id}>
                  <span className={`dot ${a.severity}`} />
                  <div className="grow">
                    <div className="name">{a.title}</div>
                    <div className="meta">{a.detail}</div>
                  </div>
                  <span className={`item-status ${SEV_CLASS[a.severity]}`}>
                    {a.severity === 'ok'
                      ? '✓'
                      : a.severity === 'critical'
                        ? t('today.priorityHigh')
                        : a.severity === 'warning'
                          ? t('today.priorityMedium')
                          : t('today.priorityLow')}
                  </span>
                </div>
              ))}
              {!showAllActions && actions.length > primaryActions.length && (
                <p className="muted-note">
                  {t('today.moreActionsHint', {
                    count: actions.length - primaryActions.length,
                  })}
                </p>
              )}
            </div>
          </div>

          <div className="card today-tools">
            <h3>{t('today.moreTools')}</h3>
            <div className="today-quick-actions">
              <button className="btn ghost" onClick={onOpenSpend}>
                {t('today.spendImpact')}
              </button>
              <button
                className="btn ghost today-quick-toggle"
                onClick={() => setShowMoreQuickActions((v) => !v)}
              >
                {showMoreQuickActions
                  ? t('today.collapseQuickActions')
                  : t('today.expandQuickActions')}
              </button>
              <div
                className={`today-quick-more${showMoreQuickActions ? ' open' : ''}`}
              >
                <button
                  className="btn ghost"
                  onClick={() => onGoTab('history', 'oneoff')}
                >
                  {t('today.manageFutureCashflows')}
                </button>
                <button
                  className="btn ghost"
                  onClick={() => onGoTab('overview')}
                >
                  {t('today.viewOverview')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CashPositionCard({
  anchors,
  privacy,
  onGoTab,
  onAlignCash,
}: {
  anchors: LiquidCashAnchors
  privacy: boolean
  onGoTab: GoTab
  onAlignCash: () => Promise<void>
}) {
  const { t } = useLocale()
  const ui = resolveCashPositionUiState(anchors)
  const [showDetails, setShowDetails] = useState(false)
  const [aligning, setAligning] = useState(false)

  if (!ui.visible || !ui.variant) return null

  const helpOnboarding = t('today.cashOnboardingHelp')
  const helpDrift = t('today.cashDriftHelp')

  const summary =
    ui.variant === 'onboarding'
      ? t('today.cashOnboardingSummary')
      : t('today.cashDriftSummary', { amount: money(ui.drift, privacy) })

  const stripClass =
    ui.variant === 'onboarding'
      ? 'cash-position-strip'
      : 'cash-position-strip cash-position-strip--warn'

  const handleAlign = () => {
    setAligning(true)
    void onAlignCash().finally(() => setAligning(false))
  }

  return (
    <div className={stripClass}>
      <div className="cash-position-strip-main">
        <p className="cash-position-strip-text">
          {summary}
          <HelpTip
            text={ui.variant === 'onboarding' ? helpOnboarding : helpDrift}
          />
        </p>
        <div className="cash-position-strip-actions">
          {ui.variant === 'onboarding' ? (
            <button
              type="button"
              className="btn outline compact"
              onClick={() => onGoTab('settings')}
            >
              {t('today.viewAccounts')}
            </button>
          ) : (
            <button
              type="button"
              className="btn compact"
              disabled={aligning}
              onClick={handleAlign}
            >
              {aligning ? t('today.aligning') : t('today.autoAlign')}
            </button>
          )}
          <button
            type="button"
            className="text-btn cash-position-strip-link"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? t('today.hideDetails') : t('today.learnMore')}
          </button>
        </div>
      </div>
      {showDetails && (
        <CashPositionDetails anchors={anchors} privacy={privacy} />
      )}
    </div>
  )
}

function CashPositionDetails({
  anchors,
  privacy,
}: {
  anchors: LiquidCashAnchors
  privacy: boolean
}) {
  const { t } = useLocale()
  return (
    <div className="cash-position-details">
      <div className="grid cols-3 cash-position-details-grid">
        <div className="kpi today-metric">
          <span className="label">{clearedCashLabel()}</span>
          <span className="value">
            {money(anchors.clearedLiquid + anchors.otherLiquid, privacy)}
          </span>
          <span className="sub">{t('today.anchorBalanceSub')}</span>
        </div>
        <div className="kpi today-metric">
          <span className="label">{inTransitCashLabel()}</span>
          <span className="value text-accent">
            {money(anchors.totalStartLiquid, privacy)}
          </span>
          <span className="sub">
            {t('today.calendarStartSub', { safeToSpend: quoteSafeToSpend() })}
          </span>
        </div>
        <div className="kpi today-metric">
          <span className="label">{bookBalanceLabel()}</span>
          <span className="value">{money(anchors.cacheLiquid, privacy)}</span>
          <span className="sub">{t('today.settingsBalanceSub')}</span>
        </div>
      </div>
    </div>
  )
}

function SafeToSpendContextNote({
  derived,
  privacy,
  onGoTab,
}: {
  derived: Dashboard['derived']
  privacy: boolean
  onGoTab: GoTab
}) {
  const { t } = useLocale()
  const safeToSpendAmount = derived.safeToSpend
  const breakdown = stsBreakdown()
  const cap = derived.savingCapacity
  const b = derived.safeToSpendBreakdown

  if (safeToSpendAmount > 0) return null

  if (cap.capacity > 0) {
    const goalPart =
      b.earmarkedOperatingGoalCash > 0
        ? t('today.stsZeroGoalPart', {
            goalReserve: breakdown.goalReserve,
            goalAmount: money(b.earmarkedOperatingGoalCash, privacy),
          })
        : ''
    return (
      <p className="sub sts-context-note">
        {t('today.stsZeroWithCapacity', {
          buffer: breakdown.buffer,
          bufferAmount: money(b.operatingCashBuffer, privacy),
          goalPart,
          capacity: money(cap.capacity, privacy),
          when: cap.bestDay
            ? t('today.stsZeroWhenAround', { date: dayLabel(cap.bestDay) })
            : t('today.stsZeroWhenMonth'),
        })}
        {b.earmarkedOperatingGoalCash > 0 && (
          <>
            {' '}
            <button
              type="button"
              className="icon-btn"
              onClick={() => onGoTab('forecast', 'scenarios')}
            >
              {t('today.adjustSavingPlan')}
            </button>
          </>
        )}
      </p>
    )
  }

  if (b.earmarkedOperatingGoalCash > 0) {
    return (
      <p className="sub sts-context-note">
        {t('today.stsZeroGoalDeducted', {
          goalReserve: breakdown.goalReserve,
          amount: money(b.earmarkedOperatingGoalCash, privacy),
          safeToSpend: quoteSafeToSpend(),
        })}
        <button
          type="button"
          className="icon-btn"
          onClick={() => onGoTab('forecast', 'scenarios')}
        >
          {t('today.adjustSavingPlan')}
        </button>
      </p>
    )
  }

  return (
    <p className="sub sts-context-note">
      {t('today.stsZeroTight', { safeToSpend: safeToSpendLabel() })}
    </p>
  )
}

function SavingPlanCard({
  derived,
  privacy,
  onGoTab,
}: {
  derived: Dashboard['derived']
  privacy: boolean
  onGoTab: GoTab
}) {
  const { t } = useLocale()
  const breakdown = stsBreakdown()
  const cap = derived.savingCapacity

  if (cap.rationale === 'none') {
    return (
      <div className="card today-hero">
        <div className="today-card-head">
          <h3>{t('today.savingCapacity')}</h3>
        </div>
        <div className="kpi" style={{ padding: 0 }}>
          <span className="value">{money(0, privacy)}</span>
          <span className="sub">
            {t('today.savingNoneSub', {
              buffer: breakdown.buffer,
              goalPart:
                cap.earmarkedOperatingGoalCash > 0
                  ? t('today.savingNoneGoalPart', { goalReserve: breakdown.goalReserve })
                  : '',
            })}
          </span>
        </div>
      </div>
    )
  }

  const whenText =
    cap.rationale === 'after-payday' && cap.bestDay
      ? t('today.savingWhenAfterPayday', { date: dayLabelWithWeekday(cap.bestDay) })
      : cap.rationale === 'timed' && cap.bestDay
        ? dayLabelWithWeekday(cap.bestDay)
        : t('today.savingWhenNow')

  const whyText = t('today.savingWhy', {
    when: whenText,
    amount: money(cap.capacity, privacy),
    inflowPart:
      cap.rationale === 'after-payday' && cap.bestDayInflow > 0
        ? t('today.savingWhyInflow', { amount: money(cap.bestDayInflow, privacy) })
        : '',
    lowPart: cap.lowestDateMonth
      ? t('today.savingWhyLow', {
          date: dayLabel(cap.lowestDateMonth),
          amount: money(cap.lowestBalanceMonth, privacy),
        })
      : '',
    buffer: breakdown.buffer,
    bufferAmount: money(cap.operatingCashBuffer, privacy),
    goalPart:
      cap.earmarkedOperatingGoalCash > 0
        ? t('today.stsExplainGoalPart', {
            goalReserve: breakdown.goalReserve,
            amount: money(cap.earmarkedOperatingGoalCash, privacy),
          })
        : '',
  })

  return (
    <div className="card today-hero">
      <div className="today-card-head">
        <h3 className="today-hero-title">
          {t('today.savingCapacityTitle')}
          <HelpTip text={whyText} />
        </h3>
        <div className="today-card-actions">
          <button
            className="btn outline compact"
            onClick={() => onGoTab('forecast', 'scenarios')}
          >
            {t('today.manageSavingPlan')}
          </button>
        </div>
      </div>
      <div className="grid cols-2">
        <div className="kpi today-metric">
          <span className="label">
            {t('today.savingCapacityLabel')}
            <HelpTip
              text={t('today.savingCapacityHelp', {
                plannedPart:
                  cap.plannedCapacity > 0
                    ? t('today.savingCapacityHelpPlanned', {
                        amount: money(cap.plannedCapacity, privacy),
                      })
                    : t('today.savingCapacityHelpDefault'),
              })}
            />
          </span>
          <span className="value text-accent">
            {money(cap.capacity, privacy)}
          </span>
        </div>
        <div className="kpi today-metric">
          <span className="label">
            {t('today.bestSavingDay')}
            <HelpTip
              text={
                cap.rationale === 'after-payday'
                  ? t('today.bestDayAfterPayday')
                  : cap.rationale === 'timed'
                    ? t('today.bestDayTimed')
                    : t('today.bestDayAnytime', { liquidCash: liquidCashLabel() })
              }
            />
          </span>
          <span className="value">
            {cap.bestDay ? dayLabel(cap.bestDay) : t('today.bestDayNow')}
          </span>
        </div>
      </div>
    </div>
  )
}

function billTag(kind: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    card: t('today.flowCard'),
    expense: t('today.billTagExpense'),
    fee: t('today.flowFee'),
    transfer: t('today.flowTransfer'),
  }
  return map[kind] ?? t('today.flowExpense')
}

function goManageOccurrence(occ: ExpectedOccurrence, onGoTab: GoTab) {
  const hint = occurrenceNavHint(occ)
  switch (hint.kind) {
    case 'oneoff':
      onGoTab('history', 'oneoff', { focusEventId: hint.eventId })
      break
    case 'fixed':
      onGoTab('history', 'fixed')
      break
    case 'review':
      onGoTab('review')
      break
    default:
      break
  }
}

function PendingConfirmationsCard({
  items,
  privacy,
  onGoTab,
  onSkip,
  onConfirmOccurred,
}: {
  items: ExpectedOccurrence[]
  privacy: boolean
  onGoTab: GoTab
  onSkip: (id: string) => void
  onConfirmOccurred: (id: string) => void
}) {
  const { t } = useLocale()
  if (items.length === 0) return null

  const oneoffItems = items.filter(
    (o) => occurrenceNavHint(o).kind === 'oneoff',
  )

  const outflowTotal = items.reduce(
    (s, o) => (o.expectedAmount < 0 ? s + Math.abs(o.expectedAmount) : s),
    0,
  )
  const inflowTotal = items.reduce(
    (s, o) => (o.expectedAmount > 0 ? s + o.expectedAmount : s),
    0,
  )

  return (
    <div className="card today-pending-card">
      <div className="today-card-head">
        <h3>
          {t('today.pendingTitle')}
          <span className="tag warn inline-meta">
            {t('today.pendingCount', { count: items.length })}
          </span>
        </h3>
        {oneoffItems.length > 0 && (
          <button
            type="button"
            className="icon-btn"
            onClick={() =>
              onGoTab('history', 'oneoff', {
                focusEventId:
                  oneoffItems[0].sourceType === 'event'
                    ? oneoffItems[0].sourceId
                    : undefined,
              })
            }
          >
            {t('today.oneoffSection', { count: oneoffItems.length })}
          </button>
        )}
      </div>
      <p className="muted-note">
        {t('today.pendingIntro', {
          outflowPart:
            outflowTotal > 0
              ? t('today.pendingOutflow', { amount: money(outflowTotal, privacy) })
              : '',
          inflowPart:
            inflowTotal > 0
              ? `${outflowTotal > 0 ? t('today.pendingInflowSep') : ''}${t('today.pendingInflow', { amount: money(inflowTotal, privacy) })}`
              : '',
        })}
      </p>
      <div className="list">
        {items.map((occ) => {
          const navHint = occurrenceNavHint(occ)
          const navLabel = occurrenceNavLabel(navHint)
          return (
            <div className="item occ-pending-item" key={occ.id}>
              <span className={`dot critical`} />
              <div className="grow">
                <div className="name">{occ.label}</div>
                <div className="meta">
                  {t('today.pendingPlanned', { date: dayLabel(occ.date) })}{' '}
                  {signedMoney(occ.expectedAmount, privacy)}
                  <span className="occ-action-btns inline">
                    <button
                      type="button"
                      className="occ-micro-btn primary"
                      onClick={() => onConfirmOccurred(occ.id)}
                    >
                      {confirmOccurredLabel(occ)}
                    </button>
                    <span className="occ-action-sep" aria-hidden="true">
                      ·
                    </span>
                    <button
                      type="button"
                      className="occ-micro-btn"
                      onClick={() => onSkip(occ.id)}
                    >
                      {t('today.notOccurred')}
                    </button>
                    {navLabel && (
                      <>
                        <span className="occ-action-sep" aria-hidden="true">
                          ·
                        </span>
                        <button
                          type="button"
                          className="occ-micro-btn"
                          onClick={() => goManageOccurrence(occ, onGoTab)}
                        >
                          {navLabel}
                        </button>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TimelineBillsCard({
  occurrences,
  fallbackEvents,
  privacy,
}: {
  occurrences: ExpectedOccurrence[]
  fallbackEvents: DayEvent[]
  privacy: boolean
}) {
  const { t } = useLocale()
  if (occurrences.length > 0) {
    const now = new Date()
    const monthEndTs = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    ).getTime()
    const bills = occurrences
      .filter(
        (o) => o.expectedAmount < 0 && new Date(o.date).getTime() < monthEndTs,
      )
      .sort((a, b) => a.date.localeCompare(b.date))

    if (bills.length === 0) {
      return (
        <div className="card">
          <div className="today-card-head">
            <h3>{t('today.billsTitle')}</h3>
          </div>
          <p className="muted-note">{t('today.billsEmpty')}</p>
        </div>
      )
    }

    const top = bills.slice(0, 6)
    const total = bills.reduce((s, e) => s + Math.abs(e.expectedAmount), 0)

    return (
      <div className="card">
        <div className="today-card-head">
          <h3>{t('today.billsTitle')}</h3>
          <span className="text-secondary text-sm">
            {t('today.billsTotal', { amount: money(total, privacy) })}
          </span>
        </div>
        <div className="bill-list">
          {top.map((occ) => {
            const status = occurrenceDisplayStatus(occ)
            const portal =
              occ.sourceType === 'card_bill'
                ? resolveCardPortalFromBillLabel(occ.label)
                : null
            return (
              <div
                className={`bill-row has-occ-status${portal ? ' has-portal' : ''}`}
                key={occ.id}
              >
                <span className="bill-date">{dayLabel(occ.date)}</span>
                <span
                  className={`occ-status-pill ${displayStatusClass(status)}`}
                >
                  {displayStatusLabel(status)}
                </span>
                <span className="bill-name">
                  <InstitutionLogo billLabel={occ.label} size="sm" />
                  <span className="bill-name-text">
                    {occ.label}
                    {portal && (
                      <span className="bill-portal">
                        <CardPortalLink
                          portal={portal}
                          compact
                          showLogo={false}
                        />
                      </span>
                    )}
                    {status === 'matched_warn' &&
                      occ.varianceAmount != null && (
                        <small className="occ-variance">
                          {' '}
                          Δ {signedMoney(occ.varianceAmount, privacy)}
                        </small>
                      )}
                  </span>
                </span>
                <span className="bill-amt text-neg">
                  {signedMoney(occ.expectedAmount, privacy)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return <KeyBillsCard events={fallbackEvents} privacy={privacy} />
}

function KeyBillsCard({
  events,
  privacy,
}: {
  events: DayEvent[]
  privacy: boolean
}) {
  const { t } = useLocale()
  const now = new Date()
  const monthEndTs = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1,
  ).getTime()
  const bills = events
    .filter((e) => e.amount < 0 && e.ts < monthEndTs)
    .sort((a, b) => a.ts - b.ts)

  if (bills.length === 0) {
    return (
      <div className="card">
        <div className="today-card-head">
          <h3>{t('today.billsTitle')}</h3>
        </div>
        <p className="muted-note">{t('today.billsEmptyMonth')}</p>
      </div>
    )
  }

  const top = bills.slice(0, 5)
  const rest = bills.length - top.length
  const total = bills.reduce((s, e) => s + Math.abs(e.amount), 0)
  const largest = Math.max(...bills.map((e) => Math.abs(e.amount)))

  return (
    <div className="card">
      <div className="today-card-head">
        <h3>{t('today.billsTitle')}</h3>
        <span className="text-secondary text-sm">
          {t('today.billsTotal', { amount: money(total, privacy) })}
        </span>
      </div>
      <div className="bill-list">
        {top.map((e, i) => {
          const isMajor = Math.abs(e.amount) >= largest * 0.5
          const portal =
            e.kind === 'card' ? resolveCardPortalFromBillLabel(e.label) : null
          return (
            <div
              className={`bill-row${isMajor ? ' major' : ''}${portal ? ' has-portal' : ''}`}
              key={i}
            >
              <span className="bill-date">{dayLabel(e.date)}</span>
              <span className="tag outline">{billTag(e.kind, t)}</span>
              <span className="bill-name">
                <InstitutionLogo billLabel={e.label} size="sm" />
                <span className="bill-name-text">
                  {e.label}
                  {portal && (
                    <span className="bill-portal">
                      <CardPortalLink
                        portal={portal}
                        compact
                        showLogo={false}
                      />
                    </span>
                  )}
                </span>
              </span>
              <span className="bill-amt text-neg">
                {signedMoney(e.amount, privacy)}
              </span>
            </div>
          )
        })}
      </div>
      {rest > 0 && (
        <p className="muted-note mt-2">
          {t('today.billsMore', { count: rest })}
        </p>
      )}
    </div>
  )
}

function ProtectedReserveFallbackCard({
  dashboard,
  privacy,
  onGoTab,
}: {
  dashboard: Dashboard
  privacy: boolean
  onGoTab: GoTab
}) {
  const { t } = useLocale()
  const [simulate, setSimulate] = useState(false)
  const breakdown = dashboard.derived.safeToSpendBreakdown
  const shortfall = Math.max(
    0,
    breakdown.operatingCashBuffer - breakdown.lowestProjectedOperatingCash30d,
  )
  const protectedReserve = breakdown.protectedReserveExcludedUpstream
  const essentialMonthly = Math.max(
    0,
    dashboard.projection.baseline[1]?.essentialExpenses ?? 0,
  )
  if (shortfall <= 0 || protectedReserve <= 0) return null

  const coverAmount = Math.min(shortfall, protectedReserve)
  const remainingShortfall = Math.max(0, shortfall - coverAmount)
  const runwayLossMonths =
    essentialMonthly > 0 ? coverAmount / essentialMonthly : null

  return (
    <div className="card">
      <h3>{t('today.shortfallTitle')}</h3>
      <div className="list">
        <div className="kv">
          <span className="k">{t('today.shortfallExpected')}</span>
          <span className="text-neg">{money(shortfall, privacy)}</span>
        </div>
        <div className="kv">
          <span className="k">{t('today.shortfallReserve')}</span>
          <span>{money(protectedReserve, privacy)}</span>
        </div>
      </div>
      <p className="muted-note mt-2">{t('today.shortfallNote')}</p>
      <div className="flex-row">
        <button className="btn" onClick={() => setSimulate((v) => !v)}>
          {simulate ? t('today.hideSimulate') : t('today.simulateReserve')}
        </button>
        <button
          className="btn ghost"
          onClick={() => onGoTab('history', 'fixed')}
        >
          {t('today.adjustExpensePlan')}
        </button>
        <button className="btn ghost" onClick={() => onGoTab('settings')}>
          {t('today.transferFunds')}
        </button>
      </div>
      {simulate && (
        <div className="list mt-2-5">
          <div className="kv">
            <span className="k">{t('today.simulateUseReserve')}</span>
            <span>{money(coverAmount, privacy)}</span>
          </div>
          <div className="kv">
            <span className="k">{t('today.simulateRemaining')}</span>
            <span className={remainingShortfall > 0 ? 'text-neg' : 'text-pos'}>
              {money(remainingShortfall, privacy)}
            </span>
          </div>
          <div className="kv">
            <span className="k">{t('today.runwayImpact')}</span>
            <span className="text-warn">
              {runwayLossMonths == null
                ? t('today.runwayNotConfigured')
                : t('today.runwayLoss', { months: runwayLossMonths.toFixed(1) })}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function safeToSpendText(
  derived: Dashboard['derived'],
  outlook: Dashboard['outlook'],
  privacy: boolean,
): string {
  const breakdown = stsBreakdown()
  const b = derived.safeToSpendBreakdown
  const a = derived.cashAnchors
  const lowDate = outlook.lowestDate ? `（${dayLabel(outlook.lowestDate)}）` : ''
  const goalPart =
    b.earmarkedOperatingGoalCash > 0
      ? translate('today.stsExplainGoalPart', {
          goalReserve: breakdown.goalReserve,
          amount: money(b.earmarkedOperatingGoalCash, privacy),
        })
      : ''
  const cashBase = a.hasAnchoredAccounts
    ? translate('today.stsExplainInTransit', {
        total: money(a.totalStartLiquid, privacy),
        anchor: money(a.clearedLiquid + a.otherLiquid, privacy),
      })
    : `${liquidCashLabel()} ${money(derived.liquidCash, privacy)}`
  return translate('today.stsExplainBody', {
    cashBase,
    lowDate,
    lowAmount: money(b.lowestProjectedOperatingCash30d, privacy),
    buffer: breakdown.buffer,
    bufferAmount: money(b.operatingCashBuffer, privacy),
    goalPart,
    protectedReserve: breakdown.protectedReserve,
    protectedAmount: money(b.protectedReserveExcludedUpstream, privacy),
  })
}

function CashCalendar({
  events,
  dailyBalances,
  privacy,
  buffer,
  view,
  monthOffset,
}: {
  events: DayEvent[]
  dailyBalances: Dashboard['outlook']['dailyBalances']
  privacy: boolean
  buffer: number
  view: 'agenda' | 'calendar'
  monthOffset: number
}) {
  const { t } = useLocale()
  const startTs = dailyBalances[0]?.ts ?? events[0]?.ts ?? Date.now()
  const startDate = new Date(startTs)
  const monthStartTs = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + monthOffset,
    1,
  ).getTime()
  const monthEndTs = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + monthOffset + 1,
    1,
  ).getTime()
  const balancesInWindow = dailyBalances.filter(
    (p) => p.ts >= monthStartTs && p.ts < monthEndTs,
  )
  const filtered = events.filter(
    (e) => e.ts >= monthStartTs && e.ts < monthEndTs,
  )
  const eventsByDate = useMemo(() => {
    const map = new Map<string, DayEvent[]>()
    for (const e of events.filter(
      (row) => row.ts >= monthStartTs && row.ts < monthEndTs,
    )) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  }, [events, monthStartTs, monthEndTs])

  if (view === 'agenda' && filtered.length === 0) {
    return (
      <p className="muted-note">{t('today.calendarEmptySetup')}</p>
    )
  }

  if (view === 'calendar' && balancesInWindow.length === 0) {
    return (
      <p className="muted-note">{t('today.calendarEmpty')}</p>
    )
  }

  const firstDay = new Date(balancesInWindow[0]?.ts ?? startTs).getDay()
  const blanks = Array.from({ length: firstDay }, (_, i) => `blank-${i}`)
  const cells = balancesInWindow.map((p) => {
    const dayEvents = eventsByDate.get(p.date) ?? []
    const activeEvents = dayEvents.filter((row) => row.affectsBalance !== false)
    const settledCount = dayEvents.length - activeEvents.length
    const hasEvents = dayEvents.length > 0
    const dayNet = activeEvents.reduce((sum, row) => sum + row.amount, 0)
    const hasRisk = p.balanceEnd < buffer
    const severeOutflow = dayNet <= -1000
    const dayTooltip = hasEvents
      ? dayEvents
          .map((e) => {
            const tag = e.fundedFromReserve
              ? ` · ${t('today.reserveAccount')}`
              : e.affectsBalance === false && e.displayStatus
                ? ` · ${displayStatusLabel(e.displayStatus)}`
                : ''
            return `${signedMoney(e.amount, privacy)} ${e.label}${tag}`
          })
          .join('\n')
      : ''
    return (
      <div
        key={p.date}
        className={`cash-day-cell${hasRisk ? ' risk' : ''}${severeOutflow ? ' severe-outflow' : ''}`}
        title={dayTooltip || undefined}
      >
        <div className="cash-day-head">
          <span>
            {dayLabel(p.date)} · {weekdayLabel(p.date)}
          </span>
          {hasRisk && <span className="tag critical">{t('today.riskTag')}</span>}
        </div>
        {hasEvents && (
          <div className="cash-day-flow">
            <span className={`cash-day-flow-amt ${cashFlowClass(dayNet)}`}>
              {signedMoney(dayNet, privacy)}
            </span>
            <span className={`cash-day-meta${severeOutflow ? ' severe' : ''}`}>
              {severeOutflow
                ? t('today.largeTag')
                : settledCount > 0
                  ? t('today.eventsMixed', {
                      active: activeEvents.length,
                      settled: settledCount,
                    })
                  : t('today.eventsCount', { count: dayEvents.length })}
            </span>
          </div>
        )}
        <div className={`cash-day-balance${hasRisk ? ' text-neg' : ''}`}>
          {t('today.balanceLabel', { amount: money(p.balanceEnd, privacy) })}
        </div>
      </div>
    )
  })

  return (
    <>
      {view === 'agenda' ? (
        <>
          <div className="cal">
            {filtered.map((e, i) => {
              const settled = e.affectsBalance === false && !e.fundedFromReserve
              const statusClass = e.displayStatus
                ? displayStatusClass(e.displayStatus)
                : ''
              return (
                <div
                  className={`cal-row${e.amount >= 0 ? ' income' : ' expense'}${settled ? ' settled' : ''}${!settled && e.balanceAfter < buffer ? ' risk' : ''}`}
                  key={`${e.date}-${e.label}-${e.occurrenceId ?? i}`}
                >
                  <span className="cal-date">
                    {dayLabel(e.date)}
                    <small>{weekdayLabel(e.date)}</small>
                  </span>
                  <span className="cal-label">
                    <span
                      className={`cal-name${settled ? ' settled-text' : ''}`}
                    >
                      {e.label}
                    </span>
                    <span className="cal-kind-row">
                      <span className="cal-kind-tag">
                        {t(EVENT_KIND_KEYS[e.kind]) ?? t('today.eventFallback')}
                      </span>
                      {e.displayStatus && (
                        <span className={`occ-pill ${statusClass}`}>
                          {displayStatusLabel(e.displayStatus)}
                        </span>
                      )}
                      {e.fundedFromReserve && (
                        <span className="occ-pill occ-reserve-tag">
                          {t('today.reserveAccount')}
                        </span>
                      )}
                      {settled && !e.displayStatus && (
                        <span className="occ-pill occ-settled-tag">
                          {t('today.settledTag')}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="cal-right">
                    <span
                      className={`cal-amt ${cashFlowClass(e.amount)}${settled ? ' settled-text' : ''}`}
                    >
                      {signedMoney(e.amount, privacy)}
                    </span>
                    <span
                      className={`cal-bal${!settled && e.balanceAfter < buffer ? ' text-neg' : ''}`}
                    >
                      {e.fundedFromReserve
                        ? t('today.notInLiquid', { liquidCash: liquidCashLabel() })
                        : settled
                          ? t('today.includedInBalance')
                          : t('today.balanceAfter', {
                              amount: money(e.balanceAfter, privacy),
                            })}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="cash-calendar-grid-wrap">
          <div className="cash-calendar-weekdays">
            {WEEKDAY_KEYS.map((key) => (
              <span key={key}>{t(key)}</span>
            ))}
          </div>
          <div className="cash-calendar-grid">
            {blanks.map((key) => (
              <div
                key={key}
                className="cash-day-cell blank"
                aria-hidden="true"
              />
            ))}
            {cells}
          </div>
        </div>
      )}
    </>
  )
}
