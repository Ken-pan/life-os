<script>
  import {
    flipGraphOpeningDirection,
    getActiveProject,
    removeGraphOpening,
    toggleGraphOpeningKind,
  } from '$lib/state.svelte.js'
  import { formatFtIn } from '$lib/spatial/dimensions.js'

  /** @type {{
   *   selectedOpening?: string,
   *   compact?: boolean,
   *   onClear?: () => void,
   * }} */
  let { selectedOpening = '', compact = false, onClear } = $props()

  const project = $derived(getActiveProject())
  const opening = $derived(
    (project.graphOpenings ?? []).find((o) => o.id === selectedOpening) ?? null,
  )

  /** @param {number} spanIn */
  function spanLabel(spanIn) {
    const ft = Math.floor(spanIn / 12)
    const inch = Math.round(spanIn % 12)
    return formatFtIn({ ft, in: inch })
  }

  const title = $derived.by(() => {
    if (!opening) return ''
    const kind = opening.type === 'window' ? '窗' : '门'
    return `${kind} · ${spanLabel(opening.spanIn)}`
  })
</script>

{#if opening && title}
  <div
    class="graph-open-bar"
    class:graph-open-bar-compact={compact}
    role="toolbar"
    aria-label="门窗快捷操作"
    title={opening.id}
  >
    {#if compact}
      <span class="graph-open-title graph-open-title-compact">{title}</span>
    {:else}
      <span class="graph-open-title">{title}</span>
    {/if}
    <div class="graph-open-actions">
      <button
        type="button"
        class="graph-open-btn graph-open-accent"
        onclick={() => toggleGraphOpeningKind(opening.id)}
      >
        {opening.type === 'door' ? '改窗' : '改门'}
      </button>
      {#if opening.type === 'door'}
        <button
          type="button"
          class="graph-open-btn"
          onclick={() => flipGraphOpeningDirection(opening.id)}
        >
          翻转
        </button>
      {/if}
      <button
        type="button"
        class="graph-open-btn graph-open-warn"
        onclick={() => {
          removeGraphOpening(opening.id)
          onClear?.()
        }}
      >
        删除
      </button>
      <button type="button" class="graph-open-btn" onclick={() => onClear?.()} aria-label="取消选中">
        ×
      </button>
    </div>
  </div>
{/if}

<style>
  .graph-open-bar {
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

  .graph-open-title {
    font-size: 13px;
    font-weight: 650;
    color: var(--graph-accent);
    font-family: var(--mono);
    white-space: nowrap;
  }

  .graph-open-title-compact {
    font-size: 12px;
    max-width: min(120px, 32vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .graph-open-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    flex-wrap: wrap;
  }

  .graph-open-btn {
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

  .graph-open-warn {
    color: #b45309;
    border-color: color-mix(in srgb, #b45309 35%, var(--border));
  }

  .graph-open-accent {
    color: var(--graph-accent);
    border-color: color-mix(in srgb, var(--graph-accent) 35%, var(--border));
  }

  @media (max-width: 599px) {
    .graph-open-bar {
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

    .graph-open-bar::-webkit-scrollbar {
      display: none;
    }

    .graph-open-bar-compact .graph-open-actions {
      margin-left: auto;
      flex-wrap: nowrap;
      flex-shrink: 0;
    }

    .graph-open-btn {
      min-height: 44px;
      flex-shrink: 0;
    }
  }
</style>
