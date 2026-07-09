<script>
  import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    HelpCircle,
    List,
  } from '@lucide/svelte'
  import { projectDaily, timelineDailyOptions } from '$lib/engine/daily'
  import { baselineCategoryAverages } from '$lib/engine/realityLoop'
  import {
    displayStatusClass,
    displayStatusLabel,
    confirmOccurredLabel,
    occurrenceDisplayStatus,
    occurrencesInMonth,
    occurrenceNavHint,
    occurrenceNavLabel,
  } from '$lib/engine/timeline'
  import { resolveCardPortalFromBillLabel } from '$lib/cardPortals'
  import CardPortalLink from '$lib/components/CardPortalLink.svelte'
  import InstitutionLogo from '$lib/components/InstitutionLogo.svelte'
  import GettingStartedChecklist from '$lib/components/GettingStartedChecklist.svelte'
  import AiBriefCard from '$lib/components/AiBriefCard.svelte'
  import { money, signedMoney, depositDeltaClass } from '$lib/format.js'
  import { resolveCashPositionUiState } from '$lib/engine/reconciliation'
  import { getTimelineStore } from '$lib/timeline.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import { safeToSpendLabel, safeToSpendSubtitle } from '@life-os/finance-core/copy/metrics'
  import {
    bookBalanceLabel,
    clearedCashLabel,
    inTransitCashLabel,
    liquidCashLabel,
    quoteSafeToSpend,
    stsBreakdown,
    welcomeTitle,
  } from '@life-os/finance-core/copy/terminology'
  import { t } from '$lib/i18n.svelte.js'

  /** @typedef {import('../../types.js').FinanceData} FinanceData */
  /** @typedef {import('$lib/dashboard.js').Dashboard} Dashboard */
  /** @typedef {import('$lib/goTab.js').GoTab} GoTab */
  /** @typedef {import('$lib/engine/daily').DayEvent} DayEvent */
  /** @typedef {import('$lib/engine/timeline').ExpectedOccurrence} ExpectedOccurrence */
  /** @typedef {import('$lib/engine/reconciliation').LiquidCashAnchors} LiquidCashAnchors */

  /** @type {{ data: FinanceData, dashboard: Dashboard, onOpenSpend: () => void, onGoTab: GoTab }} */
  let { data, dashboard, onOpenSpend, onGoTab } = $props()

  const SEV_CLASS = {
    critical: 'text-neg',
    warning: 'text-warn',
    info: 'text-secondary',
    ok: 'text-pos',
  }

  const WEEKDAY_KEYS = [
    'today.weekdaySun',
    'today.weekdayMon',
    'today.weekdayTue',
    'today.weekdayWed',
    'today.weekdayThu',
    'today.weekdayFri',
    'today.weekdaySat',
  ]

  /** @type {Record<DayEvent['kind'], string>} */
  const EVENT_KIND_KEYS = {
    income: 'today.flowIncome',
    expense: 'today.flowExpense',
    card: 'today.flowCard',
    fee: 'today.flowFee',
    transfer: 'today.flowTransfer',
  }

  const timeline = getTimelineStore()
  const txnsStore = getTransactionsStore()

  let showAllActions = $state(false)
  let calendarView = $state(/** @type {'agenda' | 'calendar'} */ ('agenda'))
  let monthOffset = $state(0)
  let showMoreQuickActions = $state(false)

  const safeToSpend = $derived(safeToSpendLabel())
  const safeToSpendSub = $derived(safeToSpendSubtitle())
  const privacy = $derived(data.privacy)
  const derived = $derived(dashboard.derived)
  const outlook = $derived(dashboard.outlook)
  const actions = $derived(dashboard.actions)

  const calendarOutlook = $derived.by(() => {
    if (outlook.days >= 180) return outlook
    let dailyBurnOverride
    if (derived.cashAnchors.hasAnchoredAccounts && txnsStore.txns.length > 0) {
      const byCat = baselineCategoryAverages(txnsStore.txns, 3)
      const monthlyActual = Object.values(byCat).reduce((s, v) => s + v, 0)
      if (monthlyActual > 0) dailyBurnOverride = monthlyActual / 30
    }
    const opts = timelineDailyOptions({
      startLiquid: derived.cashAnchors.hasAnchoredAccounts
        ? derived.cashAnchors.totalStartLiquid
        : undefined,
      occurrences: timeline.occurrences,
      dailyBurnOverride,
      suppressTodayBurn: derived.cashAnchors.hasAnchoredAccounts,
    })
    return projectDaily(data, 220, new Date(), opts)
  })

  const monthPrefix = $derived.by(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const monthOccurrences = $derived(occurrencesInMonth(timeline.occurrences, monthPrefix))

  const primaryActions = $derived(
    showAllActions
      ? actions
      : actions
          .filter((a) => a.severity === 'critical' || a.severity === 'warning')
          .slice(0, 5),
  )

  const monthBaseTs = $derived(
    calendarOutlook.dailyBalances[0]?.ts ?? calendarOutlook.events[0]?.ts ?? Date.now(),
  )
  const monthBaseDate = $derived(new Date(monthBaseTs))
  const monthStartTs = $derived(
    new Date(monthBaseDate.getFullYear(), monthBaseDate.getMonth() + monthOffset, 1).getTime(),
  )
  const monthEndTs = $derived(
    new Date(monthBaseDate.getFullYear(), monthBaseDate.getMonth() + monthOffset + 1, 1).getTime(),
  )
  const hasPrevMonth = $derived(monthOffset > 0)
  const hasNextMonth = $derived(calendarOutlook.dailyBalances.some((p) => p.ts >= monthEndTs))
  const currentMonthLabel = $derived(
    t('today.currentMonthLabel', { month: new Date(monthStartTs).getMonth() + 1 }),
  )

  /** @param {string} iso */
  function dayLabel(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    return m ? `${Number(m[2])}/${Number(m[3])}` : iso
  }

  /** @param {string} iso */
  function dayLabelWithWeekday(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    if (!m) return iso
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return `${Number(m[2])}/${Number(m[3])}（${t(WEEKDAY_KEYS[d.getDay()])}）`
  }

  /** @param {string} iso */
  function weekdayLabel(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    if (!m) return ''
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return t(WEEKDAY_KEYS[d.getDay()])
  }

  /** @param {number} amount */
  function cashFlowClass(amount) {
    return depositDeltaClass(amount)
  }

  /** @param {Dashboard['derived']} d */
  function safeToSpendText(d, ol, priv) {
    const breakdown = stsBreakdown()
    const b = d.safeToSpendBreakdown
    const a = d.cashAnchors
    const lowDate = ol.lowestDate ? `（${dayLabel(ol.lowestDate)}）` : ''
    const goalPart =
      b.earmarkedOperatingGoalCash > 0
        ? t('today.stsExplainGoalPart', {
            goalReserve: breakdown.goalReserve,
            amount: money(b.earmarkedOperatingGoalCash, priv),
          })
        : ''
    const cashBase = a.hasAnchoredAccounts
      ? t('today.stsExplainInTransit', {
          total: money(a.totalStartLiquid, priv),
          anchor: money(a.clearedLiquid + a.otherLiquid, priv),
        })
      : `${liquidCashLabel()} ${money(d.liquidCash, priv)}`
    return t('today.stsExplainBody', {
      cashBase,
      lowDate,
      lowAmount: money(b.lowestProjectedOperatingCash30d, priv),
      buffer: breakdown.buffer,
      bufferAmount: money(b.operatingCashBuffer, priv),
      goalPart,
      protectedReserve: breakdown.protectedReserve,
      protectedAmount: money(b.protectedReserveExcludedUpstream, priv),
    })
  }

  /** @param {string} kind */
  function billTag(kind) {
    const map = {
      card: t('today.flowCard'),
      expense: t('today.billTagExpense'),
      fee: t('today.flowFee'),
      transfer: t('today.flowTransfer'),
    }
    return map[kind] ?? t('today.flowExpense')
  }

  /** @param {ExpectedOccurrence} occ */
  function goManageOccurrence(occ) {
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

  // Cash position card state
  const cashUi = $derived(resolveCashPositionUiState(derived.cashAnchors))
  let showCashDetails = $state(false)
  let aligning = $state(false)

  // Protected reserve simulate
  let simulate = $state(false)
  const shortfallBreakdown = $derived(derived.safeToSpendBreakdown)
  const shortfall = $derived(
    Math.max(0, shortfallBreakdown.operatingCashBuffer - shortfallBreakdown.lowestProjectedOperatingCash30d),
  )
  const protectedReserve = $derived(shortfallBreakdown.protectedReserveExcludedUpstream)
  const essentialMonthly = $derived(
    Math.max(0, dashboard.projection.baseline[1]?.essentialExpenses ?? 0),
  )
  const coverAmount = $derived(Math.min(shortfall, protectedReserve))
  const remainingShortfall = $derived(Math.max(0, shortfall - coverAmount))
  const runwayLossMonths = $derived(essentialMonthly > 0 ? coverAmount / essentialMonthly : null)

  // Pending confirmations
  const oneoffItems = $derived(
    timeline.actionable.filter((o) => occurrenceNavHint(o).kind === 'oneoff'),
  )
  const pendingOutflowTotal = $derived(
    timeline.actionable.reduce(
      (s, o) => (o.expectedAmount < 0 ? s + Math.abs(o.expectedAmount) : s),
      0,
    ),
  )
  const pendingInflowTotal = $derived(
    timeline.actionable.reduce(
      (s, o) => (o.expectedAmount > 0 ? s + o.expectedAmount : s),
      0,
    ),
  )

  // Bills
  const monthEndForBills = $derived(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime())
  const timelineBills = $derived(
    monthOccurrences
      .filter((o) => o.expectedAmount < 0 && new Date(o.date).getTime() < monthEndForBills)
      .sort((a, b) => a.date.localeCompare(b.date)),
  )
  const fallbackBills = $derived(
    outlook.events
      .filter((e) => e.amount < 0 && e.ts < monthEndForBills)
      .sort((a, b) => a.ts - b.ts),
  )

  // Cash calendar derived
  const calStartTs = $derived(
    calendarOutlook.dailyBalances[0]?.ts ?? calendarOutlook.events[0]?.ts ?? Date.now(),
  )
  const calStartDate = $derived(new Date(calStartTs))
  const calMonthStartTs = $derived(
    new Date(calStartDate.getFullYear(), calStartDate.getMonth() + monthOffset, 1).getTime(),
  )
  const calMonthEndTs = $derived(
    new Date(calStartDate.getFullYear(), calStartDate.getMonth() + monthOffset + 1, 1).getTime(),
  )
  const balancesInWindow = $derived(
    calendarOutlook.dailyBalances.filter((p) => p.ts >= calMonthStartTs && p.ts < calMonthEndTs),
  )
  const filteredEvents = $derived(
    calendarOutlook.events.filter((e) => e.ts >= calMonthStartTs && e.ts < calMonthEndTs),
  )
  const eventsByDate = $derived.by(() => {
    /** @type {Map<string, DayEvent[]>} */
    const map = new Map()
    for (const e of calendarOutlook.events.filter(
      (row) => row.ts >= calMonthStartTs && row.ts < calMonthEndTs,
    )) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  })
  const calFirstDay = $derived(new Date(balancesInWindow[0]?.ts ?? calStartTs).getDay())
  const calBlanks = $derived(Array.from({ length: calFirstDay }, (_, i) => `blank-${i}`))

  // Saving capacity
  const savingBreakdown = $derived(stsBreakdown())
  const cap = $derived(derived.savingCapacity)
</script>

{#snippet helpTip(text)}
  <span class="help-tip" tabindex="0" role="note" aria-label={text}>
    <HelpCircle size={14} aria-hidden="true" />
    <span class="help-tip-pop" role="tooltip">{text}</span>
  </span>
{/snippet}

{#if data.accounts.length === 0 && data.cashFlows.length === 0}
  <div class="empty">
    <h2 class="mb-2">{welcomeTitle()}</h2>
    <p class="text-secondary">{t('today.emptyHint', { safeToSpend })}</p>
    <div class="flex-row-center mt-4">
      <button class="btn" onclick={() => onGoTab('accounts')}>{t('today.addAccounts')}</button>
      <button class="btn ghost" onclick={() => onGoTab('history', 'fixed')}>
        {t('today.addCashflows')}
      </button>
    </div>
    <div class="mt-4">
      <GettingStartedChecklist {onGoTab} />
    </div>
    <p class="muted-note text-sm mt-3 mb-0">
      <button type="button" class="text-btn" onclick={() => onGoTab('settings', 'help')}>
        {t('help.centerTitle')}
      </button>
    </p>
  </div>
{:else}
  <div class="grid gap-4">
    <p class="muted-note mb-1">{t('today.intro', { safeToSpend })}</p>
    <div class="life-os-grid life-os-grid--kpi life-os-grid--kpi-2 today-headline">
      <div class="card kpi kpi-accent today-hero">
        <span class="label">
          {safeToSpend}
          {@render helpTip(safeToSpendText(derived, outlook, privacy))}
        </span>
        <span class="value">{money(derived.safeToSpend, privacy)}</span>
        {#if derived.safeToSpend <= 0}
          {#if cap.capacity > 0}
            {@const goalPart =
              derived.safeToSpendBreakdown.earmarkedOperatingGoalCash > 0
                ? t('today.stsZeroGoalPart', {
                    goalReserve: savingBreakdown.goalReserve,
                    goalAmount: money(derived.safeToSpendBreakdown.earmarkedOperatingGoalCash, privacy),
                  })
                : ''}
            <p class="sub sts-context-note">
              {t('today.stsZeroWithCapacity', {
                buffer: savingBreakdown.buffer,
                bufferAmount: money(derived.safeToSpendBreakdown.operatingCashBuffer, privacy),
                goalPart,
                capacity: money(cap.capacity, privacy),
                when: cap.bestDay
                  ? t('today.stsZeroWhenAround', { date: dayLabel(cap.bestDay) })
                  : t('today.stsZeroWhenMonth'),
              })}
              {#if derived.safeToSpendBreakdown.earmarkedOperatingGoalCash > 0}
                <button
                  type="button"
                  class="icon-btn"
                  onclick={() => onGoTab('forecast', 'scenarios')}
                >
                  {t('today.adjustSavingPlan')}
                </button>
              {/if}
            </p>
          {:else if derived.safeToSpendBreakdown.earmarkedOperatingGoalCash > 0}
            <p class="sub sts-context-note">
              {t('today.stsZeroGoalDeducted', {
                goalReserve: savingBreakdown.goalReserve,
                amount: money(derived.safeToSpendBreakdown.earmarkedOperatingGoalCash, privacy),
                safeToSpend: quoteSafeToSpend(),
              })}
              <button type="button" class="icon-btn" onclick={() => onGoTab('forecast', 'scenarios')}>
                {t('today.adjustSavingPlan')}
              </button>
            </p>
          {:else}
            <p class="sub sts-context-note">
              {t('today.stsZeroTight', { safeToSpend: safeToSpendLabel() })}
            </p>
          {/if}
        {/if}
        <span class="sub">{safeToSpendSub}</span>
      </div>

      {#if cap.rationale === 'none'}
        <div class="card today-hero">
          <div class="today-card-head">
            <h3>{t('today.savingCapacity')}</h3>
          </div>
          <div class="kpi" style="padding: 0">
            <span class="value">{money(0, privacy)}</span>
            <span class="sub">
              {t('today.savingNoneSub', {
                buffer: savingBreakdown.buffer,
                goalPart:
                  cap.earmarkedOperatingGoalCash > 0
                    ? t('today.savingNoneGoalPart', { goalReserve: savingBreakdown.goalReserve })
                    : '',
              })}
            </span>
          </div>
        </div>
      {:else}
        {@const whenText =
          cap.rationale === 'after-payday' && cap.bestDay
            ? t('today.savingWhenAfterPayday', { date: dayLabelWithWeekday(cap.bestDay) })
            : cap.rationale === 'timed' && cap.bestDay
              ? dayLabelWithWeekday(cap.bestDay)
              : t('today.savingWhenNow')}
        {@const whyText = t('today.savingWhy', {
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
          buffer: savingBreakdown.buffer,
          bufferAmount: money(cap.operatingCashBuffer, privacy),
          goalPart:
            cap.earmarkedOperatingGoalCash > 0
              ? t('today.stsExplainGoalPart', {
                  goalReserve: savingBreakdown.goalReserve,
                  amount: money(cap.earmarkedOperatingGoalCash, privacy),
                })
              : '',
        })}
        <div class="card today-hero">
          <div class="today-card-head">
            <h3 class="today-hero-title">
              {t('today.savingCapacityTitle')}
              {@render helpTip(whyText)}
            </h3>
            <div class="today-card-actions">
              <button class="btn outline compact" onclick={() => onGoTab('forecast', 'scenarios')}>
                {t('today.manageSavingPlan')}
              </button>
            </div>
          </div>
          <div class="grid cols-2">
            <div class="kpi today-metric">
              <span class="label">
                {t('today.savingCapacityLabel')}
                {@render helpTip(
                  t('today.savingCapacityHelp', {
                    plannedPart:
                      cap.plannedCapacity > 0
                        ? t('today.savingCapacityHelpPlanned', {
                            amount: money(cap.plannedCapacity, privacy),
                          })
                        : t('today.savingCapacityHelpDefault'),
                  }),
                )}
              </span>
              <span class="value text-accent">{money(cap.capacity, privacy)}</span>
            </div>
            <div class="kpi today-metric">
              <span class="label">
                {t('today.bestSavingDay')}
                {@render helpTip(
                  cap.rationale === 'after-payday'
                    ? t('today.bestDayAfterPayday')
                    : cap.rationale === 'timed'
                      ? t('today.bestDayTimed')
                      : t('today.bestDayAnytime', { liquidCash: liquidCashLabel() }),
                )}
              </span>
              <span class="value">
                {cap.bestDay ? dayLabel(cap.bestDay) : t('today.bestDayNow')}
              </span>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <AiBriefCard {data} {dashboard} />

    {#if cashUi.visible && cashUi.variant}
      <div
        class={cashUi.variant === 'onboarding'
          ? 'cash-position-strip'
          : 'cash-position-strip cash-position-strip--warn'}
      >
        <div class="cash-position-strip-main">
          <p class="cash-position-strip-text">
            {cashUi.variant === 'onboarding'
              ? t('today.cashOnboardingSummary')
              : t('today.cashDriftSummary', { amount: money(cashUi.drift, privacy) })}
            {@render helpTip(
              cashUi.variant === 'onboarding'
                ? t('today.cashOnboardingHelp')
                : t('today.cashDriftHelp'),
            )}
          </p>
          <div class="cash-position-strip-actions">
            {#if cashUi.variant === 'onboarding'}
              <button type="button" class="btn outline compact" onclick={() => onGoTab('accounts')}>
                {t('today.viewAccounts')}
              </button>
            {:else}
              <button
                type="button"
                class="btn compact"
                disabled={aligning}
                onclick={() => {
                  aligning = true
                  void timeline.alignCashToAccountBalances().finally(() => (aligning = false))
                }}
              >
                {aligning ? t('today.aligning') : t('today.autoAlign')}
              </button>
            {/if}
            <button
              type="button"
              class="text-btn cash-position-strip-link"
              aria-expanded={showCashDetails}
              onclick={() => (showCashDetails = !showCashDetails)}
            >
              {showCashDetails ? t('today.hideDetails') : t('today.learnMore')}
            </button>
          </div>
        </div>
        {#if showCashDetails}
          <div class="cash-position-details">
            <div class="grid cols-3 cash-position-details-grid">
              <div class="kpi today-metric">
                <span class="label">{clearedCashLabel()}</span>
                <span class="value">
                  {money(derived.cashAnchors.clearedLiquid + derived.cashAnchors.otherLiquid, privacy)}
                </span>
                <span class="sub">{t('today.anchorBalanceSub')}</span>
              </div>
              <div class="kpi today-metric">
                <span class="label">{inTransitCashLabel()}</span>
                <span class="value text-accent">
                  {money(derived.cashAnchors.totalStartLiquid, privacy)}
                </span>
                <span class="sub">
                  {t('today.calendarStartSub', { safeToSpend: quoteSafeToSpend() })}
                </span>
              </div>
              <div class="kpi today-metric">
                <span class="label">{bookBalanceLabel()}</span>
                <span class="value">{money(derived.cashAnchors.cacheLiquid, privacy)}</span>
                <span class="sub">{t('today.settingsBalanceSub')}</span>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    {#if timeline.actionable.length > 0}
      <div class="card today-pending-card">
        <div class="today-card-head">
          <h3>
            {t('today.pendingTitle')}
            <span class="tag warn inline-meta">
              {t('today.pendingCount', { count: timeline.actionable.length })}
            </span>
          </h3>
          {#if oneoffItems.length > 0}
            <button
              type="button"
              class="icon-btn"
              onclick={() =>
                onGoTab('history', 'oneoff', {
                  focusEventId:
                    oneoffItems[0].sourceType === 'event' ? oneoffItems[0].sourceId : undefined,
                })}
            >
              {t('today.oneoffSection', { count: oneoffItems.length })}
            </button>
          {/if}
        </div>
        <p class="muted-note">
          {t('today.pendingIntro', {
            outflowPart:
              pendingOutflowTotal > 0
                ? t('today.pendingOutflow', { amount: money(pendingOutflowTotal, privacy) })
                : '',
            inflowPart:
              pendingInflowTotal > 0
                ? `${pendingOutflowTotal > 0 ? t('today.pendingInflowSep') : ''}${t('today.pendingInflow', { amount: money(pendingInflowTotal, privacy) })}`
                : '',
          })}
        </p>
        <div class="list">
          {#each timeline.actionable as occ (occ.id)}
            {@const navHint = occurrenceNavHint(occ)}
            {@const navLabel = occurrenceNavLabel(navHint)}
            <div class="item occ-pending-item">
              <span class="dot critical"></span>
              <div class="grow">
                <div class="name">{occ.label}</div>
                <div class="meta">
                  {t('today.pendingPlanned', { date: dayLabel(occ.date) })}
                  {signedMoney(occ.expectedAmount, privacy)}
                  <span class="occ-action-btns inline">
                    <button
                      type="button"
                      class="occ-micro-btn primary"
                      onclick={() => void timeline.markConfirmedPaid(occ.id)}
                    >
                      {confirmOccurredLabel(occ)}
                    </button>
                    <span class="occ-action-sep" aria-hidden="true">·</span>
                    <button
                      type="button"
                      class="occ-micro-btn"
                      onclick={() => void timeline.markSkipped(occ.id)}
                    >
                      {t('today.notOccurred')}
                    </button>
                    {#if navLabel}
                      <span class="occ-action-sep" aria-hidden="true">·</span>
                      <button
                        type="button"
                        class="occ-micro-btn"
                        onclick={() => goManageOccurrence(occ)}
                      >
                        {navLabel}
                      </button>
                    {/if}
                  </span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div class="life-os-grid life-os-grid--split-lg life-os-grid--aside-wide today-main-panels">
      <div class="life-os-grid__main card today-calendar-card">
        <div class="today-card-head">
          <h3>{t('today.cashCalendar')}</h3>
          <div class="today-card-actions">
            <div class="today-calendar-pager inline">
              <button
                class="icon-btn month-nav"
                onclick={() => (monthOffset = Math.max(0, monthOffset - 1))}
                disabled={!hasPrevMonth}
                aria-label={t('today.prevMonth')}
              >
                <ChevronLeft size={16} />
              </button>
              <span class="month-label">{currentMonthLabel}</span>
              <button
                class="icon-btn month-nav"
                onclick={() => (monthOffset = hasNextMonth ? monthOffset + 1 : monthOffset)}
                disabled={!hasNextMonth}
                aria-label={t('today.nextMonth')}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div class="seg seg-icons" role="tablist" aria-label={t('today.calendarViewMode')}>
              <button
                class={calendarView === 'agenda' ? 'active' : ''}
                role="tab"
                aria-selected={calendarView === 'agenda'}
                aria-label={t('today.listView')}
                onclick={() => (calendarView = 'agenda')}
              >
                <List size={14} />
              </button>
              <button
                class={calendarView === 'calendar' ? 'active' : ''}
                role="tab"
                aria-selected={calendarView === 'calendar'}
                aria-label={t('today.calendarView')}
                onclick={() => (calendarView = 'calendar')}
              >
                <CalendarDays size={14} />
              </button>
            </div>
          </div>
        </div>

        {#if calendarView === 'agenda' && filteredEvents.length === 0}
          <p class="muted-note">{t('today.calendarEmptySetup')}</p>
        {:else if calendarView === 'calendar' && balancesInWindow.length === 0}
          <p class="muted-note">{t('today.calendarEmpty')}</p>
        {:else if calendarView === 'agenda'}
          <div class="cal">
            {#each filteredEvents as e, i (`${e.date}-${e.label}-${e.occurrenceId ?? i}`)}
              {@const settled = e.affectsBalance === false && !e.fundedFromReserve}
              {@const statusClass = e.displayStatus ? displayStatusClass(e.displayStatus) : ''}
              <div
                class="cal-row{e.amount >= 0 ? ' income' : ' expense'}{settled ? ' settled' : ''}{!settled && e.balanceAfter < calendarOutlook.buffer ? ' risk' : ''}"
              >
                <span class="cal-date">
                  {dayLabel(e.date)}
                  <small>{weekdayLabel(e.date)}</small>
                </span>
                <span class="cal-label">
                  <span class="cal-name{settled ? ' settled-text' : ''}">{e.label}</span>
                  <span class="cal-kind-row">
                    <span class="cal-kind-tag">
                      {t(EVENT_KIND_KEYS[e.kind]) ?? t('today.eventFallback')}
                    </span>
                    {#if e.displayStatus}
                      <span class="occ-pill {statusClass}">{displayStatusLabel(e.displayStatus)}</span>
                    {/if}
                    {#if e.fundedFromReserve}
                      <span class="occ-pill occ-reserve-tag">{t('today.reserveAccount')}</span>
                    {/if}
                    {#if settled && !e.displayStatus}
                      <span class="occ-pill occ-settled-tag">{t('today.settledTag')}</span>
                    {/if}
                  </span>
                </span>
                <span class="cal-right">
                  <span class="cal-amt {cashFlowClass(e.amount)}{settled ? ' settled-text' : ''}">
                    {signedMoney(e.amount, privacy)}
                  </span>
                  <span
                    class="cal-bal{!settled && e.balanceAfter < calendarOutlook.buffer ? ' text-neg' : ''}"
                  >
                    {e.fundedFromReserve
                      ? t('today.notInLiquid', { liquidCash: liquidCashLabel() })
                      : settled
                        ? t('today.includedInBalance')
                        : t('today.balanceAfter', { amount: money(e.balanceAfter, privacy) })}
                  </span>
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="cash-calendar-grid-wrap">
            <div class="cash-calendar-weekdays">
              {#each WEEKDAY_KEYS as key (key)}
                <span>{t(key)}</span>
              {/each}
            </div>
            <div class="cash-calendar-grid">
              {#each calBlanks as key (key)}
                <div class="cash-day-cell blank" aria-hidden="true"></div>
              {/each}
              {#each balancesInWindow as p (p.date)}
                {@const dayEvents = eventsByDate.get(p.date) ?? []}
                {@const activeEvents = dayEvents.filter((row) => row.affectsBalance !== false)}
                {@const settledCount = dayEvents.length - activeEvents.length}
                {@const hasEvents = dayEvents.length > 0}
                {@const dayNet = activeEvents.reduce((sum, row) => sum + row.amount, 0)}
                {@const hasRisk = p.balanceEnd < calendarOutlook.buffer}
                {@const severeOutflow = dayNet <= -1000}
                {@const dayTooltip = hasEvents
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
                  : ''}
                <div
                  class="cash-day-cell{hasRisk ? ' risk' : ''}{severeOutflow ? ' severe-outflow' : ''}"
                  title={dayTooltip || undefined}
                >
                  <div class="cash-day-head">
                    <span>{dayLabel(p.date)} · {weekdayLabel(p.date)}</span>
                    {#if hasRisk}
                      <span class="tag critical">{t('today.riskTag')}</span>
                    {/if}
                  </div>
                  {#if hasEvents}
                    <div class="cash-day-flow">
                      <span class="cash-day-flow-amt {cashFlowClass(dayNet)}">
                        {signedMoney(dayNet, privacy)}
                      </span>
                      <span class="cash-day-meta{severeOutflow ? ' severe' : ''}">
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
                  {/if}
                  <div class="cash-day-balance{hasRisk ? ' text-neg' : ''}">
                    {t('today.balanceLabel', { amount: money(p.balanceEnd, privacy) })}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <div class="life-os-grid__aside today-side-stack">
        {#if shortfall > 0 && protectedReserve > 0}
          <div class="card">
            <h3>{t('today.shortfallTitle')}</h3>
            <div class="list">
              <div class="kv">
                <span class="k">{t('today.shortfallExpected')}</span>
                <span class="text-neg">{money(shortfall, privacy)}</span>
              </div>
              <div class="kv">
                <span class="k">{t('today.shortfallReserve')}</span>
                <span>{money(protectedReserve, privacy)}</span>
              </div>
            </div>
            <p class="muted-note mt-2">{t('today.shortfallNote')}</p>
            <div class="flex-row">
              <button class="btn" onclick={() => (simulate = !simulate)}>
                {simulate ? t('today.hideSimulate') : t('today.simulateReserve')}
              </button>
              <button class="btn ghost" onclick={() => onGoTab('history', 'fixed')}>
                {t('today.adjustExpensePlan')}
              </button>
              <button class="btn ghost" onclick={() => onGoTab('accounts')}>
                {t('today.transferFunds')}
              </button>
            </div>
            {#if simulate}
              <div class="list mt-2-5">
                <div class="kv">
                  <span class="k">{t('today.simulateUseReserve')}</span>
                  <span>{money(coverAmount, privacy)}</span>
                </div>
                <div class="kv">
                  <span class="k">{t('today.simulateRemaining')}</span>
                  <span class={remainingShortfall > 0 ? 'text-neg' : 'text-pos'}>
                    {money(remainingShortfall, privacy)}
                  </span>
                </div>
                <div class="kv">
                  <span class="k">{t('today.runwayImpact')}</span>
                  <span class="text-warn">
                    {runwayLossMonths == null
                      ? t('today.runwayNotConfigured')
                      : t('today.runwayLoss', { months: runwayLossMonths.toFixed(1) })}
                  </span>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        {#if timelineBills.length > 0}
          {@const topBills = timelineBills.slice(0, 6)}
          {@const billsTotal = timelineBills.reduce((s, e) => s + Math.abs(e.expectedAmount), 0)}
          <div class="card">
            <div class="today-card-head">
              <h3>{t('today.billsTitle')}</h3>
              <span class="text-secondary text-sm">
                {t('today.billsTotal', { amount: money(billsTotal, privacy) })}
              </span>
            </div>
            <div class="bill-list">
              {#each topBills as occ (occ.id)}
                {@const status = occurrenceDisplayStatus(occ)}
                {@const portal =
                  occ.sourceType === 'card_bill' ? resolveCardPortalFromBillLabel(occ.label) : null}
                <div class="bill-row has-occ-status{portal ? ' has-portal' : ''}">
                  <span class="bill-date">{dayLabel(occ.date)}</span>
                  <span class="occ-status-pill {displayStatusClass(status)}">
                    {displayStatusLabel(status)}
                  </span>
                  <span class="bill-name">
                    <InstitutionLogo billLabel={occ.label} size="sm" />
                    <span class="bill-name-text">
                      {occ.label}
                      {#if portal}
                        <span class="bill-portal">
                          <CardPortalLink {portal} compact showLogo={false} />
                        </span>
                      {/if}
                      {#if status === 'matched_warn' && occ.varianceAmount != null}
                        <small class="occ-variance">
                          Δ {signedMoney(occ.varianceAmount, privacy)}
                        </small>
                      {/if}
                    </span>
                  </span>
                  <span class="bill-amt text-neg">{signedMoney(occ.expectedAmount, privacy)}</span>
                </div>
              {/each}
            </div>
          </div>
        {:else if timelineBills.length === 0 && monthOccurrences.length > 0}
          <div class="card">
            <div class="today-card-head">
              <h3>{t('today.billsTitle')}</h3>
            </div>
            <p class="muted-note">{t('today.billsEmpty')}</p>
          </div>
        {:else if fallbackBills.length === 0}
          <div class="card">
            <div class="today-card-head">
              <h3>{t('today.billsTitle')}</h3>
            </div>
            <p class="muted-note">{t('today.billsEmptyMonth')}</p>
          </div>
        {:else}
          {@const top = fallbackBills.slice(0, 5)}
          {@const rest = fallbackBills.length - top.length}
          {@const total = fallbackBills.reduce((s, e) => s + Math.abs(e.amount), 0)}
          {@const largest = Math.max(...fallbackBills.map((e) => Math.abs(e.amount)))}
          <div class="card">
            <div class="today-card-head">
              <h3>{t('today.billsTitle')}</h3>
              <span class="text-secondary text-sm">
                {t('today.billsTotal', { amount: money(total, privacy) })}
              </span>
            </div>
            <div class="bill-list">
              {#each top as e, i (i)}
                {@const isMajor = Math.abs(e.amount) >= largest * 0.5}
                {@const portal = e.kind === 'card' ? resolveCardPortalFromBillLabel(e.label) : null}
                <div class="bill-row{isMajor ? ' major' : ''}{portal ? ' has-portal' : ''}">
                  <span class="bill-date">{dayLabel(e.date)}</span>
                  <span class="tag outline">{billTag(e.kind)}</span>
                  <span class="bill-name">
                    <InstitutionLogo billLabel={e.label} size="sm" />
                    <span class="bill-name-text">
                      {e.label}
                      {#if portal}
                        <span class="bill-portal">
                          <CardPortalLink {portal} compact showLogo={false} />
                        </span>
                      {/if}
                    </span>
                  </span>
                  <span class="bill-amt text-neg">{signedMoney(e.amount, privacy)}</span>
                </div>
              {/each}
            </div>
            {#if rest > 0}
              <p class="muted-note mt-2">{t('today.billsMore', { count: rest })}</p>
            {/if}
          </div>
        {/if}

        <div class="card today-actions-card">
          <div class="today-card-head">
            <h3>{t('today.worthDoing')}</h3>
            <div class="today-card-actions">
              <button class="icon-btn" onclick={() => (showAllActions = !showAllActions)}>
                {showAllActions ? t('today.showKeyOnly') : t('today.showAll')}
              </button>
              <button class="icon-btn" onclick={() => onGoTab('accounts')}>
                {t('today.manageAccounts')}
              </button>
            </div>
          </div>
          <div class="list">
            {#each primaryActions as a (a.id)}
              <div class="item">
                <span class="dot {a.severity}"></span>
                <div class="grow">
                  <div class="name">{a.title}</div>
                  <div class="meta">{a.detail}</div>
                </div>
                <span class="item-status {SEV_CLASS[a.severity]}">
                  {a.severity === 'ok'
                    ? '✓'
                    : a.severity === 'critical'
                      ? t('today.priorityHigh')
                      : a.severity === 'warning'
                        ? t('today.priorityMedium')
                        : t('today.priorityLow')}
                </span>
              </div>
            {/each}
            {#if !showAllActions && actions.length > primaryActions.length}
              <p class="muted-note">
                {t('today.moreActionsHint', { count: actions.length - primaryActions.length })}
              </p>
            {/if}
          </div>
        </div>

        <div class="card today-tools">
          <h3>{t('today.moreTools')}</h3>
          <div class="today-quick-actions">
            <button class="btn ghost" onclick={onOpenSpend}>{t('today.spendImpact')}</button>
            <button
              class="btn ghost today-quick-toggle"
              onclick={() => (showMoreQuickActions = !showMoreQuickActions)}
            >
              {showMoreQuickActions
                ? t('today.collapseQuickActions')
                : t('today.expandQuickActions')}
            </button>
            <div class="today-quick-more{showMoreQuickActions ? ' open' : ''}">
              <button class="btn ghost" onclick={() => onGoTab('history', 'oneoff')}>
                {t('today.manageFutureCashflows')}
              </button>
              <button class="btn ghost" onclick={() => onGoTab('home', 'overview')}>
                {t('today.viewOverview')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
