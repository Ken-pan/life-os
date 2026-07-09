<script>
  // Port of PortfolioStickyBar from src/components/stocks/PortfolioStickyBar.tsx.
  import { t } from '$lib/i18n.svelte.js'

  /** @typedef {import('../../engine/portfolioAllocation.js').PortfolioStickySummary} PortfolioStickySummary */

  /** @type {{
   *   summary: Pick<PortfolioStickySummary, 'top3Pct' | 'needsAccounts'>,
   *   hasAnyTarget: boolean,
   *   reviewCount: number,
   *   stanceLabel: string,
   *   onSetTarget: () => void,
   *   onImportAccounts?: () => void,
   * }} */
  let {
    summary,
    hasAnyTarget,
    reviewCount,
    stanceLabel,
    onSetTarget,
    onImportAccounts,
  } = $props()

  let sentinelEl = $state(/** @type {HTMLDivElement | null} */ (null))
  let pinned = $state(false)

  $effect(() => {
    const el = sentinelEl
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        pinned = !entry.isIntersecting
      },
      { threshold: 0, rootMargin: '-72px 0px 0px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  })

  const targetNotSet = $derived(!hasAnyTarget)
  const targetDrift = $derived(hasAnyTarget && reviewCount > 0)
  const targetWarn = $derived(targetNotSet || targetDrift)
  const statusLabel = $derived(
    targetWarn
      ? targetNotSet
        ? t('stocks.stickySummary.targetNotSet')
        : t('stocks.stickySummary.targetDriftCount', { count: reviewCount })
      : summary.needsAccounts
        ? t('stocks.stickySummary.coveragePendingAccounts')
        : t('stocks.stickySummary.targetInRange'),
  )
  const statusWarn = $derived(targetWarn || summary.needsAccounts)
  const cta = $derived(
    !targetWarn && summary.needsAccounts && onImportAccounts
      ? { label: t('stocks.sticky.importAccounts'), onClick: onImportAccounts }
      : {
          label: targetWarn ? t('stocks.sticky.setTarget') : t('stocks.sticky.editTarget'),
          onClick: onSetTarget,
        },
  )
</script>

<div bind:this={sentinelEl} class="portfolio-sticky-sentinel" aria-hidden="true"></div>
<div
  class="portfolio-sticky-bar{pinned ? ' is-pinned' : ''}"
  role="region"
  aria-label={t('stocks.sticky.ariaLabel')}
  aria-hidden={!pinned}
>
  <div class="portfolio-sticky-chips">
    <span class="portfolio-sticky-chip portfolio-sticky-chip-primary">{stanceLabel}</span>
    <span class="portfolio-sticky-chip portfolio-sticky-chip-desktop">
      {t('stocks.sticky.top3Prefix', { pct: summary.top3Pct.toFixed(1) })}
    </span>
    <span class="portfolio-sticky-chip{statusWarn ? ' is-warn' : ''}">{statusLabel}</span>
  </div>
  <div class="portfolio-sticky-actions">
    <button type="button" class="btn" onclick={cta.onClick}>{cta.label}</button>
  </div>
</div>
