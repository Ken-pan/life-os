<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import {
    activateWallGraphMode,
    rebuildWallGraphFrom508,
    addGraphWall,
    applyDetectedZones,
    detectRoomCandidates,
    getAngleSnapDeg,
    addGraphOpening,
    addPlacement,
    addViewpoint,
    addZone,
    importViewpointPhotos,
    assignStorageZone,
    commitGraphOpeningEdit,
    commitPlacementMove,
    commitViewpointHeading,
    commitViewpointMove,
    commitZoneVertexMove,
    removeGraphOpening,
    previewGraphOpeningDrag,
    canRedoGraph,
    canRedoLayout,
    canUndoGraph,
    canUndoLayout,
    commitGraphVertexMove,
    getActiveProject,
    getBrowseFloorPlan,
    isOpeningDisabled,
    isStructureLocked,
    isPlacementPinned,
    isWallGraphMode,
    getLastDoorStyle,
    getLastWindowStyle,
    previewGraphVertexMove,
    redoGraphEdit,
    redoLayoutEdit,
    removeGraphWall,
    duplicatePlacement,
    nudgePlacement,
    removePlacement,
    removeViewpoint,
    removeZone,
    resetToOuterShell,
    reset508Layout,
    rotatePlacementById,
    setOpeningDisabled,
    setPlanSubtitle,
    setPlanImmersiveEdit,
    splitGraphWall,
    undoGraphEdit,
    undoLayoutEdit,
    updateViewpoint,
  } from '$lib/state.svelte.js'
  import { buildFromWallGraph } from '$lib/spatial/wall-graph.js'
  import { snapGraphPoint } from '$lib/spatial/wall-graph.js'
  import { canClosePolygon, findZoneAtPoint } from '$lib/spatial/zones.js'
  import {
    resolveSnap,
    pointAtLength,
    parseLengthInput,
  } from '$lib/spatial/snap.js'
  import { formatFtIn, pxToFtIn } from '$lib/spatial/dimensions.js'
  import { toast } from '$lib/ui.svelte.js'
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
  import NewScanBanner from '$lib/components/NewScanBanner.svelte'
  import RecognitionBanner from '$lib/components/RecognitionBanner.svelte'
  import PlanViewpointSelectionBar from '$lib/components/PlanViewpointSelectionBar.svelte'
  import PlanNorthCalibrator from '$lib/components/PlanNorthCalibrator.svelte'
  import { headingFromPoint } from '$lib/spatial/viewpoints.js'
  import { assessPhotoCoverage, coverageForZone } from '$lib/spatial/photo-coverage.js'
  import { page } from '$app/state'
  import {
    FENCE_BAND_IN,
    fenceBandRects,
    inchesToPx,
    isFence,
    isStorable,
    PLACEMENT_GROUP_ORDER,
    PLACEMENT_KINDS,
    pxToInches,
    STORAGE_CODES,
    verticallyClear,
  } from '$lib/spatial/placements.js'
  import { resolvePlacementSnap, overlapsAny } from '$lib/spatial/placement-snap.js'
  import { wallStrokePx } from '$lib/spatial/wall-standards.js'
  import PlanContextMenu from '$lib/components/PlanContextMenu.svelte'
  import PlanEditToolbar from '$lib/components/PlanEditToolbar.svelte'
  import PlanShortcutsHelp from '$lib/components/PlanShortcutsHelp.svelte'
  import HomeTopBar from '$lib/components/HomeTopBar.svelte'
  import InspectorPanel from '$lib/components/InspectorPanel.svelte'
  import { defaultDoorSpanIn, doorStyleLabel } from '$lib/spatial/door-styles.js'
  import {
    defaultWindowSpanIn,
    windowStyleLabel,
  } from '$lib/spatial/window-styles.js'

  const project = $derived(getActiveProject())
  const planPxPerFt = $derived(
    project.wallGraph?.pxPerFt ?? project.layoutConfig?.pxPerFt ?? 36,
  )
  const wallGraph = $derived(isWallGraphMode())

  /** @type {'browse' | 'edit'} */
  let planMode = $state('browse')

  /**
   * The single source of truth for what is armed. Everything below — editStep,
   * graphTool, zoneTool, placementTool, viewpointTool — is *derived* from this
   * and never assigned directly, so no two controls can disagree about the
   * active tool (they used to: the ①②③④ step segment and the palette both wrote
   * this state from opposite ends).
   * @type {PlanTool}
   */
  let activeTool = $state('select')

  /**
   * Which layer 选择 acts on. Kept explicit and surfaced in the tool options
   * strip rather than inferred from history — an invisible mode that silently
   * changes what a click selects is exactly the mode error to avoid.
   * @type {'walls' | 'zones' | 'place' | 'view'}
   */
  let selectLayer = $state('walls')

  // 508 参数户型没有墙体/分区层可选,停在 walls 会让「选择」什么也点不中;
  // 结构锁定时同理 —— 墙体/分区层已收起
  $effect(() => {
    if (
      (!wallGraph || structureLocked) &&
      (selectLayer === 'walls' || selectLayer === 'zones')
    ) {
      selectLayer = 'place'
    }
  })

  /** @type {'door' | 'window'} 门窗工具放置哪一种 */
  let openingKind = $state('door')
  /** @type {keyof typeof PLACEMENT_KINDS} */
  let placementKind = $state('cabinet')
  let selectedViewpoint = $state('')
  /** @type {import('$lib/spatial/types.js').SpatialViewpoint[] | null} */
  let previewViewpoints = $state(null)
  let northCalOpen = $state(false)
  /** @type {HTMLInputElement | null} */
  let bulkInput = $state(null)
  /** @type {string} */
  let bulkProgress = $state('')

  /** @param {Event} e */
  async function onBulkPick(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget)
    const files = [...(input.files ?? [])]
    input.value = ''
    if (!files.length) return
    bulkProgress = `准备 0/${files.length}`
    try {
      const { added } = await importViewpointPhotos(files, (done, total, label) => {
        bulkProgress = `${label}（${done}/${total}）`
      })
      if (added.length) selectedViewpoint = added[added.length - 1]
    } finally {
      bulkProgress = ''
    }
  }
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
  /**
   * Alignment guides for the live drag — wall drawing and furniture placement
   * both feed this one channel.
   * @type {(import('$lib/spatial/snap.js').SnapGuide | import('$lib/spatial/placement-snap.js').PlacementGuide)[]}
   */
  let snapGuides = $state([])
  /** 精确长度输入框的草稿；空 = 显示实时长度 */
  let lengthDraft = $state('')
  /** @type {HTMLInputElement | null} */
  let lengthInputEl = $state(null)
  /** @type {{ x: number, y: number }[]} */
  let zoneChainPoints = $state([])
  /** @type {{ x: number, y: number } | null} */
  let zoneChainHover = $state(null)
  /** @type {import('$lib/spatial/types.js').SpatialZone[] | null} */
  let previewZones = $state(null)
  /** @type {import('$lib/spatial/types.js').SpatialPlacement[] | null} */
  let previewPlacements = $state(null)
  /** 正压在别的家具上的那件(拖拽中)。不阻止落位,只标红提示。 */
  let dragOverlapId = $state('')
  /** @type {import('$lib/spatial/types.js').WallGraph | null} */
  let graphPreviewGraph = $state(null)
  /** @type {import('$lib/spatial/types.js').GraphOpening[] | null} */
  let graphPreviewOpenings = $state(null)
  let compactPlanChrome = $state(
    browser ? window.matchMedia('(max-width: 599px)').matches : false,
  )
  let convertBannerDismissed = $state(false)

  const CONVERT_BANNER_KEY = 'home_plan_convert_banner_dismissed'

  /**
   * @typedef {'select' | 'wall' | 'opening' | 'zone' | 'furniture' | 'storage' | 'viewpoint'} PlanTool
   */

  /** Each tool belongs to exactly one layer; 选择 borrows `selectLayer`. */
  const TOOL_LAYER = /** @type {const} */ ({
    wall: 'walls',
    opening: 'walls',
    zone: 'zones',
    furniture: 'place',
    storage: 'place',
    viewpoint: 'view',
  })

  /** Number-key order must match PlanEditToolbar's rail. */
  const TOOL_KEYS = /** @type {const} */ ([
    'select',
    'wall',
    'opening',
    'zone',
    'furniture',
    'storage',
    'viewpoint',
  ])

  /**
   * 508 参数户型下放出的工具:墙由参数生成、分区它没有,所以只留搭在户型上的那层。
   * 家具/机位两种模式通用 —— 扫描把实测家具摆进 508 后,总得能挪。
   */
  const PARAMETRIC_TOOLS = ['select', 'furniture', 'storage', 'viewpoint']
  /** 结构已锁定(扫描实测户型):建墙/门窗/画区收起,防误触改坏实测墙 */
  const structureLocked = $derived(isStructureLocked())
  const STRUCTURE_TOOLS = ['wall', 'opening', 'zone']
  const LOCKED_TOOLS = ['select', 'furniture', 'storage', 'viewpoint']

  const editStep = $derived(
    activeTool === 'select' ? selectLayer : TOOL_LAYER[activeTool],
  )
  /** @type {import('$lib/plan-graph-edit.js').GraphTool} */
  const graphTool = $derived(
    activeTool === 'wall' ? 'wallAdd' : activeTool === 'opening' ? 'opening' : 'select',
  )
  /** @type {import('$lib/plan-zone-edit.js').ZoneTool} */
  const zoneTool = $derived(activeTool === 'zone' ? 'zoneAdd' : 'zoneSelect')
  /** @type {import('$lib/plan-placement-edit.js').PlacementTool} */
  const placementTool = $derived(
    activeTool === 'furniture'
      ? 'place'
      : activeTool === 'storage'
        ? 'storage'
        : 'select',
  )
  /** @type {import('$lib/plan-viewpoint-edit.js').ViewpointTool} */
  const viewpointTool = $derived(
    activeTool === 'viewpoint' ? 'viewAdd' : 'viewSelect',
  )

  const editMode508 = $derived(planMode === 'edit' && !wallGraph)
  const graphEditMode = $derived(
    wallGraph && planMode === 'edit' && editStep === 'walls',
  )
  const zoneEditMode = $derived(
    wallGraph && planMode === 'edit' && editStep === 'zones',
  )
  // 家具与机位是搭在户型上的一层,两种 layoutMode 都该能编 —— 此前写死要墙图,
  // 508 参数户型上的家具只能看不能动(扫描摆进来后第一时间就撞上了)。
  // 画墙/分区仍然只在墙图模式:508 的墙由参数生成,分区它压根没有。
  const placeEditMode = $derived(planMode === 'edit' && editStep === 'place')
  const viewEditMode = $derived(planMode === 'edit' && editStep === 'view')
  const wallGraphEditMode = $derived(
    graphEditMode || zoneEditMode || placeEditMode || viewEditMode,
  )
  const canUndo = $derived(wallGraphEditMode ? canUndoGraph() : canUndoLayout())
  const canRedo = $derived(wallGraphEditMode ? canRedoGraph() : canRedoLayout())
  const showSelectionBar = $derived(
    editMode508 && (selectedWall || selectedOpening),
  )
  const wallGraphEmpty = $derived(
    wallGraph && (project.wallGraph?.edges?.length ?? 0) === 0,
  )
  const wallGraphOuterShellOnly = $derived(
    wallGraph &&
      !wallGraphEmpty &&
      (project.wallGraph?.edges?.every((e) => e.exterior) ?? false),
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
  const selectedViewpointObj = $derived(
    (project.viewpoints ?? []).find((v) => v.id === selectedViewpoint) ?? null,
  )
  const showViewpointSelectionBar = $derived(
    viewEditMode && Boolean(selectedViewpointObj),
  )
  // 未校准时按钮带个 ! ——「罗盘」和 EXIF 朝向在此之前都是死的，得让人看见。
  const planNorthLabel = $derived.by(() => {
    const n = project.meta?.planNorthDeg
    return typeof n === 'number' ? ` ${Math.round(n)}°` : ' !'
  })
  const hideFabForBar = $derived(
    showSelectionBar ||
      showGraphSelectionBar ||
      showGraphOpeningSelectionBar ||
      showZoneSelectionBar ||
      showPlacementSelectionBar ||
      showViewpointSelectionBar,
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
    if (planMode === 'browse') {
      return getBrowseFloorPlan()
    }
    return project
  })

  /** 选择工具在各层里选的是什么 —— 供 hint 与选项条共用 */
  const SELECT_LAYER_LABEL = /** @type {const} */ ({
    walls: '墙体',
    zones: '分区',
    place: '家具',
    view: '机位',
  })

  /** 508 参数户型只有家具/机位这两层可选(墙走它自己的尺寸编辑器,分区它没有) */
  const selectLayers = $derived(
    Object.entries(SELECT_LAYER_LABEL).filter(
      ([layer]) =>
        (wallGraph && !structureLocked) || layer === 'place' || layer === 'view',
    ),
  )

  const modeHint = $derived.by(() => {
    if (planMode === 'browse') {
      return '双指缩放平移 · 储藏清单见左侧「储藏」'
    }
    if (!wallGraph) return '拖曳内墙与门窗调整户型 · Delete 隐藏门窗'
    if (activeTool === 'wall') {
      return '建墙：点击拐点连线 · Shift 正交 · 1″ 吸附 · Esc 断链'
    }
    if (activeTool === 'opening') {
      if (openingKind === 'window') {
        const style = getLastWindowStyle()
        return `门窗：点击墙段放置窗（${windowStyleLabel(style)} ${defaultWindowSpanIn(style)}″）`
      }
      const style = getLastDoorStyle()
      return `门窗：点击墙段放置门（${doorStyleLabel(style)} ${defaultDoorSpanIn(style)}″）`
    }
    if (activeTool === 'zone') {
      return '画区：逐点落顶点 · 点击首点或 Enter 闭合 · Esc 取消'
    }
    if (activeTool === 'furniture') {
      return `家具：点画布放置「${PLACEMENT_KINDS[placementKind].label}」· 拖动移动 · 方向键微调`
    }
    if (activeTool === 'storage') {
      return '标储藏：点分区或家具指派储藏区'
    }
    if (activeTool === 'viewpoint') {
      return '视角：点画布放机位 · 拖圆点改位置 · 拖手柄转朝向 · 选中后挂照片'
    }
    if (selectLayer === 'walls') {
      return '选择墙体：点墙段/门窗 · 拖顶点或沿墙移动 · Delete 删除'
    }
    if (selectLayer === 'zones') {
      return '选择分区：点分区改名/换色 · 拖顶点微调 · 需核对时点确认'
    }
    if (selectLayer === 'place') {
      return '选择家具：点家具拖动 · 方向键微调 · ⌘D 复制 · Delete 删除'
    }
    return '选择机位：点机位选中 · 拖圆点改位置 · 拖手柄转朝向 · Delete 删除'
  })

  /** AppBar 单行副标题（沉浸式编辑时由 layout 隐藏） */
  const appBarSubtitle = $derived.by(() => {
    if (planMode === 'browse') return '浏览 508 户型'
    if (editMode508) return '508 参数编辑'
    if (!wallGraph) return '编辑'
    if (activeTool === 'select') {
      return `墙图 · 选择${SELECT_LAYER_LABEL[selectLayer]}`
    }
    const label = {
      wall: '建墙',
      opening: '门窗',
      zone: '画区',
      furniture: '家具',
      storage: '标储藏',
      viewpoint: '视角',
    }[activeTool]
    return `墙图 · ${label}`
  })

  function bumpFit(
    /** @type {boolean} */ cycle = false,
    /** @type {'contain' | 'width' | undefined} */ mode = undefined,
  ) {
    fitRequest = { token: fitRequest.token + 1, cycle, mode }
  }

  // —— 拍照任务模式:从 /tidy 深链进入,拍完一张点「下一个」串到下一区,
  //    不用来回切页。任务清单是响应式的 —— 挂上照片跑完识别,该区自动出列。
  let shootMode = $state(false)
  /** 当前任务落点的区 —— 完成态由 needs 里还有没有它来判断 */
  let shootZoneId = $state('')
  /** 过期判断按天算,进页那一刻的时钟够用了 */
  const shootMountMs = Date.now()
  const shootCoverage = $derived(
    shootMode ? assessPhotoCoverage(project, { now: shootMountMs }) : null,
  )
  const shootNeeds = $derived(shootCoverage?.needs ?? [])
  const shootCurrent = $derived(
    shootNeeds.find((n) => n.zoneId === shootZoneId) ?? null,
  )

  /**
   * 落一个拍照任务:该区已有机位就直接选中它(拍照/识别都在选择条上);
   * 全盲区则按 photo-coverage 的建议站位放一个新机位并选中。
   * 建议站位是确定性的,同一点位附近已有机位就复用 —— 重复进入不重复放。
   * @param {import('$lib/spatial/photo-coverage.js').CoverageEntry} entry
   */
  function startShootTask(entry) {
    if (planMode !== 'edit') setPlanMode('edit')
    // setPlanMode 在墙图模式下会把选择层拨回 walls,必须在它之后再拨到机位层
    activeTool = 'select'
    selectLayer = 'view'
    shootMode = true
    shootZoneId = entry.zoneId
    if (entry.viewpointId) {
      selectedViewpoint = entry.viewpointId
      return
    }
    const s = entry.suggestion
    if (!s) return
    const near = (project.viewpoints ?? []).find(
      (v) => Math.hypot(v.x - s.x, v.y - s.y) < 6,
    )
    if (near) {
      selectedViewpoint = near.id
      return
    }
    const id = addViewpoint(s.x, s.y)
    if (id) {
      updateViewpoint(id, { heading: s.heading, label: `${entry.nameZh} 拍照点` })
      selectedViewpoint = id
    }
  }

  /** 跳到下一个还没完成的区;全清了就退出任务模式。 */
  function nextShootTask() {
    const needs = assessPhotoCoverage(getActiveProject(), { now: Date.now() }).needs
    const next = needs.find((n) => n.zoneId !== shootZoneId) ?? needs[0] ?? null
    if (!next) {
      exitShootMode()
      toast('拍照任务全部完成 —— 杂乱指数和整理计划已经变准')
      return
    }
    startShootTask(next)
    toast(`${next.nameZh}:${next.reason}`)
  }

  function exitShootMode() {
    shootMode = false
    shootZoneId = ''
  }

  /** /tidy 拍照任务深链:`?shoot=<zoneId>` 进任务模式并落到该区。 */
  function applyShootParam() {
    const zoneId = page.url.searchParams.get('shoot')
    if (!zoneId) return
    const entry = coverageForZone(getActiveProject(), zoneId, { now: Date.now() })
    if (!entry) return
    startShootTask(entry)
    toast(`${entry.nameZh}:${entry.reason}`)
  }

  onMount(() => {
    bumpFit(false, 'contain')
    if (!browser) return
    applyShootParam()
    convertBannerDismissed = sessionStorage.getItem(CONVERT_BANNER_KEY) === '1'
    const mq = window.matchMedia('(max-width: 599px)')
    compactPlanChrome = mq.matches
    // Both breakpoints now drive the same `activeTool` through the same palette,
    // so crossing the breakpoint no longer has orphan tools to scrub.
    /** @param {MediaQueryListEvent} e */
    const onMq = (e) => {
      compactPlanChrome = e.matches
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
    selectedViewpoint = ''
  }

  function clearZoneChain() {
    zoneChainPoints = []
    zoneChainHover = null
  }

  function clearGraphChain() {
    wallChainFrom = null
    wallChainHover = null
    snapGuides = []
    lengthDraft = ''
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

  /** Picking a kind arms the furniture tool — that is the only reason to pick one. */
  /** @param {keyof typeof PLACEMENT_KINDS} kind */
  function setPlacementKind(kind) {
    placementKind = kind
    placementKindsOpen = false
    setTool('furniture')
  }

  /**
   * @param {{ x: number, y: number }} pt
   * @param {number} [zoom]
   */
  function onPlacementPoint(pt, zoom = 1) {
    if (placementTool !== 'place') return
    // Placing runs the same snap as dragging — otherwise the very first action
    // on a piece is the one that ignores walls, and it lands on a fractional
    // inch that every later nudge inherits.
    const spec = PLACEMENT_KINDS[placementKind]
    const w = inchesToPx(spec.w, planPxPerFt)
    const h = inchesToPx(spec.h, planPxPerFt)
    const snap = resolvePlacementSnap(
      { x: pt.x - w / 2, y: pt.y - h / 2, w, h },
      project.walls ?? [],
      (project.placements ?? []).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })),
      {
        pxPerFt: planPxPerFt,
        zoom,
        thicknessFor: (wall) =>
          wallStrokePx(wall.role ?? 'interior', planPxPerFt),
      },
    )
    const id = addPlacement(placementKind, snap.x + w / 2, snap.y + h / 2)
    if (id) selectedPlacement = id
  }

  /**
   * Resolve where a dragged placement should actually land: flush to a wall
   * face, aligned to a neighbour, or on the 1″ grid. Shared by the drag preview
   * and the drop commit so what you see is what you get.
   * @param {string} id
   * @param {{ x: number, y: number }} pt target centre
   * @param {number} [zoom] current view zoom — snap tolerance is screen-space
   */
  function snapPlacementAt(id, pt, zoom = 1, mods = {}) {
    const placement = (project.placements ?? []).find((x) => x.id === id)
    if (!placement) return null
    const rect = {
      x: pt.x - placement.w / 2,
      y: pt.y - placement.h / 2,
      w: placement.w,
      h: placement.h,
    }
    const others = (project.placements ?? [])
      .filter((x) => x.id !== id)
      .map((x) => ({ x: x.x, y: x.y, w: x.w, h: x.h }))
    const snap = resolvePlacementSnap(rect, project.walls ?? [], others, {
      pxPerFt: planPxPerFt,
      zoom,
      thicknessFor: (w) => wallStrokePx(w.role ?? 'interior', planPxPerFt),
      free: mods.altKey, // Alt 临时脱开吸附,与建墙工具同一手势
    })
    // 压在别人身上不拦(床下塞收纳盒是常态),但要当场说出来 —— 压着而不自知才是错。
    // 立体上互相让开的组合(桌下柜、格子柜上的电视、台面上方的吊柜)不算压:
    // 那是真实世界的正常叠放,标红反而在骗人。
    // 围栏只有边框是实体:狗和狗窝住在围栏**里面**是它存在的意义,不是压叠 ——
    // 双方(被拖的、旁边的)谁是围栏,都只拿边框参与判定
    const bandPx = inchesToPx(FENCE_BAND_IN, planPxPerFt)
    const solidRectsOf = (p, rect) => (isFence(p.kind) ? fenceBandRects(rect, bandPx) : [rect])
    const solidOthers = (project.placements ?? [])
      .filter((x) => x.id !== id && !verticallyClear(placement, x))
      .flatMap((x) => solidRectsOf(x, { x: x.x, y: x.y, w: x.w, h: x.h }))
    const overlap = solidRectsOf(placement, {
      x: snap.x,
      y: snap.y,
      w: placement.w,
      h: placement.h,
    }).some((r) => overlapsAny(r, solidOthers))
    return { placement, snap, overlap }
  }

  /** @param {{ x: number, y: number }} pt */
  function onViewpointPoint(pt) {
    if (viewpointTool !== 'viewAdd') return
    const id = addViewpoint(pt.x, pt.y)
    if (id) {
      selectedViewpoint = id
      // 放完就转选择态 —— 否则下一次点击（想选中它）又会再放一个。
      // 不走 setTool：它会清掉刚刚选中的这个机位。
      activeTool = 'select'
      selectLayer = 'view'
    }
  }

  /** @param {{ x: number, y: number }} pt */
  function onAssignStorageAt(pt) {
    const zones = project.zones ?? []
    const placements = project.placements ?? []
    /** @type {{ zoneId?: string, placementId?: string }} */
    const target = {}
    for (const p of placements) {
      // 装不了东西的家具（吊扇、地毯、滑板车…）不接储藏指派，而且必须是
      // 「穿透」而不是「拦下」：否则点在铺满半个客厅的地毯上，底下的分区就
      // 永远够不着了。
      if (!isStorable(p.kind)) continue
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
      if (!dialog.open) {
        dialog.showModal()
        // 54 类里当前选中的可能在第 40 位 —— 打开就让它在视野内,
        // 否则「换个类型」先要凭记忆滚过 1000px。
        requestAnimationFrame(() => {
          dialog
            .querySelector('.storage-picker-btn.active')
            ?.scrollIntoView({ block: 'center' })
        })
      }
    } else if (dialog.open) {
      dialog.close()
    }
  })

  /**
   * 解析画墙落点：顶点 > 对齐 > 角度 > 网格。
   * @param {{ x: number, y: number }} pt
   * @param {{ shiftKey?: boolean, altKey?: boolean, zoom?: number }} [mods]
   */
  function snapWallPoint(pt, mods = {}) {
    const graph = project.wallGraph
    if (!graph) return null
    return resolveSnap(wallChainFrom, pt, graph, {
      angleSnapDeg: getAngleSnapDeg(),
      ortho: mods.shiftKey, // Shift 仍是强制正交，保住肌肉记忆
      freeAngle: mods.altKey, // Alt 临时脱开角度吸附
      zoom: mods.zoom ?? 1,
    })
  }

  /**
   * @param {{ x: number, y: number }} pt
   * @param {{ shiftKey?: boolean, altKey?: boolean, zoom?: number }} [mods]
   */
  function onGraphWallPoint(pt, mods = {}) {
    if (graphTool !== 'wallAdd') return
    // 触屏没有 hover，落点这里自己算一次；鼠标下与 hover 结果一致
    const snap = snapWallPoint(pt, mods)
    const target = snap ? { x: snap.x, y: snap.y } : pt
    if (!wallChainFrom) {
      wallChainFrom = target
      wallChainHover = null
      snapGuides = []
      return
    }
    if (addGraphWall(wallChainFrom.x, wallChainFrom.y, target.x, target.y)) {
      wallChainFrom = target
      lengthDraft = ''
    }
  }

  /** 按精确长度提交当前链段（沿 hover 方向）。 */
  function commitChainLength() {
    const lengthIn = parseLengthInput(lengthDraft)
    if (lengthIn == null) {
      toast('长度无法识别，例：12\'6" · 150" · 12.5（英尺）', 'warn')
      return
    }
    if (!wallChainFrom || !wallChainHover) {
      toast('先移动指针定出墙的方向', 'warn')
      return
    }
    const pxPerFt = project.wallGraph?.pxPerFt ?? 36
    const target = pointAtLength(wallChainFrom, wallChainHover, lengthIn, pxPerFt)
    if (!target) {
      // lengthIn 已保证 > 0，走到这只可能是 hover 与起点重合、方向无法确定
      toast('先移动指针定出墙的方向', 'warn')
      return
    }
    if (addGraphWall(wallChainFrom.x, wallChainFrom.y, target.x, target.y)) {
      wallChainFrom = target
      wallChainHover = null
      snapGuides = []
      lengthDraft = ''
    }
  }

  /** 链段实时长度，作为长度输入框的 placeholder */
  const chainLengthLabel = $derived.by(() => {
    if (!wallChainFrom || !wallChainHover) return ''
    const pxPerFt = project.wallGraph?.pxPerFt ?? 36
    const px = Math.hypot(
      wallChainHover.x - wallChainFrom.x,
      wallChainHover.y - wallChainFrom.y,
    )
    return formatFtIn(pxToFtIn(px, pxPerFt))
  })

  /** ② 划分：墙图闭合环 → 分区 */
  function runRoomDetect() {
    const found = detectRoomCandidates()
    if (!found.length) {
      toast('未识别到新的闭合房间——检查墙是否首尾相接', 'warn')
      return
    }
    applyDetectedZones(found)
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
      activeTool = 'select'
      selectLayer = 'walls'
    }
    if (mode !== 'edit') {
      clearSelection()
      clearGraphChain()
    }
    if (mode === 'browse') drawerOpen = false
    graphPreviewGraph = null
    graphPreviewOpenings = null
    bumpFit(false, 'contain')
  }

  /**
   * The one entry point for arming a tool. Every in-flight interaction belongs
   * to the tool that started it, so switching always drops chains, previews and
   * selection rather than leaving a half-drawn wall attached to the zone tool.
   *
   * Note it does *not* re-fit the canvas: the header no longer grows per tool,
   * so the viewport must stay exactly where the user left it.
   * @param {PlanTool} id
   */
  function setTool(id) {
    // 508 参数户型:家具/储藏/机位是搭在户型上的一层,不需要墙图,直接切。
    // 只有建墙/门窗/画区才必须先转换 —— 此前点**任何**工具都会把户型翻成墙图,
    // 挪一下沙发就把量过的 508 参数变成了不可回写的墙图。
    if (!wallGraph && !PARAMETRIC_TOOLS.includes(id)) {
      convertToWallGraph()
      return
    }
    if (structureLocked && STRUCTURE_TOOLS.includes(id)) {
      toast('户型结构已锁定(扫描实测)。要改墙体/分区,去 设置 → 户型编辑模式 解锁。')
      return
    }
    if (planMode !== 'edit') setPlanMode('edit')
    const prevLayer = editStep
    activeTool = id
    // 选择 inherits the layer you were just working in — switching 家具 → 选择
    // keeps selecting furniture, which is what the last action implies.
    if (id === 'select') selectLayer = prevLayer
    clearSelection()
    clearGraphChain()
    clearZoneChain()
    graphPreviewGraph = null
    graphPreviewOpenings = null
    previewZones = null
    previewPlacements = null
    previewViewpoints = null
    storagePickerOpen = false
    placementKindsOpen = false
  }

  /** @param {'walls' | 'zones' | 'place' | 'view'} layer */
  function setSelectLayer(layer) {
    selectLayer = layer
    activeTool = 'select'
    clearSelection()
  }

  function rebuildGraphFromLayout() {
    // Destructive: hand edits to the graph are the whole reason this isn't
    // automatic, so make the cost explicit before doing it.
    const ok =
      !browser ||
      window.confirm(
        '按最新户型重建墙图？\n\n会丢弃：你在墙图上的手工改动（建删墙、拖顶点、挪门窗）。\n会保留：家具、储藏清单、视角；手绘分区会被标记「需核对」。',
      )
    if (!ok) return
    rebuildWallGraphFrom508()
    selectedEdge = ''
    selectedOpening = ''
    clearGraphChain()
    bumpFit(false)
  }

  function convertToWallGraph() {
    activateWallGraphMode()
    activeTool = 'select'
    selectLayer = 'walls'
    if (planMode !== 'edit') planMode = 'edit'
    convertBannerDismissed = true
    if (browser) sessionStorage.setItem(CONVERT_BANNER_KEY, '1')
    bumpFit(false, 'contain')
  }

  function dismissConvertBanner() {
    convertBannerDismissed = true
    if (browser) sessionStorage.setItem(CONVERT_BANNER_KEY, '1')
  }

  function restoreDefaultLayout() {
    if (
      !window.confirm('恢复完整 508 默认户型？将退出墙图模式并显示全部内墙与门窗。')
    ) {
      return
    }
    reset508Layout()
    clearSelection()
    bumpFit(false, 'contain')
  }

  function handleResetToShell() {
    const ok = window.confirm(
      '清空户型？将删除所有内墙、门窗、分区与房间，仅保留最外围墙（可用 ⌘Z 撤销）。',
    )
    if (!ok) return
    if (!resetToOuterShell()) return
    drawerOpen = false
    if (planMode !== 'edit') setPlanMode('edit')
    // Land on 建墙: the shell is bare, so drawing is the only useful next move.
    setTool('wall')
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

      // 画墙时直接敲数字就开始输长度——业界惯例是不用先去点输入框
      if (
        graphEditMode &&
        graphTool === 'wallAdd' &&
        wallChainFrom &&
        !inField &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        /^[0-9]$/.test(e.key)
      ) {
        e.preventDefault()
        lengthDraft = e.key
        lengthInputEl?.focus()
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
        // One escape ladder for every layer: selection → in-flight work →
        // disarm the tool → leave edit. It used to differ per layer (视角's Esc
        // even armed 放机位 instead of disarming), so Esc was unpredictable.
        if (wallGraphEditMode) {
          if (
            selectedOpening ||
            selectedEdge ||
            selectedSpatialZone ||
            selectedPlacement ||
            selectedViewpoint
          ) {
            clearSelection()
          } else if (wallChainFrom || zoneChainPoints.length) {
            clearGraphChain()
            clearZoneChain()
          } else if (
            graphPreviewGraph ||
            graphPreviewOpenings ||
            previewZones ||
            previewPlacements ||
            previewViewpoints
          ) {
            graphPreviewGraph = null
            graphPreviewOpenings = null
            previewZones = null
            previewPlacements = null
            previewViewpoints = null
          } else if (activeTool !== 'select') {
            setTool('select')
          } else {
            setPlanMode('browse')
          }
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

      if (placeEditMode && selectedPlacement && !inField) {
        const NUDGE = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        }
        const dir = NUDGE[e.key]
        if (dir) {
          e.preventDefault()
          // Shift jumps a foot — the same modifier convention as the wall tools.
          const step = e.shiftKey ? 12 : 1
          nudgePlacement(selectedPlacement, dir[0] * step, dir[1] * step)
          return
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
          e.preventDefault()
          const id = duplicatePlacement(selectedPlacement)
          if (id) selectedPlacement = id
          return
        }
        // R 原地转 90° —— 摆家具时转向和挪位一样高频,不该每次都去点选择栏
        if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          rotatePlacementById(selectedPlacement)
          return
        }
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        viewEditMode &&
        selectedViewpoint &&
        !inField
      ) {
        e.preventDefault()
        removeViewpoint(selectedViewpoint)
        selectedViewpoint = ''
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

      // 1–7 match PlanEditToolbar's rail order, top to bottom. The wall-length
      // digit capture above takes precedence while a chain is live.
      if (
        !inField &&
        wallGraphEditMode &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        /^[1-7]$/.test(e.key)
      ) {
        e.preventDefault()
        setTool(TOOL_KEYS[Number(e.key) - 1])
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
  <!-- 统一页面顶栏(HomeOS Spatial Workspace,与 /storage /tidy 共用 HomeTopBar):
       标题 + 状态副题在左,模式/历史/帮助/详情归右 —— 控件不再散落在画布四角,
       画布从顶栏下沿开始。 -->
  <HomeTopBar
    title="平面"
    ariaLabel="平面工具栏"
    class="plan-topbar"
    subtitle={`${project.meta?.nameZh ? `${project.meta.nameZh} · ` : ''}${appBarSubtitle}`}
  >
    {#snippet actions()}
      <div class="seg seg-track" role="group" aria-label="浏览或编辑">
        <button
          type="button"
          class:on={planMode === 'browse'}
          aria-pressed={planMode === 'browse'}
          onclick={() => setPlanMode('browse')}
        >
          浏览
        </button>
        <button
          type="button"
          class:on={planMode === 'edit'}
          aria-pressed={planMode === 'edit'}
          onclick={() => setPlanMode('edit')}
        >
          编辑
        </button>
      </div>

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

      <!-- 桌面端 Inspector 的开关(移动端仍走右下 FAB,CSS 二选一显示) -->
      <button
        type="button"
        class="topbar-detail-btn"
        class:open={drawerOpen}
        aria-expanded={drawerOpen}
        aria-controls="plan-drawer"
        onclick={() => (drawerOpen = !drawerOpen)}
      >
        {drawerOpen ? '收起详情' : '详情'}
      </button>
    {/snippet}
  </HomeTopBar>

  <!-- 通知与控件簇分开:横幅是整条的,塞回控件簇里会把那一小撮按钮撑成一条横栏 -->
  <div class="plan-notices">
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

    <NewScanBanner />
    <RecognitionBanner />

    {#if shootMode}
      <div class="shoot-banner" role="note">
        <div class="shoot-banner-copy">
          {#if shootNeeds.length}
            <strong>拍照任务 · 剩 {shootNeeds.length} 个</strong>
            <span>
              {shootCurrent
                ? `${shootCurrent.nameZh}:${shootCurrent.reason}`
                : '这一区已完成 —— 点「下一个」继续'}
            </span>
          {:else}
            <strong>拍照任务全部完成</strong>
            <span>杂乱指数和整理计划已经变准 —— 回整理页看针对性步骤</span>
          {/if}
        </div>
        <div class="shoot-banner-actions">
          {#if shootNeeds.length}
            <button type="button" class="shoot-banner-cta" onclick={nextShootTask}>
              下一个
            </button>
            <button type="button" class="shoot-banner-dismiss" onclick={exitShootMode}>
              退出
            </button>
          {:else}
            <button
              type="button"
              class="shoot-banner-cta"
              onclick={() => {
                exitShootMode()
                goto('/tidy')
              }}
            >
              回整理页
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <PlanShortcutsHelp
    open={showHelp}
    contextHint={modeHint}
    {graphEditMode}
    editStep={wallGraph && planMode === 'edit' ? editStep : null}
    onClose={() => (showHelp = false)}
  />

  <div class="plan-body">
  <div class="plan-stage">
    {#if wallGraphEmpty}
      <p class="plan-empty-wallgraph" role="status">
        墙图为空 · ① 墙体中用「建墙」点击拐点连线，或到设置页从 508 重新转换
      </p>
    {/if}
    {#if wallGraphOuterShellOnly}
      <p class="plan-empty-wallgraph" role="status">
        当前只剩外墙框，内墙与门已清空。
        <button type="button" class="plan-inline-btn" onclick={restoreDefaultLayout}>
          恢复默认户型
        </button>
        或 ⌘Z 撤销
      </p>
    {/if}
    <FloorPlanViewer
      project={viewerProject}
      canvasPriority
      hideFurniture={false}
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
      viewpointEditMode={viewEditMode}
      {viewpointTool}
      {selectedViewpoint}
      {previewViewpoints}
      showViewpoints={viewEditMode}
      onViewpointPoint={viewEditMode ? onViewpointPoint : undefined}
      onSelectViewpoint={(id) => {
        selectedViewpoint = id
      }}
      onViewpointDragStart={() => {
        previewViewpoints = project.viewpoints ?? []
      }}
      onViewpointDrag={(id, pt) => {
        previewViewpoints = (project.viewpoints ?? []).map((v) =>
          v.id === id ? { ...v, x: pt.x, y: pt.y } : v,
        )
      }}
      onViewpointDrop={(id, pt) => {
        previewViewpoints = null
        commitViewpointMove(id, pt.x, pt.y)
      }}
      onViewpointRotate={(id, pt) => {
        previewViewpoints = (project.viewpoints ?? []).map((v) =>
          v.id === id
            ? { ...v, heading: headingFromPoint(v.x, v.y, pt.x, pt.y) }
            : v,
        )
      }}
      onViewpointRotateDrop={(id, pt) => {
        const v = (project.viewpoints ?? []).find((x) => x.id === id)
        previewViewpoints = null
        if (v) commitViewpointHeading(id, headingFromPoint(v.x, v.y, pt.x, pt.y))
      }}
      placementEditMode={placeEditMode}
      {placementTool}
      clashPlacement={dragOverlapId}
      {selectedPlacement}
      showFurniture={placeEditMode || viewEditMode || planMode === 'browse'}
      onPlacementPoint={placeEditMode ? onPlacementPoint : undefined}
      onAssignStorage={placeEditMode ? onAssignStorageAt : undefined}
      onSelectPlacement={(id) => {
        selectedPlacement = id
      }}
      onPlacementDragStart={() => {
        previewPlacements = project.placements ?? []
      }}
      onPlacementDrag={(id, pt, zoom, mods) => {
        // 钉死的连预览都不跟手 —— 跟着拖再弹回去像 bug;不动 + 松手时
        // commitPlacementMove 的报错说清原因
        if (isPlacementPinned(id)) return
        const r = snapPlacementAt(id, pt, zoom, mods)
        if (!r) return
        snapGuides = r.snap.guides
        dragOverlapId = r.overlap ? id : ''
        previewPlacements = (project.placements ?? []).map((item) =>
          item.id === id ? { ...item, x: r.snap.x, y: r.snap.y } : item,
        )
      }}
      onPlacementDrop={(id, pt, zoom, mods) => {
        const r = snapPlacementAt(id, pt, zoom, mods)
        previewPlacements = null
        snapGuides = []
        dragOverlapId = ''
        // Commit exactly what the preview showed — snapPlacementAt already
        // applied the grid on any axis that didn't catch a wall or neighbour.
        if (r) {
          commitPlacementMove(
            id,
            r.snap.x + r.placement.w / 2,
            r.snap.y + r.placement.h / 2,
            { exact: true },
          )
        } else {
          commitPlacementMove(id, pt.x, pt.y)
        }
      }}
      hideStorageZones={planMode === 'browse'}
      onZoneSelect={undefined}
      onClearSelection={editMode508 ? clearSelection : undefined}
      onGraphWallPoint={graphEditMode ? onGraphWallPoint : undefined}
      onGraphRemoveEdge={(id) => removeGraphWall(id)}
      onPlaceOpening={(pt, edgeId) => {
        const id = addGraphOpening(edgeId, pt, openingKind)
        if (id) {
          // 放完转选择态并保留选中 —— 不走 setTool（它会清选中）。
          activeTool = 'select'
          selectLayer = 'walls'
          selectedOpening = id
          selectedEdge = ''
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
      onGraphHover={(pt, mods) => {
        if (!pt) {
          wallChainHover = null
          snapGuides = []
          return
        }
        const snap = snapWallPoint(pt, mods ?? {})
        wallChainHover = snap ? { x: snap.x, y: snap.y } : pt
        snapGuides = snap?.guides ?? []
      }}
      {snapGuides}
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
    <!-- Shown on every breakpoint: mobile used to get a separate stack of
         <select>s, which was a second implementation of this same state. -->
    <PlanEditToolbar
      {activeTool}
      {canUndo}
      {canRedo}
      hidden={planMode !== 'edit'}
      enabledTools={wallGraph ? (structureLocked ? LOCKED_TOOLS : null) : PARAMETRIC_TOOLS}
      onTool={setTool}
      onUndo={performUndo}
      onRedo={performRedo}
    >
      {#snippet options()}
        {#if activeTool === 'select'}
          <span class="pt-opt-label">选择</span>
          {#each selectLayers as [layer, label] (layer)}
            <button
              type="button"
              class="pt-opt-btn"
              class:active={selectLayer === layer}
              aria-pressed={selectLayer === layer}
              onclick={() =>
                setSelectLayer(
                  /** @type {'walls' | 'zones' | 'place' | 'view'} */ (layer),
                )}
            >
              {label}
            </button>
          {/each}
        {:else if activeTool === 'opening'}
          <span class="pt-opt-label">放置</span>
          {#each /** @type {const} */ ([['door', '门'], ['window', '窗']]) as [kind, label] (kind)}
            <button
              type="button"
              class="pt-opt-btn"
              class:active={openingKind === kind}
              aria-pressed={openingKind === kind}
              onclick={() => (openingKind = kind)}
            >
              {label}
            </button>
          {/each}
        {:else if activeTool === 'wall'}
          {#if wallChainFrom}
            <label class="pt-opt-label" for="plan-len-input">长度</label>
            <input
              id="plan-len-input"
              bind:this={lengthInputEl}
              class="pt-opt-input"
              type="text"
              inputmode="text"
              aria-label="墙段精确长度"
              placeholder={chainLengthLabel || '如 12\'6"'}
              bind:value={lengthDraft}
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitChainLength()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  lengthDraft = ''
                  lengthInputEl?.blur()
                }
                e.stopPropagation()
              }}
            />
          {:else}
            <span class="pt-opt-label">点击拐点连线 · Shift 正交</span>
          {/if}
        {:else if activeTool === 'zone'}
          <button type="button" class="pt-opt-btn" onclick={runRoomDetect}>
            自动识别房间
          </button>
          <span class="pt-opt-label">或逐点圈出 · Enter 闭合</span>
        {:else if activeTool === 'furniture'}
          <span class="pt-opt-label">放置</span>
          <button
            type="button"
            class="pt-opt-btn pt-opt-btn-wide"
            aria-haspopup="dialog"
            onclick={() => (placementKindsOpen = true)}
          >
            {PLACEMENT_KINDS[placementKind].group} · {PLACEMENT_KINDS[
              placementKind
            ].label} ▾
          </button>
        {:else if activeTool === 'storage'}
          <span class="pt-opt-label">点分区或家具指派储藏区</span>
        {:else if activeTool === 'viewpoint'}
          <button
            type="button"
            class="pt-opt-btn"
            disabled={Boolean(bulkProgress)}
            onclick={() => bulkInput?.click()}
            title="一次导入多张：自动读 EXIF、VLM 定分区与朝向"
          >
            {bulkProgress || '批量导入'}
          </button>
          <button
            type="button"
            class="pt-opt-btn"
            onclick={() => (northCalOpen = true)}
            title="校准平面图北向 — EXIF/罗盘朝向的前提"
          >
            北向{planNorthLabel}
          </button>
        {/if}
      {/snippet}
    </PlanEditToolbar>
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
    {#if showViewpointSelectionBar && selectedViewpointObj}
      <PlanViewpointSelectionBar
        viewpoint={selectedViewpointObj}
        compact={compactPlanChrome}
        onClear={() => {
          selectedViewpoint = ''
        }}
        onCalibrateNorth={() => (northCalOpen = true)}
        onPreview={(patch) => {
          // 罗盘/滑杆的连续输入只画预览，不写 store —— 见 PlanViewpointSelectionBar 注释。
          if (!patch) {
            previewViewpoints = null
            return
          }
          const id = selectedViewpoint
          previewViewpoints = (project.viewpoints ?? []).map((v) =>
            v.id === id ? { ...v, ...patch } : v,
          )
        }}
      />
    {/if}
    {#if northCalOpen}
      <PlanNorthCalibrator onClose={() => (northCalOpen = false)} />
    {/if}
    <input
      type="file"
      accept="image/*"
      multiple
      bind:this={bulkInput}
      onchange={onBulkPick}
      hidden
    />
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
      onclick={(e) => {
        // A <dialog> gets the click even when it lands on the ::backdrop, so
        // compare against its box to tell "outside" from "on a kind button".
        if (e.target !== e.currentTarget) return
        const r = e.currentTarget.getBoundingClientRect()
        const outside =
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        if (outside) placementKindsOpen = false
      }}
    >
      <!-- Sticky, with its own ×: the list is 54 items tall, so a 取消 at the
           bottom means scrolling ~1000px to dismiss — and a phone has no Esc. -->
      <div class="placement-kinds-head">
        <p id="placement-kinds-title" class="storage-picker-title">
          选择家具类型
        </p>
        <button
          type="button"
          class="plan-drawer-close"
          aria-label="关闭家具类型选择"
          onclick={() => (placementKindsOpen = false)}>×</button
        >
      </div>
      {#each PLACEMENT_GROUP_ORDER as group (group)}
        <p class="placement-kinds-group">{group}</p>
        <div class="storage-picker-grid placement-kinds-grid">
          {#each Object.entries(PLACEMENT_KINDS).filter(([, s]) => s.group === group) as [kind, spec] (kind)}
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
      {/each}
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

    <!-- 当前工具的操作提示,常显在画布底部 —— 此前只藏在 ? 帮助弹窗里,
         等于每换一个工具都要现学。被动展示,不写任何工具态;选中条出现时让位。
         手机屏幕底部已被选择条/缩放/FAB 占满,提示继续走帮助弹窗。 -->
    {#if planMode === 'edit' && !compactPlanChrome && !hideFabForBar}
      <button
        type="button"
        class="plan-hint-chip"
        title="查看全部快捷键（?）"
        onclick={() => (showHelp = true)}
      >
        {modeHint}
      </button>
    {/if}

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
  </div>

    {#if drawerOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="plan-drawer-backdrop"
        onclick={() => (drawerOpen = false)}
        role="presentation"
      ></div>
      <aside id="plan-drawer" class="plan-drawer" aria-label="平面侧面板">
        <InspectorPanel
          title={drawerLabel}
          onClose={() => (drawerOpen = false)}
          bodyPad="0"
        >
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
              <button
                type="button"
                class="graph-aside-btn graph-aside-btn-warn"
                title="墙图是编辑模式的事实来源，户型定义更新后不会自动跟进"
                onclick={rebuildGraphFromLayout}
              >
                按最新户型重建墙图
              </button>
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
                    pxToInches(selectedPlacementObj.w, planPxPerFt),
                  )}″×{Math.round(
                    pxToInches(selectedPlacementObj.h, planPxPerFt),
                  )}″
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
                  选中画布上的家具可在此编辑；「标储藏」点击分区或家具指派储藏区。
                </p>
              {/if}
            </section>
          {:else if viewEditMode}
            <!-- Without this branch the 视角 layer fell through to the 508
                 RoomDimensionsEditor, which edits parameters the wall graph
                 does not even read. -->
            <section class="graph-aside" aria-label="视角编辑">
              <p class="graph-aside-lead">
                已标 {project.viewpoints?.length ?? 0} 个机位 · 北向{planNorthLabel}
              </p>
              <button
                type="button"
                class="graph-aside-btn"
                onclick={() => (northCalOpen = true)}
              >
                校准平面图北向
              </button>
              <button
                type="button"
                class="graph-aside-btn"
                disabled={Boolean(bulkProgress)}
                onclick={() => bulkInput?.click()}
              >
                {bulkProgress || '批量导入实拍照片'}
              </button>
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

          {#if wallGraphEditMode}
            <!-- 清空 used to sit in the tool palette (and on mobile it was the
                 highest-contrast control on screen, right next to undo). A
                 whole-layout wipe does not belong one stray tap from 建墙. -->
            <section class="plan-danger" aria-label="危险操作">
              <p class="plan-danger-title">危险操作</p>
              <button
                type="button"
                class="graph-aside-btn plan-danger-btn"
                title="删除所有内墙、门窗与分区，仅保留最外围墙"
                onclick={handleResetToShell}
              >
                清空户型
              </button>
            </section>
          {/if}
        </InspectorPanel>
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
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 0;
  }

  .topbar-detail-btn {
    font-size: 13px;
    font-weight: 650;
    min-height: 36px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--accent);
    cursor: pointer;
    white-space: nowrap;
  }

  .topbar-detail-btn.open {
    background: var(--accent);
    color: #f5f8fa;
    border-color: transparent;
  }

  .topbar-detail-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* 通知栈:在流里,顶栏之下、画布之上 —— 横幅不再遮画布 */
  .plan-notices {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 6px max(10px, var(--safe-right-effective)) 0
      max(10px, var(--safe-left-effective));
    max-width: 640px;
  }

  .plan-notices:empty {
    display: none;
  }

  .plan-convert-banner {
    margin: 0;
    padding: 10px 12px;
    border-radius: 12px;
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
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 10px 30px -14px rgba(0, 0, 0, 0.4);
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

  /* Destructive — drops hand edits to the graph. Must come AFTER
     .graph-aside-btn: same specificity, so source order decides. */
  .graph-aside-btn-warn {
    color: #b45309;
    border-color: color-mix(in srgb, #b45309 35%, var(--border));
  }

  /* Tool options — rendered into PlanEditToolbar's `options` snippet, so these
     rules must live here: Svelte scopes by where the markup is authored. */
  .pt-opt-label {
    padding: 0 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--t3);
    white-space: nowrap;
  }

  .pt-opt-btn {
    min-height: 30px;
    padding: 3px 10px;
    border-radius: 7px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--t2);
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
    cursor: pointer;
  }

  .pt-opt-btn:not(:disabled):hover {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--t1);
  }

  .pt-opt-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .pt-opt-btn.active {
    background: var(--accent);
    color: #f5f8fa;
  }

  .pt-opt-btn:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  .pt-opt-btn-wide {
    border-color: var(--border);
  }

  .pt-opt-input {
    width: 108px;
    min-height: 30px;
    padding: 3px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t1);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .pt-opt-input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .plan-danger {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .plan-danger-title {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--t3);
  }

  .plan-danger-btn {
    color: #b45309;
    border-color: color-mix(in srgb, #b45309 35%, var(--border));
  }

  @media (max-width: 599px) {
    .pt-opt-btn,
    .pt-opt-input {
      min-height: 38px;
      flex-shrink: 0;
    }
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

  .plan-inline-btn {
    margin: 0 4px;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-weight: 600;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }

  /* 拍照任务条 —— 结构对齐 NewScanBanner,换主题强调色区分「采集中」 */
  .shoot-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--accent, #4f7c66) 45%, var(--border));
    background: color-mix(in srgb, var(--accent, #4f7c66) 8%, var(--card));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 10px 30px -14px rgba(0, 0, 0, 0.4);
  }

  .shoot-banner-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .shoot-banner-copy strong {
    font-size: 13px;
    color: var(--t1);
  }

  .shoot-banner-copy span {
    font-size: 12px;
    color: var(--t2);
  }

  .shoot-banner-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .shoot-banner-cta {
    font-size: 13px;
    font-weight: 650;
    min-height: 36px;
    padding: 6px 14px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--accent, #4f7c66) 55%, var(--border));
    background: color-mix(in srgb, var(--accent, #4f7c66) 18%, var(--bg));
    color: var(--t1);
    cursor: pointer;
  }

  .shoot-banner-dismiss {
    font-size: 12px;
    min-height: 36px;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t2);
    cursor: pointer;
  }

  /* 画布 + Inspector 的横向骨架:中间空间画布,右侧情境面板(桌面) */
  .plan-body {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    height: 0;
  }

  .plan-stage {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .plan-stage :global(.plan-shell) {
    flex: 1 1 auto;
    min-height: 0;
  }

  .plan-hint-chip {
    position: absolute;
    z-index: 40;
    left: 50%;
    bottom: 12px;
    transform: translateX(-50%);
    max-width: min(64vw, 640px);
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    background: color-mix(in srgb, var(--card) 90%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 10px 30px -14px rgba(0, 0, 0, 0.4);
    font-size: 12px;
    line-height: 1.4;
    color: var(--t2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .plan-hint-chip:hover {
    color: var(--t1);
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  }

  .plan-hint-chip:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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

  /* .plan-drawer-close 仍被家具类型选择弹窗复用,见下方 placement-kinds-head */
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

  .plan-drawer :global(.inspector-panel) {
    flex: 1 1 auto;
    min-height: 0;
  }

  .plan-drawer :global(.inspector-panel-body .inspector),
  .plan-drawer :global(.inspector-panel-body .dim-editor) {
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .plan-drawer :global(.inspector-panel-body .dim-grid) {
    grid-template-columns: 1fr;
  }

  /* 桌面(≥900px):Inspector 驻留在画布右侧,是布局的一列而不是浮层;
     开关在顶栏(详情),右下角不再挂孤零零的 FAB。 */
  @media (min-width: 900px) {
    .plan-drawer-fab {
      display: none;
    }

    .plan-drawer {
      position: static;
      flex: 0 0 320px;
      width: 320px;
      max-height: none;
      margin: 0;
      border: none;
      border-left: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
      border-radius: 0;
      box-shadow: none;
      background: var(--bg);
    }
  }

  @media (max-width: 899px) {
    .topbar-detail-btn {
      display: none;
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

    /* 顶栏在手机上收紧:副题让位给控件。类名在 HomeTopBar 上,只能用 :global
       命中 —— 但只有 /plan 传了 class="plan-topbar",不会波及 /storage /tidy。 */
    :global(.plan-topbar) {
      gap: 8px;
      padding-left: max(10px, var(--safe-left-effective));
      padding-right: max(10px, var(--safe-right-effective));
    }

    :global(.plan-topbar .home-topbar-sub) {
      display: none;
    }

    .plan-convert-banner {
      font-size: 11px;
      padding: 6px 8px;
    }

    .seg.seg-track button {
      min-height: 40px;
      min-width: 60px;
      font-size: 13px;
      padding: 8px 14px;
    }

    .help-btn {
      width: 40px;
      height: 40px;
    }

    .mode-undo-btn {
      width: 40px;
      height: 40px;
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

    /* 选中条铺满底部时,缩放控件和图例会被整条盖住却仍可聚焦 ——
       跟 FAB 的 hide-for-bar 同一策略:让位,取消选中即回来。 */
    .plan-stage:has(:global(.sel-bar)) :global(.plan-zoom),
    .plan-stage:has(:global(.graph-sel-bar)) :global(.plan-zoom),
    .plan-stage:has(:global(.graph-open-bar)) :global(.plan-zoom),
    .plan-stage:has(:global(.sel-bar)) :global(.plan-legend-wrap.overlay),
    .plan-stage:has(:global(.graph-sel-bar)) :global(.plan-legend-wrap.overlay),
    .plan-stage:has(:global(.graph-open-bar)) :global(.plan-legend-wrap.overlay) {
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }
  }

  @media (min-width: 600px) {
    .plan-drawer-backdrop {
      display: none;
    }
  }

  /* 600–899px:没有右列的空间,Inspector 是底部居中的浮层 */
  @media (min-width: 600px) and (max-width: 899px) {
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

    .plan-body:has(:global(.sel-bar)) .plan-drawer,
    .plan-body:has(:global(.graph-open-bar)) .plan-drawer,
    .plan-body:has(:global(.graph-sel-bar)) .plan-drawer {
      bottom: calc(
        var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 148px
      );
    }
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

  .placement-kinds-head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    /* Cancels the dialog's own padding so the sticky bar spans the full width
       and nothing scrolls visibly past its edges. */
    margin: -16px -16px 0;
    padding: 12px 16px 8px;
    background: color-mix(in srgb, var(--card) 96%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }

  .placement-kinds-head .storage-picker-title {
    margin: 0;
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

  .placement-kinds-group {
    margin: 10px 0 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--t3, var(--t2));
  }

  .placement-kinds-group:first-of-type {
    margin-top: 2px;
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
