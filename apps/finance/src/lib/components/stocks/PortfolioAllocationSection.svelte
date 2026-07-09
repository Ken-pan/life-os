<script>
  // Port of src/components/stocks/PortfolioAllocationSection.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { redactMoneyText } from '$lib/format.js'
  import { sanitizePortfolioAllocationTarget } from '$lib/portfolioAllocationPrefs'
  import {
    ADVANCED_REFERENCE_MODELS,
    buildBlendedAssetBreakdown,
    buildTargetFromReferenceModel,
    buildPortfolioConfidence,
    buildPortfolioStickySummary,
    buildRebalanceSuggestions,
    classifyPortfolio,
    compareToReferenceModel,
    computeAllocationDrift,
    CORE_REFERENCE_MODELS,
    refModelMaintenanceTier,
    refModelText,
    refModelVolatilityTier,
  } from '../../../engine/portfolioAllocation'
  import AllocationTrendChart from './AllocationTrendChart.svelte'
  import PortfolioStickyBar from './PortfolioStickyBar.svelte'

  /** @typedef {import('../../types.js').FinanceData} FinanceData */
  /** @typedef {import('../../types.js').HoldingsSnapshot} HoldingsSnapshot */
  /** @typedef {import('../../types.js').PortfolioAllocationTarget} PortfolioAllocationTarget */
  /** @typedef {import('../../engine/holdingsPortfolio.js').AllocationMetrics} AllocationMetrics */
  /** @typedef {import('../../engine/holdingsPortfolio.js').AllocationTrendPoint} AllocationTrendPoint */
  /** @typedef {import('../../engine/portfolioAllocation.js').ThemeConcentration} ThemeConcentration */
  /** @typedef {import('../../engine/portfolioAllocation.js').ReferenceModel} ReferenceModel */

  /** @type {{
   *   data: FinanceData,
   *   allocation: AllocationMetrics,
   *   activeSnapshot: HoldingsSnapshot | null,
   *   taxableSecurities: number,
   *   onGoSettings?: () => void,
   *   kpiSlot?: import('svelte').Snippet,
   *   trend?: AllocationTrendPoint[],
   *   themes?: ThemeConcentration,
   * }} */
  let {
    data,
    allocation,
    activeSnapshot,
    taxableSecurities,
    onGoSettings,
    kpiSlot,
    trend,
    themes,
  } = $props()

  const store = getFinanceStore()

  let selectedModelId = $state('core-satellite')
  let showAllModels = $state(false)
  let showCompareTable = $state(false)
  let editorOpen = $state(false)
  let targetCardRef = $state(/** @type {HTMLDivElement | null} */ (null))

  const target = $derived(
    sanitizePortfolioAllocationTarget(store.data.portfolioAllocationTarget),
  )
  const blended = $derived(buildBlendedAssetBreakdown(taxableSecurities, data.accounts))
  const classification = $derived(classifyPortfolio(allocation))
  const driftRows = $derived(computeAllocationDrift(allocation, target))
  const confidence = $derived(
    buildPortfolioConfidence(data.accounts, data.holdingsSnapshots, activeSnapshot),
  )
  const allModels = $derived([...CORE_REFERENCE_MODELS, ...ADVANCED_REFERENCE_MODELS])
  const selectedModel = $derived(
    allModels.find((m) => m.id === selectedModelId) ?? CORE_REFERENCE_MODELS[0],
  )
  const modelCompare = $derived(compareToReferenceModel(allocation, selectedModel))
  const selectableModels = $derived(allModels.filter((m) => m.id !== 'custom'))
  const visibleModels = $derived.by(() => {
    if (showAllModels) return selectableModels
    const defaults = selectableModels.slice(0, 3)
    if (defaults.some((m) => m.id === selectedModelId)) return defaults
    const selected = selectableModels.find((m) => m.id === selectedModelId)
    return selected ? [...defaults, selected] : defaults
  })
  const hiddenModelCount = $derived(selectableModels.length - visibleModels.length)
  const rebalance = $derived(
    buildRebalanceSuggestions(driftRows, activeSnapshot?.unrealizedGain),
  )
  const selectedModelTarget = $derived(buildTargetFromReferenceModel(selectedModel, target))
  const hasAnyTarget = $derived(driftRows.some((r) => r.targetPct != null))
  const reviewCount = $derived(driftRows.filter((r) => r.state === 'review').length)
  const top3Elevated = $derived(allocation.top3Pct >= (target.top3MaxPct ?? 45))
  const themeElevated = $derived((themes?.topTheme?.pct ?? 0) >= 50)
  const missingCount = $derived(confidence.items.filter((i) => !i.complete).length)
  const equityExposure = $derived(allocation.stockPct + allocation.etfPct)
  const showDriftTable = $derived(hasAnyTarget || editorOpen)
  const stickySummary = $derived(
    buildPortfolioStickySummary(
      allocation,
      classification,
      hasAnyTarget,
      reviewCount,
      confidence,
      data.accounts,
    ),
  )
  const concentratedKeyword = $derived(t('stocks.classify.concentratedKeyword'))
  const isWarnStance = $derived(classification.label.includes(concentratedKeyword))

  /** @param {PortfolioAllocationTarget} next */
  function persistTarget(next) {
    store.setPortfolioAllocationTarget(sanitizePortfolioAllocationTarget(next))
  }

  /**
   * @param {ReferenceModel} m
   * @param {{ edit?: boolean }} [options]
   */
  function applyModelToTarget(m, options = {}) {
    const next = buildTargetFromReferenceModel(m, target)
    if (!next) return
    persistTarget(next)
    editorOpen = Boolean(options.edit)
    requestAnimationFrame(() => {
      targetCardRef?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function openTargetEditor() {
    editorOpen = true
    requestAnimationFrame(() => {
      targetCardRef?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
</script>

{#snippet driftStateTag(state)}
  {#if state === 'ok'}
    <span class="tag positive">{t('stocks.hub.drift.tag.ok')}</span>
  {:else if state === 'review'}
    <span class="tag warn">{t('stocks.hub.drift.tag.review')}</span>
  {:else}
    <span class="tag">{t('stocks.hub.drift.tag.unset')}</span>
  {/if}
{/snippet}

{#snippet targetInputs(currentTarget, onChange)}
  <div class="portfolio-target-grid">
    {#each [
      { label: t('stocks.hub.target.stockPct'), key: 'stockPct', placeholder: t('stocks.hub.target.placeholderStock') },
      { label: t('stocks.hub.target.etfPct'), key: 'etfPct', placeholder: t('stocks.hub.target.placeholderEtf') },
      { label: t('stocks.hub.target.top1Max'), key: 'top1MaxPct', placeholder: t('stocks.hub.target.placeholderTop1') },
      { label: t('stocks.hub.target.top3Max'), key: 'top3MaxPct', placeholder: t('stocks.hub.target.placeholderTop3') },
      { label: t('stocks.hub.target.driftThreshold'), key: 'driftThresholdPct', placeholder: t('stocks.hub.target.placeholderDrift') },
    ] as field (field.key)}
      <label class="portfolio-target-field">
        <span>{field.label}</span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          placeholder={field.placeholder}
          value={currentTarget[field.key] ?? ''}
          oninput={(e) => {
            const raw = e.currentTarget.value
            const next = { ...currentTarget }
            if (raw === '') {
              delete next[field.key]
            } else {
              const n = Number(raw)
              if (Number.isFinite(n)) next[field.key] = n
            }
            onChange(next)
          }}
        />
        <span class="text-secondary">%</span>
      </label>
    {/each}
  </div>
{/snippet}

{#snippet actionCard(priority, title, reason, ctaLabel, onClick, disabled = false, done = false)}
  <div class="portfolio-action-card{done ? ' is-done' : ''}">
    <span class="portfolio-action-priority">{priority}</span>
    <div class="portfolio-action-body">
      <strong>{title}</strong>
      <p class="muted-note">{reason}</p>
    </div>
    <button
      type="button"
      class="btn ghost portfolio-action-cta"
      onclick={onClick}
      {disabled}
    >
      {ctaLabel}
    </button>
  </div>
{/snippet}

{#snippet modelDetail(model, yourEquityPct)}
  {@const gap = yourEquityPct - model.typical.equityPct}
  {@const gapLabel = `${gap >= 0 ? '+' : ''}${gap.toFixed(0)}%`}
  <div class="portfolio-model-detail">
    <p class="muted-note">{refModelText(model.id, 'philosophy')}</p>
    <div class="portfolio-model-meta">
      <span>
        {t('stocks.hub.modelDetail.typical', {
          equity: model.typical.equityPct,
          bond: model.typical.bondPct,
        })}
      </span>
      <span>
        {t('stocks.hub.modelDetail.maintenance', {
          tier: refModelMaintenanceTier(model.maintenance),
        })}
      </span>
      <span>
        {t('stocks.hub.modelDetail.volatility', {
          tier: refModelVolatilityTier(model.volatility),
        })}
      </span>
      {#if model.typical.equityPct > 0}
        <span>
          {t('stocks.hub.modelDetail.yourExposure', {
            pct: yourEquityPct.toFixed(0),
            gap: gapLabel,
          })}
        </span>
      {/if}
    </div>
    <p class="text-secondary text-sm mb-0">
      {t('stocks.hub.modelDetail.rebalanceTradeoffs', {
        rebalance: refModelText(model.id, 'rebalanceRule'),
        tradeoffs: refModelText(model.id, 'tradeoffs'),
      })}
    </p>
  </div>
{/snippet}

<section class="portfolio-hub" aria-label={t('stocks.hub.ariaLabel')}>
  <div class="card portfolio-stance{isWarnStance ? ' is-warn' : ''}">
    <div class="portfolio-stance-main">
      <span class="portfolio-stance-eyebrow">{t('stocks.hub.stance.eyebrow')}</span>
      <h3 class="portfolio-stance-title">{classification.label}</h3>
      <p class="portfolio-stance-detail">{classification.detail}</p>
    </div>
    <div class="portfolio-stance-facts" role="list">
      <div class="portfolio-stance-fact" role="listitem">
        <span class="k">{t('stocks.hub.stance.top1')}</span>
        <span class="v">{allocation.top1Ticker} · {allocation.top1Pct.toFixed(1)}%</span>
      </div>
      <div class="portfolio-stance-fact" role="listitem">
        <span class="k">{t('stocks.hub.stance.top3')}</span>
        <span class="v">{allocation.top3Pct.toFixed(1)}%</span>
      </div>
      <div class="portfolio-stance-fact" role="listitem">
        <span class="k">{t('stocks.hub.stance.stockEtf')}</span>
        <span class="v">{allocation.stockPct.toFixed(0)}% / {allocation.etfPct.toFixed(0)}%</span>
      </div>
      <div class="portfolio-stance-fact" role="listitem">
        <span class="k">{t('stocks.hub.stance.target')}</span>
        <span class="v{!hasAnyTarget ? ' is-muted' : reviewCount > 0 ? ' is-warn' : ''}">
          {hasAnyTarget
            ? t('stocks.hub.stance.itemsToReview', { count: reviewCount })
            : t('stocks.hub.stance.notSet')}
        </span>
      </div>
    </div>
  </div>

  <PortfolioStickyBar
    summary={stickySummary}
    {hasAnyTarget}
    {reviewCount}
    stanceLabel={classification.label}
    onSetTarget={openTargetEditor}
    onImportAccounts={onGoSettings}
  />

  {@render kpiSlot?.()}

  <h2 class="portfolio-layer-title">{t('stocks.hub.layer.diagnosis')}</h2>

  <div class="card portfolio-breakdown">
    <h3>{t('stocks.hub.breakdown.title')}</h3>
    <div class="portfolio-segbar-group">
      <div class="portfolio-segbar-row">
        <span class="portfolio-segbar-label">{t('stocks.hub.breakdown.stockVsEtf')}</span>
        <div class="portfolio-segbar">
          <span
            class="segbar-fill segbar-fill-stock"
            style:width="{Math.max(allocation.stockPct, 0)}%"
            title={t('stocks.hub.breakdown.stockTitle', { pct: allocation.stockPct.toFixed(1) })}
          ></span>
          <span
            class="segbar-fill segbar-fill-etf"
            style:width="{Math.max(allocation.etfPct, 0)}%"
            title={t('stocks.hub.breakdown.etfTitle', { pct: allocation.etfPct.toFixed(1) })}
          ></span>
        </div>
        <span class="portfolio-segbar-value">
          {allocation.stockPct.toFixed(0)}% / {allocation.etfPct.toFixed(0)}%
        </span>
      </div>
      <div class="portfolio-segbar-row">
        <span class="portfolio-segbar-label">{t('stocks.hub.breakdown.top3Concentration')}</span>
        <div class="portfolio-segbar">
          <span
            class="segbar-fill segbar-fill-metric{top3Elevated ? ' is-elevated' : ''}"
            style:width="{Math.min(allocation.top3Pct, 100)}%"
            title={t('stocks.hub.breakdown.top3Title', { pct: allocation.top3Pct.toFixed(1) })}
          ></span>
        </div>
        <span class="portfolio-segbar-value{top3Elevated ? ' text-warn' : ''}">
          {allocation.top3Pct.toFixed(0)}%
        </span>
      </div>
      {#if themes?.topTheme}
        <div class="portfolio-segbar-row">
          <span class="portfolio-segbar-label">{t('stocks.hub.breakdown.themeConcentration')}</span>
          <div class="portfolio-segbar">
            <span
              class="segbar-fill segbar-fill-metric{themeElevated ? ' is-elevated' : ''}"
              style:width="{Math.min(themes.topTheme.pct, 100)}%"
              title={t('stocks.hub.breakdown.themeTitle', {
                theme: themes.topTheme.theme,
                pct: themes.topTheme.pct.toFixed(1),
              })}
            ></span>
          </div>
          <span class="portfolio-segbar-value{themeElevated ? ' text-warn' : ''}">
            {themes.topTheme.theme} {themes.topTheme.pct.toFixed(0)}%
          </span>
        </div>
      {/if}
    </div>
    {#if themes?.note}
      <p class="muted-note portfolio-theme-note">{themes.note}</p>
    {/if}
    <p class="muted-note{blended.retirementSummaries.length > 0 ? ' mb-3' : ''}">
      {t('stocks.hub.breakdown.taxableNote')}
    </p>
    {#if blended.retirementSummaries.length > 0}
      <div class="portfolio-blended-row">
        <span class="portfolio-segbar-label">{t('stocks.hub.breakdown.totalInvested')}</span>
        <div class="portfolio-segbar portfolio-segbar-multi">
          <span
            class="segbar-fill segbar-fill-stock"
            style:width="{blended.equityPct}%"
            title={t('stocks.hub.breakdown.equityTitle', { pct: blended.equityPct.toFixed(1) })}
          ></span>
          <span
            class="segbar-fill segbar-fill-bond"
            style:width="{blended.bondPct}%"
            title={t('stocks.hub.breakdown.bondTitle', { pct: blended.bondPct.toFixed(1) })}
          ></span>
          <span
            class="segbar-fill segbar-fill-cash"
            style:width="{blended.cashPct}%"
            title={t('stocks.hub.breakdown.cashTitle', { pct: blended.cashPct.toFixed(1) })}
          ></span>
        </div>
        <span class="portfolio-segbar-value">
          {t('stocks.hub.breakdown.blendedSummary', {
            equity: blended.equityPct.toFixed(0),
            bond: blended.bondPct.toFixed(0),
            cash: blended.cashPct.toFixed(0),
          })}
        </span>
      </div>
    {/if}
  </div>

  {#if trend}
    <div class="card allocation-trend-card">
      <div class="section-head">
        <h3 class="flush">{t('stocks.hub.trend.title')}</h3>
        {#if trend.length >= 2}
          <span class="text-secondary text-sm">
            {t('stocks.hub.trend.snapshotCount', { count: trend.length })}
          </span>
        {/if}
      </div>
      <AllocationTrendChart points={trend} {target} />
    </div>
  {/if}

  {#each blended.retirementSummaries as ret (ret.accountId)}
    <div class="card portfolio-retirement-funds">
      <div class="section-head">
        <h3 class="flush">{ret.accountName}</h3>
        <span class="text-secondary text-sm">
          {ret.underlying.length > 0
            ? t('stocks.hub.retirement.fidelityLookthrough')
            : t('stocks.hub.retirement.fundComposition')}
        </span>
      </div>
      <p class="muted-note">
        {t('stocks.hub.retirement.assetBreakdown', {
          equity: ret.equityPct.toFixed(1),
          bond: ret.bondPct.toFixed(1),
          cash: ret.cashPct.toFixed(1),
        })}{ret.otherPct > 0
          ? t('stocks.hub.retirement.otherSuffix', { pct: ret.otherPct.toFixed(1) })
          : ''}{ret.underlying.length > 0
          ? t('stocks.hub.retirement.lookthroughNote')
          : t('stocks.hub.retirement.fundRatioNote')}
      </p>
      {#if ret.underlying.length > 0}
        <ul class="portfolio-retirement-fund-list">
          {#each ret.underlying as s (s.id)}
            <li>
              <span class="portfolio-retirement-ticker">{s.sourceTicker ?? t('stocks.compare.emDash')}</span>
              <span>{s.label}</span>
              <span class="portfolio-retirement-pct">{s.weightPct.toFixed(2)}%</span>
              <span class="tag">
                {s.assetClass === 'cash'
                  ? t('stocks.hub.retirement.assetClass.cashShort')
                  : s.assetClass === 'bond'
                    ? t('stocks.hub.retirement.assetClass.bond')
                    : s.assetClass === 'other'
                      ? t('stocks.hub.retirement.assetClass.other')
                      : t('stocks.hub.retirement.assetClass.equity')}
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <ul class="portfolio-retirement-fund-list">
          {#each ret.funds as f (f.ticker)}
            <li>
              <span class="portfolio-retirement-ticker">{f.ticker}</span>
              <span>{f.securityName ?? f.ticker}</span>
              <span class="portfolio-retirement-pct">{f.weightPct.toFixed(0)}%</span>
              <span class="tag">
                {f.assetClass === 'cash'
                  ? t('stocks.hub.retirement.assetClass.cashEquiv')
                  : f.assetClass === 'bond'
                    ? t('stocks.hub.retirement.assetClass.bond')
                    : t('stocks.hub.retirement.assetClass.equity')}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if ret.underlying.length > 0 && ret.funds.length > 0}
        <details class="portfolio-retirement-positions mt-3">
          <summary>{t('stocks.hub.retirement.mainHoldings')}</summary>
          <ul class="portfolio-retirement-fund-list">
            {#each ret.funds as f (f.ticker)}
              <li>
                <span class="portfolio-retirement-ticker">{f.ticker}</span>
                <span>{f.securityName ?? f.ticker}</span>
                <span class="portfolio-retirement-pct">{f.weightPct.toFixed(0)}%</span>
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    </div>
  {/each}

  <div class="card portfolio-status{confidence.complete ? '' : ' is-partial'}">
    <div class="section-head">
      <h3 class="flush">{t('stocks.hub.confidence.title')}</h3>
      <span class="tag{confidence.complete ? '' : ' warn'}">
        {confidence.complete
          ? missingCount > 0
            ? t('stocks.hub.confidence.partial')
            : t('stocks.hub.confidence.complete')
          : t('stocks.hub.confidence.noData')}
      </span>
    </div>
    <ul class="portfolio-status-list">
      {#each confidence.items as item (item.id)}
        {@const actionable =
          !item.complete && (item.id === 'retirement' || item.id === 'hsa') && onGoSettings}
        <li class={item.complete ? 'done' : 'missing'}>
          <span class="portfolio-status-dot">{item.complete ? '✓' : '○'}</span>
          <span class="portfolio-status-label">{item.label}</span>
          {#if actionable}
            <button
              type="button"
              class="btn ghost compact portfolio-status-cta"
              onclick={onGoSettings}
            >
              {t('stocks.hub.confidence.goSettings')}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  </div>

  <div class="card portfolio-diagnosis">
    <h3>{t('stocks.hub.diagnosis.title')}</h3>
    <p class="muted-note">
      {t('stocks.hub.diagnosis.intro', { label: classification.label })}{classification.coreSatelliteNote
        ? t('stocks.hub.diagnosis.introNoteSeparator', { note: classification.coreSatelliteNote })
        : '。'}
      {t('stocks.hub.diagnosis.introSuffix')}
    </p>
    <div class="portfolio-model-tabs">
      {#each visibleModels as model (model.id)}
        <button
          type="button"
          class="chip{model.tier === 'advanced' ? ' dashed' : ''}{selectedModelId === model.id ? ' active' : ''}"
          onclick={() => {
            selectedModelId = model.id
          }}
        >
          {refModelText(model.id, 'name')}
        </button>
      {/each}
      <button
        type="button"
        class="chip dashed subtle"
        onclick={() => {
          showAllModels = !showAllModels
        }}
        aria-expanded={showAllModels}
      >
        {showAllModels
          ? t('stocks.hub.diagnosis.collapseModels')
          : t('stocks.hub.diagnosis.moreModels', { count: hiddenModelCount })}
      </button>
    </div>
    {@render modelDetail(selectedModel, equityExposure)}
    <div class="portfolio-diagnosis-actions">
      <button
        type="button"
        class="btn"
        onclick={() => applyModelToTarget(selectedModel)}
        disabled={!selectedModelTarget}
      >
        {t('stocks.hub.diagnosis.acceptTarget', {
          model: refModelText(selectedModel.id, 'name'),
        })}
      </button>
      <button
        type="button"
        class="btn ghost"
        onclick={() => applyModelToTarget(selectedModel, { edit: true })}
        disabled={!selectedModelTarget}
      >
        {t('stocks.hub.diagnosis.tweakFirst')}
      </button>
      <button
        type="button"
        class="btn ghost"
        onclick={() => {
          showCompareTable = !showCompareTable
        }}
      >
        {showCompareTable
          ? t('stocks.hub.diagnosis.collapseCompare')
          : t('stocks.hub.diagnosis.expandCompare')}
      </button>
    </div>
    {#if showCompareTable}
      <table class="review-table portfolio-compare-table">
        <thead>
          <tr>
            <th>{t('stocks.hub.diagnosis.compareTable.dimension')}</th>
            <th>{t('stocks.hub.diagnosis.compareTable.yours')}</th>
            <th>{t('stocks.hub.diagnosis.compareTable.model')}</th>
            <th>{t('stocks.hub.diagnosis.compareTable.gap')}</th>
          </tr>
        </thead>
        <tbody>
          {#each modelCompare as row (row.metric)}
            <tr>
              <td>{row.metric}</td>
              <td>{row.yours}</td>
              <td>{row.model}</td>
              <td>{row.gap}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <h2 class="portfolio-layer-title">{t('stocks.hub.layer.decision')}</h2>

  <div class="card portfolio-drift-card" bind:this={targetCardRef}>
    <div class="section-head">
      <h3 class="flush">{t('stocks.hub.drift.title')}</h3>
      {#if showDriftTable}
        <button
          type="button"
          class="btn ghost"
          onclick={() => {
            editorOpen = !editorOpen
          }}
        >
          {editorOpen ? t('stocks.hub.drift.collapseEdit') : t('stocks.hub.drift.editTarget')}
        </button>
      {/if}
    </div>

    {#if !showDriftTable}
      <div class="portfolio-drift-setup">
        <p class="portfolio-drift-setup-lead">{t('stocks.hub.drift.setupLead')}</p>
        <p class="muted-note">{t('stocks.hub.drift.setupHint')}</p>
        <ul class="portfolio-drift-setup-list">
          <li>{t('stocks.hub.drift.setupItem1')}</li>
          <li>{t('stocks.hub.drift.setupItem2')}</li>
          <li>{t('stocks.hub.drift.setupItem3')}</li>
        </ul>
        <div class="portfolio-diagnosis-actions">
          <button
            type="button"
            class="btn"
            onclick={() => applyModelToTarget(selectedModel)}
            disabled={!selectedModelTarget}
          >
            {t('stocks.hub.diagnosis.acceptTarget', {
              model: refModelText(selectedModel.id, 'name'),
            })}
          </button>
          <button type="button" class="btn ghost" onclick={openTargetEditor}>
            {t('stocks.hub.drift.manualSet')}
          </button>
        </div>
      </div>
    {:else}
      {#if editorOpen}
        {@render targetInputs(target, persistTarget)}
      {/if}
      <table class="review-table portfolio-drift-table">
        <thead>
          <tr>
            <th>{t('stocks.hub.drift.table.metric')}</th>
            <th class="num">{t('stocks.hub.drift.table.current')}</th>
            <th class="num">{t('stocks.hub.drift.table.target')}</th>
            <th class="num">{t('stocks.hub.drift.table.delta')}</th>
            <th>{t('stocks.hub.drift.table.status')}</th>
          </tr>
        </thead>
        <tbody>
          {#each driftRows as row (row.key)}
            <tr>
              <td>
                {row.label}
                {#if row.hint}
                  <span class="text-secondary text-xs block">{row.hint}</span>
                {/if}
              </td>
              <td class="num">{row.currentPct.toFixed(1)}%</td>
              <td class="num">
                {row.targetPct != null
                  ? `${row.targetPct.toFixed(1)}%`
                  : t('stocks.compare.emDash')}
              </td>
              <td class="num">
                {row.driftPct != null
                  ? `${row.driftPct >= 0 ? '+' : ''}${row.driftPct.toFixed(1)}%`
                  : t('stocks.compare.emDash')}
              </td>
              <td>{@render driftStateTag(row.state)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <div class="card portfolio-actions-card">
    <h3>{t('stocks.hub.actions.title')}</h3>
    <div class="portfolio-action-list">
      {@render actionCard(
        'P1',
        t('stocks.hub.actions.p1Title'),
        t('stocks.hub.actions.p1Reason'),
        t('stocks.hub.actions.p1Cta'),
        openTargetEditor,
      )}
      {@render actionCard(
        'P2',
        t('stocks.hub.actions.p2Title'),
        t('stocks.hub.actions.p2Reason'),
        onGoSettings ? t('stocks.hub.actions.p2CtaSettings') : t('stocks.hub.actions.p2CtaPending'),
        onGoSettings,
        !onGoSettings,
      )}
    </div>
    <div class="portfolio-rebalance-detail">
      {#each rebalance as item (item.method)}
        {#if item.collapsed}
          <details class="portfolio-rebalance-collapsed">
            <summary>{item.title}</summary>
            <p class="muted-note">{redactMoneyText(item.description, data.privacy)}</p>
          </details>
        {:else}
          <p class="muted-note portfolio-rebalance-note">
            <strong>{item.title}：</strong>{redactMoneyText(item.description, data.privacy)}
          </p>
        {/if}
      {/each}
    </div>
  </div>
</section>
