<script>
  /** @type {{ interactive?: boolean, editMode?: boolean, showFurniture?: boolean }} */
  let { interactive = false, editMode = false, showFurniture = false } = $props()
</script>

<div class="plan-legend" role="list" aria-label="平面图图例">
  {#if editMode}
    <span class="plan-legend-item plan-legend-edit" role="listitem">
      <i class="sw wall-edit" aria-hidden="true"></i> 内墙线（拖曳改尺寸）
    </span>
    <span class="plan-legend-item plan-legend-edit" role="listitem">
      <i class="sw open-edit" aria-hidden="true"></i> 门窗（拖曳改位置）
    </span>
    <span class="plan-legend-item plan-legend-edit" role="listitem">
      <i class="sw grip-edit" aria-hidden="true"></i> 虚线框 = 门宽握把
    </span>
  {:else if interactive}
    <span class="plan-legend-item" role="listitem">
      <i class="sw store" aria-hidden="true"></i> 储藏区（点击跳转清单）
    </span>
  {:else}
    <span class="plan-legend-item" role="listitem">
      <i class="sw store" aria-hidden="true"></i> 储藏区
    </span>
  {/if}
  {#if showFurniture}
    <span class="plan-legend-item" role="listitem">
      <i class="sw furn" aria-hidden="true"></i> 家具
    </span>
  {/if}
  <span class="plan-legend-item" role="listitem">
    <svg class="sym" viewBox="0 0 28 16" aria-hidden="true">
      <line x1="2" y1="14" x2="26" y2="14" stroke="currentColor" stroke-width="2.5" />
    </svg>
    承重墙
  </span>
  <span class="plan-legend-item" role="listitem">
    <svg class="sym" viewBox="0 0 28 16" aria-hidden="true">
      <line x1="2" y1="14" x2="26" y2="14" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 2" />
    </svg>
    通道口
  </span>
  <span class="plan-legend-item" role="listitem">
    <svg class="sym" viewBox="0 0 28 16" aria-hidden="true">
      <path d="M4 14 L10 4 L14 14 M24 14 L18 4 L14 14" fill="none" stroke="currentColor" stroke-width="1.4" />
    </svg>
    双折门
  </span>
  <span class="plan-legend-item" role="listitem">
    <svg class="sym" viewBox="0 0 28 16" aria-hidden="true">
      <line x1="4" y1="14" x2="4" y2="2" stroke="currentColor" stroke-width="1.2" />
      <path d="M4 14 A10 10 0 0 0 14 8" fill="none" stroke="currentColor" stroke-width="1.2" />
    </svg>
    平开门
  </span>
</div>

<style>
  .plan-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    margin-top: 12px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t3);
  }

  .plan-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .sw {
    display: inline-block;
    width: 16px;
    height: 12px;
    border-radius: 2px;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .sw.store {
    background: repeating-linear-gradient(
      45deg,
      #dce4ec,
      #dce4ec 3px,
      #f4f7fa 3px,
      #f4f7fa 6px
    );
    border-color: var(--storage-accent);
  }

  .sw.furn {
    background: var(--plan-furn, #dfe3e8);
  }

  .sw.wall-edit {
    background: transparent;
    border: 2px solid rgba(92, 117, 140, 0.45);
    border-radius: 1px;
    height: 3px;
    width: 18px;
    align-self: center;
  }

  .sw.open-edit {
    background: rgba(92, 117, 140, 0.12);
    border: 1.5px dashed var(--accent);
  }

  .sw.grip-edit {
    background: rgba(92, 117, 140, 0.08);
    border: 1.5px dashed var(--accent);
    width: 10px;
  }

  .plan-legend-edit {
    color: var(--accent);
  }

  .sym {
    width: 28px;
    height: 16px;
    color: var(--t2);
    flex-shrink: 0;
  }
</style>
