<script>
  // Port of src/components/stocks/InvestmentAdvisor.tsx.
  import { RefreshCw, Sparkles } from '@lucide/svelte'
  import { t, locale } from '$lib/i18n.svelte.js'
  import { buildAdvice, computeSignal } from '../../../engine/advisor'
  import { fetchDailyHistories } from '$lib/priceHistory'
  import { fetchNewsForSymbols, newsSearchUrl } from '$lib/marketNews'
  import { sanitizePortfolioAllocationTarget } from '$lib/portfolioAllocationPrefs'
  import { buildAdvisorBriefPrompt } from '$lib/aiBrief'
  import {
    ensureAiText,
    getCachedAiText,
    isAiDisabled,
    parseAdvisorBriefData,
  } from '$lib/aiClient'
  import { money, isoToCalendarLabel, redactMoneyText } from '$lib/format.js'

  /** @typedef {import('../../types.js').FinanceData} FinanceData */
  /** @typedef {import('../../engine/holdingsPortfolio.js').PositionRowView} PositionRowView */
  /** @typedef {import('../../engine/metrics.js').MonthlySavingCapacity} MonthlySavingCapacity */
  /** @typedef {import('../../engine/advisor.js').TechnicalSignal} TechnicalSignal */
  /** @typedef {import('$lib/aiClient').AiText} AiText */
  /** @typedef {import('$lib/marketNews').NewsItem} NewsItem */

  /** @type {{
   *   data: FinanceData,
   *   rows: PositionRowView[],
   *   totalValue: number,
   *   savingCapacity?: MonthlySavingCapacity,
   *   tabActive: boolean,
   * }} */
  let { data, rows, totalValue, savingCapacity, tabActive } = $props()

  const privacy = $derived(data.privacy)
  const symbols = $derived(rows.map((r) => r.position.ticker.toUpperCase()))
  const topSymbols = $derived(
    rows
      .slice()
      .sort((a, b) => b.weightPct - a.weightPct)
      .slice(0, 5)
      .map((r) => r.position.ticker.toUpperCase()),
  )

  let signals = $state(/** @type {Record<string, TechnicalSignal>} */ ({}))
  let signalsReady = $state(false)
  let news = $state(/** @type {NewsItem[]} */ ([]))
  let newsReady = $state(false)
  let newsRefreshing = $state(false)
  const startedForRef = { current: /** @type {string | null} */ (null) }

  let aiBrief = $state(/** @type {AiText | null} */ (getCachedAiText('advisor')))
  let aiRefreshing = $state(false)
  let aiFailed = $state(false)
  let aiHidden = $state(isAiDisabled())
  let isAiExpanded = $state(false)
  const aiStartedForRef = { current: /** @type {string | null} */ (null) }
  let adviceCardRef = $state(/** @type {HTMLDivElement | null} */ (null))

  $effect(() => {
    if (!tabActive || symbols.length === 0) return
    const key = symbols.join(',')
    if (startedForRef.current === key) return
    startedForRef.current = key
    let cancelled = false
    void fetchDailyHistories(symbols).then((histories) => {
      if (cancelled) return
      /** @type {Record<string, TechnicalSignal>} */
      const next = {}
      for (const [symbol, candles] of Object.entries(histories)) {
        const sig = computeSignal(symbol, candles)
        if (sig) next[symbol] = sig
      }
      signals = next
      signalsReady = true
    })
    void fetchNewsForSymbols(topSymbols).then((items) => {
      if (cancelled) return
      news = items
      newsReady = true
    })
    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    void locale()
    aiBrief = null
    aiFailed = false
    aiStartedForRef.current = null
  })

  const signalsLoading = $derived(symbols.length > 0 && !signalsReady)
  const newsLoading = $derived((topSymbols.length > 0 && !newsReady) || newsRefreshing)

  function refreshNews() {
    newsRefreshing = true
    try {
      for (const s of topSymbols) localStorage.removeItem(`finance_os_market_news_v1:${s}`)
    } catch {
      /* ignore */
    }
    void fetchNewsForSymbols(topSymbols).then((items) => {
      news = items
      newsReady = true
      newsRefreshing = false
    })
  }

  const target = $derived.by(() => {
    const tgt = sanitizePortfolioAllocationTarget(data.portfolioAllocationTarget)
    return Object.values(tgt).some((v) => v != null) ? tgt : null
  })

  const monthlyInvestable = $derived(
    Math.max(0, (savingCapacity?.capacity ?? 0) * (data.assumptions.investRatio ?? 0.5)),
  )

  const output = $derived(
    buildAdvice({
      holdings: rows.map((r) => ({
        ticker: r.position.ticker.toUpperCase(),
        weightPct: r.weightPct,
        value: r.liveValue,
        assetType: r.position.assetType,
        totalReturnAmount: r.position.totalReturnAmount,
      })),
      totalValue,
      target,
      signals,
      monthlyInvestable,
      bestDay: savingCapacity?.bestDay ?? null,
    }),
  )

  const sortedSignals = $derived(
    rows
      .slice()
      .sort((a, b) => b.weightPct - a.weightPct)
      .map((r) => ({ row: r, sig: signals[r.position.ticker.toUpperCase()] }))
      .filter((x) => x.sig),
  )

  function localToday() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  /** @param {unknown} raw */
  function normalizeConfidence(raw) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
    const pct = raw > 0 && raw <= 1 ? raw * 100 : raw
    return Math.min(100, Math.max(0, Math.round(pct)))
  }

  /** @param {number} ts */
  function timeAgo(ts) {
    if (!ts) return ''
    const mins = Math.round((Date.now() - ts) / 60000)
    if (mins < 60) return t('stocks.advisor.timeAgo.minutes', { count: Math.max(mins, 1) })
    const hours = Math.round(mins / 60)
    if (hours < 24) return t('stocks.advisor.timeAgo.hours', { count: hours })
    return t('stocks.advisor.timeAgo.days', { count: Math.round(hours / 24) })
  }

  /** @param {AiText | null} brief */
  function isBriefStale(brief) {
    return brief != null && Date.now() - brief.generatedAt > 24 * 60 * 60 * 1000
  }

  /** @param {string} signal */
  function signalChipClass(signal) {
    if (signal.includes(t('stocks.advisor.ai.signalNegative'))) return 'negative'
    if (
      signal.includes(t('stocks.advisor.ai.signalCautious')) ||
      signal.includes(t('stocks.advisor.ai.signalStrong'))
    ) {
      return 'warn'
    }
    if (signal.includes(t('stocks.advisor.ai.signalPositive'))) return 'positive'
    return 'neutral'
  }

  /** @param {boolean} force */
  function runAiBrief(force) {
    if (privacy) return
    const prompt = buildAdvisorBriefPrompt(
      {
        date: localToday(),
        planAmount: output.plan.amount,
        planCorePct: output.plan.corePct,
        bestDay: savingCapacity?.bestDay ?? null,
        holdings: rows
          .slice()
          .sort((a, b) => b.weightPct - a.weightPct)
          .slice(0, 8)
          .map((r) => {
            const sig = signals[r.position.ticker.toUpperCase()]
            return {
              ticker: r.position.ticker.toUpperCase(),
              weightPct: r.weightPct,
              zone: sig?.zone,
              trend: sig?.trend,
              rsi: sig?.rsi14,
            }
          }),
        advices: output.advices.map((a) => ({
          action: t(`stocks.advisor.action.${a.action}`),
          title: a.title,
        })),
        newsTitles: news.slice(0, 8).map((n) => ({ symbol: n.symbol, title: n.title })),
      },
      locale(),
    )
    aiRefreshing = true
    void ensureAiText({ kind: 'advisor', ...prompt, force }).then((result) => {
      aiRefreshing = false
      if (isAiDisabled()) {
        aiHidden = true
        return
      }
      if (result) {
        aiBrief = result
        aiFailed = false
      } else {
        aiFailed = true
      }
    })
  }

  const aiReady = $derived(signalsReady && newsReady)
  const aiKey = $derived(symbols.join(','))

  $effect(() => {
    if (privacy) return
    if (aiHidden || !aiReady || aiStartedForRef.current === aiKey) return
    aiStartedForRef.current = aiKey
    const timer = setTimeout(() => runAiBrief(false), 1500)
    return () => clearTimeout(timer)
  })

  const briefData = $derived(aiBrief ? parseAdvisorBriefData(aiBrief.text) : null)
  const confidence = $derived(normalizeConfidence(briefData?.confidenceScore))
  const isStale = $derived(isBriefStale(aiBrief))
  const mechanismBodyLines = $derived(t('stocks.advisor.ai.mechanismBody').split('\n'))
  const aiFooterLines = $derived(t('stocks.advisor.ai.footer').split('\n'))
</script>

{#if rows.length === 0}{:else}
  <section class="grid gap-3">
    <h2 class="portfolio-layer-title">{t('stocks.advisor.layerTitle')}</h2>

    <div class="card advisor-plan">
      <div class="card-head">
        <h3>{t('stocks.advisor.plan.title')}</h3>
        {#if savingCapacity?.bestDay}
          <span class="tag">
            {t('stocks.advisor.plan.bestBuyDay', {
              date: isoToCalendarLabel(savingCapacity.bestDay),
            })}
          </span>
        {/if}
      </div>
      <div class="advisor-plan-row">
        <div class="advisor-plan-amount">
          <span class="label">{t('stocks.advisor.plan.monthlyInvestable')}</span>
          <span class="value">{money(output.plan.amount, privacy)}</span>
        </div>
        <div class="advisor-plan-split">
          <span class="label">{t('stocks.advisor.plan.suggestedSplit')}</span>
          <span class="value">
            {t('stocks.advisor.plan.splitTemplate', {
              corePct: output.plan.corePct,
              flexPct: 100 - output.plan.corePct,
            })}
          </span>
        </div>
      </div>
      {#each output.plan.notes as n, i (i)}
        <p class="muted-note {i === 0 ? 'mt-2' : 'mt-1'}">{n}</p>
      {/each}
    </div>

    {#if !privacy && !aiHidden && (aiBrief || aiRefreshing || aiFailed)}
      <div class="card ai-signal-brief">
        <div class="ai-header">
          <div class="ai-header-left">
            <div class="ai-icon-container">
              <Sparkles size={14} aria-hidden="true" />
            </div>
            <span class="ai-title">{t('stocks.advisor.ai.title')}</span>
            <div class="ai-meta">
              {#if aiBrief}
                <span>
                  {t('stocks.advisor.ai.updatedAgo', { time: timeAgo(aiBrief.generatedAt) })}
                </span>
              {/if}
              {#if confidence != null}
                <span class="ai-confidence">
                  {t('stocks.advisor.ai.confidence', { pct: confidence })}
                </span>
              {/if}
              {#if isStale}
                <span class="ai-confidence is-stale">{t('stocks.advisor.ai.stale')}</span>
              {/if}
            </div>
          </div>
          <div class="ai-header-actions">
            <button
              class="ai-btn-icon"
              onclick={() => (isAiExpanded = !isAiExpanded)}
              aria-label={t('stocks.advisor.ai.explainAria')}
              title={t('stocks.advisor.ai.explainTitle')}
            >
              {t('stocks.advisor.ai.explain')}
            </button>
            <button
              class="ai-btn-icon"
              onclick={() => runAiBrief(true)}
              disabled={aiRefreshing}
              aria-label={t('stocks.advisor.ai.refreshAria')}
              title={t('stocks.advisor.ai.refreshTitle')}
            >
              <RefreshCw size={13} class={aiRefreshing ? 'life-os-spin' : undefined} />
            </button>
          </div>
        </div>

        {#if isAiExpanded}
          <div class="ai-explain">
            <span class="ai-hero-eyebrow">{t('stocks.advisor.ai.mechanismEyebrow')}</span>
            <span class="ai-explain-body">
              {#each mechanismBodyLines as line, i (i)}
                {line}{#if i < mechanismBodyLines.length - 1}<br />{/if}
              {/each}
            </span>
          </div>
        {/if}

        {#if !briefData && aiRefreshing}
          <div class="ai-signals">
            <div class="skeleton ai-signal-row ai-loading-row"></div>
            <div class="skeleton ai-signal-row ai-loading-row"></div>
            <div class="skeleton ai-signal-row ai-loading-row"></div>
          </div>
        {:else if briefData}
          {#if briefData.heroConclusion}
            <div class="ai-hero">
              <span class="ai-hero-eyebrow">{t('stocks.advisor.ai.todayJudgment')}</span>
              <span class="ai-hero-title">{briefData.heroConclusion.title}</span>
              <span class="ai-hero-reason">{briefData.heroConclusion.reason}</span>
            </div>
          {/if}

          {#if briefData.signals && briefData.signals.length > 0}
            <div class="ai-signals">
              {#each briefData.signals as sig, i (i)}
                {@const color = signalChipClass(sig.signal)}
                <div class="ai-signal-row">
                  <span class="ai-ticker">{sig.ticker}</span>
                  <div>
                    <span class="ai-signal-chip {color}">{sig.signal}</span>
                  </div>
                  <span class="ai-signal-reason">{sig.reason}</span>
                  <span class="ai-signal-action">{sig.action}</span>
                </div>
              {/each}
            </div>
          {/if}

          {#if briefData.suggestedActions && briefData.suggestedActions.length > 0}
            <div class="ai-actions">
              {#each briefData.suggestedActions as action, i (i)}
                <div class="ai-action-item">
                  <strong>[{action.type}]</strong>
                  {action.text}
                </div>
              {/each}
              <div class="ai-buttons">
                {#if output.advices.length > 0}
                  <button
                    class="btn outline compact"
                    onclick={() =>
                      adviceCardRef?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    {t('stocks.advisor.ai.viewAdjustments')}
                  </button>
                {/if}
                <button class="btn ghost compact" onclick={() => (isAiExpanded = !isAiExpanded)}>
                  {isAiExpanded
                    ? t('stocks.advisor.ai.collapseExplain')
                    : t('stocks.advisor.ai.expandExplain')}
                </button>
              </div>
            </div>
          {/if}
        {:else}
          <div class="ai-hero">
            <span class="ai-hero-reason text-muted">{t('stocks.advisor.ai.fallback')}</span>
          </div>
        {/if}

        <div class="ai-footer">
          {#each aiFooterLines as line, i (i)}
            {line}{#if i < aiFooterLines.length - 1}<br />{/if}
          {/each}
        </div>
      </div>
    {/if}

    {#if output.advices.length > 0}
      <div class="card" bind:this={adviceCardRef}>
        <h3 class="mb-2-5">{t('stocks.advisor.adjustments.title')}</h3>
        <div class="advisor-advice-list">
          {#each output.advices as a, i (i)}
            <div class="advisor-advice advisor-{a.action}">
              <div class="advisor-advice-head">
                <span class="tag advisor-tag-{a.action}">
                  {t(`stocks.advisor.action.${a.action}`)}
                </span>
                <span class="advisor-advice-title">{a.title}</span>
              </div>
              <p class="advisor-advice-detail">{redactMoneyText(a.detail, privacy)}</p>
              <p class="advisor-advice-timing">
                <strong>{t('stocks.advisor.adjustments.timing')}</strong>{a.timing}
              </p>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <details class="card stocks-secondary-tools">
      <summary>
        {t('stocks.advisor.signals.title')}
        <span class="tag inline-meta">
          {signalsLoading
            ? t('stocks.advisor.signals.computing')
            : t('stocks.advisor.signals.reference')}
        </span>
      </summary>
      {#if sortedSignals.length === 0 && !signalsLoading}
        <p class="muted-note">{t('stocks.advisor.signals.unavailable')}</p>
      {:else}
        <div class="advisor-signal-list">
          {#each sortedSignals as { row, sig } (row.position.id)}
            <div class="advisor-signal">
              <div class="advisor-signal-main">
                <span class="advisor-signal-ticker">{row.position.ticker}</span>
                <span class="tag advisor-zone-{sig.zone}">{t(`stocks.advisor.zone.${sig.zone}`)}</span>
                <span class="advisor-trend advisor-trend-{sig.trend}">
                  {t(`stocks.advisor.trend.${sig.trend}`)}
                </span>
              </div>
              <div class="advisor-signal-metrics">
                {#if sig.rsi14 != null}
                  <span>{t('stocks.advisor.signals.rsi', { value: sig.rsi14.toFixed(0) })}</span>
                {/if}
                {#if sig.drawdownPct != null}
                  <span>
                    {t('stocks.advisor.signals.drawdownFromHigh', {
                      pct: (sig.drawdownPct * 100).toFixed(0),
                    })}
                  </span>
                {/if}
                <span class="text-muted">{sig.reasons[0] ?? t('stocks.advisor.signals.noSignal')}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      <p class="muted-note mt-2-5">{t('stocks.advisor.signals.footnote')}</p>
    </details>

    <details class="card stocks-secondary-tools">
      <summary>
        {t('stocks.advisor.news.title')}
        <span class="tag inline-meta">
          {news.length > 0
            ? t('stocks.advisor.news.count', { count: news.length })
            : t('stocks.advisor.news.reference')}
        </span>
      </summary>
      <div class="stocks-refresh-actions mt-2">
        <button
          class="icon-btn"
          onclick={refreshNews}
          disabled={newsLoading}
          aria-label={t('stocks.advisor.news.refreshAria')}
        >
          <RefreshCw size={14} strokeWidth={2} />
          {newsLoading ? t('stocks.advisor.news.refreshing') : t('stocks.advisor.news.refresh')}
        </button>
      </div>
      {#if news.length === 0}
        <div>
          <p class="muted-note mb-2">
            {newsLoading ? t('stocks.advisor.news.loading') : t('stocks.advisor.news.unavailable')}
          </p>
          {#if !newsLoading}
            <div class="advisor-news-fallback">
              {#each topSymbols as s (s)}
                <a class="tag" href={newsSearchUrl(s)} target="_blank" rel="noreferrer">
                  {t('stocks.advisor.news.searchLink', { symbol: s })}
                </a>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <div class="advisor-news-list">
          {#each news.slice(0, 10) as n (n.link)}
            <a class="advisor-news-item" href={n.link} target="_blank" rel="noreferrer">
              <span class="advisor-news-symbol tag">{n.symbol}</span>
              <span class="advisor-news-title">{n.title}</span>
              <span class="advisor-news-meta text-muted">
                {[n.source, timeAgo(n.publishedTs)].filter(Boolean).join(' · ')}
              </span>
            </a>
          {/each}
        </div>
      {/if}
    </details>

    <p class="muted-note">{t('stocks.advisor.disclaimer')}</p>
  </section>
{/if}
