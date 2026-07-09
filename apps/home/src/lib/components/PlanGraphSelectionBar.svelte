<script>
  import {
    canRedoGraph,
    canUndoGraph,
    redoGraphEdit,
    removeGraphWall,
    undoGraphEdit,
  } from '$lib/state.svelte.js'

  /** @type {{
   *   selectedEdge?: string,
   *   compact?: boolean,
   *   onClear?: () => void,
   *   onOpenDetails?: () => void,
   *   onSplit?: () => void,
   * }} */
  let { selectedEdge = '', compact = false, onClear, onOpenDetails, onSplit } = $props()

  const undoAvailable = $derived(canUndoGraph())
  const redoAvailable = $derived(canRedoGraph())
</script>

{#if selectedEdge}
  <div
    class="graph-sel-bar"
    class:graph-sel-bar-compact={compact}
    role="toolbar"
    aria-label="墙段快捷操作"
  >
    {#if !compact}
      <span class="graph-sel-title">墙段 · {selectedEdge}</span>
    {/if}
    <div class="graph-sel-actions">
      <button
        type="button"
        class="graph-sel-btn"
        disabled={!undoAvailable}
        onclick={undoGraphEdit}
      >撤销</button>
      <button
        type="button"
        class="graph-sel-btn"
        disabled={!redoAvailable}
        onclick={redoGraphEdit}
      >重做</button>
      <button
        type="button"
        class="graph-sel-btn graph-sel-warn"
        onclick={() => {
          removeGraphWall(selectedEdge)
          onClear?.()
        }}
      >删除</button>
      <button
        type="button"
        class="graph-sel-btn graph-sel-accent"
        onclick={() => onSplit?.()}
      >分割</button>
      <button type="button" class="graph-sel-btn graph-sel-accent" onclick={() => onOpenDetails?.()}>
        详情
      </button>
      <button type="button" class="graph-sel-btn" onclick={() => onClear?.()} aria-label="取消选中">
        ×
      </button>
    </div>
  </div>
{/if}

<style>
  .graph-sel-bar {
    position: absolute;
    left: 50%;
    bottom: var(--stack-tight);
    transform: translateX(-50%);
    z-index: 42;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    max-width: min(640px, calc(100% - 2 * var(--stack-tight)));
    padding: 10px 14px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--graph-accent) 35%, var(--border));
    background: color-mix(in srgb, var(--card) 94%, transparent);
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.32);
  }

  .graph-sel-title {
    font-size: 13px;
    font-weight: 650;
    color: var(--graph-accent);
    font-family: var(--mono);
    white-space: nowrap;
  }

  .graph-sel-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    flex-wrap: wrap;
  }

  .graph-sel-btn {
    font-size: 12px;
    font-weight: 600;
    min-height: 36px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t2);
    cursor: pointer;
  }

  .graph-sel-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .graph-sel-warn {
    color: #b45309;
    border-color: color-mix(in srgb, #b45309 35%, var(--border));
  }

  .graph-sel-accent {
    color: var(--graph-accent);
    border-color: color-mix(in srgb, var(--graph-accent) 35%, var(--border));
  }

  @media (max-width: 599px) {
    .graph-sel-bar {
      left: 0;
      right: 0;
      transform: none;
      max-width: none;
      bottom: calc(
        var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 72px
      );
      padding: 8px 10px;
      flex-wrap: nowrap;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .graph-sel-bar::-webkit-scrollbar {
      display: none;
    }

    .graph-sel-bar-compact .graph-sel-actions {
      margin-left: 0;
      flex-wrap: nowrap;
      width: 100%;
    }

    .graph-sel-btn {
      min-height: 44px;
      flex-shrink: 0;
    }
  }
</style>
