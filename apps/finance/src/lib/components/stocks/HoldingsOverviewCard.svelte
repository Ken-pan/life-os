<script>
  import { onMount } from 'svelte'
  import {
    buildPositionRows,
    sortPositionRows,
    sortedSnapshots,
    snapshotAsOfLabel,
  } from '$lib/engine/holdingsPortfolio'
  import { fetchLiveQuotes } from '$lib/quotes'
  import { money, signedMoney, depositDeltaClass } from '$lib/format.js'
  import InstitutionLogo from '$lib/components/InstitutionLogo.svelte'
  import { quoteSafeToSpend } from '@life-os/finance-core/copy/terminology'
  import { t } from '$lib/i18n.svelte.js'

  /** @typedef {import('../../types.js').FinanceData} FinanceData */
  /** @typedef {'idle' | 'loading' | 'live' | 'partial' | 'stale' | 'error' | 'paused'} LiveTrackStatus */

  /** @type {{ data: FinanceData, tabActive: boolean, onGoStocks: (snapshotId?: string) => void }} */
  let { data, tabActive, onGoStocks } = $props()

  const snapshots = $derived(sortedSnapshots(data.holdingsSnapshots))
  const latest = $derived(snapshots[0])
  const symbols = $derived(latest?.positions.map((p) => p.ticker) ?? [])

  /** @type {Record<string, import('$lib/quotes').LiveQuote>} */
  let quotes = $state({})
  /** @type {LiveTrackStatus} */
  let status = $state('idle')

  const normalizedSymbols = $derived(
    [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))],
  )

  const liveTotal = $derived.by(() => {
    if (!latest) return null
    const rows = buildPositionRows(latest, quotes)
    return rows.reduce((sum, r) => sum + r.liveValue, 0)
  })

  const topReturners = $derived.by(() => {
    if (!latest) return []
    const rows = sortPositionRows(buildPositionRows(latest, quotes), 'return-desc')
    return rows.filter((r) => (r.position.totalReturnAmount ?? 0) !== 0).slice(0, 3)
  })

  const displayStatus = $derived(
    !latest || !tabActive
      ? 'paused'
      : normalizedSymbols.length === 0
        ? 'idle'
        : status,
  )

  /** @param {LiveTrackStatus} s */
  function liveStatusShort(s) {
    return t(`stocks.liveStatus.short.${s}`)
  }

  async function refresh() {
    const uniq = normalizedSymbols
    if (uniq.length === 0) {
      status = 'idle'
      return
    }
    status = 'loading'
    try {
      const next = await fetchLiveQuotes(uniq)
      const got = Object.keys(next).length
      const hasCachedQuotes = Object.keys(quotes).length > 0
      if (got === 0) {
        status = hasCachedQuotes ? 'stale' : 'error'
        return
      }
      quotes = { ...quotes, ...next }
      status = got < uniq.length ? 'partial' : 'live'
    } catch {
      status = Object.keys(quotes).length > 0 ? 'stale' : 'error'
    }
  }

  onMount(() => {
    let timer = null
    const run = () => {
      if (!latest || !tabActive || document.visibilityState === 'hidden') return
      void refresh()
    }
    run()
    timer = setInterval(run, normalizedSymbols.length <= 8 ? 15_000 : 30_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && tabActive) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  })

  $effect(() => {
    if (!latest || !tabActive) return
    void refresh()
  })
</script>

{#if latest}
  <div class="card holdings-overview-card">
    <div class="section-head">
      <h3 class="flex-row">
        <InstitutionLogo name="Robinhood" size="sm" />
        {t('stocks.overview.title')}
      </h3>
      <button type="button" class="btn outline compact" onclick={() => onGoStocks(latest.id)}>
        {t('stocks.overview.openAllocation')}
      </button>
    </div>
    <p class="muted-note">
      {t('stocks.overview.marketValueNote', { safeToSpend: quoteSafeToSpend() })}
    </p>
    <div class="list">
      <div class="kv">
        <span class="k">{t('stocks.overview.portfolioMarketValue')}</span>
        <span>{money(liveTotal ?? latest.holdingsMarketValue, data.privacy)}</span>
      </div>
      {#if latest.impliedCostBasis != null}
        <div class="kv">
          <span class="k">{t('stocks.overview.totalCost')}</span>
          <span>{money(latest.impliedCostBasis, data.privacy)}</span>
        </div>
      {/if}
      {#if latest.unrealizedGain != null}
        <div class="kv">
          <span class="k">{t('stocks.overview.cumulativePnL')}</span>
          <span class={depositDeltaClass(latest.unrealizedGain)}>
            {signedMoney(latest.unrealizedGain, data.privacy)}
            {#if latest.weightedTotalReturnPct != null}
              <span class="text-secondary inline-meta-tight">
                {latest.weightedTotalReturnPct >= 0 ? '+' : ''}
                {latest.weightedTotalReturnPct.toFixed(2)}%
              </span>
            {/if}
          </span>
        </div>
      {/if}
      {#if latest.todayReturnPctApprox != null}
        <div class="kv">
          <span class="k">{t('stocks.overview.todayPnL')}</span>
          <span class={depositDeltaClass(latest.todayReturnPctApprox)}>
            {#if latest.todayReturnAmountApprox != null}
              {signedMoney(latest.todayReturnAmountApprox, data.privacy)} ·
            {/if}
            {latest.todayReturnPctApprox >= 0 ? '+' : ''}
            {latest.todayReturnPctApprox.toFixed(2)}%
          </span>
        </div>
      {/if}
      <div class="kv">
        <span class="k">{t('stocks.overview.dataAsOf')}</span>
        <span>{snapshotAsOfLabel(latest)}</span>
      </div>
      <div class="kv">
        <span class="k">{t('stocks.overview.quoteStatus')}</span>
        <span class="holdings-overview-live-meta">
          <span
            class="dot {displayStatus === 'live' ? 'ok' : displayStatus === 'error' ? 'critical' : 'warn'}"
          ></span>
          {liveStatusShort(displayStatus)}
          {tabActive ? '' : t('stocks.overview.pausedWhenInactive')}
        </span>
      </div>
      <div class="kv">
        <span class="k">{t('stocks.overview.positionCount')}</span>
        <span>{latest.positionCount}</span>
      </div>
    </div>
    {#if topReturners.length > 0}
      <div class="holdings-overview-movers">
        <span class="label">{t('stocks.overview.topReturners')}</span>
        <ul>
          {#each topReturners as row (row.position.id)}
            <li>
              <span class="holdings-overview-mover-ticker">{row.position.ticker}</span>
              <span class={depositDeltaClass(row.position.totalReturnAmount ?? 0)}>
                {signedMoney(row.position.totalReturnAmount ?? 0, data.privacy)}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}
