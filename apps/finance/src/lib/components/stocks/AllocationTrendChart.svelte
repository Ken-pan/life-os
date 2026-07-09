<script>
  // Port of src/components/stocks/AllocationTrendChart.tsx (SVG chart).
  import { t } from '$lib/i18n.svelte.js'
  import {
    CHART_H,
    CHART_W,
    PAD_L,
    PAD_R,
    buildAllocationTrendMeta,
    fmtDelta,
    linePath,
    xAt,
    yAt,
  } from './allocationTrendData.js'

  /** @type {{
   *   points: import('../../../engine/holdingsPortfolio.js').AllocationTrendPoint[],
   *   target?: import('../../../types.js').PortfolioAllocationTarget,
   * }} */
  let { points, target } = $props()

  const meta = $derived(buildAllocationTrendMeta(points, target))
  const gridLines = [0, 25, 50, 75, 100]

  const targetSummary = $derived.by(() => {
    const parts = [
      meta.hasStockTarget
        ? t('stocks.allocationTrend.stockTarget', { pct: meta.stockTarget.toFixed(0) })
        : null,
      meta.hasTop3Target
        ? t('stocks.allocationTrend.top3Cap', { pct: meta.top3Target.toFixed(0) })
        : null,
    ].filter(Boolean)
    return parts.join(t('stocks.allocationTrend.targetSummarySeparator'))
  })
</script>

{#if !meta.hasEnoughPoints}
  <p class="muted-note">{t('stocks.allocationTrend.empty')}</p>
{:else}
  <div class="allocation-trend">
    <svg
      viewBox="0 0 {CHART_W} {CHART_H}"
      class="allocation-trend-svg"
      role="img"
      aria-label={t('stocks.allocationTrend.ariaLabel', {
        startStock: meta.first.stockPct.toFixed(0),
        endStock: meta.latest.stockPct.toFixed(0),
        startTop3: meta.first.top3Pct.toFixed(0),
        endTop3: meta.latest.top3Pct.toFixed(0),
        targetSummary: targetSummary ? `，${targetSummary}` : '',
      })}
    >
      {#if meta.hasStockTarget && meta.stockBandTop != null && meta.stockBandBottom != null}
        <g>
          <rect
            x={PAD_L}
            y={yAt(meta.stockBandTop)}
            width={CHART_W - PAD_L - PAD_R}
            height={Math.max(1, yAt(meta.stockBandBottom) - yAt(meta.stockBandTop))}
            class="allocation-trend-target-band"
          />
          <line
            x1={PAD_L}
            x2={CHART_W - PAD_R}
            y1={yAt(meta.stockTarget)}
            y2={yAt(meta.stockTarget)}
            class="allocation-trend-target-line is-stock-target"
          />
        </g>
      {/if}
      {#if meta.hasTop3Target}
        <line
          x1={PAD_L}
          x2={CHART_W - PAD_R}
          y1={yAt(meta.top3Target)}
          y2={yAt(meta.top3Target)}
          class="allocation-trend-target-line is-top3-target"
        />
      {/if}
      {#each gridLines as pct (pct)}
        <g>
          <line
            x1={PAD_L}
            x2={CHART_W - PAD_R}
            y1={yAt(pct)}
            y2={yAt(pct)}
            class="allocation-trend-grid"
          />
          <text x={PAD_L - 6} y={yAt(pct) + 3} class="allocation-trend-axis" text-anchor="end">
            {pct}
          </text>
        </g>
      {/each}
      <path d={linePath(points, (p) => p.stockPct)} class="allocation-trend-line is-stock" />
      <path d={linePath(points, (p) => p.top3Pct)} class="allocation-trend-line is-top3" />
      {#each points as p, i (p.snapshotId)}
        <g>
          <circle
            cx={xAt(i, points.length)}
            cy={yAt(p.stockPct)}
            r="3"
            class="allocation-trend-dot is-stock"
          />
          <circle
            cx={xAt(i, points.length)}
            cy={yAt(p.top3Pct)}
            r="3"
            class="allocation-trend-dot is-top3"
          />
          <text
            x={xAt(i, points.length)}
            y={CHART_H - 6}
            class="allocation-trend-axis"
            text-anchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
          >
            {p.dateLabel}
          </text>
        </g>
      {/each}
    </svg>
    <div class="allocation-trend-legend">
      <span class="allocation-trend-key is-stock">
        {t('stocks.allocationTrend.legendStock', {
          pct: meta.latest.stockPct.toFixed(0),
          delta: fmtDelta(meta.stockDelta),
        })}
      </span>
      <span class="allocation-trend-key is-top3">
        {t('stocks.allocationTrend.legendTop3', {
          pct: meta.latest.top3Pct.toFixed(0),
          delta: fmtDelta(meta.top3Delta),
        })}
      </span>
      {#if meta.hasStockTarget}
        <span class="allocation-trend-key is-stock-target">
          {t('stocks.allocationTrend.legendStockTarget', {
            pct: meta.stockTarget.toFixed(0),
            threshold: meta.threshold.toFixed(0),
          })}
        </span>
      {/if}
      {#if meta.hasTop3Target}
        <span class="allocation-trend-key is-top3-target">
          {t('stocks.allocationTrend.legendTop3Cap', { pct: meta.top3Target.toFixed(0) })}
        </span>
      {/if}
    </div>
  </div>
{/if}
