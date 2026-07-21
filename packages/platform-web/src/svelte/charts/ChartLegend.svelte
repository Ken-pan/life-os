<script>
  /**
   * 图表图例——≥2 系列时必现(可靠的身份通道),单系列由标题承担。
   * swatch 形状随 mark:折线用短线键,柱/环用圆角方块。
   * @type {{
   *   items: { label: string, color: string, muted?: boolean }[],
   *   shape?: 'line' | 'rect',
   *   onHover?: (index: number | null) => void,
   * }}
   */
  let { items, shape = 'rect', onHover } = $props()
</script>

<div class="chart-legend" role="list">
  {#each items as item, i (item.label + i)}
    <span
      class="chart-legend__item"
      class:chart-legend__item--muted={item.muted}
      role="listitem"
      onpointerenter={() => onHover?.(i)}
      onpointerleave={() => onHover?.(null)}
    >
      {#if shape === 'line'}
        <span class="chart-legend__key-line" style:background={item.color}></span>
      {:else}
        <span class="chart-legend__key-rect" style:background={item.color}></span>
      {/if}
      {item.label}
    </span>
  {/each}
</div>

<style>
  .chart-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    align-items: center;
    font-size: var(--text-xs, 11px);
    color: var(--t2, var(--text-secondary, #52514e));
    line-height: 1.4;
  }
  .chart-legend__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: opacity var(--dur-fast) var(--ease-standard, ease);
  }
  .chart-legend__item--muted {
    opacity: 0.35;
  }
  .chart-legend__key-line {
    width: 12px;
    height: 2px;
    border-radius: 1px;
    flex: none;
  }
  .chart-legend__key-rect {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    flex: none;
  }
</style>
