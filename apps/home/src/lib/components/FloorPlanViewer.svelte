<script>
  import { browser } from '$app/environment'
  import { renderFloorPlanSvg } from '$lib/spatial/render-svg.js'
  import { planPanZoom } from '$lib/plan-pan-zoom.js'
  import {
    getPlanView,
    markPlanViewTouched,
    releasePlanView,
  } from '$lib/plan-view.svelte.js'
  import { bindPlanEditDrag } from '$lib/plan-edit-drag.js'
  import { bindPlanGraphEdit } from '$lib/plan-graph-edit.js'
  import { bindPlanZoneEdit } from '$lib/plan-zone-edit.js'
  import { bindPlanPlacementEdit } from '$lib/plan-placement-edit.js'
  import { bindPlanViewpointEdit } from '$lib/plan-viewpoint-edit.js'
  import { hydrateProject } from '$lib/spatial/model.js'
  import {
    commitLayoutDrag,
    getLastDoorStyle,
    getLastWindowStyle,
    previewLayoutDrag,
    setLayoutDragPreview,
  } from '$lib/state.svelte.js'
  import {
    describeDragEdit,
    dragLabelAnchor,
    RESIZE_GRIP_HIT,
  } from '$lib/spatial/wall-edit.js'
  import { describeGraphOpeningDrag } from '$lib/spatial/graph-openings.js'
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
   *   toolbarMinimal?: boolean,
   *   hideFurniture?: boolean,
   *   hideStorageZones?: boolean,
   *   selectedWall?: string,
   *   selectedOpening?: string,
   *   selectedEdge?: string,
   *   wallChainFrom?: { x: number, y: number } | null,
   *   wallChainHover?: { x: number, y: number } | null,
   *   measurePoints?: { a: { x: number, y: number } | null, b: { x: number, y: number } | null },
   *   fitRequest?: { token: number, cycle?: boolean, mode?: 'contain' | 'width' },
   *   focusRequest?: { token: number, x: number, y: number, zoom?: number, centerX?: number, centerY?: number },
   *   onZoneSelect?: (code: string) => void,
   *   onClearSelection?: () => void,
   *   onBlankContextMenu?: (pt: { x: number, y: number, svgX: number, svgY: number }) => void,
   *   onSelectWall?: (id: string) => void,
   *   onSelectOpening?: (id: string) => void,
   *   onMeasurePoint?: (pt: { x: number, y: number }) => void,
   *   onGraphWallPoint?: (pt: { x: number, y: number }, mods?: { shiftKey: boolean, altKey: boolean, zoom: number }) => void,
   *   onGraphRemoveEdge?: (edgeId: string) => void,
   *   onGraphSelectEdge?: (edgeId: string) => void,
   *   onGraphSelectOpening?: (openingId: string) => void,
   *   onOpeningDragStart?: (openingId: string, mode: 'move' | 'resize-start' | 'resize-end') => void,
   *   onOpeningDrag?: (openingId: string, pt: { x: number, y: number }, mode: 'move' | 'resize-start' | 'resize-end', clientX: number, clientY: number) => void,
   *   onOpeningDrop?: (openingId: string, pt: { x: number, y: number }, mode: 'move' | 'resize-start' | 'resize-end') => void,
   *   onPlaceOpening?: (pt: { x: number, y: number }, edgeId: string) => void,
   *   onGraphHover?: (pt: { x: number, y: number } | null, mods?: { shiftKey: boolean, altKey: boolean, zoom: number }) => void,
   *   snapGuides?: (import('$lib/spatial/snap.js').SnapGuide | import('$lib/spatial/placement-snap.js').PlacementGuide)[],
   *   onVertexDragStart?: (vertexId: string) => void,
   *   onVertexDrag?: (vertexId: string, pt: { x: number, y: number }) => void,
   *   onVertexDrop?: (vertexId: string, pt: { x: number, y: number }) => void,
   *   zoneEditMode?: boolean,
   *   zoneTool?: import('$lib/plan-zone-edit.js').ZoneTool,
   *   selectedSpatialZone?: string,
   *   zoneChainFrom?: { x: number, y: number } | null,
   *   zoneChainHover?: { x: number, y: number } | null,
   *   zoneChainPoints?: { x: number, y: number }[],
   *   previewZones?: import('$lib/spatial/types.js').SpatialZone[] | null,
   *   onZonePoint?: (pt: { x: number, y: number }) => void,
   *   onSelectSpatialZone?: (zoneId: string) => void,
   *   onRemoveSpatialZone?: (zoneId: string) => void,
   *   onZoneHover?: (pt: { x: number, y: number } | null) => void,
   *   onZoneVertexDragStart?: (zoneId: string, index: number) => void,
   *   onZoneVertexDrag?: (zoneId: string, index: number, pt: { x: number, y: number }) => void,
   *   onZoneVertexDrop?: (zoneId: string, index: number, pt: { x: number, y: number }) => void,
   *   placementEditMode?: boolean,
   *   placementTool?: import('$lib/plan-placement-edit.js').PlacementTool,
   *   selectedPlacement?: string,
   *   clashPlacement?: string,
   *   onPlacementPoint?: (pt: { x: number, y: number }, zoom: number) => void,
   *   onSelectPlacement?: (id: string) => void,
   *   onAssignStorage?: (pt: { x: number, y: number }) => void,
   *   onPlacementDrag?: (id: string, pt: { x: number, y: number }, zoom: number, mods: { altKey: boolean }) => void,
   *   onPlacementDrop?: (id: string, pt: { x: number, y: number }, zoom: number, mods: { altKey: boolean }) => void,
   *   viewpointEditMode?: boolean,
   *   viewpointTool?: 'viewAdd' | 'viewSelect',
   *   selectedViewpoint?: string,
   *   previewViewpoints?: import('$lib/spatial/types.js').SpatialViewpoint[] | null,
   *   showViewpoints?: boolean,
   *   onViewpointPoint?: (pt: { x: number, y: number }) => void,
   *   onSelectViewpoint?: (id: string) => void,
   *   onViewpointDragStart?: (id: string) => void,
   *   onViewpointDrag?: (id: string, pt: { x: number, y: number }) => void,
   *   onViewpointDrop?: (id: string, pt: { x: number, y: number }) => void,
   *   onViewpointRotate?: (id: string, pt: { x: number, y: number }) => void,
   *   onViewpointRotateDrop?: (id: string, pt: { x: number, y: number }) => void,
   *   showFurniture?: boolean,
   *   overrideProject?: import('$lib/spatial/types.js').SpatialProject,
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
    toolbarMinimal = false,
    hideFurniture = true,
    hideStorageZones = false,
    selectedWall = '',
    selectedOpening = '',
    selectedEdge = '',
    wallChainFrom = null,
    wallChainHover = null,
    snapGuides = [],
    measurePoints = { a: null, b: null },
    fitRequest = { token: 0, cycle: false },
    focusRequest = { token: 0, x: 0, y: 0 },
    onZoneSelect,
    onClearSelection,
    onBlankContextMenu,
    onSelectWall,
    onSelectOpening,
    onMeasurePoint,
    onGraphWallPoint,
    onGraphRemoveEdge,
    onGraphSelectEdge,
    onGraphSelectOpening,
    onOpeningDragStart,
    onOpeningDrag,
    onOpeningDrop,
    onPlaceOpening,
    onGraphHover,
    onVertexDragStart,
    onVertexDrag,
    onVertexDrop,
    zoneEditMode = false,
    zoneTool = 'zoneAdd',
    selectedSpatialZone = '',
    zoneChainFrom = null,
    zoneChainHover = null,
    zoneChainPoints = [],
    previewZones = null,
    onZonePoint,
    onSelectSpatialZone,
    onRemoveSpatialZone,
    onZoneHover,
    onZoneVertexDragStart,
    onZoneVertexDrag,
    onZoneVertexDrop,
    placementEditMode = false,
    placementTool = 'place',
    selectedPlacement = '',
    clashPlacement = '',
    onPlacementPoint,
    onSelectPlacement,
    onAssignStorage,
    onPlacementDragStart,
    onPlacementDrag,
    onPlacementDrop,
    viewpointEditMode = false,
    viewpointTool = 'viewAdd',
    selectedViewpoint = '',
    previewViewpoints = null,
    showViewpoints = false,
    onViewpointPoint,
    onSelectViewpoint,
    onViewpointDragStart,
    onViewpointDrag,
    onViewpointDrop,
    onViewpointRotate,
    onViewpointRotateDrop,
    showFurniture = false,
    overrideProject,
  } = $props()

  // 视角跨页面共享(见 plan-view.svelte.js):在储藏页缩放定位到一个柜子,切到
  // 平面页要还在那儿。这里取的是**初值** —— 组件内部照旧用局部 zoom/panX/panY 读写
  // (下面几十处引用一个都不用改),变化由后面那个 $effect 同步回去。
  const planView = getPlanView()
  let zoom = $state(planView.zoom)
  let panX = $state(planView.panX)
  let panY = $state(planView.panY)
  /** @type {'contain' | 'width'} */
  let fitMode = $state(planView.fitMode)
  let fitRaf = 0
  /** @type {HTMLElement | null} */
  let viewportEl = $state(null)
  /** @type {import('$lib/spatial/types.js').Layout508Config | null} */
  let dragBaseConfig = $state(null)

  /** @type {import('$lib/spatial/types.js').SpatialProject | null} */
  let previewProject = $state(null)

  const displayProject = $derived(overrideProject ?? previewProject ?? project)

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

  const planEditing = $derived(
    editMode ||
      graphEditMode ||
      zoneEditMode ||
      placementEditMode ||
      viewpointEditMode,
  )

  /**
   * 缩放控件收在一个芯片里,点开才是菜单 —— 画布类工具的通行做法
   * (Figma 的缩放控件收起态就只有一个百分比数字)。此前这里是一整条常驻的
   * 「− 94% + 看全图 铺满宽 + 一行操作提示」,横着占掉画布顶部三分之一,
   * 而其中真正每次都要用的只有那个百分比。
   *
   * 提示文字整条删掉了,不是搬走:同一句话另有两处副本 —— PlanEditToolbar 每个
   * 工具按钮的 title,以及 ? 面板的 contextHint(页面传的 modeHint 与这里逐字
   * 相同)。浏览态那句讲的是双指缩放/拖拽平移,是所有地图都一样的手势。
   */
  let zoomMenuOpen = $state(false)
  /** @type {HTMLElement | null} */
  let zoomMenuEl = $state(null)

  const ZOOM_PRESETS = /** @type {const} */ ([0.5, 1, 2])

  $effect(() => {
    if (!zoomMenuOpen || !browser) return
    /** @param {PointerEvent} e */
    function onDown(e) {
      if (e.target instanceof Node && zoomMenuEl?.contains(e.target)) return
      zoomMenuOpen = false
    }
    /** @param {KeyboardEvent} e */
    function onKey(e) {
      if (e.key !== 'Escape') return
      // 捕获阶段吃掉:否则这一下 Esc 会顺着冒到页面的退出阶梯,
      // 关菜单的同时把画布上的选中/工具一起清了
      e.stopPropagation()
      zoomMenuOpen = false
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  })

  // 编辑态开合、工具切换都该让菜单收起 —— 它是临时浮层,不是模式
  $effect(() => {
    planEditing
    zoomMenuOpen = false
  })

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
    if (
      (!editMode &&
        !graphEditMode &&
        !zoneEditMode &&
        !placementEditMode &&
        !viewpointEditMode) ||
      !viewportEl
    )
      return 1
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
      hideFurniture: hideFurniture && !showFurniture,
      hideStorageZones,
      selectedWall,
      selectedOpening,
      dragOverlay,
      dragBlockedWall,
      dragBlockedOpening,
      dragDimmed: dragActive,
      touchScale,
      measure: measureMode ? measurePoints : undefined,
      graphEditMode,
      graphTool,
      selectedEdge,
      wallChainFrom,
      wallChainHover,
      snapGuides,
      zoneEditMode,
      zoneTool,
      selectedSpatialZone,
      zoneChainFrom,
      zoneChainHover,
      zoneChainPoints,
      previewZones,
      placementEditMode,
      placementTool,
      selectedPlacement,
      clashPlacement,
      viewpointEditMode,
      viewpointTool,
      selectedViewpoint,
      previewViewpoints,
      showViewpoints,
      showFurniture,
    }),
  )

  const canvasStyle = $derived(
    `transform: translate(${panX}px, ${panY}px) scale(${zoom}); transform-origin: 0 0;` +
      (focusFlying
        ? ' transition: transform 0.55s cubic-bezier(0.25, 0.8, 0.3, 1);'
        : ''),
  )

  function getPlanSvg() {
    const el = viewportEl?.querySelector('.floor-plan-svg')
    return el instanceof SVGElement ? el : null
  }

  function applyZoomAt(clientX, clientY, nextZoom) {
    markPlanViewTouched()
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
    applyZoomAt(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      zoom + 0.15,
    )
  }

  function zoomOut() {
    if (!viewportEl) {
      zoom = clampPlanZoom(zoom - 0.15)
      return
    }
    const rect = viewportEl.getBoundingClientRect()
    applyZoomAt(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      zoom - 0.15,
    )
  }

  /** 跳到一个确定的倍数(菜单里的 50/100/200%),以视口中心为锚点 */
  /** @param {number} next */
  function setZoomPct(next) {
    zoomMenuOpen = false
    if (!viewportEl) {
      markPlanViewTouched()
      zoom = clampPlanZoom(next)
      return
    }
    const rect = viewportEl.getBoundingClientRect()
    applyZoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, next)
  }

  // 显式重置 —— 同样把视角交回自动挡
  function resetView() {
    releasePlanView('contain')
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
  // 「看全图」/「铺满宽」是用户**显式**要求重新 fit —— 把视角交回自动挡,
  // 否则 touched 一直挂着,这两个按钮就再也按不动了。
  function applyFit(mode) {
    if (mode) fitMode = mode
    releasePlanView(mode)
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

  // —— 定位飞行(focusRequest):把一个 SVG 坐标点平滑居中到画布,地图应用的
  //    「点搜索结果 → 飞过去」。只吃 token 变化;读了 zoom/viewportEl 也不会
  //    在用户捏合时重放(lastFocusToken 挡住了)。
  let focusFlying = $state(false)
  let lastFocusToken = 0
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let focusTimer
  $effect(() => {
    const req = focusRequest
    const el = viewportEl
    if (!req?.token || req.token === lastFocusToken || !el) return
    const vbW = displayProject.viewport.width
    if (!vbW) return
    lastFocusToken = req.token
    const { contentW, contentH } = getViewportContentBox(el)
    // SVG 以 width:100% 排版:1 viewBox 单位 = contentW/vbW 画布 px
    const scale = contentW / vbW
    const targetZoom = clampPlanZoom(req.zoom ?? Math.max(zoom, 1.2))
    markPlanViewTouched()
    focusFlying = true
    zoom = targetZoom
    // centerX/centerY:落点在视口里的位置(0–1,默认正中)。浮动面板/底部抽屉
    // 盖住一块画布时,调用方用它把目标挪进真正可见的那条区域
    panX = contentW * (req.centerX ?? 0.5) - req.x * scale * targetZoom
    panY = contentH * (req.centerY ?? 0.5) - req.y * scale * targetZoom
    clearTimeout(focusTimer)
    focusTimer = setTimeout(() => {
      focusFlying = false
    }, 580)
  })

  $effect(() => () => clearTimeout(focusTimer))

  $effect(() => {
    if (!fitRequest.token) return
    if (fitRequest.cycle) {
      fitMode = fitMode === 'contain' ? 'width' : 'contain'
    } else if (fitRequest.mode === 'contain' || fitRequest.mode === 'width') {
      fitMode = fitRequest.mode
    }
    // 同 applyFit:外部按钮发来的 fit 也是显式请求,得把 touched 清掉
    releasePlanView(fitMode)
    scheduleFit()
  })

  // 局部视角 → 共享视角。放在这里(而不是每个赋值点手写一遍)是因为写点太多:
  // fitToView、applyZoomAt、planPanZoom 的 setScale/setPan 都在改它们。
  $effect(() => {
    planView.zoom = zoom
    planView.panX = panX
    planView.panY = panY
    planView.fitMode = fitMode
  })

  $effect(() => {
    displayProject.viewport.width
    displayProject.viewport.height
    svgHtml
    // 用户亲手捏出来的视角不许自动 fit 覆盖 —— 否则「跨页面保持视角」在挂载后的
    // 下一帧就被冲掉,而且拖一件家具(svgHtml 变)也会把他看的地方弹回全图。
    if (planView.touched) return
    scheduleFit()
  })

  $effect(() => {
    const el = viewportEl
    if (!canvasPriority || !el) return
    if (!planView.touched) scheduleFit()
    const ro = new ResizeObserver(() => {
      if (planView.touched) return
      scheduleFit()
    })
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
        markPlanViewTouched()
        zoom = n
      },
      getPan: () => ({ x: panX, y: panY }),
      setPan: (p) => {
        markPlanViewTouched()
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
      onWallChainPoint: (pt, mods) =>
        onGraphWallPoint?.(pt, { ...mods, zoom }),
      onRemoveEdge: (id) => onGraphRemoveEdge?.(id),
      onSelectEdge: (id) => onGraphSelectEdge?.(id),
      onSelectOpening: (id) => onGraphSelectOpening?.(id),
      onOpeningDragStart: (id, mode) => {
        dragActive = true
        onOpeningDragStart?.(id, mode)
      },
      onOpeningDrag: (id, pt, mode, clientX, clientY) => {
        dragHudX = clientX + 14
        dragHudY = clientY - 36
        if (project.wallGraph) {
          dragHint = describeGraphOpeningDrag(
            project.wallGraph,
            project.graphOpenings ?? [],
            id,
            pt,
            mode,
          )
        }
        onOpeningDrag?.(id, pt, mode, clientX, clientY)
      },
      onOpeningDrop: (id, pt, mode) => {
        dragHint = null
        dragActive = false
        onOpeningDrop?.(id, pt, mode)
      },
      onPlaceOpening: (pt, edgeId) => onPlaceOpening?.(pt, edgeId),
      onVertexDragStart: (id) => onVertexDragStart?.(id),
      onVertexDrag: (id, pt) => onVertexDrag?.(id, pt),
      onVertexDrop: (id, pt) => onVertexDrop?.(id, pt),
    })
    /** @param {PointerEvent} e */
    function onMove(e) {
      if (graphTool !== 'wallAdd') {
        onGraphHover?.(null)
        return
      }
      // 链未起头时也要报 hover——链首那一点同样要吃顶点/对齐吸附
      onGraphHover?.(clientToSvg(e.clientX, e.clientY), {
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        zoom,
      })
    }
    el.addEventListener('pointermove', onMove)
    return () => {
      action.destroy()
      el.removeEventListener('pointermove', onMove)
    }
  })

  $effect(() => {
    const el = viewportEl
    if (!zoneEditMode || !el) return
    const action = bindPlanZoneEdit(el, {
      getTool: () => zoneTool,
      clientToSvg,
      onZoneChainPoint: (pt) => onZonePoint?.(pt),
      onSelectZone: (id) => onSelectSpatialZone?.(id),
      onRemoveZone: (id) => onRemoveSpatialZone?.(id),
      onZoneVertexDragStart: (zoneId, index) =>
        onZoneVertexDragStart?.(zoneId, index),
      onZoneVertexDrag: (zoneId, index, pt) =>
        onZoneVertexDrag?.(zoneId, index, pt),
      onZoneVertexDrop: (zoneId, index, pt) =>
        onZoneVertexDrop?.(zoneId, index, pt),
    })
    /** @param {PointerEvent} e */
    function onMove(e) {
      if (zoneTool !== 'zoneAdd' || !zoneChainPoints.length) {
        onZoneHover?.(null)
        return
      }
      onZoneHover?.(clientToSvg(e.clientX, e.clientY))
    }
    el.addEventListener('pointermove', onMove)
    return () => {
      action.destroy()
      el.removeEventListener('pointermove', onMove)
    }
  })

  $effect(() => {
    const el = viewportEl
    if (!placementEditMode || !el) return
    const action = bindPlanPlacementEdit(el, {
      getTool: () => placementTool,
      clientToSvg,
      getPlacementRect: (id) =>
        (displayProject.placements ?? []).find((p) => p.id === id) ?? null,
      onPlacePoint: (pt) => onPlacementPoint?.(pt, zoom),
      onSelectPlacement: (id) => onSelectPlacement?.(id),
      onAssignStorage: (pt) => onAssignStorage?.(pt),
      onPlacementDragStart: (id) => onPlacementDragStart?.(id),
      // zoom rides along so the caller can size its snap tolerance in screen
      // px rather than plan px — it lives in this component.
      onPlacementDrag: (id, pt, mods) => onPlacementDrag?.(id, pt, zoom, mods),
      onPlacementDrop: (id, pt, mods) => onPlacementDrop?.(id, pt, zoom, mods),
    })
    return () => action.destroy()
  })

  $effect(() => {
    const el = viewportEl
    if (!viewpointEditMode || !el) return
    const action = bindPlanViewpointEdit(el, {
      getTool: () => viewpointTool,
      clientToSvg,
      onAddPoint: (pt) => onViewpointPoint?.(pt),
      onSelect: (id) => onSelectViewpoint?.(id),
      onMoveStart: (id) => onViewpointDragStart?.(id),
      onMove: (id, pt) => onViewpointDrag?.(id, pt),
      onMoveDrop: (id, pt) => onViewpointDrop?.(id, pt),
      onRotateStart: (id) => onViewpointDragStart?.(id),
      onRotate: (id, pt) => onViewpointRotate?.(id, pt),
      onRotateDrop: (id, pt) => onViewpointRotateDrop?.(id, pt),
    })
    return () => action.destroy()
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
  class:toolbar-minimal={toolbarMinimal}
>
  {#if zoomable}
    <div class="plan-zoom" bind:this={zoomMenuEl}>
      <button
        type="button"
        class="plan-zoom-trigger"
        class:open={zoomMenuOpen}
        onclick={() => (zoomMenuOpen = !zoomMenuOpen)}
        aria-expanded={zoomMenuOpen}
        aria-haspopup="menu"
        aria-label="缩放与视图"
        title="缩放与视图"
      >
        <span class="plan-zoom-value">{Math.round(zoom * 100)}%</span>
        <svg class="plan-zoom-caret" viewBox="0 0 10 6" aria-hidden="true">
          <path
            d="M1 1.5 5 5 9 1.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      {#if zoomMenuOpen}
        <div class="plan-zoom-menu" role="menu" aria-label="缩放与视图">
          <button
            type="button"
            role="menuitem"
            class="plan-zoom-item"
            onclick={zoomIn}
          >
            放大
          </button>
          <button
            type="button"
            role="menuitem"
            class="plan-zoom-item"
            onclick={zoomOut}
          >
            缩小
          </button>
          <div class="plan-zoom-sep" role="separator"></div>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={fitMode === 'contain'}
            class="plan-zoom-item"
            class:checked={fitMode === 'contain'}
            onclick={() => {
              zoomMenuOpen = false
              applyFit('contain')
            }}
          >
            看全图
            <!-- F 是页面真有的绑定(bumpFit(true) 在两种 fit 之间切)。
                 放大/缩小没有键位,就不编一个挂在那儿骗人。 -->
            <kbd class="plan-zoom-kbd">F</kbd>
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={fitMode === 'width'}
            class="plan-zoom-item"
            class:checked={fitMode === 'width'}
            onclick={() => {
              zoomMenuOpen = false
              applyFit('width')
            }}
          >
            铺满宽
            <kbd class="plan-zoom-kbd">F</kbd>
          </button>
          <div class="plan-zoom-sep" role="separator"></div>
          {#each ZOOM_PRESETS as pct (pct)}
            <button
              type="button"
              role="menuitem"
              class="plan-zoom-item"
              onclick={() => setZoomPct(pct)}
            >
              {pct * 100}%
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div
    class="plan-viewer"
    class:compact
    class:edit-mode={editMode}
    class:measure-mode={measureMode}
    class:graph-edit-mode={graphEditMode}
    data-zoom-tier={zoom < 1.15 ? 'far' : 'near'}
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
    /* No flex/max-height centering here: computePlanFit owns both scale and
       centering, and it assumes the SVG lays out at width:100% of the canvas
       with the canvas anchored top-left. The old `:global(svg) max-height:100%;
       width:auto` made the SVG pre-shrink itself to the viewport, and the fit
       zoom then scaled that already-fitted SVG a second time — the plan showed
       at roughly half the size the zoom label claimed. */
    .plan-shell.canvas-priority .plan-viewer:not(.compact) {
      flex: 1 1 auto;
      min-height: 0;
    }
  }

  @media (max-width: 599px) {
    .plan-shell.canvas-priority .plan-viewer:not(.compact) {
      min-height: min(72dvh, 780px);
    }

    .plan-shell.canvas-priority.toolbar-minimal .plan-viewer:not(.compact) {
      min-height: 0;
      flex: 1 1 auto;
    }

    /* 手机编辑态:工具鱼骨横铺在顶部整条,芯片得让开它,落到 详情 FAB 上方
       (FAB 占着右下角,z-index 48)。菜单跟着朝上开。 */
    .plan-shell.canvas-priority.toolbar-minimal .plan-zoom {
      top: auto;
      bottom: calc(var(--space-2-5) + 52px);
      right: var(--space-2-5);
      left: auto;
    }

    .plan-shell.canvas-priority.toolbar-minimal .plan-zoom-menu {
      top: auto;
      bottom: calc(100% + 6px);
      transform-origin: bottom right;
    }
  }

  .plan-shell {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* 缩放芯片。canvas-priority 时浮在画布右上角;非 canvas-priority(卡片式
     嵌入)时贴在图的右上,不占一行。 */
  .plan-zoom {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 6;
  }

  /* 渐进披露:整屋视图(缩放没过阈值)不显示小件家具/门窗的名字 ——
     那个层级它们本来就读不清,只剩噪声;拉近后再淡入。 */
  .plan-viewer[data-zoom-tier='far'] :global(.label-minor) {
    opacity: 0;
  }

  /* 桌面地图惯例:缩放控件在右下角(底部左=图例,中=提示,右=缩放)。
     移动端底部被选择条/FAB 占用,芯片留在原位(toolbar-minimal 已有专门处理)。 */
  @media (min-width: 900px) {
    .plan-shell.canvas-priority .plan-zoom {
      top: auto;
      bottom: 12px;
      right: 12px;
    }

    .plan-shell.canvas-priority .plan-zoom-menu {
      top: auto;
      bottom: calc(100% + 6px);
      transform-origin: bottom right;
    }
  }

  .plan-shell:not(.canvas-priority) {
    position: relative;
  }

  .plan-zoom-trigger {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 34px;
    padding: 0 9px 0 11px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
    background: color-mix(in srgb, var(--card) 88%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: var(--t2);
    cursor: pointer;
    box-shadow: 0 3px 12px -6px rgba(0, 0, 0, 0.25);
    transition:
      color 0.12s ease,
      border-color 0.12s ease;
  }

  .plan-zoom-trigger:hover,
  .plan-zoom-trigger.open {
    color: var(--t1);
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }

  .plan-zoom-value {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    /* 94% → 100% 不该让芯片和它的边框跟着抖 */
    min-width: 34px;
    text-align: right;
  }

  .plan-zoom-caret {
    width: 9px;
    height: 5px;
    flex: 0 0 auto;
    opacity: 0.75;
    transition: transform 0.15s ease;
  }

  .plan-zoom-trigger.open .plan-zoom-caret {
    transform: rotate(180deg);
  }

  .plan-zoom-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    min-width: 168px;
    padding: 5px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    background: color-mix(in srgb, var(--card) 96%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: 0 18px 44px -16px rgba(0, 0, 0, 0.5);
    transform-origin: top right;
    animation: plan-zoom-pop 0.13s ease-out;
  }

  @keyframes plan-zoom-pop {
    from {
      opacity: 0;
      transform: scale(0.96) translateY(-3px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .plan-zoom-menu {
      animation: none;
    }

    .plan-zoom-caret {
      transition: none;
    }
  }

  .plan-zoom-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 9px 0 24px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--t1);
    font: inherit;
    font-size: 13px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  .plan-zoom-item:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .plan-zoom-item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  /* 勾在左侧留白里 —— 选中与否不改变文字的起始位置 */
  .plan-zoom-item.checked::before {
    content: '✓';
    position: absolute;
    margin-left: -15px;
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
  }

  .plan-zoom-kbd {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--t3);
  }

  .plan-zoom-sep {
    height: 1px;
    margin: 4px 6px;
    background: color-mix(in srgb, var(--border) 70%, transparent);
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

  .plan-zoom-trigger:focus-visible,
  .plan-viewer:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .plan-viewer.graph-edit-mode {
    cursor: crosshair;
    border-color: color-mix(in srgb, var(--graph-accent) 60%, var(--accent));
  }

  .plan-viewer.measure-mode {
    cursor: crosshair;
    border-color: color-mix(in srgb, var(--graph-accent) 55%, var(--accent));
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--graph-accent) 30%, transparent);
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
    background: var(--graph-accent);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--graph-accent) 22%, transparent);
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
    transition:
      opacity 0.15s ease,
      visibility 0.15s ease;
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
