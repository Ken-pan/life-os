<script>
  import {
    canRedoGraph,
    canUndoGraph,
    redoGraphEdit,
    removePlacement,
    rotatePlacementById,
    undoGraphEdit,
    updatePlacement,
  } from '$lib/state.svelte.js'

  /** @type {{
   *   placement: import('$lib/spatial/types.js').SpatialPlacement,
   *   compact?: boolean,
   *   onClear?: () => void,
   * }} */
  let { placement, compact = false, onClear } = $props()

  const undoAvailable = $derived(canUndoGraph())
  const redoAvailable = $derived(canRedoGraph())

  let detailsOpen = $state(false)
  let wDraft = $state('')
  let hDraft = $state('')

  $effect(() => {
    wDraft = String(Math.round(placement.w))
    hDraft = String(Math.round(placement.h))
    detailsOpen = false
  })

  function commitSize() {
    const w = Math.max(8, Math.round(Number(wDraft)))
    const h = Math.max(8, Math.round(Number(hDraft)))
    if (!Number.isFinite(w) || !Number.isFinite(h)) return
    if (w === placement.w && h === placement.h) return
    updatePlacement(placement.id, { w, h })
  }
</script>

<div
  class="graph-sel-bar"
  class:graph-sel-bar-compact={compact}
  class:graph-sel-bar-details={compact && detailsOpen}
  role="toolbar"
  aria-label="家具快捷操作"
>
  {#if compact}
    <span class="graph-sel-title graph-sel-title-compact">
      {placement.label} · {Math.round(placement.w)}″×{Math.round(placement.h)}″
    </span>
  {:else}
    <span class="graph-sel-title">{placement.label}</span>
  {/if}

  {#if !compact || detailsOpen}
    <div class="placement-size-fields">
      <label class="size-field">
        <span class="size-label">宽</span>
        <input
          type="number"
          class="size-input"
          min="8"
          step="1"
          bind:value={wDraft}
          onchange={commitSize}
          onkeydown={(e) => e.key === 'Enter' && commitSize()}
          aria-label="宽度英寸"
        />
      </label>
      <label class="size-field">
        <span class="size-label">深</span>
        <input
          type="number"
          class="size-input"
          min="8"
          step="1"
          bind:value={hDraft}
          onchange={commitSize}
          onkeydown={(e) => e.key === 'Enter' && commitSize()}
          aria-label="深度英寸"
        />
      </label>
    </div>
  {/if}

  <div class="graph-sel-actions">
    {#if compact}
      <button
        type="button"
        class="graph-sel-btn graph-sel-accent"
        aria-expanded={detailsOpen}
        onclick={() => (detailsOpen = !detailsOpen)}
      >
        {detailsOpen ? '收起' : '尺寸'}
      </button>
    {/if}
    <button
      type="button"
      class="graph-sel-btn graph-sel-accent"
      onclick={() => rotatePlacementById(placement.id)}
    >旋转 90°</button>
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
        removePlacement(placement.id)
        onClear?.()
      }}
    >删除</button>
    <button type="button" class="graph-sel-btn" onclick={() => onClear?.()} aria-label="取消选中">
      ×
    </button>
  </div>
</div>

<style>
  .graph-sel-bar {
    position: absolute;
    left: 50%;
    bottom: max(14px, var(--safe-bottom-effective));
    transform: translateX(-50%);
    z-index: 42;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    max-width: min(720px, calc(100% - 24px));
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
    white-space: nowrap;
  }

  .graph-sel-title-compact {
    max-width: min(160px, 38vw);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .placement-size-fields {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .size-field {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--t2);
  }

  .size-label {
    font-weight: 600;
    font-family: var(--mono);
  }

  .size-input {
    width: 56px;
    min-height: 36px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t1);
    font-family: var(--mono);
    font-size: 12px;
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
      left: max(12px, var(--safe-left-effective));
      right: max(12px, var(--safe-right-effective));
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

    .graph-sel-bar-details {
      flex-wrap: wrap;
      overflow-x: visible;
    }

    .graph-sel-bar::-webkit-scrollbar {
      display: none;
    }

    .graph-sel-bar-compact .graph-sel-actions {
      margin-left: auto;
      flex-wrap: nowrap;
      flex-shrink: 0;
    }

    .graph-sel-bar-details .placement-size-fields {
      order: 10;
      flex-basis: 100%;
      margin-top: 4px;
    }

    .graph-sel-btn {
      min-height: 44px;
      flex-shrink: 0;
    }

    .size-input {
      min-height: 44px;
      width: 64px;
    }
  }
</style>
