import { browser } from '$app/environment'
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme,
} from '@life-os/theme'
import { SAMPLE_508 } from './spatial/sample-508.js'
import { scheduleHomePortalMetadataSync } from './homePortalMetadata.js'
import { deserializeProject, hydrateProject } from './spatial/model.js'
import {
  default508Config,
  merge508Config,
  setRoomDimension,
  validate508Config,
} from './spatial/layout-508.js'
import {
  applyOpeningDrag,
  applyWallDrag,
  OPENING_EDIT_BINDINGS,
  resolveWallBinding,
} from './spatial/wall-edit.js'
import {
  addWallSegment,
  createEmptyWallGraph,
  deleteWallEdge,
  export508ToWallGraph,
  moveVertex,
  splitWallAtMidpoint,
} from './spatial/wall-graph.js'
import {
  convert508Openings,
  createOpeningAtPoint,
  cycleDoorStyleOpening,
  doorStyleLabel,
  filterOpeningsForEdge,
  flipGraphOpeningSwing,
  fitGraphOpeningOnEdge,
  previewGraphOpeningEdit,
  remapOpeningsAfterSplit,
  toggleGraphOpeningType,
} from './spatial/graph-openings.js'
import {
  createZoneFromChain,
  findZoneAtPoint,
  markZonesStaleOnWallChange,
} from './spatial/zones.js'
import {
  createPlacement,
  placementsToFurniture,
  resolveStorageZoneBounds,
  rotatePlacement,
} from './spatial/placements.js'
import { snapGraphPoint } from './spatial/wall-graph.js'
import { toast } from './ui.svelte.js'

/** @typedef {import('./spatial/types.js').SpatialProject} SpatialProject */
/** @typedef {import('@life-os/contracts/appearance').ColorSchemePreference} ColorSchemePreference */

const SKEY = 'homeos_spatial_v1'
const UNDO_KEY = 'homeos_layout_undo_v1'
const GRAPH_UNDO_KEY = 'homeos_wall_graph_undo_v1'
const MAX_LAYOUT_UNDO = 24

/** @type {string[]} */
let layoutUndoStack = []
/** @type {string[]} */
let layoutRedoStack = []

function persistUndoStacks() {
  if (!browser) return
  try {
    localStorage.setItem(
      UNDO_KEY,
      JSON.stringify({ undo: layoutUndoStack, redo: layoutRedoStack }),
    )
  } catch {
    /* quota */
  }
}

function loadUndoStacks() {
  if (!browser) return
  try {
    const raw = localStorage.getItem(UNDO_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (Array.isArray(data.undo)) layoutUndoStack = data.undo
    if (Array.isArray(data.redo)) layoutRedoStack = data.redo
  } catch {
    layoutUndoStack = []
    layoutRedoStack = []
  }
}

loadUndoStacks()

/** @type {string[]} */
let graphUndoStack = []
/** @type {string[]} */
let graphRedoStack = []

function persistGraphUndoStacks() {
  if (!browser) return
  try {
    localStorage.setItem(
      GRAPH_UNDO_KEY,
      JSON.stringify({ undo: graphUndoStack, redo: graphRedoStack }),
    )
  } catch {
    /* quota */
  }
}

function loadGraphUndoStacks() {
  if (!browser) return
  try {
    const raw = localStorage.getItem(GRAPH_UNDO_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (Array.isArray(data.undo)) graphUndoStack = data.undo
    if (Array.isArray(data.redo)) graphRedoStack = data.redo
  } catch {
    graphUndoStack = []
    graphRedoStack = []
  }
}

loadGraphUndoStacks()

export function isWallGraphMode() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  return raw.layoutMode === 'wallGraph' && Boolean(raw.wallGraph)
}

function snapshotEditSource(raw) {
  return JSON.stringify({
    wallGraph: raw.wallGraph,
    graphOpenings: raw.graphOpenings ?? [],
    zones: raw.zones ?? [],
    placements: raw.placements ?? [],
  })
}

/** @param {string} raw */
function parseEditSnapshot(raw) {
  const data = JSON.parse(raw)
  if (data && typeof data === 'object' && data.wallGraph) return data
  return {
    wallGraph: data,
    graphOpenings: [],
    zones: [],
    placements: [],
  }
}

function pushGraphUndo() {
  const raw = S.projects[S.activeProjectId]
  if (!raw?.wallGraph) return
  graphUndoStack.push(snapshotEditSource(raw))
  if (graphUndoStack.length > MAX_LAYOUT_UNDO) graphUndoStack.shift()
  graphRedoStack = []
  persistGraphUndoStacks()
}

export function canUndoGraph() {
  return graphUndoStack.length > 0
}

export function canRedoGraph() {
  return graphRedoStack.length > 0
}

export function undoGraphEdit() {
  const prev = graphUndoStack.pop()
  if (!prev) {
    toast('没有可撤销的墙图修改', 'warn')
    return
  }
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  if (raw?.wallGraph) {
    graphRedoStack.push(snapshotEditSource(raw))
    if (graphRedoStack.length > MAX_LAYOUT_UNDO) graphRedoStack.shift()
  }
  const snap = parseEditSnapshot(prev)
  applyEditSource(snap, { skipUndo: true, silent: true })
  persistGraphUndoStacks()
  toast('已撤销墙图修改')
}

export function redoGraphEdit() {
  const nextSnap = graphRedoStack.pop()
  if (!nextSnap) {
    toast('没有可重做的墙图修改', 'warn')
    return
  }
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  if (raw?.wallGraph) {
    graphUndoStack.push(snapshotEditSource(raw))
    if (graphUndoStack.length > MAX_LAYOUT_UNDO) graphUndoStack.shift()
  }
  const snap = parseEditSnapshot(nextSnap)
  applyEditSource(snap, { skipUndo: true, silent: true })
  persistGraphUndoStacks()
  toast('已重做墙图修改')
}

/**
 * @param {{
 *   wallGraph?: import('./spatial/types.js').WallGraph,
 *   graphOpenings?: import('./spatial/types.js').GraphOpening[],
 *   zones?: import('./spatial/types.js').SpatialZone[],
 *   placements?: import('./spatial/types.js').SpatialPlacement[],
 *   storageZones?: import('./spatial/types.js').SpatialStorageZone[],
 * }} patch
 * @param {{ skipUndo?: boolean, silent?: boolean, toastMsg?: string }} [opts]
 */
export function applyEditSource(patch, opts = {}) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  if (!opts.skipUndo) pushGraphUndo()
  const nextGraph = patch.wallGraph ?? raw.wallGraph
  let zones = patch.zones ?? raw.zones ?? []
  if (
    patch.wallGraph &&
    raw.wallGraph &&
    nextGraph &&
    !patch.zones &&
    zones.length
  ) {
    zones = markZonesStaleOnWallChange(raw.wallGraph, nextGraph, zones)
  }
  const next = hydrateProject({
    ...raw,
    layoutMode: 'wallGraph',
    wallGraph: nextGraph,
    graphOpenings: patch.graphOpenings ?? raw.graphOpenings ?? [],
    zones,
    placements: patch.placements ?? raw.placements ?? [],
    storageZones: patch.storageZones ?? raw.storageZones ?? [],
  })
  setActiveProject(next)
  if (!opts.silent && opts.toastMsg) toast(opts.toastMsg)
  else if (!opts.silent) notifyLayoutSaved()
}

/**
 * @param {import('./spatial/types.js').Point[]} polygon
 * @param {string} [nameZh]
 */
export function addZone(polygon, nameZh) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const zones = raw.zones ?? []
  const zone = createZoneFromChain(polygon, nameZh, zones)
  if (!zone) return null
  applyEditSource({ zones: [...zones, zone] }, { toastMsg: `已添加 ${zone.nameZh}` })
  return zone.id
}

/**
 * @param {string} zoneId
 * @param {Partial<import('./spatial/types.js').SpatialZone>} patch
 */
export function updateZone(zoneId, patch) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const zones = (raw.zones ?? []).map((z) =>
    z.id === zoneId ? { ...z, ...patch } : z,
  )
  applyEditSource({ zones }, { silent: true })
}

/** @param {string} zoneId */
export function removeZone(zoneId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const zones = (raw.zones ?? []).filter((z) => z.id !== zoneId)
  applyEditSource({ zones }, { silent: true })
  toast('已删除分区', {
    actionLabel: '撤销',
    onAction: () => undoGraphEdit(),
    duration: 8000,
  })
}

/** @param {string} zoneId */
export function confirmZone(zoneId) {
  updateZone(zoneId, { stale: false })
  toast('已确认分区')
}

/**
 * @param {string} zoneId
 * @param {number} vertexIndex
 * @param {number} x
 * @param {number} y
 */
export function commitZoneVertexMove(zoneId, vertexIndex, x, y) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  const pxPerFt = graph?.pxPerFt ?? 36
  const snapped = snapGraphPoint(x, y, pxPerFt)
  const zones = (raw.zones ?? []).map((z) => {
    if (z.id !== zoneId) return z
    const polygon = z.polygon.map((p, i) =>
      i === vertexIndex ? snapped : p,
    )
    return { ...z, polygon }
  })
  applyEditSource({ zones }, { toastMsg: '已调整分区顶点' })
}

/**
 * @param {string} kind
 * @param {number} x
 * @param {number} y
 */
export function addPlacement(kind, x, y) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const zones = raw.zones ?? []
  const placements = raw.placements ?? []
  const p = createPlacement(kind, x, y, zones, placements)
  if (!p) return null
  applyEditSource(
    { placements: [...placements, p] },
    { toastMsg: `已放置 ${p.label}` },
  )
  return p.id
}

/**
 * @param {string} placementId
 * @param {Partial<import('./spatial/types.js').SpatialPlacement>} patch
 */
export function updatePlacement(placementId, patch) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const placements = (raw.placements ?? []).map((p) =>
    p.id === placementId ? { ...p, ...patch } : p,
  )
  applyEditSource({ placements }, { silent: true })
}

/** @param {string} placementId */
export function removePlacement(placementId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  let placements = (raw.placements ?? []).filter((p) => p.id !== placementId)
  const storageZones = (raw.storageZones ?? []).map((sz) =>
    sz.placementId === placementId
      ? { ...sz, placementId: undefined, zoneId: undefined }
      : sz,
  )
  applyEditSource({ placements, storageZones }, { silent: true })
  toast('已删除家具', {
    actionLabel: '撤销',
    onAction: () => undoGraphEdit(),
    duration: 8000,
  })
}

/** @param {string} placementId */
export function rotatePlacementById(placementId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const placements = (raw.placements ?? []).map((p) =>
    p.id === placementId ? rotatePlacement(p) : p,
  )
  applyEditSource({ placements }, { toastMsg: '已旋转家具' })
}

/**
 * @param {string} placementId
 * @param {number} x
 * @param {number} y
 */
export function commitPlacementMove(placementId, x, y) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  const pxPerFt = graph?.pxPerFt ?? 36
  const snapped = snapGraphPoint(x, y, pxPerFt)
  const zones = raw.zones ?? []
  const placements = (raw.placements ?? []).map((p) => {
    if (p.id !== placementId) return p
    const cx = snapped.x
    const cy = snapped.y
    const zone = findZoneAtPoint(zones, { x: cx, y: cy })
    return {
      ...p,
      x: cx - p.w / 2,
      y: cy - p.h / 2,
      zoneId: zone?.id,
    }
  })
  applyEditSource({ placements }, { silent: true })
}

/**
 * @param {string} code
 * @param {{ zoneId?: string, placementId?: string }} target
 */
export function assignStorageZone(code, target) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const storageZones = (raw.storageZones ?? []).map((sz) =>
    sz.code === code
      ? { ...sz, zoneId: target.zoneId, placementId: target.placementId }
      : sz,
  )
  applyEditSource({ storageZones }, { toastMsg: `已将 ${code} 指派到新位置` })
}

/** @param {string} code */
export function unassignStorageZone(code) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const storageZones = (raw.storageZones ?? []).map((sz) =>
    sz.code === code
      ? { ...sz, zoneId: undefined, placementId: undefined }
      : sz,
  )
  applyEditSource({ storageZones }, { toastMsg: `已解除 ${code} 指派` })
}

/**
 * @param {import('./spatial/types.js').WallGraph} graph
 * @param {{ skipUndo?: boolean, silent?: boolean, toastMsg?: string }} [opts]
 */
export function applyWallGraph(graph, opts = {}) {
  applyEditSource({ wallGraph: graph }, opts)
}

export function activateWallGraphMode() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const hydrated = hydrateProject(raw)
  const graph = export508ToWallGraph(hydrated)
  const graphOpenings = convert508Openings(hydrated, graph)
  graphUndoStack = []
  graphRedoStack = []
  persistGraphUndoStacks()
  const next = hydrateProject({
    ...hydrated,
    layoutMode: 'wallGraph',
    wallGraph: graph,
    graphOpenings,
    openings: [],
  })
  setActiveProject(next)
  toast(`已切换墙图 · 识别 ${graphOpenings.length} 个门窗`)
}

export function reconvertGraphOpenings() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  if (!raw.wallGraph) {
    toast('当前不是墙图模式', 'warn')
    return
  }
  const hydrated508 = hydrateProject({
    ...raw,
    layoutMode: 'parametric508',
    wallGraph: undefined,
  })
  const graphOpenings = convert508Openings(hydrated508, raw.wallGraph)
  applyEditSource({ graphOpenings }, { toastMsg: `已重新识别 ${graphOpenings.length} 个门窗` })
}

export function revertToParametric508() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  if (!raw.layoutConfig) {
    toast('无 508 参数可恢复', 'warn')
    return
  }
  const next = hydrateProject({
    ...raw,
    layoutMode: 'parametric508',
    wallGraph: undefined,
    graphOpenings: [],
  })
  setActiveProject(next)
  toast('已切回 508 参数化编辑')
}

/**
 * Clear everything except the outermost walls: interior walls, openings,
 * zones (rooms) and placements are removed so the plan can be redrawn from
 * scratch. Storage zone item lists are kept but unassigned from geometry.
 */
export function resetToOuterShell() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const hydrated = hydrateProject(raw)
  const sourceGraph =
    raw.layoutMode === 'wallGraph' && raw.wallGraph
      ? raw.wallGraph
      : export508ToWallGraph(hydrated)
  const exteriorEdges = sourceGraph.edges.filter((e) => e.exterior)
  const boundsEdges = exteriorEdges.length ? exteriorEdges : sourceGraph.edges
  if (!boundsEdges.length) {
    toast('墙图为空，没有可保留的外墙', 'warn')
    return false
  }
  const vById = Object.fromEntries(sourceGraph.vertices.map((v) => [v.id, v]))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const edge of boundsEdges) {
    for (const v of [vById[edge.a], vById[edge.b]]) {
      if (!v) continue
      minX = Math.min(minX, v.x)
      minY = Math.min(minY, v.y)
      maxX = Math.max(maxX, v.x)
      maxY = Math.max(maxY, v.y)
    }
  }
  if (!(maxX > minX) || !(maxY > minY)) {
    toast('外墙范围无效，无法清空', 'warn')
    return false
  }

  if (raw.wallGraph) {
    pushGraphUndo()
  } else {
    // Coming from 508 parametric mode: seed undo with the fully converted
    // wall graph so ⌘Z restores the previous layout instead of nothing.
    graphUndoStack = [
      JSON.stringify({
        wallGraph: sourceGraph,
        graphOpenings: convert508Openings(hydrated, sourceGraph),
        zones: [],
        placements: [],
      }),
    ]
    graphRedoStack = []
    persistGraphUndoStacks()
  }

  let shell = createEmptyWallGraph(sourceGraph.pxPerFt, sourceGraph.margin)
  const sides = [
    [minX, minY, maxX, minY],
    [maxX, minY, maxX, maxY],
    [maxX, maxY, minX, maxY],
    [minX, maxY, minX, minY],
  ]
  for (const [x1, y1, x2, y2] of sides) {
    shell = addWallSegment(shell, x1, y1, x2, y2, { exterior: true }).graph
  }

  // 物品清单保留；几何位置清空，待「标储藏」重新指派后才在图上显示
  const storageZones = (raw.storageZones ?? []).map((sz) => ({
    ...sz,
    zoneId: undefined,
    placementId: undefined,
    bounds: undefined,
    marker: undefined,
  }))
  const next = hydrateProject({
    ...raw,
    layoutMode: 'wallGraph',
    wallGraph: shell,
    graphOpenings: [],
    zones: [],
    placements: [],
    rooms: [],
    openings: [],
    storageZones,
  })
  setActiveProject(next)
  toast('已清空户型 · 仅保留最外围墙，可开始重新绘制', {
    actionLabel: '撤销',
    onAction: () => undoGraphEdit(),
    duration: 8000,
  })
  return true
}

/**
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 */
export function addGraphWall(x1, y1, x2, y2) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  if (!graph) return false
  const result = addWallSegment(graph, x1, y1, x2, y2)
  if (!result.edgeId && result.error && result.error !== '墙段已存在') {
    toast(result.error, 'warn')
    return false
  }
  if (!result.edgeId) return false
  applyEditSource({ wallGraph: result.graph }, { toastMsg: '已添加墙段' })
  return true
}

/** @type {import('./spatial/types.js').GraphOpening['style']} */
let lastDoorStyle = 'swing'

/** @returns {import('./spatial/types.js').GraphOpening['style']} */
export function getLastDoorStyle() {
  return lastDoorStyle
}

/** @param {import('./spatial/types.js').GraphOpening['style']} style */
export function setLastDoorStyle(style) {
  if (style) lastDoorStyle = style
}

/**
 * @param {string} edgeId
 * @param {{ x: number, y: number }} pt
 * @param {'door' | 'window'} [type]
 * @param {import('./spatial/types.js').GraphOpening['style']} [doorStyle]
 */
export function addGraphOpening(edgeId, pt, type = 'door', doorStyle) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  if (!graph) return null
  const style = type === 'door' ? doorStyle ?? lastDoorStyle : undefined
  const opening = createOpeningAtPoint(graph, edgeId, pt, type, style ?? 'swing')
  if (!opening) return null
  if (type === 'door' && opening.style) lastDoorStyle = opening.style
  const graphOpenings = [...(raw.graphOpenings ?? []), opening]
  applyEditSource(
    { graphOpenings },
    {
      toastMsg: `已添加${type === 'window' ? '窗' : `门（${doorStyleLabel(opening.style)} · ${opening.spanIn}″）`}`,
    },
  )
  return opening.id
}

/** @param {string} openingId */
export function cycleGraphOpeningStyle(openingId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  if (!graph) return
  const graphOpenings = (raw.graphOpenings ?? []).map((o) => {
    if (o.id !== openingId || o.type !== 'door') return o
    const next = cycleDoorStyleOpening(o)
    return fitGraphOpeningOnEdge(graph, next)
  })
  const next = graphOpenings.find((o) => o.id === openingId)
  if (next?.style) lastDoorStyle = next.style
  applyEditSource(
    { graphOpenings },
    {
      toastMsg: next
        ? `已切换为${doorStyleLabel(next.style)}（${next.spanIn}″）`
        : '已切换门型',
    },
  )
}

/** @param {string} openingId */
export function removeGraphOpening(openingId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graphOpenings = (raw.graphOpenings ?? []).filter((o) => o.id !== openingId)
  applyEditSource({ graphOpenings }, { toastMsg: '已删除门窗' })
}

/**
 * @param {string} openingId
 * @param {{ x: number, y: number }} pt
 * @param {'move' | 'resize-start' | 'resize-end'} mode
 */
export function commitGraphOpeningEdit(openingId, pt, mode) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  if (!graph) return
  const graphOpenings = previewGraphOpeningEdit(
    graph,
    raw.graphOpenings ?? [],
    openingId,
    pt,
    mode,
  )
  applyEditSource({ graphOpenings }, { silent: true })
}

/**
 * @param {import('./spatial/types.js').WallGraph} graph
 * @param {import('./spatial/types.js').GraphOpening[]} graphOpenings
 * @param {string} openingId
 * @param {{ x: number, y: number }} pt
 * @param {'move' | 'resize-start' | 'resize-end'} mode
 */
export function previewGraphOpeningDrag(graph, graphOpenings, openingId, pt, mode) {
  return previewGraphOpeningEdit(graph, graphOpenings, openingId, pt, mode)
}

/** @param {string} openingId */
export function toggleGraphOpeningKind(openingId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  if (!graph) return
  const graphOpenings = (raw.graphOpenings ?? []).map((o) => {
    if (o.id !== openingId) return o
    return fitGraphOpeningOnEdge(graph, toggleGraphOpeningType(o))
  })
  applyEditSource({ graphOpenings }, { toastMsg: '已切换门窗类型' })
}

/** @param {string} openingId */
export function flipGraphOpeningDirection(openingId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graphOpenings = (raw.graphOpenings ?? []).map((o) =>
    o.id === openingId ? flipGraphOpeningSwing(o) : o,
  )
  applyEditSource({ graphOpenings }, { toastMsg: '已翻转开向' })
}

/**
 * @param {GraphOpening[]} graphOpenings
 * @param {string} edgeId
 */
export function countGraphOpeningsOnEdge(graphOpenings, edgeId) {
  return graphOpenings.filter((o) => o.edgeId === edgeId && !o.hidden).length
}

/** @param {string} edgeId */
export function removeGraphWall(edgeId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  if (!graph) return
  const cascadeCount = countGraphOpeningsOnEdge(raw.graphOpenings ?? [], edgeId)
  const nextGraph = deleteWallEdge(graph, edgeId)
  const graphOpenings = filterOpeningsForEdge(raw.graphOpenings ?? [], edgeId)
  applyEditSource({ wallGraph: nextGraph, graphOpenings }, { silent: true })
  const msg =
    cascadeCount > 0
      ? `已删除墙段 · 级联 ${cascadeCount} 个门窗`
      : '已删除墙段'
  toast(msg, {
    actionLabel: '撤销',
    onAction: () => undoGraphEdit(),
    duration: 8000,
  })
}

/** @param {string} edgeId */
export function splitGraphWall(edgeId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  if (!graph) return false
  const result = splitWallAtMidpoint(graph, edgeId)
  if (!result) {
    toast('无法分割此墙段', 'warn')
    return false
  }
  const graphOpenings = remapOpeningsAfterSplit(
    graph,
    raw.graphOpenings ?? [],
    edgeId,
    result.edgeAId,
    result.edgeBId,
    result.splitT,
  )
  applyEditSource(
    { wallGraph: result.graph, graphOpenings },
    { toastMsg: '已分割墙段' },
  )
  return true
}

/**
 * @param {string} vertexId
 * @param {number} x
 * @param {number} y
 */
export function commitGraphVertexMove(vertexId, x, y) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  if (!graph) return
  const nextGraph = moveVertex(graph, vertexId, x, y)
  applyEditSource({ wallGraph: nextGraph }, { toastMsg: '已移动顶点' })
}

/**
 * @param {import('./spatial/types.js').WallGraph} graph
 * @param {string} vertexId
 * @param {number} x
 * @param {number} y
 * @returns {import('./spatial/types.js').WallGraph | null}
 */
export function previewGraphVertexMove(graph, vertexId, x, y) {
  if (!graph) return null
  return moveVertex(graph, vertexId, x, y)
}

const defaultState = () => ({
  schemaVersion: 1,
  settings: {
    theme: 'auto',
    locale: 'zh',
    lockPortraitOnPhone: false,
  },
  activeProjectId: SAMPLE_508.meta.id,
  projects: {
    [SAMPLE_508.meta.id]: SAMPLE_508,
  },
})

function load() {
  if (!browser) return defaultState()
  try {
    const raw = localStorage.getItem(SKEY)
    if (!raw) return defaultState()
    const data = JSON.parse(raw)
    if (!data.projects || !data.projects[SAMPLE_508.meta.id]) {
      data.projects = { ...defaultState().projects, ...(data.projects || {}) }
    }
    const stored = data.projects[SAMPLE_508.meta.id]
    if ((stored.schemaVersion ?? 2) < 3 && stored.layoutMode === 'wallGraph') {
      stored.graphOpenings = stored.graphOpenings ?? []
      stored.zones = stored.zones ?? []
      stored.placements = stored.placements ?? []
      graphUndoStack = []
      graphRedoStack = []
      persistGraphUndoStacks()
    }
    data.projects[SAMPLE_508.meta.id] = hydrateProject({
      ...SAMPLE_508,
      ...stored,
      layoutConfig: stored.layoutConfig ?? SAMPLE_508.layoutConfig,
      layoutMode: stored.layoutMode ?? 'parametric508',
      wallGraph: stored.wallGraph,
      graphOpenings: stored.graphOpenings ?? [],
      zones: stored.zones ?? [],
      placements: stored.placements ?? [],
      storageZones: stored.storageZones ?? SAMPLE_508.storageZones,
      furnitureInventory: [],
      meta: { ...SAMPLE_508.meta, ...stored.meta },
    })
    return { ...defaultState(), ...data }
  } catch {
    return defaultState()
  }
}

export const S = $state(load())

export function persist() {
  if (!browser) return
  try {
    localStorage.setItem(SKEY, JSON.stringify(S))
  } catch {
    /* quota */
  }
}

/** @returns {SpatialProject} */
export function getActiveProject() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  return hydrateProject(raw)
}

/** @type {string} */
let planSubtitle = $state('')
/** @type {boolean} */
let planImmersiveEdit = $state(false)

/** @param {string} subtitle */
export function setPlanSubtitle(subtitle) {
  planSubtitle = subtitle
}

/** @returns {string} */
export function getPlanSubtitle() {
  return planSubtitle
}

/** @param {boolean} on */
export function setPlanImmersiveEdit(on) {
  planImmersiveEdit = on
}

/** @returns {boolean} */
export function getPlanImmersiveEdit() {
  return planImmersiveEdit
}

/** @type {number} */
let layoutSavedAt = $state(0)

export function notifyLayoutSaved() {
  layoutSavedAt = Date.now()
}

/** @returns {number} */
export function getLayoutSavedAt() {
  return layoutSavedAt
}

/** @type {import('./spatial/types.js').Layout508Config | null} */
let layoutDragPreview = $state(null)

/** @returns {import('./spatial/types.js').Layout508Config | null} */
export function getLayoutDragPreview() {
  return layoutDragPreview
}

/** @param {import('./spatial/types.js').Layout508Config | null} config */
export function setLayoutDragPreview(config) {
  layoutDragPreview = config
}

export function canUndoLayout() {
  return layoutUndoStack.length > 0
}

export function canRedoLayout() {
  return layoutRedoStack.length > 0
}

function clearLayoutRedo() {
  layoutRedoStack = []
}

function pushLayoutUndo() {
  const raw = S.projects[S.activeProjectId]
  if (!raw?.layoutConfig) return
  layoutUndoStack.push(JSON.stringify(raw.layoutConfig))
  if (layoutUndoStack.length > MAX_LAYOUT_UNDO) layoutUndoStack.shift()
  clearLayoutRedo()
  persistUndoStacks()
}

export function undoLayoutEdit() {
  const prev = layoutUndoStack.pop()
  if (!prev) {
    toast('没有可撤销的修改', 'warn')
    return
  }
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  if (raw?.layoutConfig) {
    layoutRedoStack.push(JSON.stringify(raw.layoutConfig))
    if (layoutRedoStack.length > MAX_LAYOUT_UNDO) layoutRedoStack.shift()
  }
  const config = JSON.parse(prev)
  const next = hydrateProject({ ...raw, layoutConfig: config })
  setActiveProject(next)
  persistUndoStacks()
  toast('已撤销上一步尺寸修改')
}

export function redoLayoutEdit() {
  const nextConfig = layoutRedoStack.pop()
  if (!nextConfig) {
    toast('没有可重做的修改', 'warn')
    return
  }
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  if (raw?.layoutConfig) {
    layoutUndoStack.push(JSON.stringify(raw.layoutConfig))
    if (layoutUndoStack.length > MAX_LAYOUT_UNDO) layoutUndoStack.shift()
  }
  const config = JSON.parse(nextConfig)
  const next = hydrateProject({ ...raw, layoutConfig: config })
  setActiveProject(next)
  persistUndoStacks()
  toast('已重做')
}

/**
 * @param {string} roomKey
 * @param {'w' | 'h'} axis
 * @param {{ ft: number, in: number }} value
 * @param {{ skipUndo?: boolean, silent?: boolean }} [opts]
 * @returns {string[]}
 */
export function updateRoomDimension(roomKey, axis, value, opts = {}) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const config = raw.layoutConfig ?? SAMPLE_508.layoutConfig
  if (!config) return []
  if (!opts.skipUndo) pushLayoutUndo()
  const nextConfig = setRoomDimension(config, roomKey, axis, value)
  const issues = validate508Config(nextConfig)
  if (issues.length) {
    toast(issues[0], 'warn')
    return issues
  }
  const next = hydrateProject({ ...raw, layoutConfig: nextConfig })
  setActiveProject(next)
  if (!opts.silent) toast('尺寸已更新')
  return []
}

/**
 * @param {import('./spatial/types.js').Layout508Config} config
 * @param {{ skipUndo?: boolean, silent?: boolean, toastMsg?: string }} [opts]
 */
export function applyLayoutConfig(config, opts = {}) {
  const issues = validate508Config(config)
  if (issues.length) {
    if (!opts.silent) toast(issues[0], 'warn')
    return { ok: false, issues }
  }
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  if (!opts.skipUndo) pushLayoutUndo()
  const next = hydrateProject({ ...raw, layoutConfig: config })
  setActiveProject(next)
  if (!opts.silent && opts.toastMsg) toast(opts.toastMsg)
  return { ok: true, issues: [] }
}

/**
 * @param {import('./spatial/types.js').Layout508Config} baseConfig
 * @param {'wall' | 'opening'} kind
 * @param {string} id
 * @param {number} deltaPx
 * @param {import('./spatial/wall-edit.js').OpeningDragMode} [dragMode]
 */
export function previewLayoutDrag(
  baseConfig,
  kind,
  id,
  deltaPx,
  dragMode = 'move',
) {
  const next =
    kind === 'wall'
      ? applyWallDrag(baseConfig, id, deltaPx)
      : applyOpeningDrag(baseConfig, id, deltaPx, dragMode)
  if (!next) return null
  if (validate508Config(next).length) return null
  return next
}

/**
 * @param {'wall' | 'opening'} kind
 * @param {string} id
 * @param {number} deltaPx
 * @param {{ silent?: boolean, dragMode?: import('./spatial/wall-edit.js').OpeningDragMode }} [opts]
 */
export function commitLayoutDrag(kind, id, deltaPx, opts = {}) {
  const dragMode = opts.dragMode ?? 'move'
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const config = raw.layoutConfig ?? SAMPLE_508.layoutConfig
  if (!config) return false
  const next =
    kind === 'wall'
      ? applyWallDrag(config, id, deltaPx)
      : applyOpeningDrag(config, id, deltaPx, dragMode)
  if (!next) {
    if (!opts.silent) toast('该方向无法继续调整', 'warn')
    return false
  }
  if (JSON.stringify(config) === JSON.stringify(next)) return false
  const label =
    kind === 'wall'
      ? resolveWallBinding(id)?.label
      : OPENING_EDIT_BINDINGS[id]?.label
  const result = applyLayoutConfig(next, {
    silent: opts.silent,
    toastMsg: opts.silent
      ? undefined
      : label
        ? `已更新：${label}`
        : '已更新布局',
  })
  if (result.ok) notifyLayoutSaved()
  return result.ok
}

export function reset508Layout() {
  layoutUndoStack = []
  layoutRedoStack = []
  persistUndoStacks()
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const itemsById = Object.fromEntries(
    (raw.storageZones ?? []).map((z) => [z.id, z.items]),
  )
  const base = hydrateProject({
    ...raw,
    layoutConfig: default508Config(),
    furnitureInventory: undefined,
  })
  const zones = base.storageZones.map((z) => ({
    ...z,
    items: itemsById[z.id] ?? z.items,
  }))
  setActiveProject({ ...base, storageZones: zones })
  toast('已恢复默认户型')
}

/** @param {SpatialProject} project */
export function setActiveProject(project) {
  S.projects[project.meta.id] = project
  S.activeProjectId = project.meta.id
  persist()
  scheduleHomePortalMetadataSync(project.storageZones?.length ?? 0)
}

export function applyTheme() {
  const resolved = resolveTheme(S.settings.theme)
  applyResolvedTheme(resolved, 'home')
}

export function bindAppThemeSystemChange() {
  return bindSystemThemeChange(() => {
    if (S.settings.theme === 'auto') applyTheme()
  })
}

/** @param {ColorSchemePreference} theme */
export function setTheme(theme) {
  S.settings.theme = theme
  applyTheme()
  persist()
}

/**
 * @param {string} openingId
 * @returns {boolean}
 */
export function isOpeningDisabled(openingId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  return (raw.layoutConfig?.disabledOpenings ?? []).includes(openingId)
}

/**
 * @param {string} openingId
 * @param {boolean} disabled
 */
export function setOpeningDisabled(openingId, disabled) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const config = raw.layoutConfig ?? SAMPLE_508.layoutConfig
  if (!config) return
  const set = new Set(config.disabledOpenings ?? [])
  if (disabled) set.add(openingId)
  else set.delete(openingId)
  const next = { ...config, disabledOpenings: [...set] }
  applyLayoutConfig(next, {
    toastMsg: disabled ? '已隐藏门窗' : '已恢复门窗',
  })
}

/** @returns {string} */
export function exportLayoutJson() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const payload =
    raw.layoutMode === 'wallGraph' && raw.wallGraph
      ? {
          schema: 'homeos-layout-v2',
          exportedAt: new Date().toISOString(),
          projectId: raw.meta.id,
          layoutMode: 'wallGraph',
          wallGraph: raw.wallGraph,
          graphOpenings: raw.graphOpenings ?? [],
          layoutConfig: raw.layoutConfig,
        }
      : {
          schema: 'homeos-layout-v1',
          exportedAt: new Date().toISOString(),
          projectId: raw.meta.id,
          layoutMode: 'parametric508',
          layoutConfig: raw.layoutConfig,
        }
  return JSON.stringify(payload, null, 2)
}

/**
 * @param {string} raw
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function importLayoutJson(raw) {
  try {
    const data = JSON.parse(raw)
    if (data.layoutMode === 'wallGraph' && data.wallGraph?.vertices) {
      layoutUndoStack = []
      layoutRedoStack = []
      graphUndoStack = []
      graphRedoStack = []
      persistUndoStacks()
      persistGraphUndoStacks()
      const base = S.projects[S.activeProjectId] ?? SAMPLE_508
      const next = hydrateProject({
        ...base,
        layoutMode: 'wallGraph',
        wallGraph: data.wallGraph,
        graphOpenings: data.graphOpenings ?? [],
        layoutConfig: data.layoutConfig ?? base.layoutConfig,
      })
      setActiveProject(next)
      toast('墙图布局已导入')
      return { ok: true }
    }
    const patch = data.layoutConfig ?? data
    if (!patch?.rooms || !patch.leftCol) {
      return { ok: false, error: '不是有效的 layoutConfig JSON' }
    }
    const merged = merge508Config(default508Config(), patch)
    const issues = validate508Config(merged)
    if (issues.length) return { ok: false, error: issues[0] }
    layoutUndoStack = []
    layoutRedoStack = []
    persistUndoStacks()
    const base = S.projects[S.activeProjectId] ?? SAMPLE_508
    const next = hydrateProject({
      ...base,
      layoutMode: 'parametric508',
      wallGraph: undefined,
      layoutConfig: merged,
    })
    setActiveProject(next)
    toast('户型布局已导入')
    return { ok: true }
  } catch {
    return { ok: false, error: 'JSON 解析失败' }
  }
}

export { deserializeProject }
