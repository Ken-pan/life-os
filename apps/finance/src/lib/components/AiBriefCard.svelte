<script>
  import { quoteSafeToSpend } from '@life-os/finance-core/copy/terminology'
  import { t, locale } from '$lib/i18n.svelte.js'
  import { RefreshCw, Sparkles } from '@lucide/svelte'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import { getTimelineStore } from '$lib/timeline.svelte.js'
  import { spendingOf } from '$lib/engine/transactions'
  import { budgetProgress, discretionaryMonthlyBudget } from '$lib/engine/budget'
  import { buildTodayBriefPrompt } from '$lib/aiBrief'
  import {
    ensureAiText,
    getCachedAiText,
    isAiDisabled,
    parseBriefSections,
  } from '$lib/aiClient'

  /** @typedef {import('../../types.js').FinanceData} FinanceData */
  /** @typedef {import('$lib/dashboard.js').Dashboard} Dashboard */

  /** @type {{ data: FinanceData, dashboard: Dashboard }} */
  let { data, dashboard } = $props()

  const txnsStore = getTransactionsStore()
  const timeline = getTimelineStore()

  const SECTION_KEYS = [
    { key: 'risk', labelKey: 'aiBrief.sectionRisk' },
    { key: 'suggest', labelKey: 'aiBrief.sectionSuggest' },
    { key: 'anomaly', labelKey: 'aiBrief.sectionAnomaly' },
  ]

  function localToday() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const today = localToday()

  /** @param {number} ts */
  function generatedAgo(ts) {
    const mins = Math.round((Date.now() - ts) / 60000)
    if (mins < 2) return t('aiBrief.justNow')
    if (mins < 60) return t('aiBrief.minutesAgo', { mins })
    const hours = Math.round(mins / 60)
    if (hours < 24) return t('aiBrief.hoursAgo', { hours })
    return t('aiBrief.daysAgo', { days: Math.round(hours / 24) })
  }

  const facts = $derived.by(() => {
    // 可变月预算(与脉搏卡/记录页日预算同分母),AI 简报的进度判断才与页面显示一致。
    const budget = discretionaryMonthlyBudget(data.cashFlows).monthly
    const progress = budgetProgress(txnsStore.txns, budget, today)

    const horizon = new Date(`${today}T00:00:00`)
    horizon.setDate(horizon.getDate() + 14)
    const horizonTs = horizon.getTime()
    const upcomingBills = dashboard.outlook.events
      .filter((e) => e.amount < 0 && e.ts <= horizonTs && e.affectsBalance !== false)
      .slice(0, 6)
      .map((e) => ({ date: e.date, label: e.label, amount: e.amount }))

    const month = today.slice(0, 7)
    const byCat = new Map()
    for (const txn of txnsStore.txns) {
      if (txn.month !== month || txn.date > today) continue
      const s = spendingOf(txn)
      if (s <= 0) continue
      byCat.set(txn.category, (byCat.get(txn.category) ?? 0) + s)
    }
    const topCategories = [...byCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, amount]) => ({ category, amount }))

    return {
      date: today,
      safeToSpend: dashboard.derived.safeToSpend,
      savingCapacity: dashboard.derived.savingCapacity.capacity,
      savingBestDay: dashboard.derived.savingCapacity.bestDay,
      budget: {
        budget: progress.budget,
        spent: progress.spent,
        todaySpend: progress.todaySpend,
        dailyAllowance: progress.dailyAllowance,
        daysLeft: progress.daysLeft,
        pace: progress.pace,
      },
      upcomingBills,
      pendingCount: timeline.actionable.length,
      topCategories,
    }
  })

  /** @type {import('$lib/aiClient').AiText | null} */
  let brief = $state(getCachedAiText('today'))
  let refreshing = $state(false)
  let failed = $state(false)
  let hidden = $state(isAiDisabled())

  /** @param {boolean} force */
  function runGenerate(force) {
    if (data.privacy) return
    const prompt = buildTodayBriefPrompt(facts, locale())
    refreshing = true
    void ensureAiText({ kind: 'today', ...prompt, force }).then((result) => {
      refreshing = false
      if (isAiDisabled()) {
        hidden = true
        return
      }
      if (result) {
        brief = result
        failed = false
      } else {
        failed = true
      }
    })
  }

  $effect(() => {
    locale()
    brief = null
    failed = false
  })

  $effect(() => {
    if (data.privacy || hidden) return
    const timer = setTimeout(() => runGenerate(false), 3000)
    return () => clearTimeout(timer)
  })

  const sections = $derived(brief ? parseBriefSections(brief.text) : null)
  const visibleSections = $derived(
    sections ? SECTION_KEYS.filter(({ key }) => sections[key]?.trim()) : [],
  )
</script>

{#if !data.privacy && !hidden && (brief || refreshing || failed)}
  <div class="card ai-brief">
    <div class="card-head">
      <h3 class="ai-brief-title">
        <Sparkles size={15} aria-hidden="true" />
        {t('aiBrief.title')}
      </h3>
      <div class="ai-brief-meta">
        {#if brief}
          <span class="text-muted">{generatedAgo(brief.generatedAt)}</span>
        {/if}
        <button
          class="icon-btn ai-brief-refresh"
          onclick={() => runGenerate(true)}
          disabled={refreshing}
          aria-label={refreshing ? t('aiBrief.generating') : t('aiBrief.regenerate')}
          title={refreshing ? t('aiBrief.generating') : t('aiBrief.refresh')}
        >
          <RefreshCw size={14} class={refreshing ? 'life-os-spin' : undefined} />
        </button>
      </div>
    </div>

    {#if visibleSections.length > 0}
      <div class="ai-brief-sections">
        {#each visibleSections as { key, labelKey } (key)}
          <div class="ai-brief-section">
            <span class="ai-brief-section-label">{t(labelKey)}</span>
            <p class="ai-brief-section-body">{sections[key]}</p>
          </div>
        {/each}
      </div>
    {:else if refreshing}
      <div class="ai-brief-skeleton" aria-hidden="true">
        <span class="skeleton skeleton--text"></span>
        <span class="skeleton skeleton--text"></span>
        <span class="skeleton skeleton--text"></span>
      </div>
    {:else}
      <p class="muted-note">{t('aiBrief.failed')}</p>
    {/if}

    <p class="ai-brief-foot text-muted">
      {t('aiBrief.footnote', { safeToSpend: quoteSafeToSpend() })}
    </p>
  </div>
{/if}
