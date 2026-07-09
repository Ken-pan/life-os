<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import {
    activateWallGraphMode,
    addGraphWall,
    addGraphOpening,
    addPlacement,
    addZone,
    assignStorageZone,
    commitGraphOpeningEdit,
    commitPlacementMove,
    commitZoneVertexMove,
    removeGraphOpening,
    previewGraphOpeningDrag,
    canRedoGraph,
    canRedoLayout,
    canUndoGraph,
    canUndoLayout,
    commitGraphVertexMove,
    getActiveProject,
    isOpeningDisabled,
    isWallGraphMode,
    previewGraphVertexMove,
    redoGraphEdit,
    redoLayoutEdit,
    removeGraphWall,
    removePlacement,
    removeZone,
    resetToOuterShell,
    rotatePlacementById,
    setOpeningDisabled,
    setPlanSubtitle,
    setPlanImmersiveEdit,
    splitGraphWall,
    undoGraphEdit,
    undoLayoutEdit,
  } from '$lib/state.svelte.js'
  import { buildFromWallGraph } from '$lib/spatial/wall-graph.js'
  import { snapGraphPoint } from '$lib/spatial/wall-graph.js'
  import { canClosePolygon, findZoneAtPoint } from '$lib/spatial/zones.js'
  import { browser } from '$app/environment'
  import FloorPlanViewer from '$lib/components/FloorPlanViewer.svelte'
  import RoomDimensionsEditor from '$lib/components/RoomDimensionsEditor.svelte'
  import PlanEditInspector from '$lib/components/PlanEditInspector.svelte'
  import PlanLegend from '$lib/components/PlanLegend.svelte'
  import PlanSelectionBar from '$lib/components/PlanSelectionBar.svelte'
  import PlanGraphSelectionBar from '$lib/components/PlanGraphSelectionBar.svelte'
  import PlanGraphOpeningSelectionBar from '$lib/components/PlanGraphOpeningSelectionBar.svelte'
  import PlanZoneSelectionBar from '$lib/components/PlanZoneSelectionBar.svelte'
  import PlanPlacementSelectionBar from '$lib/components/PlanPlacementSelectionBar.svelte'
  import { PLACEMENT_KINDS, STORAGE_CODES } from '$lib/spatial/placements.js'
  import PlanContextMenu from '$lib/components/PlanContextMenu.svelte'
  import PlanEditToolbar from '$lib/components/PlanEditToolbar.svelte'
  import PlanShortcutsHelp from '$lib/components/PlanShortcutsHelp.svelte'

  const project = $derived(getActiveProject())
  const wallGraph = $derived(isWallGraphMode())

  /** @type {'browse' | 'edit'} */
  let planMode = $state('browse')
  /** @type {'walls' | 'zones' | 'place'} */
  let editStep = $state('walls')
  /** @type {import('$lib/plan-graph-edit.js').GraphTool} */
  let graphTool = $state('wallAdd')
  /** @type {import('$lib/plan-zone-edit.js').ZoneTool} */
  let zoneTool = $state('zoneAdd')
  /** @type {import('$lib/plan-placement-edit.js').PlacementTool} */
  let placementTool = $state('place')
  /** @type {keyof typeof PLACEMENT_KINDS} */
  let placementKind = $state('cabinet')
  let selectedWall = $state('')
  let selectedOpening = $state('')
  let selectedEdge = $state('')
  let selectedSpatialZone = $state('')
  let selectedPlacement = $state('')
  let storagePickerOpen = $state(false)
  /** @type {HTMLDialogElement | null} */
  let storagePickerDialog = $state(null)
  let placementKindsOpen = $state(false)
  /** @type {HTMLDialogElement | null} */
  let placementKindsDialog = $state(null)
  /** @type {{ zoneId?: string, placementId?: string }} */
  let storagePickerTarget = $state({})
  let showHelp = $state(false)
  let fitRequest = $state({ token: 0, cycle: false })
  let drawerOpen = $state(false)
  let ctxMenu = $state({ open: false, x: 0, y: 0 })
  /** @type {{ x: number, y: number } | null} */
  let wallChainFrom = $state(null)
  /** @type {{ x: number, y: number } | null} */
  let wallChainHover = $state(null)
  /** @type {{ x: number, y: number }[]} */
  let zoneChainPoints = $state([])
  /** @type {{ x: number, y: number } | null} */
  let zoneChainHover = $state(null)
  /** @type {import('$lib/spatial/types.js').SpatialZone[] | null} */
  let previewZones = $state(null)
  /** @type {import('$lib/spatial/types.js').SpatialPlacement[] | null} */
  let previewPlacements = $state(null)
  /** @type {import('$lib/spatial/types.js').WallGraph | null} */
  let graphPreviewGraph = $state(null)
  /** @type {import('$lib/spatial/types.js').GraphOpening[] | null} */
  let graphPreviewOpenings = $state(null)
  let compactPlanChrome = $state(
    browser ? window.matchMedia('(max-width: 599px)').matches : false,
  )
  let convertBannerDismissed = $state(false)

  const CONVERT_BANNER_KEY = 'home_plan_convert_banner_dismissed'

  const editMode508 = $derived(planMode === 'edit' && !wallGraph)
  const graphEditMode = $derived(
    wallGraph && planMode === 'edit' && editStep === 'walls',
  )
  const zoneEditMode = $derived(
    wallGraph && planMode === 'edit' && editStep === 'zones',
  )
  const placeEditMode = $derived(
    wallGraph && planMode === 'edit' && editStep === 'place',
  )
  const wallGraphEditMode = $derived(
    graphEditMode || zoneEditMode || placeEditMode,
  )
  const canUndo = $derived(wallGraphEditMode ? canUndoGraph() : canUndoLayout())
  const canRedo = $derived(wallGraphEditMode ? canRedoGraph() : canRedoLayout())
  const showSelectionBar = $derived(
    editMode508 && (selectedWall || selectedOpening),
  )
  const wallGraphEmpty = $derived(
    wallGraph && (project.wallGraph?.edges?.length ?? 0) === 0,
  )
  const showGraphSelectionBar = $derived(
    graphEditMode && Boolean(selectedEdge) && !selectedOpening,
  )
  const showGraphOpeningSelectionBar = $derived(
    graphEditMode && Boolean(selectedOpening),
  )
  const selectedZoneObj = $derived(
    (project.zones ?? []).find((z) => z.id === selectedSpatialZone) ?? null,
  )
  const showZoneSelectionBar = $derived(
    zoneEditMode && Boolean(selectedZoneObj),
  )
  const selectedPlacementObj = $derived(
    (project.placements ?? []).find((p) => p.id === selectedPlacement) ?? null,
  )
  const showPlacementSelectionBar = $derived(
    placeEditMode && Boolean(selectedPlacementObj),
  )
  const hideFabForBar = $derived(
    showSelectionBar ||
      showGraphSelectionBar ||
      showGraphOpeningSelectionBar ||
      showZoneSelectionBar ||
      showPlacementSelectionBar,
  )
  const drawerLabel = $derived('详情')

  const viewerProject = $derived.by(() => {
    const graph = graphPreviewGraph ?? project.wallGraph
    const graphOpenings = graphPreviewOpenings ?? project.graphOpenings ?? []
    const zones = previewZones ?? project.zones ?? []
    if (graph && (graphPreviewGraph || graphPreviewOpenings)) {
      return buildFromWallGraph(graph, { ...project, graphOpenings, zones })
    }
    if (previewZones) {
      return buildFromWallGraph(project.wallGraph ?? graph, {
        ...project,
        zones: previewZones,
      })
    }
    if (previewPlacements) {
      return buildFromWallGraph(project.wallGraph ?? graph, {
        ...project,
        placements: previewPlacements,
      })
    }
    return project
  })

  const modeHint = $derived.by(() => {
    if (planMode === 'browse') {
      return '点击储藏区查看物品 · 双指缩放平移'
    }
    if (wallGraph && editStep === 'walls') {
      if (graphTool === 'wallAdd') {
        return '建墙：点击拐点连线 · Shift 正交 · 1″ 吸附 · Esc 断链'
      }
      if (graphTool === 'remove') return '删墙：点击墙段删除'
      if (graphTool === 'opening') return '门窗：点击墙段放置门（32″）'
      return '选择：点墙段/门窗 · 拖顶点或沿墙移动 · Delete 删除'
    }
    if (wallGraph && editStep === 'zones') {
      if (zoneTool === 'zoneAdd') {
        return '画区：逐点落顶点 · 点击首点或 Enter 闭合 · Esc 取消'
      }
      if (zoneTool === 'zoneRemove') return '删区：点击分区删除'
      return '选区：点分区改名/换色 · 拖顶点微调 · 需核对时点确认'
    }
    if (wallGraph && editStep === 'place') {
      return '布置：选家具类型后点画布放置 · 标储藏指派 S1–S8'
    }
    return '拖曳内墙与门窗调整户型 · Delete 隐藏门窗'
  })

  /** AppBar 单行副标题（沉浸式编辑时由 layout 隐藏） */
  const appBarSubtitle = $derived.by(() => {
    if (planMode === 'browse') return '储藏区可点击'
    if (graphEditMode) {
      if (graphTool === 'wallAdd') return '墙图 · 建墙'
      if (graphTool === 'opening') return '墙图 · 门窗'
      if (graphTool === 'remove') return '墙图 · 删墙'
      return '墙图 · 选择'
    }
    if (zoneEditMode) {
      if (zoneTool === 'zoneAdd') return '墙图 · 画区'
      if (zoneTool === 'zoneRemove') return '墙图 · 删区'
      return '墙图 · 选区'
    }
    if (placeEditMode) return '墙图 · 布置'
    if (editMode508) return '508 参数编辑'
    return '编辑'
  })

  function bumpFit(
    /** @type {boolean} */ cycle = false,
    /** @type {'contain' | 'width' | undefined} */ mode = undefined,
  ) {
    fitRequest = { token: fitRequest.token + 1, cycle, mode }
  }

  onMount(() => {
    bumpFit(false, 'contain')
    if (!browser) return
    convertBannerDismissed = sessionStorage.getItem(CONVERT_BANNER_KEY) === '1'
    const mq = window.matchMedia('(max-width: 599px)')
    compactPlanChrome = mq.matches
    /** @param {MediaQueryListEvent} e */
    const onMq = (e) => {
      compactPlanChrome = e.matches
      // Desktop has no erase-mode chrome (select → Delete / selection bar).
      // Clear orphan remove tools left over from compact.
      if (!e.matches) {
        if (graphTool === 'remove') setGraphTool('select')
        if (zoneTool === 'zoneRemove') setZoneTool('zoneSelect')
      }
    }
    mq.addEventListener('change', onMq)
    return () => mq.removeEventListener('change', onMq)
  })

  /** @param {string} code */
  function selectZone(code) {
    goto(`/storage?zone=${encodeURIComponent(code)}`)
  }

  function clearSelection() {
    selectedWall = ''
    selectedOpening = ''
    selectedEdge = ''
    selectedSpatialZone = ''
    selectedPlacement = ''
  }

  function clearZoneChain() {
    zoneChainPoints = []
    zoneChainHover = null
  }

  function clearGraphChain() {
    wallChainFrom = null
    wallChainHover = null
  }

  /** @param {{ x: number, y: number }} pt */
  function onZonePoint(pt) {
    if (zoneTool !== 'zoneAdd') return
    const pxPerFt = project.wallGraph?.pxPerFt ?? 36
    const snapped = snapGraphPoint(pt.x, pt.y, pxPerFt)
    if (!zoneChainPoints.length) {
      zoneChainPoints = [snapped]
      return
    }
    if (
      zoneChainPoints.length >= 3 &&
      canClosePolygon(snapped, zoneChainPoints[0])
    ) {
      const id = addZone([...zoneChainPoints], undefined)
      clearZoneChain()
      if (id) selectedSpatialZone = id
      return
    }
    zoneChainPoints = [...zoneChainPoints, snapped]
  }

  function closeZoneChainFromKeyboard() {
    if (zoneChainPoints.length < 3) return
    const id = addZone([...zoneChainPoints], undefined)
    clearZoneChain()
    if (id) selectedSpatialZone = id
  }

  /** @param {import('$lib/plan-placement-edit.js').PlacementTool} tool */
  function setPlacementTool(tool) {
    placementTool = tool
    previewPlacements = null
    storagePickerOpen = false
    placementKindsOpen = false
  }

  /** @param {keyof typeof PLACEMENT_KINDS} kind */
  function setPlacementKind(kind) {
    placementKind = kind
    placementKindsOpen = false
  }

  /** @param {{ x: number, y: number }} pt */
  function onPlacementPoint(pt) {
    if (placementTool !== 'place') return
    const id = addPlacement(placementKind, pt.x, pt.y)
    if (id) selectedPlacement = id
  }

  /** @param {{ x: number, y: number }} pt */
  function onAssignStorageAt(pt) {
    const zones = project.zones ?? []
    const placements = project.placements ?? []
    /** @type {{ zoneId?: string, placementId?: string }} */
    const target = {}
    for (const p of placements) {
      if (
        pt.x >= p.x &&
        pt.x <= p.x + p.w &&
        pt.y >= p.y &&
        pt.y <= p.y + p.h
      ) {
        target.placementId = p.id
        break
      }
    }
    if (!target.placementId) {
      const z = findZoneAtPoint(zones, pt)
      if (z) target.zoneId = z.id
    }
    if (!target.placementId && !target.zoneId) return
    storagePickerTarget = target
    storagePickerOpen = true
  }

  /** @param {string} code */
  function pickStorageCode(code) {
    assignStorageZone(code, storagePickerTarget)
    storagePickerOpen = false
  }

  $effect(() => {
    const dialog = storagePickerDialog
    if (!dialog || !browser) return
    if (storagePickerOpen) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  })

  $effect(() => {
    const dialog = placementKindsDialog
    if (!dialog || !browser) return
    if (placementKindsOpen) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  })

  /** @param {import('$lib/plan-zone-edit.js').ZoneTool} tool */
  function setZoneTool(tool) {
    zoneTool = tool
    clearZoneChain()
    previewZones = null
  }

  /** @param {{ x: number, y: number }} from @param {{ x: number, y: number }} to */
  function orthoPoint(from, to) {
    const dx = Math.abs(to.x - from.x)
    const dy = Math.abs(to.y - from.y)
    return dx > dy ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
  }

  /** @param {{ x: number, y: number }} pt */
  function onGraphWallPoint(pt) {
    if (graphTool !== 'wallAdd') return
    const target = wallChainFrom && wallChainHover ? wallChainHover : pt
    if (!wallChainFrom) {
      wallChainFrom = target
      return
    }
    if (addGraphWall(wallChainFrom.x, wallChainFrom.y, target.x, target.y)) {
      wallChainFrom = target
    }
  }

  function performUndo() {
    if (wallGraphEditMode) undoGraphEdit()
    else undoLayoutEdit()
  }

  function performRedo() {
    if (wallGraphEditMode) redoGraphEdit()
    else redoLayoutEdit()
  }

  function openDrawerForSelection(
    /** @type {'edge' | '508' | 'graphOpening'} */ kind = '508',
  ) {
    if (kind === 'graphOpening') return
    // Compact/mobile: bottom bars + 详情/FAB；不自动弹 drawer（UX-03 对齐）
    if (compactPlanChrome) return
    drawerOpen = true
  }

  /** @param {{ x: number, y: number }} pt */
  function onBlankContextMenu(pt) {
    ctxMenu = { open: true, x: pt.x, y: pt.y }
  }

  const ctxMenuItems = $derived.by(() => {
    /** @type {{ id: string, label: string, action: () => void }[]} */
    const items = []
    if (planMode !== 'edit') {
      items.push({
        id: 'edit',
        label: '编辑',
        action: () => setPlanMode('edit'),
      })
    }
    if (planMode !== 'browse') {
      items.push({
        id: 'browse',
        label: '浏览',
        action: () => setPlanMode('browse'),
      })
    }
    if (selectedWall || selectedOpening) {
      items.push({
        id: 'clear',
        label: '取消选中',
        action: () => clearSelection(),
      })
    }
    return items
  })

  /** @param {'browse' | 'edit'} mode */
  function setPlanMode(mode) {
    planMode = mode
    if (mode === 'edit' && wallGraph) {
      editStep = 'walls'
      graphTool = 'wallAdd'
    }
    if (mode !== 'edit') {
      clearSelection()
      clearGraphChain()
    }
    if (mode === 'browse') drawerOpen = false
    graphPreviewGraph = null
    graphPreviewOpenings = null
    if (mode === 'edit' && compactPlanChrome && wallGraph) {
      bumpFit(false, 'contain')
    } else {
      bumpFit(false)
    }
  }

  /** Side effects after edit step changes (compact select uses bind:value). */
  function syncEditStepSideEffects() {
    clearSelection()
    clearGraphChain()
    clearZoneChain()
    graphPreviewGraph = null
    graphPreviewOpenings = null
    previewZones = null
    previewPlacements = null
    if (editStep === 'zones') zoneTool = 'zoneAdd'
    if (editStep === 'place') placementTool = 'place'
    if (compactPlanChrome && (editStep === 'walls' || editStep === 'place')) {
      bumpFit(false, 'contain')
    } else {
      bumpFit(false)
    }
  }

  /** @param {'walls' | 'zones' | 'place'} step */
  function setEditStep(step) {
    if (!wallGraph && step !== 'walls') return
    if (step === 'place' && !wallGraph) return
    const prev = editStep
    editStep = step
    if (prev !== step) syncEditStepSideEffects()
  }

  /** @param {import('$lib/plan-graph-edit.js').GraphTool} tool */
  function setGraphTool(tool) {
    graphTool = tool
    clearGraphChain()
    graphPreviewGraph = null
    graphPreviewOpenings = null
  }

  function convertToWallGraph() {
    activateWallGraphMode()
    editStep = 'walls'
    graphTool = 'wallAdd'
    if (planMode !== 'edit') planMode = 'edit'
    convertBannerDismissed = true
    if (browser) sessionStorage.setItem(CONVERT_BANNER_KEY, '1')
    bumpFit(false)
  }

  function dismissConvertBanner() {
    convertBannerDismissed = true
    if (browser) sessionStorage.setItem(CONVERT_BANNER_KEY, '1')
  }

  /** 浮动工具栏当前高亮的工具 */
  const toolbarActiveTool = $derived.by(() => {
    if (planMode !== 'edit' || !wallGraph) return null
    if (editStep === 'walls') {
      if (graphTool === 'wallAdd') return 'wall'
      if (graphTool === 'opening') return 'opening'
      if (graphTool === 'select') return 'select'
      return null
    }
    if (editStep === 'zones') {
      if (zoneTool === 'zoneAdd') return 'zone'
      if (zoneTool === 'zoneSelect') return 'select'
      return null
    }
    if (editStep === 'place') {
      return placementTool === 'place' ? 'furniture' : null
    }
    return null
  })

  /** @param {'select' | 'wall' | 'opening' | 'zone' | 'furniture'} id */
  function activateToolbarTool(id) {
    if (!wallGraph) {
      convertToWallGraph()
    } else if (planMode !== 'edit') {
      setPlanMode('edit')
    }
    if (id === 'select') {
      if (editStep === 'zones') {
        setZoneTool('zoneSelect')
      } else {
        setEditStep('walls')
        setGraphTool('select')
      }
      return
    }
    if (id === 'wall') {
      setEditStep('walls')
      setGraphTool('wallAdd')
      return
    }
    if (id === 'opening') {
      setEditStep('walls')
      setGraphTool('opening')
      return
    }
    if (id === 'zone') {
      setEditStep('zones')
      setZoneTool('zoneAdd')
      return
    }
    if (id === 'furniture') {
      setEditStep('place')
      setPlacementTool('place')
    }
  }

  function handleResetToShell() {
    const ok = window.confirm(
      '清空户型？将删除所有内墙、门窗、分区与房间，仅保留最外围墙（可用 ⌘Z 撤销）。',
    )
    if (!ok) return
    if (!resetToOuterShell()) return
    clearSelection()
    clearGraphChain()
    clearZoneChain()
    graphPreviewGraph = null
    graphPreviewOpenings = null
    previewZones = null
    previewPlacements = null
    if (planMode !== 'edit') {
      setPlanMode('edit')
    } else {
      setEditStep('walls')
    }
    graphTool = 'wallAdd'
    convertBannerDismissed = true
    if (browser) sessionStorage.setItem(CONVERT_BANNER_KEY, '1')
    bumpFit(false, 'contain')
  }

  $effect(() => {
    setPlanSubtitle(appBarSubtitle)
  })

  $effect(() => {
    setPlanImmersiveEdit(planMode === 'edit' && compactPlanChrome)
    return () => setPlanImmersiveEdit(false)
  })

  $effect(() => {
    /** @param {KeyboardEvent} e */
    function onKey(e) {
      const tag = e.target instanceof Element ? e.target.tagName : ''
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if (e.key === '?' && !inField) {
        e.preventDefault()
        showHelp = !showHelp
        return
      }

      if (
        (e.key === 'e' || e.key === 'E') &&
        !inField &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault()
        setPlanMode(planMode === 'edit' ? 'browse' : 'edit')
        return
      }

      if (
        (e.key === 'f' || e.key === 'F') &&
        !inField &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault()
        bumpFit(true)
        return
      }

      if (e.key === 'Escape') {
        if (showHelp) {
          showHelp = false
          return
        }
        if (storagePickerOpen) {
          storagePickerOpen = false
          return
        }
        if (placementKindsOpen) {
          placementKindsOpen = false
          return
        }
        if (drawerOpen) {
          drawerOpen = false
          return
        }
        if (graphEditMode) {
          if (selectedOpening) selectedOpening = ''
          else if (selectedEdge) selectedEdge = ''
          else if (wallChainFrom) clearGraphChain()
          else if (graphPreviewGraph || graphPreviewOpenings) {
            graphPreviewGraph = null
            graphPreviewOpenings = null
          } else setPlanMode('browse')
          return
        }
        if (zoneEditMode) {
          if (selectedSpatialZone) selectedSpatialZone = ''
          else if (zoneChainPoints.length) clearZoneChain()
          else if (previewZones) previewZones = null
          else setPlanMode('browse')
          return
        }
        if (placeEditMode) {
          if (selectedPlacement) selectedPlacement = ''
          else if (placementTool === 'storage') setPlacementTool('place')
          else if (previewPlacements) previewPlacements = null
          else setPlanMode('browse')
          return
        }
        if (planMode === 'edit') {
          if (selectedWall || selectedOpening) clearSelection()
          else setPlanMode('browse')
        }
        return
      }

      if (
        e.key === 'Enter' &&
        zoneEditMode &&
        zoneTool === 'zoneAdd' &&
        zoneChainPoints.length >= 3 &&
        !inField
      ) {
        e.preventDefault()
        closeZoneChainFromKeyboard()
        return
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        placeEditMode &&
        selectedPlacement &&
        !inField
      ) {
        e.preventDefault()
        removePlacement(selectedPlacement)
        selectedPlacement = ''
        return
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        zoneEditMode &&
        selectedSpatialZone &&
        !inField
      ) {
        e.preventDefault()
        removeZone(selectedSpatialZone)
        selectedSpatialZone = ''
        return
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        graphEditMode &&
        selectedOpening &&
        !inField
      ) {
        e.preventDefault()
        removeGraphOpening(selectedOpening)
        selectedOpening = ''
        return
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        graphEditMode &&
        selectedEdge &&
        !inField
      ) {
        e.preventDefault()
        removeGraphWall(selectedEdge)
        selectedEdge = ''
        return
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        editMode508 &&
        selectedOpening &&
        !inField
      ) {
        e.preventDefault()
        if (!isOpeningDisabled(selectedOpening)) {
          setOpeningDisabled(selectedOpening, true)
          clearSelection()
        }
        return
      }

      // Align with PlanEditToolbar: select / wall / opening (delete = select + Delete / bar)
      if (!inField && graphEditMode && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        if (e.key === '1') setGraphTool('select')
        if (e.key === '2') setGraphTool('wallAdd')
        if (e.key === '3') setGraphTool('opening')
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        if (inField) return
        if (wallGraphEditMode && canUndoGraph()) {
          e.preventDefault()
          undoGraphEdit()
          return
        }
        if (!canUndoLayout()) return
        e.preventDefault()
        undoLayoutEdit()
      }
      if (
        ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) ||
        (e.ctrlKey && e.key === 'y')
      ) {
        if (inField) return
        if (wallGraphEditMode && canRedoGraph()) {
          e.preventDefault()
          redoGraphEdit()
          return
        }
        if (!canRedoLayout()) return
        e.preventDefault()
        redoLayoutEdit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

<div
  class="plan-page"
  class:plan-page-immersive={planMode === 'edit' && compactPlanChrome}
>
  <header
    class="plan-top"
    class:plan-top-edit={planMode === 'edit'}
    aria-label="平面图模式"
  >
    <div class="plan-top-primary">
      <div class="mode-segment" role="group" aria-label="浏览或编辑">
        <button
          type="button"
          class="mode-btn"
          class:active={planMode === 'browse'}
          aria-pressed={planMode === 'browse'}
          onclick={() => setPlanMode('browse')}
        >
          浏览
        </button>
        <button
          type="button"
          class="mode-btn"
          class:active={planMode === 'edit'}
          aria-pressed={planMode === 'edit'}
          onclick={() => setPlanMode('edit')}
        >
          编辑
        </button>
      </div>

      {#if planMode === 'edit' && compactPlanChrome}
        <div class="edit-chrome-wrap edit-chrome-compact">
          <label class="plan-tool-select-wrap">
            <span class="sr-only">编辑步骤</span>
            <select
              class="plan-tool-select"
              aria-label="编辑步骤"
              value={editStep}
              onchange={(e) =>
                setEditStep(
                  /** @type {'walls' | 'zones' | 'place'} */ (
                    /** @type {HTMLSelectElement} */ (e.currentTarget).value
                  ),
                )}
            >
              <option value="walls">① 墙体</option>
              <option value="zones" disabled={!wallGraph}>② 划分</option>
              <option value="place" disabled={!wallGraph}>③ 布置</option>
            </select>
          </label>

          {#if graphEditMode}
            <label class="plan-tool-select-wrap">
              <span class="sr-only">墙图工具</span>
              <select
                class="plan-tool-select"
                aria-label="墙图工具"
                value={graphTool}
                onchange={(e) =>
                  setGraphTool(
                    /** @type {import('$lib/plan-graph-edit.js').GraphTool} */ (
                      /** @type {HTMLSelectElement} */ (e.currentTarget).value
                    ),
                  )}
              >
                <option value="select">选择</option>
                <option value="wallAdd">建墙</option>
                <option value="opening">门窗</option>
                <option value="remove">删墙</option>
              </select>
            </label>
          {:else if zoneEditMode}
            <label class="plan-tool-select-wrap">
              <span class="sr-only">分区工具</span>
              <select
                class="plan-tool-select"
                aria-label="分区工具"
                value={zoneTool}
                onchange={(e) =>
                  setZoneTool(
                    /** @type {import('$lib/plan-zone-edit.js').ZoneTool} */ (
                      /** @type {HTMLSelectElement} */ (e.currentTarget).value
                    ),
                  )}
              >
                <option value="zoneAdd">画区</option>
                <option value="zoneSelect">选区</option>
                <option value="zoneRemove">删区</option>
              </select>
            </label>
          {:else if placeEditMode}
            <label class="plan-tool-select-wrap">
              <span class="sr-only">布置工具</span>
              <select
                class="plan-tool-select"
                aria-label="布置工具"
                value={placementTool}
                onchange={(e) =>
                  setPlacementTool(
                    /** @type {import('$lib/plan-placement-edit.js').PlacementTool} */ (
                      /** @type {HTMLSelectElement} */ (e.currentTarget).value
                    ),
                  )}
              >
                <option value="place">家具</option>
                <option value="storage">标储藏</option>
              </select>
            </label>
            {#if placementTool === 'place'}
              <label class="plan-tool-select-wrap">
                <span class="sr-only">家具类型</span>
                <select
                  class="plan-tool-select"
                  aria-label="家具类型"
                  value={placementKind}
                  onchange={(e) =>
                    setPlacementKind(
                      /** @type {keyof typeof PLACEMENT_KINDS} */ (
                        /** @type {HTMLSelectElement} */ (e.currentTarget).value
                      ),
                    )}
                >
                  {#each Object.entries(PLACEMENT_KINDS) as [kind, spec] (kind)}
                    <option value={kind}>{spec.label}</option>
                  {/each}
                </select>
              </label>
            {/if}
          {/if}
        </div>
      {/if}

      {#if editMode508 || (wallGraphEditMode && compactPlanChrome)}
        <div class="mode-history" role="group" aria-label="编辑历史">
          <button
            type="button"
            class="mode-undo-btn"
            disabled={!canUndo}
            title="撤销 (⌘Z)"
            aria-label="撤销"
            onclick={performUndo}>↶</button
          >
          <button
            type="button"
            class="mode-undo-btn"
            disabled={!canRedo}
            title="重做"
            aria-label="重做"
            onclick={performRedo}>↷</button
          >
          {#if wallGraphEditMode && compactPlanChrome}
            <button
              type="button"
              class="mode-undo-btn mode-reset-btn"
              title="清空户型"
              aria-label="清空户型"
              onclick={handleResetToShell}>清空</button
            >
          {/if}
        </div>
      {/if}

      <button
        type="button"
        class="help-btn"
        onclick={() => (showHelp = !showHelp)}
        aria-label="快捷键与操作提示"
        title="快捷键与操作提示"
      >
        ?
      </button>
    </div>

    {#if planMode === 'edit' && !compactPlanChrome}
      <div class="edit-chrome-wrap">
        <div class="step-segment" role="group" aria-label="编辑步骤">
          <button
            type="button"
            class="step-btn"
            class:active={editStep === 'walls'}
            aria-pressed={editStep === 'walls'}
            onclick={() => setEditStep('walls')}
          >
            ① 墙体
          </button>
          <button
            type="button"
            class="step-btn"
            class:active={editStep === 'zones'}
            aria-pressed={editStep === 'zones'}
            disabled={!wallGraph}
            title={wallGraph ? '手绘分区' : '请先转换为墙图'}
            onclick={() => setEditStep('zones')}
          >
            ② 划分
          </button>
          <button
            type="button"
            class="step-btn"
            class:active={editStep === 'place'}
            aria-pressed={editStep === 'place'}
            disabled={!wallGraph}
            title={wallGraph ? '家具与储藏指派' : '请先转换为墙图'}
            onclick={() => setEditStep('place')}
          >
            ③ 布置
          </button>
        </div>

        {#if placeEditMode}
          <div class="tool-segment-scroll" data-scroll-hint="tools">
            <div class="tool-segment" role="group" aria-label="布置工具">
              <button
                type="button"
                class="step-btn"
                class:active={placementTool === 'place'}
                aria-pressed={placementTool === 'place'}
                onclick={() => setPlacementTool('place')}
              >
                家具
              </button>
              <button
                type="button"
                class="step-btn"
                class:active={placementTool === 'storage'}
                aria-pressed={placementTool === 'storage'}
                onclick={() => setPlacementTool('storage')}
              >
                标储藏
              </button>
            </div>
          </div>
          {#if placementTool === 'place'}
            <div class="tool-segment-scroll" data-scroll-hint="kinds">
              <div class="tool-segment" role="group" aria-label="家具类型">
                {#each Object.entries(PLACEMENT_KINDS) as [kind, spec] (kind)}
                  <button
                    type="button"
                    class="step-btn step-btn-compact"
                    class:active={placementKind === kind}
                    aria-pressed={placementKind === kind}
                    onclick={() =>
                      setPlacementKind(
                        /** @type {keyof typeof PLACEMENT_KINDS} */ (kind),
                      )}
                  >
                    {spec.label}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      </div>
    {/if}

    {#if editMode508 && !convertBannerDismissed}
      <div class="plan-convert-banner" role="note">
        <div class="plan-convert-copy">
          <strong>参数模式</strong>
          <span>转换为墙图后可自由建删墙、沿墙拖门窗。</span>
        </div>
        <div class="plan-convert-actions">
          <button
            type="button"
            class="plan-convert-cta"
            onclick={convertToWallGraph}
          >
            转换为墙图
          </button>
          <button
            type="button"
            class="plan-convert-dismiss"
            onclick={dismissConvertBanner}
            aria-label="稍后提醒"
          >
            稍后
          </button>
        </div>
      </div>
    {/if}
  </header>

  <PlanShortcutsHelp
    open={showHelp}
    contextHint={modeHint}
    {graphEditMode}
    editStep={wallGraph && planMode === 'edit' ? editStep : null}
    onClose={() => (showHelp = false)}
  />

  <div class="plan-stage">
    {#if wallGraphEmpty}
      <p class="plan-empty-wallgraph" role="status">
        墙图为空 · ① 墙体中用「建墙」点击拐点连线，或到设置页从 508 重新转换
      </p>
    {/if}
    {#if wallGraph && planMode === 'browse' && !project.zones?.length}
      <p class="plan-snapshot-badge" role="note">
        房间名与色块来自 508 参数快照 · 在编辑②划分中手绘分区后替换
      </p>
    {/if}
    <FloorPlanViewer
      project={viewerProject}
      canvasPriority
      hideFurniture
      editMode={editMode508}
      {graphEditMode}
      toolbarMinimal={compactPlanChrome && planMode === 'edit'}
      {graphTool}
      {fitRequest}
      {selectedWall}
      {selectedOpening}
      {selectedEdge}
      {wallChainFrom}
      {wallChainHover}
      {zoneEditMode}
      {zoneTool}
      {selectedSpatialZone}
      zoneChainFrom={zoneChainPoints[0] ?? null}
      {zoneChainHover}
      {zoneChainPoints}
      {previewZones}
      onZonePoint={zoneEditMode ? onZonePoint : undefined}
      onSelectSpatialZone={(id) => {
        selectedSpatialZone = id
      }}
      onRemoveSpatialZone={(id) => {
        removeZone(id)
        if (selectedSpatialZone === id) selectedSpatialZone = ''
      }}
      onZoneHover={(pt) => {
        zoneChainHover = pt
      }}
      onZoneVertexDragStart={() => {
        previewZones = project.zones ?? []
      }}
      onZoneVertexDrag={(zoneId, index, pt) => {
        const pxPerFt = project.wallGraph?.pxPerFt ?? 36
        const snapped = snapGraphPoint(pt.x, pt.y, pxPerFt)
        previewZones = (project.zones ?? []).map((z) => {
          if (z.id !== zoneId) return z
          return {
            ...z,
            polygon: z.polygon.map((p, i) => (i === index ? snapped : p)),
          }
        })
      }}
      onZoneVertexDrop={(zoneId, index, pt) => {
        previewZones = null
        commitZoneVertexMove(zoneId, index, pt.x, pt.y)
      }}
      placementEditMode={placeEditMode}
      {placementTool}
      {selectedPlacement}
      showFurniture={placeEditMode || planMode === 'browse'}
      onPlacementPoint={placeEditMode ? onPlacementPoint : undefined}
      onAssignStorage={placeEditMode ? onAssignStorageAt : undefined}
      onSelectPlacement={(id) => {
        selectedPlacement = id
      }}
      onPlacementDragStart={() => {
        previewPlacements = project.placements ?? []
      }}
      onPlacementDrag={(id, pt) => {
        const p = (project.placements ?? []).find((x) => x.id === id)
        if (!p) return
        previewPlacements = (project.placements ?? []).map((item) =>
          item.id === id
            ? { ...item, x: pt.x - item.w / 2, y: pt.y - item.h / 2 }
            : item,
        )
      }}
      onPlacementDrop={(id, pt) => {
        previewPlacements = null
        commitPlacementMove(id, pt.x, pt.y)
      }}
      onZoneSelect={planMode === 'browse' ? selectZone : undefined}
      onClearSelection={editMode508 ? clearSelection : undefined}
      onGraphWallPoint={graphEditMode ? onGraphWallPoint : undefined}
      onGraphRemoveEdge={(id) => removeGraphWall(id)}
      onPlaceOpening={(pt, edgeId) => {
        const id = addGraphOpening(edgeId, pt, 'door')
        if (id) {
          selectedOpening = id
          selectedEdge = ''
          setGraphTool('select')
        }
      }}
      onGraphSelectEdge={(id) => {
        selectedEdge = id
        selectedOpening = ''
      }}
      onGraphSelectOpening={(id) => {
        selectedOpening = id
        selectedEdge = ''
      }}
      onOpeningDragStart={() => {
        graphPreviewOpenings = project.graphOpenings ?? []
      }}
      onOpeningDrag={(id, pt, mode) => {
        if (!project.wallGraph) return
        graphPreviewOpenings = previewGraphOpeningDrag(
          project.wallGraph,
          project.graphOpenings ?? [],
          id,
          pt,
          mode,
        )
      }}
      onOpeningDrop={(id, pt, mode) => {
        graphPreviewOpenings = null
        commitGraphOpeningEdit(id, pt, mode)
      }}
      onGraphHover={(pt, shiftKey) => {
        if (!pt || !wallChainFrom) {
          wallChainHover = pt
          return
        }
        wallChainHover =
          shiftKey && wallChainFrom ? orthoPoint(wallChainFrom, pt) : pt
      }}
      onVertexDragStart={() => {
        graphPreviewGraph = project.wallGraph ?? null
      }}
      onVertexDrag={(vertexId, pt) => {
        if (!project.wallGraph) return
        graphPreviewGraph = previewGraphVertexMove(
          project.wallGraph,
          vertexId,
          pt.x,
          pt.y,
        )
      }}
      onVertexDrop={(vertexId, pt) => {
        graphPreviewGraph = null
        commitGraphVertexMove(vertexId, pt.x, pt.y)
      }}
      onSelectWall={(id) => {
        selectedWall = id
        selectedOpening = ''
        openDrawerForSelection()
      }}
      onSelectOpening={(id) => {
        selectedOpening = id
        selectedWall = ''
        openDrawerForSelection()
      }}
      {onBlankContextMenu}
    />
    <PlanEditToolbar
      activeTool={toolbarActiveTool}
      {canUndo}
      {canRedo}
      hidden={planMode !== 'edit' || editMode508 || compactPlanChrome}
      onTool={activateToolbarTool}
      onUndo={performUndo}
      onRedo={performRedo}
      onReset={handleResetToShell}
    />
    {#if showSelectionBar}
      <PlanSelectionBar
        {selectedWall}
        {selectedOpening}
        compact={compactPlanChrome}
        onClear={clearSelection}
        onOpenDetails={() => (drawerOpen = true)}
      />
    {/if}
    {#if showGraphOpeningSelectionBar}
      <PlanGraphOpeningSelectionBar
        {selectedOpening}
        compact={compactPlanChrome}
        onClear={() => {
          selectedOpening = ''
        }}
      />
    {/if}
    {#if showGraphSelectionBar}
      <PlanGraphSelectionBar
        {selectedEdge}
        compact={compactPlanChrome}
        onClear={() => {
          selectedEdge = ''
        }}
        onSplit={() => {
          if (splitGraphWall(selectedEdge)) selectedEdge = ''
        }}
        onOpenDetails={() => (drawerOpen = true)}
      />
    {/if}
    {#if showPlacementSelectionBar && selectedPlacementObj}
      <PlanPlacementSelectionBar
        placement={selectedPlacementObj}
        compact={compactPlanChrome}
        onClear={() => {
          selectedPlacement = ''
        }}
      />
    {/if}
    <dialog
      bind:this={storagePickerDialog}
      class="storage-picker plan-modal-picker"
      aria-labelledby="storage-picker-title"
      onclose={() => (storagePickerOpen = false)}
    >
      <p id="storage-picker-title" class="storage-picker-title">指派到储藏区</p>
      <div class="storage-picker-grid">
        {#each STORAGE_CODES as code (code)}
          <button
            type="button"
            class="storage-picker-btn"
            onclick={() => pickStorageCode(code)}
          >
            {code}
          </button>
        {/each}
      </div>
      <button
        type="button"
        class="storage-picker-cancel"
        onclick={() => (storagePickerOpen = false)}
      >
        取消
      </button>
    </dialog>
    <dialog
      bind:this={placementKindsDialog}
      class="placement-kinds-picker plan-modal-picker"
      aria-labelledby="placement-kinds-title"
      onclose={() => (placementKindsOpen = false)}
    >
      <p id="placement-kinds-title" class="storage-picker-title">
        选择家具类型
      </p>
      <div class="storage-picker-grid placement-kinds-grid">
        {#each Object.entries(PLACEMENT_KINDS) as [kind, spec] (kind)}
          <button
            type="button"
            class="storage-picker-btn"
            class:active={placementKind === kind}
            aria-pressed={placementKind === kind}
            onclick={() =>
              setPlacementKind(
                /** @type {keyof typeof PLACEMENT_KINDS} */ (kind),
              )}
          >
            {spec.label}
          </button>
        {/each}
      </div>
      <button
        type="button"
        class="storage-picker-cancel"
        onclick={() => (placementKindsOpen = false)}
      >
        取消
      </button>
    </dialog>
    {#if showZoneSelectionBar && selectedZoneObj}
      <PlanZoneSelectionBar
        zone={selectedZoneObj}
        compact={compactPlanChrome}
        onClear={() => {
          selectedSpatialZone = ''
        }}
      />
    {/if}
    <PlanLegend
      overlay
      interactive={planMode === 'browse'}
      editMode={editMode508}
      {graphEditMode}
      {zoneEditMode}
      {placeEditMode}
    />

    <button
      type="button"
      class="plan-drawer-fab"
      class:open={drawerOpen}
      class:hide-for-bar={hideFabForBar && !drawerOpen}
      aria-expanded={drawerOpen}
      aria-controls="plan-drawer"
      onclick={() => (drawerOpen = !drawerOpen)}
    >
      {drawerOpen ? '收起' : drawerLabel}
    </button>

    {#if drawerOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="plan-drawer-backdrop"
        onclick={() => (drawerOpen = false)}
        role="presentation"
      ></div>
      <aside id="plan-drawer" class="plan-drawer" aria-label="平面侧面板">
        <header class="plan-drawer-head">
          <h2 class="plan-drawer-title">{drawerLabel}</h2>
          <button
            type="button"
            class="plan-drawer-close"
            onclick={() => (drawerOpen = false)}
            aria-label="关闭面板">×</button
          >
        </header>
        <div class="plan-drawer-body">
          {#if graphEditMode}
            <section class="graph-aside" aria-label="墙图编辑">
              <p class="graph-aside-lead">
                顶点 {project.wallGraph?.vertices.length ?? 0} · 墙段
                {project.wallGraph?.edges.length ?? 0}
              </p>
              {#if wallChainFrom}
                <button
                  type="button"
                  class="graph-aside-btn"
                  onclick={clearGraphChain}
                >
                  清除建墙链点
                </button>
              {/if}
              {#if selectedEdge}
                <button
                  type="button"
                  class="graph-aside-btn"
                  onclick={() => {
                    if (splitGraphWall(selectedEdge)) selectedEdge = ''
                  }}>分割选中墙段</button
                >
              {/if}
            </section>
          {:else if zoneEditMode}
            <section class="graph-aside" aria-label="分区编辑">
              <p class="graph-aside-lead">
                已划分 {project.zones?.length ?? 0} 个分区
              </p>
              {#if zoneChainPoints.length}
                <button
                  type="button"
                  class="graph-aside-btn"
                  onclick={clearZoneChain}
                >
                  清除画区链点
                </button>
                <button
                  type="button"
                  class="graph-aside-btn"
                  onclick={closeZoneChainFromKeyboard}
                  disabled={zoneChainPoints.length < 3}
                >
                  闭合当前分区
                </button>
              {/if}
            </section>
          {:else if placeEditMode}
            <section class="graph-aside" aria-label="布置编辑">
              <p class="graph-aside-lead">
                已放置 {project.placements?.length ?? 0} 件家具
              </p>
              {#if selectedPlacementObj}
                <p class="graph-aside-lead">
                  {selectedPlacementObj.label} · {Math.round(
                    selectedPlacementObj.w,
                  )}″×{Math.round(selectedPlacementObj.h)}″
                </p>
                <button
                  type="button"
                  class="graph-aside-btn"
                  onclick={() => rotatePlacementById(selectedPlacementObj.id)}
                >
                  旋转选中家具 90°
                </button>
                <button
                  type="button"
                  class="graph-aside-btn"
                  onclick={() => {
                    removePlacement(selectedPlacementObj.id)
                    selectedPlacement = ''
                  }}
                >
                  删除选中家具
                </button>
              {:else}
                <p class="graph-aside-lead">
                  选中画布上的家具可在此编辑；「标储藏」点击分区或家具指派
                  S1–S8。
                </p>
              {/if}
            </section>
          {:else if editMode508}
            <PlanEditInspector
              {selectedWall}
              {selectedOpening}
              onClear={clearSelection}
            />
          {:else}
            <RoomDimensionsEditor />
          {/if}
        </div>
      </aside>
    {/if}
  </div>
</div>

<PlanContextMenu
  open={ctxMenu.open}
  x={ctxMenu.x}
  y={ctxMenu.y}
  items={ctxMenuItems}
  onClose={() => (ctxMenu = { open: false, x: 0, y: 0 })}
/>

<style>
  .plan-page {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 0;
  }

  .plan-top {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 10px;
    padding: var(--stack-tight) var(--stack-section);
    flex-shrink: 0;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
    background: color-mix(in srgb, var(--card) 90%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 20px -12px rgba(0, 0, 0, 0.18);
  }

  .plan-top-primary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .edit-chrome-wrap {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    flex: 1 1 100%;
  }

  .plan-tool-select-wrap {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
  }

  .plan-tool-select {
    width: 100%;
    min-height: 44px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t1);
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .tool-segment-scroll {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
  }

  .tool-segment-scroll::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 20px;
    pointer-events: none;
    background: linear-gradient(
      to left,
      color-mix(in srgb, var(--card) 96%, transparent),
      transparent
    );
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .mode-segment {
    display: inline-flex;
    padding: 4px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    gap: 3px;
  }

  .mode-btn {
    font-size: 14px;
    font-weight: 650;
    min-height: 40px;
    min-width: 72px;
    padding: 8px 18px;
    border-radius: 999px;
    border: none;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .mode-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .mode-btn.active {
    background: var(--accent);
    color: #f5f8fa;
    box-shadow: 0 2px 10px -2px color-mix(in srgb, var(--accent) 50%, transparent);
  }

  .step-segment {
    display: inline-flex;
    padding: 3px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    background: color-mix(in srgb, var(--bg) 85%, transparent);
    gap: 2px;
  }

  .tool-segment {
    display: inline-flex;
    padding: 3px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--graph-accent) 25%, var(--border));
    background: color-mix(in srgb, var(--graph-accent) 6%, var(--bg));
    gap: 2px;
  }

  .step-btn {
    font-size: 12px;
    font-weight: 600;
    min-height: 34px;
    padding: 6px 12px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
    white-space: nowrap;
  }

  .step-btn:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  .step-btn.active {
    background: color-mix(in srgb, var(--accent) 14%, var(--card));
    color: var(--accent);
  }

  .tool-segment .step-btn.active {
    background: color-mix(in srgb, var(--graph-accent) 14%, var(--card));
    color: var(--graph-accent);
  }

  .plan-convert-banner {
    flex: 1 1 100%;
    margin: 0;
    padding: 10px 12px;
    border-radius: 10px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 14px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--t2);
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
    border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  }

  .plan-convert-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .plan-convert-copy strong {
    color: var(--t1);
    font-size: 13px;
  }

  .plan-convert-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .plan-convert-cta {
    font-size: 13px;
    font-weight: 650;
    min-height: 40px;
    padding: 8px 14px;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: #f5f8fa;
    cursor: pointer;
    white-space: nowrap;
  }

  .plan-convert-dismiss {
    font-size: 12px;
    font-weight: 600;
    min-height: 40px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--t2);
    cursor: pointer;
  }

  .graph-aside {
    padding: 14px 16px;
  }

  .graph-aside-lead {
    margin: 0 0 10px;
    font-size: 13px;
    color: var(--t2);
    font-family: var(--mono);
  }

  .graph-aside-btn {
    display: block;
    width: 100%;
    margin-top: 8px;
    font-size: 13px;
    font-weight: 600;
    min-height: 40px;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t1);
    cursor: pointer;
  }

  .help-btn {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t2);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }

  .mode-history {
    display: inline-flex;
    gap: 4px;
  }

  .mode-undo-btn {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--accent);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    line-height: 1;
  }

  .mode-undo-btn:disabled {
    opacity: 0.38;
    color: var(--t3);
    cursor: not-allowed;
  }

  .mode-undo-btn:not(:disabled):hover {
    background: color-mix(in srgb, var(--accent) 10%, var(--card));
  }

  .mode-reset-btn {
    width: auto;
    min-width: 44px;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 650;
    color: #b45309;
    border-color: color-mix(in srgb, #b45309 35%, var(--border));
  }

  .mode-reset-btn:not(:disabled):hover {
    background: color-mix(in srgb, #b45309 10%, var(--card));
    color: #b45309;
  }

  .plan-snapshot-badge {
    flex: 0 0 auto;
    margin: 0 0 6px;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 11px;
    font-family: var(--mono);
    color: var(--t2);
    background: color-mix(in srgb, var(--graph-accent) 8%, var(--card));
    border: 1px solid color-mix(in srgb, var(--graph-accent) 20%, var(--border));
  }

  .plan-empty-wallgraph {
    flex: 0 0 auto;
    margin: 0 0 6px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--t2);
    background: color-mix(in srgb, #b45309 10%, var(--card));
    border: 1px solid color-mix(in srgb, #b45309 28%, var(--border));
  }

  .plan-stage {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 0;
    overflow: hidden;
  }

  .plan-stage :global(.plan-shell) {
    flex: 1 1 auto;
    min-height: 0;
  }

  .plan-drawer-fab {
    position: fixed;
    z-index: 48;
    right: var(--inset-inline-end);
    bottom: calc(
      var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 14px
    );
    min-height: 44px;
    padding: 10px 16px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--accent);
    font-size: 13px;
    font-weight: 650;
    box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.28);
    cursor: pointer;
  }

  .plan-drawer-fab.open {
    background: var(--accent);
    color: #f5f8fa;
    border-color: transparent;
  }

  .plan-drawer-fab.hide-for-bar {
    opacity: 0;
    pointer-events: none;
  }

  .plan-drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 49;
    background: rgba(12, 16, 22, 0.38);
  }

  .plan-drawer {
    position: fixed;
    z-index: 50;
    top: calc(var(--appbar-h, 56px) + 8px);
    right: var(--inset-inline-end);
    bottom: calc(
      var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 8px
    );
    width: min(
      380px,
      calc(100vw - var(--inset-inline-start) - var(--inset-inline-end))
    );
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    box-shadow: 0 20px 48px -16px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }

  .plan-drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .plan-drawer-title {
    margin: 0;
    font-size: 14px;
    font-weight: 650;
    color: var(--t1);
  }

  .plan-drawer-close {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 8px;
    background: var(--bg);
    color: var(--t2);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }

  .plan-drawer-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  }

  .plan-drawer-body :global(.inspector),
  .plan-drawer-body :global(.dim-editor) {
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .plan-drawer-body :global(.dim-grid) {
    grid-template-columns: 1fr;
  }

  @media (min-width: 900px) {
    .plan-drawer-fab {
      bottom: calc(var(--safe-bottom-effective) + 20px);
    }

    .plan-drawer {
      bottom: calc(var(--safe-bottom-effective) + 16px);
    }
  }

  @media (max-width: 599px) {
    .plan-drawer {
      top: auto;
      left: var(--inset-inline-start);
      right: var(--inset-inline-end);
      width: auto;
      max-height: min(72dvh, 560px);
      border-radius: 14px 14px 0 0;
    }

    .plan-top {
      gap: 6px;
      padding: 6px 8px;
      margin-bottom: 6px;
    }

    .plan-top-edit .plan-top-primary {
      flex: 1 1 100%;
    }

    .plan-top-edit .edit-chrome-compact {
      flex: 0 0 auto;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      width: 100%;
    }

    .plan-top-edit .edit-chrome-compact .plan-tool-select-wrap {
      flex: 0 0 auto;
      width: 100%;
    }

    .plan-top-edit .edit-chrome-wrap:not(.edit-chrome-compact) {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }

    .plan-top-edit .step-segment {
      width: 100%;
      justify-content: space-between;
    }

    .plan-top-edit .step-segment .step-btn {
      flex: 1 1 0;
      padding-inline: 8px;
    }

    .plan-top-edit .tool-segment-scroll {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding-bottom: 2px;
    }

    .plan-top-edit .tool-segment-scroll::-webkit-scrollbar {
      display: none;
    }

    .plan-top-edit .tool-segment {
      flex-shrink: 0;
      width: max-content;
    }

    .plan-top-edit .tool-segment-scroll::after {
      opacity: 1;
    }

    .plan-top-edit .step-btn {
      min-height: 44px;
    }

    .plan-convert-banner {
      font-size: 11px;
      padding: 6px 8px;
    }

    .mode-btn {
      min-height: 44px;
      min-width: 64px;
      font-size: 13px;
      padding: 8px 14px;
    }

    .help-btn {
      width: 44px;
      height: 44px;
    }

    .mode-undo-btn {
      width: 44px;
      height: 44px;
    }

    .plan-page-immersive .plan-stage {
      flex: 1 1 auto;
      min-height: min(52dvh, 520px);
    }

    .plan-page-immersive
      :global(.plan-shell.canvas-priority .plan-viewer:not(.compact)) {
      min-height: 0;
      flex: 1 1 auto;
    }

    .plan-page-immersive .plan-drawer-fab {
      bottom: calc(var(--safe-bottom-effective) + 14px);
    }
  }

  @media (min-width: 600px) {
    .plan-drawer-backdrop {
      display: none;
    }

    .plan-drawer {
      top: auto;
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      bottom: calc(
        var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 88px
      );
      width: min(520px, calc(100vw - 32px));
      max-height: min(42vh, 400px);
    }

    .plan-stage:has(:global(.sel-bar)) .plan-drawer {
      bottom: calc(
        var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 148px
      );
    }

    .plan-stage:has(:global(.graph-open-bar)) .plan-drawer {
      bottom: calc(
        var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 148px
      );
    }

    .plan-stage:has(:global(.graph-sel-bar)) .plan-drawer {
      bottom: calc(
        var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 148px
      );
    }
  }

  .step-btn-compact {
    font-size: 11px;
    padding-inline: 8px;
  }

  .plan-modal-picker {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 50;
    margin: 0;
    padding: 16px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--card) 96%, transparent);
    box-shadow: 0 16px 40px -16px rgba(0, 0, 0, 0.35);
    min-width: min(320px, calc(100% - 32px));
    max-width: calc(100% - 32px);
  }

  .storage-picker::backdrop,
  .placement-kinds-picker::backdrop {
    background: rgba(12, 16, 22, 0.42);
  }

  @media (max-width: 599px) {
    .plan-modal-picker {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      transform: none;
      width: 100%;
      max-width: none;
      min-width: 0;
      border-radius: 18px 18px 0 0;
      padding-bottom: calc(16px + var(--safe-bottom-effective));
    }
  }

  .storage-picker-title {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 650;
  }

  .storage-picker-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .storage-picker-btn {
    min-height: 40px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    font-weight: 650;
    cursor: pointer;
  }

  .storage-picker-cancel {
    margin-top: 12px;
    width: 100%;
    min-height: 36px;
    border: none;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
  }

  .storage-picker-btn.active {
    border-color: var(--graph-accent);
    color: var(--graph-accent);
    background: color-mix(in srgb, var(--graph-accent) 10%, var(--bg));
  }

  .placement-kinds-grid {
    grid-template-columns: repeat(4, 1fr);
  }

  @media (max-width: 599px) {
    .placement-kinds-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .storage-picker-btn {
      min-height: 44px;
    }
  }
</style>
