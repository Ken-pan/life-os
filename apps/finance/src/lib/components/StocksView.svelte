<script module>
  /** @param {string} date @param {string | undefined} time */
  function parseSnapshotTs(date, time) {
    const hourMin = time?.trim() ? `${time.trim()}:00` : '00:00:00'
    const ts = Date.parse(`${date}T${hourMin}`)
    return Number.isFinite(ts) ? ts : Date.now()
  }

  /** @param {{ asOfDate: string, asOfTimeLocal?: string, positions: { ticker: string, marketPrice: number }[] }[]} snapshots */
  function buildSnapshotTrails(snapshots) {
    /** @type {Record<string, import('../../engine/holdingsPortfolio.js').PriceTrailPoint[]>} */
    const out = {}
    const asc = snapshots
      .slice()
      .sort(
        (a, b) =>
          parseSnapshotTs(a.asOfDate, a.asOfTimeLocal) -
          parseSnapshotTs(b.asOfDate, b.asOfTimeLocal),
      )
    for (const snapshot of asc) {
      const ts = parseSnapshotTs(snapshot.asOfDate, snapshot.asOfTimeLocal)
      for (const position of snapshot.positions) {
        const ticker = position.ticker?.trim().toUpperCase()
        if (!ticker || !Number.isFinite(position.marketPrice) || position.marketPrice <= 0)
          continue
        if (!out[ticker]) out[ticker] = []
        out[ticker].push({ ts, price: position.marketPrice, source: 'snapshot' })
      }
    }
    return out
  }

  /**
   * @param {Record<string, import('../../engine/holdingsPortfolio.js').PriceTrailPoint[]>} snapshotTrails
   * @param {Record<string, { ts: number, price: number }[]>} liveHistory
   */
  function mergeTrails(snapshotTrails, liveHistory) {
    /** @type {Record<string, import('../../engine/holdingsPortfolio.js').PriceTrailPoint[]>} */
    const out = {}
    const symbols = new Set([...Object.keys(snapshotTrails), ...Object.keys(liveHistory)])
    for (const symbol of symbols) {
      const points = [
        ...(snapshotTrails[symbol] ?? []),
        ...((liveHistory[symbol] ?? []).map((point) => ({
          ts: point.ts,
          price: point.price,
          source: /** @type {const} */ ('live'),
        }))),
      ]
        .filter(
          (point) =>
            Number.isFinite(point.ts) && Number.isFinite(point.price) && point.price > 0,
        )
        .sort((a, b) => a.ts - b.ts)
      if (points.length > 0) out[symbol] = points
    }
    return out
  }

  function readSnapshotIdFromUrl() {
    if (typeof window === 'undefined') return null
    const id = new URLSearchParams(window.location.search).get('snapshot')
    return id?.trim() || null
  }
</script>

<script>
  // Port of src/components/StocksView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { createHoldingsLive } from '$lib/holdingsLive.svelte.js'
  import { createBundledRobinhoodSnapshot } from '../../engine/holdings.js'
  import {
    buildPositionRows,
    computeAllocation,
    computeAllocationTrend,
    computeInvestedScopeTotals,
    computeLiveTotals,
    sortPositionRows,
    sortedSnapshots,
    snapshotAsOfLabel,
  } from '../../engine/holdingsPortfolio.js'
  import { computeThemeConcentration } from '../../engine/portfolioAllocation.js'
  import { prefetchDailyCandleHistories } from '$lib/priceHistory'
  import LiveStatusBar from './stocks/LiveStatusBar.svelte'
  import PortfolioAllocationSection from './stocks/PortfolioAllocationSection.svelte'
  import HoldingsWatchlist from './stocks/HoldingsWatchlist.svelte'
  import SnapshotPicker from './stocks/SnapshotPicker.svelte'
  import SnapshotComparePanel from './stocks/SnapshotComparePanel.svelte'
  import StocksSummaryKpis from './stocks/StocksSummaryKpis.svelte'
  import PositionDrawer from './stocks/PositionDrawer.svelte'
  import InvestmentAdvisor from './stocks/InvestmentAdvisor.svelte'

  /** @typedef {import('../../types.js').FinanceData} FinanceData */
  /** @typedef {import('../../engine/holdingsPortfolio.js').HoldingsSort} HoldingsSort */
  /** @typedef {import('../../engine/holdingsPortfolio.js').PositionRowView} PositionRowView */
  /** @typedef {import('../../engine/metrics.js').MonthlySavingCapacity} MonthlySavingCapacity */

  /** @type {{
   *   data: FinanceData,
   *   tabActive?: boolean,
   *   onGoSettings?: () => void,
   *   savingCapacity?: MonthlySavingCapacity,
   * }} */
  let { data, tabActive = true, onGoSettings, savingCapacity } = $props()

  const store = getFinanceStore()

  const snapshots = $derived(sortedSnapshots(data.holdingsSnapshots))
  let activeSnapshotId = $state(/** @type {string | null} */ (null))
  let compareOlderId = $state(/** @type {string | null} */ (null))
  let compareNewerId = $state(/** @type {string | null} */ (null))
  let trackingEnabled = $state(true)
  let sort = $state(/** @type {HoldingsSort} */ ('weight'))
  let selectedRow = $state(/** @type {PositionRowView | null} */ (null))

  const autoLoadedRef = { current: false }
  const dailySyncKeyRef = { current: /** @type {string | null} */ (null) }
  const nowTs = Date.now()

  $effect(() => {
    if (activeSnapshotId == null && snapshots[0]?.id) {
      activeSnapshotId = snapshots[0].id
    }
    if (compareOlderId == null && snapshots[1]?.id) {
      compareOlderId = snapshots[1].id
    }
    if (compareNewerId == null && snapshots[0]?.id) {
      compareNewerId = snapshots[0].id
    }
  })

  $effect(() => {
    if (autoLoadedRef.current) return
    if (data.holdingsSnapshots.length > 0) return
    autoLoadedRef.current = true
    try {
      const { snapshot } = createBundledRobinhoodSnapshot(data.accounts)
      store.upsertHoldingsSnapshot(snapshot)
      activeSnapshotId = snapshot.id
    } catch {
      // 内置数据异常时静默跳过
    }
  })

  $effect(() => {
    const fromUrl = readSnapshotIdFromUrl()
    if (fromUrl && snapshots.some((s) => s.id === fromUrl)) {
      activeSnapshotId = fromUrl
    }
  })

  $effect(() => {
    if (snapshots.length < 2) return
    if (!compareOlderId || !snapshots.some((s) => s.id === compareOlderId)) {
      compareOlderId = snapshots[1]?.id ?? null
    }
    if (!compareNewerId || !snapshots.some((s) => s.id === compareNewerId)) {
      compareNewerId = snapshots[0]?.id ?? null
    }
  })

  const activeSnapshot = $derived(
    snapshots.find((s) => s.id === activeSnapshotId) ?? snapshots[0] ?? null,
  )
  const symbols = $derived(activeSnapshot?.positions.map((p) => p.ticker) ?? [])

  const live = createHoldingsLive(
    () => symbols,
    () => trackingEnabled && Boolean(activeSnapshot),
    () => tabActive,
  )

  $effect(() => {
    if (!tabActive || symbols.length === 0) return
    const key = symbols.join(',')
    if (dailySyncKeyRef.current === key) return
    dailySyncKeyRef.current = key
    prefetchDailyCandleHistories(symbols)
  })

  const snapshotTrails = $derived(buildSnapshotTrails(snapshots))
  const mergedTrails = $derived(mergeTrails(snapshotTrails, live.history))
  const rows = $derived.by(() => {
    if (!activeSnapshot) return []
    return sortPositionRows(
      buildPositionRows(activeSnapshot, live.quotes, mergedTrails),
      sort,
    )
  })
  const allocation = $derived(computeAllocation(rows))
  const totals = $derived(computeLiveTotals(rows, activeSnapshot?.holdingsMarketValue ?? 0))
  const investedScope = $derived(
    computeInvestedScopeTotals(
      totals.liveTotal,
      data.accounts,
      activeSnapshot?.impliedCostBasis,
    ),
  )
  const allocationTrend = $derived(computeAllocationTrend(snapshots))
  const themeConcentration = $derived(
    computeThemeConcentration(
      rows.map((r) => ({ ticker: r.position.ticker, value: r.snapshotValue })),
    ),
  )

  const snapshotAsOfTs = $derived(
    activeSnapshot ? Date.parse(activeSnapshot.asOfDate) : Number.NaN,
  )
  const snapshotAgeDays = $derived(
    Number.isFinite(snapshotAsOfTs)
      ? Math.floor((nowTs - snapshotAsOfTs) / 86_400_000)
      : 0,
  )
</script>

{#if snapshots.length === 0}
  <div class="empty">
    <h3>{t('stocks.view.emptyTitle')}</h3>
    <p class="muted-note mb-0">{t('stocks.view.emptyNote')}</p>
  </div>
{:else}
  <div class="grid gap-4">
    {#if activeSnapshot}
      <header class="portfolio-page-head">
        <div class="portfolio-page-scope">
          <span class="tag">{activeSnapshot.accountLabel ?? 'Robinhood'}</span>
          {#if investedScope.lockedBalance > 0}
            <span class="tag">{t('stocks.view.tagIncludesRetirement')}</span>
          {:else}
            <span class="tag warn">{t('stocks.view.tagTaxableOnly')}</span>
          {/if}
          <span class="text-secondary text-sm">
            {t('stocks.view.updatedAt', { label: snapshotAsOfLabel(activeSnapshot) })}
          </span>
          {#if snapshotAgeDays >= 7}
            <span class="tag warn">
              {t('stocks.view.snapshotStale', { days: snapshotAgeDays })}
            </span>
          {/if}
          {#if !tabActive && trackingEnabled}
            <span class="tag warn">{t('stocks.view.quotesPaused')}</span>
          {/if}
        </div>
      </header>
    {/if}

    <PortfolioAllocationSection
      {data}
      {allocation}
      {activeSnapshot}
      taxableSecurities={totals.liveTotal}
      {onGoSettings}
      trend={allocationTrend}
      themes={themeConcentration}
    >
      {#snippet kpiSlot()}
        <StocksSummaryKpis
          scope={investedScope}
          todayReturnAmount={activeSnapshot?.todayReturnAmountApprox}
          todayReturnPct={activeSnapshot?.todayReturnPctApprox}
          unrealizedGain={activeSnapshot?.unrealizedGain}
          weightedTotalReturnPct={activeSnapshot?.weightedTotalReturnPct}
          positionCount={activeSnapshot?.positionCount ?? 0}
          privacy={data.privacy}
        />
      {/snippet}
    </PortfolioAllocationSection>

    <InvestmentAdvisor
      {data}
      {rows}
      totalValue={totals.liveTotal}
      {savingCapacity}
      {tabActive}
    />

    <h2 class="portfolio-layer-title portfolio-layer-details">{t('stocks.view.detailsLayer')}</h2>

    <HoldingsWatchlist
      {rows}
      privacy={data.privacy}
      {sort}
      onSortChange={(s) => {
        sort = s
      }}
      onSelect={(row) => {
        selectedRow = row
      }}
    />

    <details class="card stocks-secondary-tools">
      <summary>
        {t('stocks.view.quoteControls.title')}
        <span class="tag inline-meta">{t('stocks.view.quoteControls.secondary')}</span>
      </summary>
      <div class="stocks-refresh-actions">
        <button class="btn ghost" onclick={() => (trackingEnabled = !trackingEnabled)}>
          {trackingEnabled
            ? t('stocks.view.quoteControls.pause')
            : t('stocks.view.quoteControls.resume')}
        </button>
        <button
          class="btn"
          onclick={() => void live.refresh()}
          disabled={live.loading || !activeSnapshot}
        >
          {live.loading
            ? t('stocks.view.quoteControls.refreshing')
            : t('stocks.view.quoteControls.refreshNow')}
        </button>
      </div>
      <LiveStatusBar
        status={live.status}
        updatedAt={live.updatedAt}
        pollIntervalSec={live.pollIntervalMs / 1000}
        error={live.error}
      />
    </details>

    <details class="card stocks-secondary-tools">
      <summary>
        {t('stocks.view.history.title')}
        <span class="tag inline-meta">
          {t('stocks.view.history.count', { count: snapshots.length })}
        </span>
      </summary>
      {#if snapshots.length < 2}
        <p class="muted-note mt-2">{t('stocks.view.history.hint')}</p>
      {/if}
      <div class="grid gap-3 mt-3">
        <SnapshotComparePanel
          {snapshots}
          olderId={compareOlderId}
          newerId={compareNewerId}
          privacy={data.privacy}
          onOlderChange={(id) => {
            compareOlderId = id
          }}
          onNewerChange={(id) => {
            compareNewerId = id
          }}
        />

        <SnapshotPicker
          {snapshots}
          activeId={activeSnapshot?.id ?? null}
          privacy={data.privacy}
          onSelect={(id) => {
            activeSnapshotId = id
          }}
          onDelete={(id) => {
            store.removeHoldingsSnapshot(id)
            if (activeSnapshotId === id) {
              const rest = snapshots.filter((s) => s.id !== id)
              activeSnapshotId = rest[0]?.id ?? null
            }
          }}
        />
      </div>
    </details>

    {#if selectedRow}
      <PositionDrawer
        row={selectedRow}
        privacy={data.privacy}
        onClose={() => {
          selectedRow = null
        }}
      />
    {/if}
  </div>
{/if}
