<script>
  import { browser } from '$app/environment'
  import { renderFloorPlanSvg } from '$lib/spatial/render-svg.js'
  import { planPanZoom } from '$lib/plan-pan-zoom.js'
  import { bindPlanEditDrag } from '$lib/plan-edit-drag.js'
  import { bindPlanGraphEdit } from '$lib/plan-graph-edit.js'
  import { hydrateProject } from '$lib/spatial/model.js'
  import {
    commitLayoutDrag,
    previewLayoutDrag,
    setLayoutDragPreview,
  } from '$lib/state.svelte.js'
  import {
    describeDragEdit,
    dragLabelAnchor,
    RESIZE_GRIP_HIT,
  } from '$lib/spatial/wall-edit.js'
  import { snapDeltaPx } from '$lib/spatial/dimensions.js'
  import {
    clampPlanZoom,
    clientToSvgPoint,
    computePlanFit,
    getViewportContentBox,
    panForZoomAtPoint,
  } from '$lib/plan-viewport.js'
  import { bindPlanSvgTooltip } from '$lib/plan-svg-tooltip.js'

  /** @type {{
   *   project: import('$lib/spatial/types.js').SpatialProject,
   *   highlightZone?: string,
   *   compact?: boolean,
   *   zoomable?: boolean,
   *   canvasPriority?: boolean,
   *   editMode?: boolean,
   *   measureMode?: boolean,
   *   graphEditMode?: boolean,
   *   graphTool?: import('$lib/plan-graph-edit.js').GraphTool,
   *   hideFurniture?: boolean,
   *   selectedWall?: string,
   *   selectedOpening?: string,
   *   selectedEdge?: string,
   *   wallChainFrom?: { x: number, y: number } | null,
   *   wallChainHover?: { x: number, y: number } | null,
   *   measurePoints?: { a: { x: number, y: number } | null, b: { x: number, y: number } | null },
   *   fitRequest?: { token: number, cycle?: boolean, mode?: 'contain' | 'width' },
   *   onZoneSelect?: (code: string) => void,
   *   onClearSelection?: () => void,
   *   onBlankContextMenu?: (pt: { x: number, y: number, svgX: number, svgY: number }) => void,
   *   onSelectWall?: (id: string) => void,
   *   onSelectOpening?: (id: string) => void,
   *   onMeasurePoint?: (pt: { x: number, y: number }) => void,
   *   onGraphWallPoint?: (pt: { x: number, y: number }) => void,
   *   onGraphRemoveEdge?: (edgeId: string) => void,
   *   onGraphSelectEdge?: (edgeId: string) => void,
   *   onGraphHover?: (pt: { x: number, y: number } | null) => void,
   * }} */
  let {
    project,
    highlightZone = '',
    compact = false,
    zoomable = true,
    canvasPriority = false,
    editMode = false,
    measureMode = false,
    graphEditMode = false,
    graphTool = 'select',
    hideFurniture = true,
    selectedWall = '',
    selectedOpening = '',
    selectedEdge = '',
    wallChainFrom = null,
    wallChainHover = null,
    measurePoints = { a: null, b: null },
    fitRequest = { token: 0, cycle: false },
    onZoneSelect,
    onClearSelection,
    onBlankContextMenu,
    onSelectWall,
    onSelectOpening,
    onMeasurePoint,
    onGraphWallPoint,
    onGraphRemoveEdge,
    onGraphSelectEdge,
    onGraphHover,
  } = $props()

  let zoom = $state(1)
  let panX = $state(0)
  let panY = $state(0)
  /** @type {'contain' | 'width'} */
  let fitMode = $state('contain')
  let fitRaf = 0
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
    return Math.max(1.15, (52 * vbPerScreenPx) / RESIZE_GRIP_HIT)
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
      measure: measureMode ? measurePoints : undefined,
      graphEditMode,
      selectedEdge,
      wallChainFrom,
      wallChainHover,
    }),
  )

  const canvasStyle = $derived(
    `transform: translate(${panX}px, ${panY}px) scale(${zoom}); transform-origin: 0 0;`,
  )

  function getPlanSvg() {
    const el = viewportEl?.querySelector('.floor-plan-svg')
    return el instanceof SVGElement ? el : null
  }

  function applyZoomAt(clientX, clientY, nextZoom) {
    if (!viewportEl) {
      zoom = clampPlanZoom(nextZoom)
      return
    }
    const next = clampPlanZoom(nextZoom)
    const p = panForZoomAtPoint({
      viewportEl,
      focalClientX: clientX,
      focalClientY: clientY,
      panX,
      panY,
      zoom,
      nextZoom: next,
    })
    zoom = p.zoom
    panX = p.panX
    panY = p.panY
  }

  function scheduleFit() {
    if (!browser) return
    cancelAnimationFrame(fitRaf)
    fitRaf = requestAnimationFrame(() => {
      fitRaf = requestAnimationFrame(() => fitToView())
    })
  }

  function updateHudPos(clientX, clientY) {
    if (!viewportEl) return
    const r = viewportEl.getBoundingClientRect()
    dragHudX = Math.min(Math.max(clientX - r.left, 8), r.width - 8)
    dragHudY = Math.min(Math.max(clientY - r.top, 8), r.height - 8)
  }

  function clientToSvg(clientX, clientY) {
    return clientToSvgPoint(getPlanSvg(), clientX, clientY) ?? { x: 0, y: 0 }
  }

  /** @param {MouseEvent} e */
  function handleContextMenu(e) {
    if (!onBlankContextMenu) return
    const blocked =
      e.target instanceof Element &&
      e.target.closest(
        '[data-wall-id],[data-opening-id],[data-zone],[data-edge-id],[data-drag-mode]',
      )
    if (blocked) return
    e.preventDefault()
    const svgPt = clientToSvg(e.clientX, e.clientY)
    onBlankContextMenu({
      x: e.clientX,
      y: e.clientY,
      svgX: svgPt.x,
      svgY: svgPt.y,
    })
  }

  /** @param {PointerEvent} e */
  function handleLongPress(e) {
    if (!onBlankContextMenu) return
    if (
      e.target instanceof Element &&
      e.target.closest(
        '[data-wall-id],[data-opening-id],[data-zone],[data-edge-id],[data-drag-mode]',
      )
    ) {
      return
    }
    const svgPt = clientToSvg(e.clientX, e.clientY)
    onBlankContextMenu({
      x: e.clientX,
      y: e.clientY,
      svgX: svgPt.x,
      svgY: svgPt.y,
    })
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (
      (e.key === 'Enter' || e.key === ' ') &&
      onZoneSelect &&
      !editMode &&
      !measureMode &&
      !graphEditMode
    ) {
      const hit =
        e.target instanceof Element ? e.target.closest('[data-zone]') : null
      const code = hit?.getAttribute('data-zone')
      if (code) {
        e.preventDefault()
        onZoneSelect(code)
      }
    }
  }

  /** @param {MouseEvent} e */
  function handleClick(e) {
    if (graphEditMode) return
    if (measureMode && onMeasurePoint && viewportEl) {
      if (viewportEl.dataset.dragged === '1') {
        delete viewportEl.dataset.dragged
        return
      }
      const pt = clientToSvg(e.clientX, e.clientY)
      onMeasurePoint(pt)
      return
    }
    if (editMode) {
      if (viewportEl?.dataset.dragged === '1') {
        delete viewportEl.dataset.dragged
        return
      }
      const hit =
        e.target instanceof Element
          ? e.target.closest(
              '[data-wall-id],[data-opening-id],[data-drag-mode]',
            )
          : null
      if (!hit) onClearSelection?.()
      return
    }
    if (!onZoneSelect) return
    const target = /** @type {SVGElement | null} */ (
      e.target instanceof Element ? e.target.closest('[data-zone]') : null
    )
    const code = target?.getAttribute('data-zone')
    if (viewportEl?.dataset.dragged === '1') {
      delete viewportEl.dataset.dragged
      if (!code) return
    }
    if (code) onZoneSelect(code)
  }

  function zoomIn() {
    if (!viewportEl) {
      zoom = clampPlanZoom(zoom + 0.15)
      return
    }
    const rect = viewportEl.getBoundingClientRect()
    applyZoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, zoom + 0.15)
  }

  function zoomOut() {
    if (!viewportEl) {
      zoom = clampPlanZoom(zoom - 0.15)
      return
    }
    const rect = viewportEl.getBoundingClientRect()
    applyZoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, zoom - 0.15)
  }

  function resetView() {
    if (canvasPriority) {
      fitMode = 'contain'
      scheduleFit()
      return
    }
    zoom = 1
    panX = 0
    panY = 0
  }

  /** @param {'contain' | 'width'} [mode] */
  function applyFit(mode) {
    if (mode) fitMode = mode
    scheduleFit()
  }

  /** Fit plan: contain = entire drawing visible; width = fill canvas width */
  function fitToView() {
    if (!viewportEl) return
    const vbW = displayProject.viewport.width
    const vbH = displayProject.viewport.height
    const { contentW, contentH } = getViewportContentBox(viewportEl)
    if (!vbW || !vbH) return

    const fit = computePlanFit({
      contentW,
      contentH,
      vbW,
      vbH,
      mode: fitMode,
    })
    zoom = fit.zoom
    panX = fit.panX
    panY = fit.panY
  }

  /** @param {import('$lib/spatial/types.js').Layout508Config} config */
  function cloneLayoutConfig(config) {
    return JSON.parse(JSON.stringify(config))
  }

  $effect(() => {
    if (!browser) return
    sessionStorage.removeItem('home-plan-fit-mode')
  })

  $effect(() => {
    if (!fitRequest.token) return
    if (fitRequest.cycle) {
      fitMode = fitMode === 'contain' ? 'width' : 'contain'
    } else if (fitRequest.mode === 'contain' || fitRequest.mode === 'width') {
      fitMode = fitRequest.mode
    }
    scheduleFit()
  })

  $effect(() => {
    displayProject.viewport.width
    displayProject.viewport.height
    svgHtml
    scheduleFit()
  })

  $effect(() => {
    const el = viewportEl
    if (!canvasPriority || !el) return
    scheduleFit()
    const ro = new ResizeObserver(() => scheduleFit())
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(fitRaf)
    }
  })

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
      onZoomAt: (clientX, clientY, next) => applyZoomAt(clientX, clientY, next),
      onLongPress: onBlankContextMenu ? handleLongPress : undefined,
    })
    return () => action.destroy()
  })

  $effect(() => {
    const el = viewportEl
    if (!graphEditMode || !el) return
    const action = bindPlanGraphEdit(el, {
      getZoom: () => zoom,
      getTool: () => graphTool,
      clientToSvg,
      onWallChainPoint: (pt) => onGraphWallPoint?.(pt),
      onRemoveEdge: (id) => onGraphRemoveEdge?.(id),
      onSelectEdge: (id) => onGraphSelectEdge?.(id),
    })
    /** @param {PointerEvent} e */
    function onMove(e) {
      if (graphTool !== 'wallAdd' || !wallChainFrom) {
        onGraphHover?.(null)
        return
      }
      onGraphHover?.(clientToSvg(e.clientX, e.clientY))
    }
    el.addEventListener('pointermove', onMove)
    return () => {
      action.destroy()
      el.removeEventListener('pointermove', onMove)
    }
  })

  $effect(() => {
    const el = viewportEl
    if (!editMode || graphEditMode || !el) return

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

  $effect(() => {
    const el = viewportEl
    if (!el) return
    const action = bindPlanSvgTooltip(el, {
      enabled: () => !dragActive && !measureMode,
    })
    return () => action.destroy()
  })
</script>

<div
  class="plan-shell"
  class:compact
  class:edit-mode={editMode}
  class:canvas-priority={canvasPriority}
>
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
      <button
        type="button"
        class="plan-tool plan-tool-text"
        class:active={fitMode === 'contain'}
        onclick={() => applyFit('contain')}
        aria-pressed={fitMode === 'contain'}
        title="默认：完整显示整张户型">看全图</button
      >
      <button
        type="button"
        class="plan-tool plan-tool-text"
        class:active={fitMode === 'width'}
        onclick={() => applyFit('width')}
        aria-pressed={fitMode === 'width'}
        title="放大到铺满宽度，上下需滑动">铺满宽</button
      >
      {#if graphEditMode}
        <span class="plan-hint plan-hint-graph">
          {graphTool === 'wallAdd'
            ? '建墙：依次点击拐点 · 1″ 吸附'
            : graphTool === 'remove'
              ? '删墙：点击墙段'
              : '选择墙段'}
        </span>
      {:else if measureMode}
        <span class="plan-hint plan-hint-measure"
          >点击两点测距 · 第三次点击重新开始</span
        >
      {:else if editMode}
        <span class="plan-hint plan-hint-edit"
          >拖曳编辑 · 点空白取消选中 · 长按/右键菜单</span
        >
      {:else if !compact}
        <span class="plan-hint">双指捏合缩放 · 拖拽平移 · Tab 聚焦储藏区</span>
      {/if}
    </div>
  {/if}

  <div
    class="plan-viewer"
    class:compact
    class:edit-mode={editMode}
    class:measure-mode={measureMode}
    class:graph-edit-mode={graphEditMode}
    bind:this={viewportEl}
    role={onZoneSelect && !editMode && !measureMode && !graphEditMode
      ? 'group'
      : undefined}
    aria-label={graphEditMode
      ? '户型编辑画布'
      : measureMode
        ? '户型编辑画布'
        : editMode
          ? '户型编辑画布'
          : onZoneSelect
            ? '平面图储藏区选择'
            : '顶视平面图'}
    onclick={handleClick}
    oncontextmenu={handleContextMenu}
    onkeydown={handleKeydown}
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
        <span
          class="drag-hud-status"
          class:ok={dragHint.valid}
          class:bad={!dragHint.valid}
        ></span>
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
  .plan-shell.canvas-priority {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    gap: 0;
    overflow: hidden;
  }

  .plan-shell.canvas-priority .plan-viewer:not(.compact) {
    flex: 1 1 auto;
    min-height: min(56dvh, 640px);
    max-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    overflow: hidden;
  }

  .plan-shell.canvas-priority .plan-canvas {
    width: 100%;
    max-width: 100%;
  }

  @media (min-width: 768px) {
    .plan-shell.canvas-priority .plan-viewer:not(.compact) {
      min-height: 0;
    }
  }

  .plan-shell {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .plan-shell.canvas-priority .plan-toolbar {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 4;
    pointer-events: none;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 8px;
    padding: 4px 6px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    background: color-mix(in srgb, var(--card) 88%, transparent);
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 24px -12px rgba(0, 0, 0, 0.35);
  }

  .plan-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 8px;
    align-self: flex-end;
  }

  .plan-tool {
    pointer-events: auto;
    min-width: 44px;
    min-height: 44px;
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

  .plan-tool-text.active {
    background: var(--accent);
    color: #f5f8fa;
    border-color: transparent;
  }

  .plan-zoom-pct {
    pointer-events: none;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t3);
    min-width: 40px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .plan-hint {
    pointer-events: none;
    font-size: 11px;
    color: var(--t3);
    font-family: var(--mono);
  }

  .plan-hint-edit {
    color: var(--accent);
  }

  .plan-shell.canvas-priority .plan-viewer {
    padding: 8px;
    border-radius: 10px;
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

  .plan-viewer.graph-edit-mode {
    cursor: crosshair;
    border-color: color-mix(in srgb, #1d6b42 60%, var(--accent));
  }

  .plan-hint-graph {
    color: #1d6b42;
  }

  .plan-viewer.measure-mode {
    cursor: crosshair;
    border-color: color-mix(in srgb, #1d6b42 55%, var(--accent));
    box-shadow: 0 0 0 1px color-mix(in srgb, #1d6b42 30%, transparent);
  }

  .plan-hint-measure {
    color: #1d6b42;
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
    min-width: 132px;
    max-width: 240px;
    padding: 9px 11px 9px 28px;
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
    background: color-mix(in srgb, #fff7ed 92%, var(--card));
    animation: drag-hud-shake 0.42s ease;
  }

  @keyframes drag-hud-shake {
    0%,
    100% {
      transform: translate(-50%, calc(-100% - 12px));
    }
    25% {
      transform: translate(calc(-50% - 3px), calc(-100% - 12px));
    }
    75% {
      transform: translate(calc(-50% + 3px), calc(-100% - 12px));
    }
  }

  .drag-hud-status {
    position: absolute;
    left: 10px;
    top: 50%;
    width: 10px;
    height: 10px;
    margin-top: -5px;
    border-radius: 999px;
    background: var(--t3);
  }

  .drag-hud-status.ok {
    background: #1d6b42;
    box-shadow: 0 0 0 3px color-mix(in srgb, #1d6b42 22%, transparent);
  }

  .drag-hud-status.bad {
    background: #b45309;
    box-shadow: 0 0 0 3px color-mix(in srgb, #b45309 22%, transparent);
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

  .plan-viewer :global(.plan-svg-tooltip) {
    position: absolute;
    z-index: 6;
    max-width: min(280px, calc(100% - 16px));
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
    background: color-mix(in srgb, var(--card) 94%, transparent);
    backdrop-filter: blur(8px);
    box-shadow: 0 8px 20px -10px rgba(0, 0, 0, 0.35);
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.45;
    color: var(--t2);
    pointer-events: none;
    user-select: none;
    transform: translateY(calc(-100% - 6px));
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.15s ease, visibility 0.15s ease;
  }

  .plan-viewer :global(.plan-svg-tooltip[data-visible='1']) {
    opacity: 1;
    visibility: visible;
  }

  @media (prefers-reduced-motion: reduce) {
    .plan-viewer :global(.plan-svg-tooltip) {
      transition: none;
    }
  }
</style>
