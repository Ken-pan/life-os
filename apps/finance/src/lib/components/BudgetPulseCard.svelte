<script>
  // Port of src/components/BudgetPulseCard.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import { budgetProgress, dailySpendSeries, discretionaryMonthlyBudget } from '../../engine/budget.js'
  import { money } from '$lib/format.js'

  /** @type {{ data: import('../../types.js').FinanceData, onQuickAdd?: () => void, compact?: boolean }} */
  let { data, onQuickAdd, compact = false } = $props()

  const txStore = getTransactionsStore()
  const privacy = $derived(data.privacy)
  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  let showWeekChart = $state(!compact)

  // 可变月预算(剔除房租/401k 等不走日常流水的固定项)——与记录页日预算同分母。
  // 之前用全量计划($4,700 含房租):房租从不出现在流水里,进度条永远「低于进度」。
  const budget = $derived(discretionaryMonthlyBudget(data.cashFlows).monthly)
  const progress = $derived(budgetProgress(txStore.txns, budget, today))
  const days = $derived(dailySpendSeries(txStore.txns, today, 7))
  const maxDay = $derived(Math.max(1, ...days.map((d) => Math.abs(d.amount))))

  const paceLabel = $derived(
    progress.pace === 'under'
      ? t('budget.paceUnder')
      : progress.pace === 'on'
        ? t('budget.paceOn')
        : t('budget.paceOver'),
  )
  const paceCls = $derived(
    progress.pace === 'under'
      ? 'budget-pace-under'
      : progress.pace === 'on'
        ? 'budget-pace-on'
        : 'budget-pace-over',
  )
  const pctWidth = $derived(Math.min(100, Math.max(0, progress.spentRatio * 100)))
</script>

<div class="card budget-pulse">
  <div class="card-head">
    <h3>{t('budget.title')}</h3>
    {#if onQuickAdd}
      <button type="button" class="icon-btn primary budget-pulse-log-btn" onclick={onQuickAdd}>
        {t('budget.logTxn')}
      </button>
    {/if}
  </div>

  <div class="budget-pulse-top">
    <div class="budget-pulse-spent">
      <span class="label">{t('budget.spentMonth')}</span>
      <span class="value records-metric">{money(progress.spent, privacy)}</span>
      {#if budget > 0}
        <span class="sub">
          {t('budget.budgetLine', { amount: money(budget, privacy), pace: paceLabel })}
        </span>
      {/if}
    </div>
    <div class="budget-pulse-today">
      <span class="label">{t('budget.todaySpent')}</span>
      <span class="value records-metric">{money(progress.todaySpend, privacy)}</span>
      {#if budget > 0 && progress.daysLeft > 0}
        <span class="sub">
          {t('budget.daysLeftDaily', {
            days: progress.daysLeft,
            amount: money(progress.dailyAllowance, privacy),
          })}
        </span>
      {/if}
    </div>
  </div>

  {#if budget > 0}
    <div
      class="budget-pulse-bar"
      role="progressbar"
      aria-valuenow={Math.round(progress.spentRatio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div class="budget-pulse-fill {paceCls}" style:width="{pctWidth}%"></div>
      <div
        class="budget-pulse-timeline"
        style:left="{Math.min(100, progress.timeRatio * 100)}%"
        title={t('budget.timeProgressTitle', { pct: (progress.timeRatio * 100).toFixed(0) })}
      ></div>
    </div>
  {:else}
    <p class="muted-note mt-1">{t('budget.emptyHint')}</p>
  {/if}

  {#if showWeekChart}
    <div class="budget-pulse-days" aria-label={t('budget.last7DaysAria')}>
      {#each days as d (d.date)}
        {@const h = Math.max(3, (Math.abs(d.amount) / maxDay) * 40)}
        {@const isToday = d.date === today}
        <div class="budget-pulse-day">
          <span class="budget-pulse-day-amt">{d.amount !== 0 ? money(d.amount, privacy) : ''}</span>
          <div
            class="budget-pulse-day-bar{isToday ? ' today' : ''}{d.amount < 0 ? ' refund' : ''}"
            style:height="{h}px"
          ></div>
          <span class="budget-pulse-day-label">{isToday ? t('budget.today') : d.date.slice(8)}</span>
        </div>
      {/each}
    </div>
    {#if compact}
      <button type="button" class="btn ghost budget-pulse-week-toggle" onclick={() => (showWeekChart = false)}>
        {t('budget.hideLast7Days')}
      </button>
    {/if}
  {:else if compact}
    <button type="button" class="btn ghost budget-pulse-week-toggle" onclick={() => (showWeekChart = true)}>
      {t('budget.showLast7Days')}
    </button>
  {/if}
</div>
