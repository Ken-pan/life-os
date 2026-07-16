<script>
  import { confirmZone, removeZone, updateZone } from '$lib/state.svelte.js'
  import { ZONE_COLORS } from '$lib/spatial/zones.js'
  import { FLOOR_MATERIALS } from '$lib/spatial/floor-materials.js'

  /** @type {{
   *   zone: import('$lib/spatial/types.js').SpatialZone,
   *   compact?: boolean,
   *   onClear?: () => void,
   * }} */
  let { zone, compact = false, onClear } = $props()

  let nameDraft = $state('')
  let detailsOpen = $state(false)

  $effect(() => {
    nameDraft = zone.nameZh
    detailsOpen = false
  })

  function commitName() {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== zone.nameZh) {
      updateZone(zone.id, { nameZh: trimmed })
    }
  }
</script>

<div
  class="graph-sel-bar"
  class:graph-sel-bar-compact={compact}
  class:graph-sel-bar-details={compact && detailsOpen}
  role="toolbar"
  aria-label="分区快捷操作"
>
  {#if compact}
    <span class="graph-sel-title graph-sel-title-compact">
      <i class="zone-color-dot" style:background={zone.color} aria-hidden="true"></i>
      {zone.nameZh}{zone.stale ? ' · 需核对' : ''}
    </span>
  {:else}
    <span class="graph-sel-title">
      {zone.nameZh}{zone.stale ? ' · 需核对' : ''}
    </span>
  {/if}

  {#if !compact || detailsOpen}
    <div class="zone-edit-fields">
      <input
        type="text"
        class="zone-name-input"
        bind:value={nameDraft}
        onchange={commitName}
        onkeydown={(e) => e.key === 'Enter' && commitName()}
        aria-label="分区名称"
      />
      <div class="zone-colors" role="group" aria-label="分区颜色">
        {#each ZONE_COLORS.slice(0, 5) as color (color)}
          <button
            type="button"
            class="zone-color-swatch"
            class:active={zone.color === color}
            style:background={color}
            aria-label="颜色 {color}"
            onclick={() => updateZone(zone.id, { color })}
          ></button>
        {/each}
      </div>
      <!-- 地板材质给真实贴图模式用(浏览态可见);「自动」= 按分区名推断。 -->
      <select
        class="zone-floor-select"
        aria-label="地板材质"
        value={zone.floor ?? ''}
        onchange={(e) => {
          const v = e.currentTarget.value
          updateZone(zone.id, {
            floor: v === '' ? undefined : /** @type {any} */ (v),
          })
        }}
      >
        <option value="">地板:自动</option>
        {#each FLOOR_MATERIALS as m (m.value)}
          <option value={m.value}>地板:{m.label}</option>
        {/each}
      </select>
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
        {detailsOpen ? '收起' : '编辑'}
      </button>
    {/if}
    {#if zone.stale}
      <button
        type="button"
        class="graph-sel-btn graph-sel-accent"
        onclick={() => confirmZone(zone.id)}
      >确认</button>
    {/if}
    <button
      type="button"
      class="graph-sel-btn graph-sel-warn"
      onclick={() => {
        removeZone(zone.id)
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
    bottom: var(--stack-tight);
    transform: translateX(-50%);
    z-index: 42;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    max-width: min(720px, calc(100% - 2 * var(--stack-tight)));
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: min(140px, 36vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .zone-color-dot {
    width: 12px;
    height: 12px;
    border-radius: 4px;
    border: 1.5px solid rgba(255, 255, 255, 0.85);
    flex-shrink: 0;
  }

  .zone-edit-fields {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    width: 100%;
  }

  .graph-sel-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    flex-wrap: wrap;
  }

  .zone-name-input {
    font-size: 12px;
    min-height: 36px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t1);
    min-width: 100px;
    flex: 1 1 120px;
  }

  .zone-colors {
    display: inline-flex;
    gap: 4px;
  }

  .zone-floor-select {
    font-size: 12px;
    min-height: 36px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t2);
    cursor: pointer;
  }

  .zone-color-swatch {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }

  .zone-color-swatch.active {
    border-color: var(--graph-accent);
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

    .graph-sel-bar-details .zone-edit-fields {
      order: 10;
      flex-basis: 100%;
      margin-top: 4px;
    }

    .graph-sel-btn {
      min-height: 44px;
      flex-shrink: 0;
    }

    .zone-color-swatch {
      width: 28px;
      height: 28px;
    }
  }
</style>
