<script>
  import { renderFloorPlanSvg } from '$lib/spatial/render-svg.js'
  import { planPanZoom } from '$lib/plan-pan-zoom.js'
  import { bindPlanEditDrag } from '$lib/plan-edit-drag.js'
  import { hydrateProject } from '$lib/spatial/model.js'
  import {
    commitLayoutDrag,
    previewLayoutDrag,
    setLayoutDragPreview,
  } from '$lib/state.svelte.js'
  import { describeDragEdit, dragLabelAnchor, RESIZE_GRIP_HIT } from '$lib/spatial/wall-edit.js'
  import { snapDeltaPx } from '$lib/spatial/dimensions.js'

  /** @type {{
   *   project: import('$lib/spatial/types.js').SpatialProject,
   *   highlightZone?: string,
   *   compact?: boolean,
   *   zoomable?: boolean,
   *   editMode?: boolean,
   *   hideFurniture?: boolean,
   *   selectedWall?: string,
   *   selectedOpening?: string,
   *   onZoneSelect?: (code: string) => void,
   *   onSelectWall?: (id: string) => void,
   *   onSelectOpening?: (id: string) => void,
   * }} */
  let {
    project,
    highlightZone = '',
    compact = false,
    zoomable = true,
    editMode = false,
    hideFurniture = false,
    selectedWall = '',
    selectedOpening = '',
    onZoneSelect,
    onSelectWall,
    onSelectOpening,
  } = $props()

  let zoom = $state(1)
  let panX = $state(0)
  let panY = $state(0)
  /** @type {HTMLElement | null} */
  let viewportEl = $state(null)
  /** @type {import('$lib/spatial/types.js').Layout508Config | null} */
  let dragBaseConfig = $state(null)

  /** @type {import('$lib/spatial/types.js').SpatialProject | null} */
  let previewProject = $state(null)

  const displayProject = $derived(previewProject ?? project)

  /** @type {{ valid: boolean, title: string, detail: string, delta: string, gridSnapped: boolean } | null} */
  let dragHint = $state(null)
  let dragHudX = $state(0)
  let dragHudY = $state(0)
  let dragActive = $state(false)
  /** @type {{ x: number, y: number } | null} */
  let snapFlash = $state(null)
  let rafId = 0
  /** @type {{ sel: import('$lib/plan-edit-drag.js').EditDragSelection, deltaPx: number, clientX: number, clientY: number } | null} */
  let dragPending = null
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let snapFlashTimer

  const dragOverlay = $derived.by(() => {
    if (!dragHint || !dragActive || !displayProject || !dragPending) return null
    const anchor = dragLabelAnchor(
      displayProject,
      dragPending.sel.kind,
      dragPending.sel.id,
    )
    if (!anchor) return null
    return {
      x: anchor.x,
      y: anchor.y,
      anchorX: anchor.anchorX,
      anchorY: anchor.anchorY,
      text: dragHint.detail,
      subtext: dragHint.delta,
      valid: dragHint.valid,
    }
  })

  const dragBlockedWall = $derived.by(() => {
    if (!dragHint || dragHint.valid || !dragActive || !dragPending) return ''
    return dragPending.sel.kind === 'wall' ? dragPending.sel.id : ''
  })

  const dragBlockedOpening = $derived.by(() => {
    if (!dragHint || dragHint.valid || !dragActive || !dragPending) return ''
    return dragPending.sel.kind === 'opening' ? dragPending.sel.id : ''
  })

  const touchScale = $derived.by(() => {
    if (!editMode || !viewportEl) return 1
    const vbW = displayProject.viewport.width
    const canvasW = Math.max(viewportEl.clientWidth - 24, 120)
    if (!vbW) return 1
    const vbPerScreenPx = vbW / canvasW / Math.max(zoom, 0.55)
    return Math.max(1, (44 * vbPerScreenPx) / RESIZE_GRIP_HIT)
  })

  const svgHtml = $derived(
    renderFloorPlanSvg(displayProject, {
      interactive: Boolean(onZoneSelect) && !editMode,
      highlightZone,
      compact,
      editMode,
      hideFurniture,
      selectedWall,
      selectedOpening,
      dragOverlay,
      dragBlockedWall,
      dragBlockedOpening,
      dragDimmed: dragActive,
      touchScale,
    }),
  )

  const canvasStyle = $derived(
    `transform: translate(${panX}px, ${panY}px) scale(${zoom}); transform-origin: top center;`,
  )

  function updateHudPos(clientX, clientY) {
    if (!viewportEl) return
    const r = viewportEl.getBoundingClientRect()
    dragHudX = Math.min(Math.max(clientX - r.left, 8), r.width - 8)
    dragHudY = Math.min(Math.max(clientY - r.top, 8), r.height - 8)
  }

  /** @param {MouseEvent} e */
  function handleClick(e) {
    if (editMode || !onZoneSelect) return
    if (viewportEl?.dataset.dragged === '1') {
      delete viewportEl.dataset.dragged
      return
    }
    const target = /** @type {SVGElement | null} */ (
      e.target instanceof Element ? e.target.closest('[data-zone]') : null
    )
    const code = target?.getAttribute('data-zone')
    if (code) onZoneSelect(code)
  }

  function zoomIn() {
    zoom = Math.min(2.5, Math.round((zoom + 0.15) * 100) / 100)
  }

  function zoomOut() {
    zoom = Math.max(0.55, Math.round((zoom - 0.15) * 100) / 100)
  }

  function resetView() {
    zoom = 1
    panX = 0
    panY = 0
  }

  /** @param {import('$lib/spatial/types.js').Layout508Config} config */
  function cloneLayoutConfig(config) {
    return JSON.parse(JSON.stringify(config))
  }

  $effect(() => {
    const el = viewportEl
    if (!zoomable || !el) return
    const action = planPanZoom(el, {
      getScale: () => zoom,
      setScale: (n) => {
        zoom = n
      },
      getPan: () => ({ x: panX, y: panY }),
      setPan: (p) => {
        panX = p.x
        panY = p.y
      },
    })
    return () => action.destroy()
  })

  $effect(() => {
    const el = viewportEl
    if (!editMode || !el) return

    const action = bindPlanEditDrag(el, {
      getZoom: () => zoom,
      onDragStart: () => {
        dragBaseConfig = project.layoutConfig
          ? cloneLayoutConfig(project.layoutConfig)
          : null
        dragActive = true
      },
      onSelect: (sel) => {
        if (!sel) return
        if (sel.kind === 'wall') onSelectWall?.(sel.id)
        else onSelectOpening?.(sel.id)
      },
      onPreview: (sel, deltaPx, clientX, clientY) => {
        dragPending = { sel, deltaPx, clientX, clientY }
        updateHudPos(clientX, clientY)
        if (rafId) return
        rafId = requestAnimationFrame(() => {
          rafId = 0
          const p = dragPending
          if (!p || !dragBaseConfig) return
          const snapped = snapDeltaPx(p.deltaPx, dragBaseConfig.pxPerFt)
          const mode =
            p.sel.kind === 'opening' ? (p.sel.mode ?? 'move') : 'move'
          dragHint = describeDragEdit(
            dragBaseConfig,
            p.sel.kind,
            p.sel.id,
            snapped,
            mode,
          )
          const next = previewLayoutDrag(
            dragBaseConfig,
            p.sel.kind,
            p.sel.id,
            snapped,
            mode,
          )
          setLayoutDragPreview(next)
          previewProject = next
            ? hydrateProject({
                meta: project.meta,
                layoutConfig: next,
                storageZones: project.storageZones,
                furnitureInventory: project.furnitureInventory,
              })
            : null
        })
      },
      onCommit: (sel, deltaPx) => {
        const base = dragBaseConfig ?? project.layoutConfig
        const hudX = dragHudX
        const hudY = dragHudY
        dragPending = null
        dragHint = null
        dragActive = false
        previewProject = null
        dragBaseConfig = null
        setLayoutDragPreview(null)
        if (rafId) {
          cancelAnimationFrame(rafId)
          rafId = 0
        }
        if (!base) return
        const rawSnapped = deltaPx
        const snapped = snapDeltaPx(deltaPx, base.pxPerFt)
        const mode = sel.kind === 'opening' ? (sel.mode ?? 'move') : 'move'
        if (!previewLayoutDrag(base, sel.kind, sel.id, snapped, mode)) return
        if (
          commitLayoutDrag(sel.kind, sel.id, snapped, {
            silent: false,
            dragMode: mode,
          })
        ) {
          if (Math.abs(rawSnapped - snapped) > 0.01) {
            snapFlash = { x: hudX, y: hudY }
            clearTimeout(snapFlashTimer)
            snapFlashTimer = setTimeout(() => {
              snapFlash = null
            }, 720)
          }
        }
      },
      onDragEnd: () => {
        dragPending = null
        dragHint = null
        dragActive = false
        previewProject = null
        dragBaseConfig = null
        setLayoutDragPreview(null)
        if (rafId) {
          cancelAnimationFrame(rafId)
          rafId = 0
        }
      },
    })
    return () => action.destroy()
  })
</script>

<div class="plan-shell" class:compact class:edit-mode={editMode}>
  {#if zoomable}
    <div class="plan-toolbar" aria-label="平面图缩放">
      <button
        type="button"
        class="plan-tool"
        onclick={zoomOut}
        aria-label="缩小">−</button
      >
      <span class="plan-zoom-pct">{Math.round(zoom * 100)}%</span>
      <button type="button" class="plan-tool" onclick={zoomIn} aria-label="放大"
        >+</button
      >
      <button type="button" class="plan-tool plan-tool-text" onclick={resetView}
        >适配</button
      >
      {#if editMode}
        <span class="plan-hint plan-hint-edit">空白处平移 · 捏合/⌘ 滚轮缩放</span>
      {:else if !compact}
        <span class="plan-hint">双指捏合缩放 · 拖拽平移</span>
      {/if}
    </div>
  {/if}

  <div
    class="plan-viewer"
    class:compact
    class:edit-mode={editMode}
    bind:this={viewportEl}
    role={onZoneSelect && !editMode ? 'group' : undefined}
    aria-label={editMode
      ? '户型编辑画布'
      : onZoneSelect
        ? '平面图储藏区选择'
        : '顶视平面图'}
    onclick={handleClick}
    onkeydown={() => {}}
  >
    <div class="plan-canvas" style={canvasStyle}>
      {@html svgHtml}
    </div>
    {#if dragHint && dragActive}
      <div
        class="drag-hud"
        class:invalid={!dragHint.valid}
        style="left: {dragHudX}px; top: {dragHudY}px"
        role="status"
        aria-live="polite"
      >
        <span class="drag-hud-title">{dragHint.title}</span>
        {#if dragHint.valid}
          <span class="drag-hud-detail">{dragHint.delta}</span>
        {:else}
          <span class="drag-hud-detail">{dragHint.detail}</span>
        {/if}
        {#if dragHint.gridSnapped}
          <span class="drag-hud-snap">⊞ 1″ 网格</span>
        {/if}
      </div>
    {/if}
    {#if snapFlash}
      <div
        class="snap-flash"
        style="left: {snapFlash.x}px; top: {snapFlash.y}px"
        role="status"
        aria-live="polite"
      >
        ⊞ 1″
      </div>
    {/if}
  </div>
</div>

<style>
  .plan-shell {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .plan-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 8px;
    align-self: flex-end;
  }

  .plan-tool {
    min-width: 36px;
    min-height: 36px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t1);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
  }

  .plan-tool-text {
    font-size: 12px;
    font-weight: 600;
    padding: 0 10px;
  }

  .plan-zoom-pct {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t3);
    min-width: 40px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .plan-hint {
    font-size: 11px;
    color: var(--t3);
    font-family: var(--mono);
  }

  .plan-hint-edit {
    color: var(--accent);
  }

  .plan-viewer {
    position: relative;
    background: var(--plan-paper, #eef1f4);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 12px);
    padding: 12px;
    overflow: hidden;
    box-shadow: 0 12px 32px -16px rgba(0, 0, 0, 0.25);
    touch-action: none;
    cursor: grab;
  }

  .plan-tool:focus-visible,
  .plan-viewer:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .plan-viewer.edit-mode {
    cursor: default;
    border-color: var(--accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  }

  .plan-viewer:active:not(.edit-mode) {
    cursor: grabbing;
  }

  .plan-canvas {
    width: 100%;
    margin: 0 auto;
    will-change: transform;
  }

  .plan-viewer :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    min-width: 0;
    max-width: 100%;
    margin: 0 auto;
  }

  .plan-viewer.compact {
    min-height: 200px;
    max-height: none;
  }

  .plan-shell.compact .plan-toolbar {
    align-self: stretch;
    justify-content: flex-end;
  }

  .drag-hud {
    position: absolute;
    z-index: 4;
    transform: translate(-50%, calc(-100% - 12px));
    pointer-events: none;
    min-width: 120px;
    max-width: 220px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
    background: color-mix(in srgb, var(--card) 92%, transparent);
    backdrop-filter: blur(8px);
    box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.28);
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-family: var(--mono);
  }

  .drag-hud.invalid {
    border-color: color-mix(in srgb, #b45309 55%, var(--border));
    background: color-mix(in srgb, #fff7ed 88%, var(--card));
  }

  .drag-hud-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
  }

  .drag-hud.invalid .drag-hud-title {
    color: #b45309;
  }

  .drag-hud-detail {
    font-size: 12px;
    font-weight: 600;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }

  .drag-hud-snap {
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    margin-top: 2px;
  }

  .drag-hud.invalid .drag-hud-snap {
    color: #b45309;
  }

  .snap-flash {
    position: absolute;
    z-index: 5;
    transform: translate(-50%, -50%);
    pointer-events: none;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 2px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--accent);
    animation: snap-flash-pop 0.72s ease-out forwards;
  }

  @keyframes snap-flash-pop {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.55);
    }
    18% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(1.15);
    }
  }
</style>
