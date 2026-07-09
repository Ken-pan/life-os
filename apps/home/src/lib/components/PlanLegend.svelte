<script>
  /** @type {{ interactive?: boolean, editMode?: boolean, graphEditMode?: boolean, zoneEditMode?: boolean, placeEditMode?: boolean, overlay?: boolean }} */
  let {
    interactive = false,
    editMode = false,
    graphEditMode = false,
    zoneEditMode = false,
    placeEditMode = false,
    overlay = false,
  } = $props()

  let expanded = $state(false)
</script>

<div class="plan-legend-wrap" class:overlay>
  <button
    type="button"
    class="legend-toggle"
    aria-expanded={expanded}
    aria-controls="plan-legend-body"
    onclick={() => (expanded = !expanded)}
  >
    {expanded ? '收起图例' : '图例'}
  </button>

  {#if !overlay || expanded}
    <div
      id="plan-legend-body"
      class="plan-legend"
      role="list"
      aria-label="平面图图例"
    >
      <span class="plan-legend-item" role="listitem">
        <i class="sw room" aria-hidden="true"></i> 房间区域（浅色底）
      </span>
      <span class="plan-legend-item" role="listitem">
        <i class="sw store" aria-hidden="true"></i>
        {#if interactive}
          斜线区 = 储藏区（悬停见名称 · 点击进清单）
        {:else}
          斜线区 = 储藏区 S1–S8
        {/if}
      </span>
      <span class="plan-legend-item" role="listitem">
        <svg class="sym sym-wall" viewBox="0 0 28 16" aria-hidden="true">
          <line
            x1="2"
            y1="14"
            x2="26"
            y2="14"
            stroke="currentColor"
            stroke-width="3.5"
          />
        </svg>
        粗实线 = 承重墙/隔墙
      </span>
      {#if graphEditMode}
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw wall-graph" aria-hidden="true"></i> 墙段（选中后可删）
        </span>
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw chain-edit" aria-hidden="true"></i> 绿色虚线 = 建墙预览
        </span>
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw vert-edit" aria-hidden="true"></i> 绿点 = 墙顶点（拖曳改形）
        </span>
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw graph-open-hit" aria-hidden="true"></i> 虚线框 = 门窗选中区
        </span>
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw graph-grip" aria-hidden="true"></i> 端点圆点 = 改宽握把
        </span>
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw delete-hint" aria-hidden="true"></i> Delete 删除门窗/墙段
        </span>
      {:else if zoneEditMode}
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw wall-graph" aria-hidden="true"></i> 分区填充（淡色多边形）
        </span>
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw chain-edit" aria-hidden="true"></i> 绿色虚线 = 画区预览
        </span>
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw delete-hint" aria-hidden="true"></i> 橙色虚线 = 需核对（改墙后）
        </span>
      {:else if placeEditMode}
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw placement" aria-hidden="true"></i> 矩形 = 家具放置
        </span>
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw store" aria-hidden="true"></i> 标储藏 = 指派 S1–S8
        </span>
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw delete-hint" aria-hidden="true"></i> Delete 删除选中家具
        </span>
      {:else if editMode}
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw wall-edit" aria-hidden="true"></i> 内墙线（拖曳改尺寸）
        </span>
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw open-edit" aria-hidden="true"></i> 门窗（拖曳改位置）
        </span>
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw grip-edit" aria-hidden="true"></i> 虚线框 = 门宽握把
        </span>
        <span class="plan-legend-item plan-legend-edit" role="listitem">
          <i class="sw delete-hint" aria-hidden="true"></i> Delete 仅隐藏门窗
        </span>
      {:else if interactive}
        <span class="plan-legend-item" role="listitem">
          <i class="sw zone-dot" aria-hidden="true"></i> 圆点 S1–S8 = 储藏入口
        </span>
      {/if}
      {#if !graphEditMode && !zoneEditMode && !placeEditMode && !editMode}
        <span class="plan-legend-item" role="listitem">
          <i class="sw gap" aria-hidden="true"></i> 浅色宽条 = 墙上门洞
        </span>
        <span class="plan-legend-item" role="listitem">
          <svg class="sym" viewBox="0 0 28 16" aria-hidden="true">
            <line
              x1="2"
              y1="14"
              x2="26"
              y2="14"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-dasharray="3 2"
            />
          </svg>
          通道口
        </span>
        <span class="plan-legend-item" role="listitem">
          <svg class="sym" viewBox="0 0 28 16" aria-hidden="true">
            <path
              d="M4 6 L24 6 M4 10 L24 10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
            />
          </svg>
          推拉门
        </span>
        <span class="plan-legend-item" role="listitem">
          <svg class="sym" viewBox="0 0 28 16" aria-hidden="true">
            <line
              x1="4"
              y1="14"
              x2="4"
              y2="2"
              stroke="currentColor"
              stroke-width="1.2"
            />
            <path
              d="M4 14 A10 10 0 0 0 14 8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
            />
          </svg>
          平开门
        </span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .plan-legend-wrap {
    margin-top: 12px;
  }

  .plan-legend-wrap.overlay {
    position: absolute;
    left: var(--space-2);
    bottom: var(--space-2);
    z-index: 3;
    margin-top: 0;
    max-width: min(520px, calc(100% - 120px));
    pointer-events: none;
  }

  .plan-legend-wrap.overlay .legend-toggle,
  .plan-legend-wrap.overlay .plan-legend {
    pointer-events: auto;
  }

  .legend-toggle {
    min-height: 32px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--card) 92%, transparent);
    backdrop-filter: blur(8px);
    color: var(--t2);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 650;
    cursor: pointer;
    box-shadow: 0 6px 18px -10px rgba(0, 0, 0, 0.35);
  }

  .plan-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-top: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
    background: color-mix(in srgb, var(--card) 90%, transparent);
    backdrop-filter: blur(8px);
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t3);
    box-shadow: 0 8px 24px -12px rgba(0, 0, 0, 0.35);
  }

  .plan-legend-wrap:not(.overlay) .plan-legend {
    margin-top: 0;
    padding: 0;
    border: none;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
  }

  .plan-legend-wrap:not(.overlay) .legend-toggle {
    display: none;
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

  .sw.room {
    background: var(--plan-room, #e8edf1);
    border-color: var(--plan-room-stroke, #cdd4da);
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

  .sw.wall-graph {
    background: transparent;
    border: 2px solid color-mix(in srgb, var(--graph-accent) 55%, transparent);
    border-radius: 1px;
    height: 3px;
    width: 18px;
    align-self: center;
  }

  .sw.chain-edit {
    background: transparent;
    border: none;
    border-top: 2px dashed var(--graph-accent);
    border-radius: 0;
    height: 0;
    width: 18px;
    align-self: center;
  }

  .sw.vert-edit {
    background: var(--graph-accent);
    border: 1.5px solid #fff;
    border-radius: 999px;
    width: 10px;
    height: 10px;
    align-self: center;
  }

  .sw.graph-open-hit {
    background: var(--graph-accent-muted);
    border: 1.5px dashed var(--graph-accent);
  }

  .sw.graph-grip {
    background: var(--graph-accent);
    border: 1.5px solid #fff;
    border-radius: 999px;
    width: 8px;
    height: 8px;
    align-self: center;
  }

  .sw.delete-hint {
    background: rgba(180, 83, 9, 0.12);
    border: 1.5px dashed #b45309;
  }

  .sw.placement {
    background: color-mix(in srgb, var(--graph-accent) 18%, var(--bg));
    border: 1.5px solid color-mix(in srgb, var(--graph-accent) 45%, var(--border));
  }

  .sw.zone-dot {
    background: var(--plan-accent, #5c758c);
    border: 1.5px solid #fff;
    border-radius: 999px;
    width: 12px;
    height: 12px;
  }

  .sw.gap {
    background: var(--plan-paper, #eef1f4);
    border: 2px solid var(--plan-wall, #20242b);
    height: 4px;
    width: 18px;
    align-self: center;
  }

  .plan-legend-edit {
    color: var(--accent);
  }

  .sym-wall {
    color: var(--plan-wall, #20242b);
  }

  .sym {
    width: 28px;
    height: 16px;
    color: var(--t2);
    flex-shrink: 0;
  }
  @media (max-width: 599px) {
    .legend-toggle {
      min-height: 44px;
      min-width: 44px;
      padding: 8px 14px;
    }
  }
</style>
