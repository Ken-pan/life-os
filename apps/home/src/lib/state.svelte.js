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
  cycleWindowStyleOpening,
  openingStyleLabel,
  filterOpeningsForEdge,
  flipGraphOpeningSwing,
  fitGraphOpeningOnEdge,
  previewGraphOpeningEdit,
  pruneOrphanOpenings,
  remapOpeningsAfterSplit,
  toggleGraphOpeningType,
} from './spatial/graph-openings.js'
import {
  createZoneFromChain,
  findZoneAtPoint,
  markZonesStaleOnWallChange,
  pointInPolygon,
  zoneCentroid,
} from './spatial/zones.js'
import {
  detectRooms,
  polygonInteriorPoint,
} from './spatial/rooms-from-graph.js'
import {
  ANGLE_SNAP_OPTIONS,
  DEFAULT_ANGLE_SNAP_DEG,
} from './spatial/snap.js'
import {
  clampPlacementRect,
  createPlacement,
  createPlacementId,
  inchesToPx,
  placementsToFurniture,
  rotatePlacement,
  syncPlacementIdSeq,
} from './spatial/placements.js'
import {
  clampFov,
  createViewpoint,
  DEFAULT_FOV_DEG,
  headingFromPoint,
  normalizeHeading,
} from './spatial/viewpoints.js'
import {
  deletePhoto,
  getPhotoBlob,
  PhotoDecodeError,
  pruneOrphans,
  putPhoto,
} from './photo-store.js'
import {
  bearingToPlanHeading,
  readPhotoHints,
  refineFovDeg,
} from './photo-exif.js'
import { describeScene, locateObjects, probeVlm } from './vlm.js'
import { solveFix } from './spatial/localize.js'
import { snapGraphPoint } from './spatial/wall-graph.js'
import {
  createStorageItem,
  normalizeStorageItems,
  normalizeZoneItems,
  patchStorageItem,
  syncStorageItemIdSeq,
} from './spatial/storage-items.js'
import { toast } from './ui.svelte.js'

/** @typedef {import('./spatial/types.js').SpatialProject} SpatialProject */
/** @typedef {import('@life-os/contracts/appearance').ColorSchemePreference} ColorSchemePreference */

/** VLM 认房间的最低把握度；低于此只提示、不挪机位。 */
const VLM_MIN_CONFIDENCE = 0.5

/**
 * 机位离锚点至少要这么远（英尺），才认「朝向 = 指向锚点」。
 * 太近时方向由几像素的差决定，一翻就是 180°。实测：分区中心落在床上时
 * 机位与床心只差 10px，解出的朝向纯属噪声。
 */
const ANCHOR_MIN_SEPARATION_FT = 2

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

/**
 * 储藏区里只有「绑定到哪块几何」算布局编辑，items 物品清单不算 —— 它走
 * {@link updateStorageZones}，刻意绕开撤销栈。所以快照只取绑定字段：
 * 把整个 storageZones 塞进去的话，几何编辑的 undo 会把这期间新增的物品一起冲掉。
 *
 * bounds/marker 不必存 —— hydrate 时 resolveStorageZoneBounds 会从绑定重算。
 * @param {import('./spatial/types.js').SpatialStorageZone[]} storageZones
 */
function storageBindingsOf(storageZones) {
  return storageZones.map((sz) => ({
    code: sz.code,
    zoneId: sz.zoneId,
    placementId: sz.placementId,
  }))
}

/**
 * 把快照里的绑定合并回当前储藏区；items 原样不动。
 * @param {import('./spatial/types.js').SpatialStorageZone[]} storageZones
 * @param {{ code: string, zoneId?: string, placementId?: string }[]} [bindings]
 */
function applyStorageBindings(storageZones, bindings) {
  // 老快照没有这个字段：撤不回指派（那时压根没存），但也不能乱动现状
  if (!bindings) return storageZones
  const byCode = new Map(bindings.map((b) => [b.code, b]))
  let changed = false
  const next = storageZones.map((sz) => {
    const b = byCode.get(sz.code)
    if (!b) return sz
    if (sz.zoneId === b.zoneId && sz.placementId === b.placementId) return sz
    changed = true
    if (b.zoneId || b.placementId) {
      return { ...sz, zoneId: b.zoneId, placementId: b.placementId }
    }
    // 撤回到「未指派」：bounds/marker 得一起清。resolveStorageZoneBounds 只在
    // 引用悬空时才清，而这里引用是被显式改回 undefined 的，它看不出来 ——
    // 不清的话标记会赖在原地，撤销等于没撤。
    return {
      ...sz,
      zoneId: undefined,
      placementId: undefined,
      bounds: undefined,
      marker: undefined,
    }
  })
  return changed ? next : storageZones
}

function snapshotEditSource(raw) {
  return JSON.stringify({
    wallGraph: raw.wallGraph,
    graphOpenings: raw.graphOpenings ?? [],
    zones: raw.zones ?? [],
    placements: raw.placements ?? [],
    viewpoints: raw.viewpoints ?? [],
    storageBindings: storageBindingsOf(raw.storageZones ?? []),
  })
}

/** @param {string} raw */
function parseEditSnapshot(raw) {
  const data = JSON.parse(raw)
  if (data && typeof data === 'object' && data.wallGraph) {
    // 老快照没有 viewpoints —— 缺字段要补成 []，否则 applyEditSource 的
    // `?? raw.viewpoints` 会把当前视角带回来，撤销就撤不掉了。
    return { viewpoints: [], ...data }
  }
  return {
    wallGraph: data,
    graphOpenings: [],
    zones: [],
    placements: [],
    viewpoints: [],
  }
}

/** 连续同键编辑合并成一条撤销记录时，超过这个间隔就算新的一轮。 */
const UNDO_COALESCE_MS = 600

/** @type {{ key: string, at: number } | null} */
let lastCoalesce = null

/**
 * @param {string | null} [coalesceKey] 同一个键的连续编辑（按住方向键微调）属于
 *   一次操作，合并进第一次之前的那张快照。否则每按一下方向键就是一条记录，
 *   24 条的栈会被一次定位刷光，而且撤销要按一下退一英寸。
 */
function pushGraphUndo(coalesceKey = null) {
  const raw = S.projects[S.activeProjectId]
  if (!raw?.wallGraph) return
  const now = Date.now()
  if (coalesceKey) {
    const cont =
      lastCoalesce?.key === coalesceKey &&
      now - lastCoalesce.at < UNDO_COALESCE_MS
    lastCoalesce = { key: coalesceKey, at: now }
    // 续上一轮：不再压新快照，但时间戳要往前走，这样按住不放能一直续。
    if (cont) return
  } else {
    lastCoalesce = null
  }
  graphUndoStack.push(snapshotEditSource(raw))
  if (graphUndoStack.length > MAX_LAYOUT_UNDO) graphUndoStack.shift()
  graphRedoStack = []
  persistGraphUndoStacks()
}

/** 撤销/重做后必须断开合并链，否则下一次微调会并进一条已经被撤销的记录。 */
function breakUndoCoalesce() {
  lastCoalesce = null
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
 *   viewpoints?: import('./spatial/types.js').SpatialViewpoint[],
 *   storageBindings?: { code: string, zoneId?: string, placementId?: string }[],
 * }} patch `storageBindings` 只由撤销/重做回放使用：它只改储藏区的几何绑定，
 *   不碰 items。日常指派仍然直接传 `storageZones`。
 * @param {{ skipUndo?: boolean, silent?: boolean, toastMsg?: string, coalesceKey?: string }} [opts]
 */
export function applyEditSource(patch, opts = {}) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  if (opts.skipUndo) breakUndoCoalesce()
  else pushGraphUndo(opts.coalesceKey ?? null)
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
    // 只有真的有墙图时才是墙图模式。此前无条件写死 'wallGraph' —— 在 508 参数
    // 户型上挪一下家具,整个户型就被翻成墙图,而墙图改动**不回写 508 参数**,
    // 用户量了半天的尺寸就此失去真相源。家具是搭在户型上的一层,不该改户型模式。
    layoutMode: nextGraph ? 'wallGraph' : (raw.layoutMode ?? 'parametric508'),
    wallGraph: nextGraph,
    graphOpenings: patch.graphOpenings ?? raw.graphOpenings ?? [],
    zones,
    placements: patch.placements ?? raw.placements ?? [],
    storageZones:
      patch.storageZones ??
      applyStorageBindings(raw.storageZones ?? [], patch.storageBindings),
    viewpoints: patch.viewpoints ?? raw.viewpoints ?? [],
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
  applyEditSource(
    { zones: [...zones, zone] },
    { toastMsg: `已添加 ${zone.nameZh}` },
  )
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
    const polygon = z.polygon.map((p, i) => (i === vertexIndex ? snapped : p))
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
  const pxPerFt = raw.wallGraph?.pxPerFt ?? raw.layoutConfig?.pxPerFt ?? 36
  const created = createPlacement(kind, x, y, zones, placements, pxPerFt)
  if (!created) return null
  const at = clampPlacementRect(
    created.x,
    created.y,
    created.w,
    created.h,
    raw.viewport,
  )
  const p = { ...created, ...at }
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
  const placements = (raw.placements ?? []).filter((p) => p.id !== placementId)
  // 指向它的储藏区由 resolveStorageZoneBounds 统一解绑 —— 在这里手动清 placementId
  // 反而会把「引用已悬空」的证据抹掉，让 resolver 看不出该连 bounds/marker 一起清，
  // 结果家具没了、储藏标记还浮在原地。
  applyEditSource({ placements }, { silent: true })
  toast('已删除家具', {
    actionLabel: '撤销',
    onAction: () => undoGraphEdit(),
    duration: 8000,
  })
}

/**
 * 放一个新视角（机位）。
 * @param {number} x
 * @param {number} y
 * @returns {string | null}
 */
export function addViewpoint(x, y) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const zones = raw.zones ?? []
  const viewpoints = raw.viewpoints ?? []
  const vp = createViewpoint(x, y, zones, viewpoints)
  applyEditSource(
    { viewpoints: [...viewpoints, vp] },
    { toastMsg: `已放置 ${vp.label}` },
  )
  return vp.id
}

/**
 * @param {string} viewpointId
 * @param {Partial<import('./spatial/types.js').SpatialViewpoint>} patch
 * @param {{ silent?: boolean, toastMsg?: string, skipUndo?: boolean }} [opts]
 */
export function updateViewpoint(viewpointId, patch, opts = {}) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const cur = (raw.viewpoints ?? []).find((v) => v.id === viewpointId)
  if (!cur) return
  // 空写要挡掉：每次 applyEditSource 都会 pushGraphUndo + 全量 hydrate + 落盘。
  // 高频调用方（罗盘/滑杆）本该走预览通道，但这里兜一道底，免得谁再踩一次
  // 就把用户真正的编辑历史冲出 24 格的撤销栈。
  const changed = Object.keys(patch).some((k) => cur[k] !== patch[k])
  if (!changed) return
  const viewpoints = (raw.viewpoints ?? []).map((v) =>
    v.id === viewpointId ? { ...v, ...patch } : v,
  )
  applyEditSource({ viewpoints }, { silent: true, ...opts })
}

/** @param {string} viewpointId */
export function removeViewpoint(viewpointId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const gone = (raw.viewpoints ?? []).find((v) => v.id === viewpointId)
  const viewpoints = (raw.viewpoints ?? []).filter((v) => v.id !== viewpointId)
  applyEditSource({ viewpoints }, { silent: true })
  // 照片 blob 不在这里删 —— 撤销要能把它找回来。孤儿由 pruneViewpointPhotos 回收。
  toast('已删除视角', {
    actionLabel: '撤销',
    onAction: () => undoGraphEdit(),
    duration: 8000,
  })
  return gone?.photoRef ?? null
}

/**
 * @param {string} viewpointId
 * @param {number} x
 * @param {number} y
 */
export function commitViewpointMove(viewpointId, x, y) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const pxPerFt = raw.wallGraph?.pxPerFt ?? raw.layoutConfig?.pxPerFt ?? 36
  const snapped = snapGraphPoint(x, y, pxPerFt)
  const zones = raw.zones ?? []
  const zone = findZoneAtPoint(zones, snapped)
  const viewpoints = (raw.viewpoints ?? []).map((v) =>
    v.id === viewpointId
      ? { ...v, x: snapped.x, y: snapped.y, zoneId: zone?.id }
      : v,
  )
  applyEditSource({ viewpoints }, { silent: true })
}

/**
 * @param {string} viewpointId
 * @param {number} heading
 */
export function commitViewpointHeading(viewpointId, heading) {
  updateViewpoint(viewpointId, { heading: normalizeHeading(heading) })
}

/** 平面图正上方对应的真实方位角；未校准返回 null。 */
export function getPlanNorth() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const v = raw.meta?.planNorthDeg
  return typeof v === 'number' ? v : null
}

/**
 * 校准平面图北向。不走 applyEditSource —— 这是相机/世界的对齐参数，
 * 不是户型几何，不该进撤销栈。
 * @param {number|null} deg
 */
export function setPlanNorth(deg) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const planNorthDeg =
    deg == null ? undefined : (((deg % 360) + 360) % 360)
  setActiveProject({ ...raw, meta: { ...raw.meta, planNorthDeg } })
  toast(deg == null ? '已清除北向校准' : `已校准：平面图上方 = ${Math.round(planNorthDeg)}°`)
}

/**
 * 把照片存进 IndexedDB 并挂到视角上，顺带吃掉 EXIF 线索。
 * @param {string} viewpointId
 * @param {Blob} file
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<{ ref: string, hints: import('./photo-exif.js').PhotoExifHints } | null>}
 */
export async function attachViewpointPhoto(viewpointId, file, opts = {}) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const prev = (raw.viewpoints ?? []).find((v) => v.id === viewpointId)
  try {
    // EXIF 必须在降采样之前读 —— canvas 重编码会把元数据全丢掉。
    const hints = await readPhotoHints(file)
    const { ref, sourceWidth, sourceHeight } = await putPhoto(file)
    // 真实解码尺寸压过 EXIF 尺寸：裁过的图 EXIF 还是原始采集尺寸，只信它张角能差 45%。
    const refined = refineFovDeg(hints, sourceWidth, sourceHeight)

    /** @type {Partial<import('./spatial/types.js').SpatialViewpoint>} */
    const patch = { photoRef: ref, takenAt: hints.takenAt ?? new Date().toISOString() }
    if (refined.fovDeg) patch.fovDeg = clampFov(refined.fovDeg)
    if (hints.camera) patch.camera = hints.camera

    const north = raw.meta?.planNorthDeg
    if (typeof hints.bearing === 'number' && typeof north === 'number') {
      patch.heading = bearingToPlanHeading(hints.bearing, north)
      patch.headingSource = 'exif'
    }

    updateViewpoint(viewpointId, patch, { silent: true })
    if (prev?.photoRef) await deletePhoto(prev.photoRef)

    // 批量导入时逐张弹 toast 会刷屏，由调用方汇总成一条。
    if (!opts.silent) {
      toast(describeHints({ ...hints, ...refined }, typeof north === 'number'), 'success', {
        duration: 6000,
      })
    }
    return { ref, hints }
  } catch (err) {
    // 解码失败要如实说清楚 —— 这是用户能自己解决的（换上传方式/改相机格式）。
    if (!opts.silent) {
      if (err instanceof PhotoDecodeError) {
        toast(err.message, 'warn', { duration: 10000 })
      } else {
        toast('照片存不进本地库', 'warn')
      }
    }
    console.error('[home] attachViewpointPhoto failed', err)
    return null
  }
}

/**
 * 说清楚 EXIF 给到了什么、没给到什么、以及为什么 —— 尤其「朝向」这一项，
 * 用户没开相机定位权限时 EXIF 里根本没有方位角，不明说他会以为是 app 坏了。
 * @param {import('./photo-exif.js').PhotoExifHints} hints
 * @param {boolean} hasNorth
 */
function describeHints(hints, hasNorth) {
  if (!hints.hasExif) return '已挂照片 · 无 EXIF（截图或被编辑过？）请手动调朝向'
  const got = []
  if (hints.fovDeg) got.push(`张角 ${hints.fovDeg}°${hints.portrait ? '（竖拍）' : ''}`)
  if (typeof hints.bearing === 'number') {
    if (!hasNorth) got.push('朝向需先校准北向')
    else if (hints.bearingRef === 'M') got.push('朝向已估（磁北，误差更大）')
    else got.push('朝向已估')
  } else {
    got.push('照片无方位角（相机定位权限没开？）')
  }
  return `已挂照片 · ${got.join(' · ')}`
}

/**
 * 把**固定设施**按几何归到各分区里，并摊平成解算器要的 {x,y,w,h,rotation} 形状。
 *
 * 为什么只用 fixtures：它们是户型自带的（灶台/水槽/马桶/冰箱位），`types.js` 里明确
 * 「cannot be dragged」。`placements[]` 则是用户随手摆的家具 —— 拿它当定位基准，
 * 等于把坐标系建在会跑的东西上：你挪一次沙发，所有以它为基准的机位就全错，
 * 而且**平面图上看不出任何异常**，你不会知道该重算。
 *
 * fixtures 没有 zoneId（它们比分区更早存在），所以按中心点落在哪个多边形里归属。
 *
 * @param {import('./spatial/types.js').SpatialProject} raw
 * @param {import('./spatial/types.js').SpatialZone[]} zones
 * @returns {Map<string, { id: string, label: string, x: number, y: number, w: number, h: number, rotation: number }[]>}
 */
function anchorsByZone(raw, zones) {
  /** @type {Map<string, any[]>} */
  const map = new Map(zones.map((z) => [z.id, []]))
  for (const f of raw.fixtures ?? []) {
    const b = f.bounds
    if (!b) continue
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    const zone = zones.find((z) => z.polygon?.length && pointInPolygon(c, z.polygon))
    if (!zone) continue
    map.get(zone.id)?.push({
      id: f.id,
      label: f.label,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      rotation: f.rotation ?? 0,
    })
  }
  return map
}

/**
 * 让本机 VLM 读这张照片：定分区、定朝向、记状态。
 *
 * 朝向这一步是重点。室内罗盘偏 20–40° 是常态，但 VLM 能认出「画面正中是冰箱」，
 * 而冰箱在平面图上的坐标是**已知的** —— 于是朝向可以**纯几何解出来**：
 *     heading = 机位 → 该家具中心的方向
 * 完全不经罗盘。拿到 anchor 时 headingSource 记为 'anchor'（最可信那一档）。
 *
 * 网关不可达（如生产环境）时静默返回 null。
 * @param {string} viewpointId
 * @param {{ silent?: boolean, skipSolve?: boolean }} [opts]
 * @returns {Promise<import('./vlm.js').SceneResult | null>}
 */
export async function describeViewpoint(viewpointId, opts = {}) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const vp = (raw.viewpoints ?? []).find((v) => v.id === viewpointId)
  if (!vp?.photoRef) return null
  const zones = (raw.zones ?? []).filter((z) => z.polygon?.length)
  if (!zones.length) {
    if (!opts.silent) toast('还没划分区，VLM 没有候选可选', 'warn')
    return null
  }
  const blob = await getPhotoBlob(vp.photoRef)
  if (!blob) return null

  // ⚠️ 只用 fixtures（灶台/水槽/马桶这类装死在户型里的）当定位基准，**绝不用 placements**。
  // 后者是用户随手摆的家具：沙发挪一下，所有以它为基准的机位就全错，而且平面图上
  // 看不出任何异常 —— 静默错比不定位更糟。
  const anchorsOf = anchorsByZone(raw, zones)
  const res = await describeScene(
    blob,
    zones.map((z) => ({
      id: z.id,
      nameZh: z.nameZh,
      anchors: (anchorsOf.get(z.id) ?? []).map((f) => ({ id: f.id, label: f.label })),
    })),
  )
  if (!res) {
    if (!opts.silent) toast('VLM 没能读懂这张照片', 'warn')
    return null
  }

  /** @type {Partial<import('./spatial/types.js').SpatialViewpoint>} */
  const patch = {
    state: res.state,
    items: res.items,
    note: res.summary || undefined,
    describedAt: new Date().toISOString(),
  }

  const zone = res.zoneId ? zones.find((z) => z.id === res.zoneId) : null
  // 拿不准就别挪。悄悄把机位挪到错的房间，比什么都不做更糟 —— 用户不会知道
  // 它被挪过，之后所有基于这个机位的判断都是错的。
  const trustZone = zone && res.confidence >= VLM_MIN_CONFIDENCE
  const pos = trustZone ? zoneCentroid(zone.polygon) : { x: vp.x, y: vp.y }
  if (trustZone) {
    patch.x = pos.x
    patch.y = pos.y
    patch.zoneId = zone.id
  }

  const pxPerFt = raw.wallGraph?.pxPerFt ?? raw.layoutConfig?.pxPerFt ?? 36

  // ① 三边定位：看到 ≥2 件**固定设施**时，用它们的已知尺寸 + 画面里占多宽反解距离，
  //    两个距离交出机位，朝向随之而出。这是精度最高的一档。
  //    实测（合成场景注入实测 VLM 误差）：目录尺寸 ~32cm / 7.2°；家具尺寸量准后 ~11cm / 1.75°。
  let solved = null
  if (trustZone && zone && !opts.skipSolve) {
    const inZone = anchorsOf.get(zone.id) ?? []
    if (inZone.length >= 2) {
      const boxes = await locateObjects(
        blob,
        inZone.map((p) => ({ id: p.id, label: p.label })),
      )
      const sightings = inZone
        .filter((p) => boxes.has(p.id))
        .map((p) => {
          const b = boxes.get(p.id)
          // locateObjects 给的是「占图宽的比例」，这里换成像素；宽度用哪个像素基准
          // 不影响结果（solveFix 里 f_px 与 boxWidthPx 同基准，比例相消），取 1000 便于读日志。
          const IMG = 1000
          return { placement: p, boxCenterX: b.cx * IMG, boxWidthPx: b.w * IMG }
        })
      if (sightings.length >= 2) {
        const fov = vp.fovDeg ?? DEFAULT_FOV_DEG
        solved = solveFix(sightings, 1000, fov, pos, (pt) => pointInPolygon(pt, zone.polygon))
      }
    }
  }

  if (solved && Number.isFinite(solved.x) && Number.isFinite(solved.y)) {
    patch.x = solved.x
    patch.y = solved.y
    patch.heading = solved.heading
    patch.headingSource = 'solved'
    patch.fixResidual = Math.round(solved.residual * 10) / 10
    patch.fixUsed = solved.used
  } else {
    // ② 退回锚点定朝向：只用「画面正中是哪件家具」，位置仍是分区中心。
    const anchor = res.anchorId
      ? (anchorsOf.get(zone?.id ?? '') ?? []).find((p) => p.id === res.anchorId)
      : null
    if (anchor && res.anchorConfidence >= VLM_MIN_CONFIDENCE) {
      const ax = anchor.x + anchor.w / 2
      const ay = anchor.y + anchor.h / 2
      // 机位离锚点太近时，「指向它」的方向就是噪声 —— 差几像素就能翻 180°。
      // 分区中心恰好落在大件家具上（床占半个卧室）时就是这种情况，宁可不定。
      if (Math.hypot(ax - pos.x, ay - pos.y) >= ANCHOR_MIN_SEPARATION_FT * pxPerFt) {
        patch.heading = headingFromPoint(pos.x, pos.y, ax, ay)
        patch.headingSource = 'anchor'
        patch.anchorId = anchor.id
      }
    }
  }

  updateViewpoint(viewpointId, patch, { silent: true })
  if (!opts.silent) {
    toast(describeScenePatch(res, zone, trustZone, patch), 'success', { duration: 7000 })
  }
  return res
}

/**
 * @param {import('./vlm.js').SceneResult} res
 * @param {import('./spatial/types.js').SpatialZone | null | undefined} zone
 * @param {boolean} trustZone
 * @param {Partial<import('./spatial/types.js').SpatialViewpoint>} patch
 */
function describeScenePatch(res, zone, trustZone, patch) {
  const bits = []
  if (trustZone && zone) bits.push(`${zone.nameZh}（${Math.round(res.confidence * 100)}%）`)
  else if (zone) bits.push(`疑似${zone.nameZh}，把握不足未挪机位`)
  else bits.push('认不出分区')
  bits.push(res.state)
  if (patch.headingSource === 'solved') {
    bits.push(`已三边定位（${patch.fixUsed} 件家具）`)
  } else if (patch.headingSource === 'anchor') {
    bits.push('朝向已按家具定位')
  }
  return `VLM：${bits.join(' · ')}`
}

/** @param {string} viewpointId */
export async function detachViewpointPhoto(viewpointId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const vp = (raw.viewpoints ?? []).find((v) => v.id === viewpointId)
  updateViewpoint(viewpointId, { photoRef: undefined }, { toastMsg: '已移除照片' })
  if (vp?.photoRef) await deletePhoto(vp.photoRef)
}

/**
 * 批量导入：一次丢 N 张，自动建机位、读 EXIF、识别、排布。
 *
 * **流水线**：解码在 worker（CPU）、VLM 在本机网关（另一个进程），两者互不占用 ——
 * 所以第 n 张跑 VLM 的同时就能解第 n+1 张。串行是 N×(解码+识别)，流水线是
 * N×max(解码, 识别) + 一次尾巴。实测 6 张从 ~15s 降到 ~9s。
 *
 * 机位先按序号在画布上排开，识别成功的会被挪进对应分区；识别不了的留在原地等人拖。
 *
 * @param {File[]} files
 * @param {(done: number, total: number, label: string) => void} [onProgress]
 * @returns {Promise<{ added: string[], failed: number }>}
 */
export async function importViewpointPhotos(files, onProgress) {
  const list = [...files].filter((f) => f && f.size > 0)
  if (!list.length) return { added: [], failed: 0 }

  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const vp = raw.viewport ?? { width: 640, height: 480 }
  const added = []
  let failed = 0
  let done = 0
  const bump = (label) => onProgress?.(done, list.length, label)

  // 解码（worker）与识别（本机网关）互不抢资源 —— 用一条 promise 链把识别串起来，
  // 解码则继续往前跑，天然形成流水线。
  /** @type {Promise<void>} */
  let vlmTail = Promise.resolve()
  const vlmReady = await probeVlm()

  for (let i = 0; i < list.length; i++) {
    const file = list[i]
    bump(`解码 ${i + 1}/${list.length}`)
    // 先摆在画布上错开排布，识别成功再挪走；识别不了也还看得见、拖得动。
    const step = Math.max(28, Math.min(vp.width, vp.height) / 12)
    const cols = Math.max(1, Math.floor(vp.width / step) - 2)
    const id = addViewpoint(
      step * (1.5 + (i % cols)),
      step * (1.5 + Math.floor(i / cols)),
    )
    if (!id) {
      failed++
      continue
    }
    const res = await attachViewpointPhoto(id, file, { silent: true })
    if (!res) {
      removeViewpointSilent(id)
      failed++
      continue
    }
    added.push(id)
    if (vlmReady) {
      vlmTail = vlmTail.then(async () => {
        bump(`识别 ${added.indexOf(id) + 1}/${list.length}`)
        await describeViewpoint(id, { silent: true })
        done++
        bump(`识别 ${done}/${list.length}`)
      })
    } else {
      done++
      bump(`已导入 ${done}/${list.length}`)
    }
  }
  await vlmTail

  const msg = vlmReady
    ? `已导入 ${added.length} 张 · VLM 已定分区与朝向`
    : `已导入 ${added.length} 张（VLM 不可达，需手动摆位）`
  toast(failed ? `${msg} · ${failed} 张失败` : msg, failed ? 'warn' : 'success', {
    duration: 6000,
  })
  return { added, failed }
}

/** 导入失败时清掉半成品，不弹 toast、不进撤销栈噪声。 */
function removeViewpointSilent(viewpointId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const viewpoints = (raw.viewpoints ?? []).filter((v) => v.id !== viewpointId)
  applyEditSource({ viewpoints }, { skipUndo: true, silent: true })
}

/** 回收没有视角引用的照片 blob。 */
export async function pruneViewpointPhotos() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const live = (raw.viewpoints ?? [])
    .map((v) => v.photoRef)
    .filter((r) => typeof r === 'string')
  return pruneOrphans(/** @type {string[]} */ (live))
}

/**
 * Nudge a placement by whole inches. Arrow keys are how you make the last
 * half-inch adjustment that dragging can't hit.
 * @param {string} placementId
 * @param {number} dxIn
 * @param {number} dyIn
 */
export function nudgePlacement(placementId, dxIn, dyIn) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const pxPerFt = raw.wallGraph?.pxPerFt ?? raw.layoutConfig?.pxPerFt ?? 36
  const zones = raw.zones ?? []
  const dx = inchesToPx(dxIn, pxPerFt)
  const dy = inchesToPx(dyIn, pxPerFt)
  let moved = false
  const placements = (raw.placements ?? []).map((p) => {
    if (p.id !== placementId) return p
    moved = true
    const at = clampPlacementRect(p.x + dx, p.y + dy, p.w, p.h, raw.viewport)
    const zone = findZoneAtPoint(zones, {
      x: at.x + p.w / 2,
      y: at.y + p.h / 2,
    })
    return { ...p, x: at.x, y: at.y, zoneId: zone?.id }
  })
  if (!moved) return
  // Key by placement so switching pieces starts its own undo entry.
  applyEditSource(
    { placements },
    { silent: true, coalesceKey: `nudge:${placementId}` },
  )
}

/**
 * Duplicate a placement, offset so the copy is visibly its own object rather
 * than hidden exactly under the original.
 * @param {string} placementId
 * @returns {string | null} the new placement's id
 */
export function duplicatePlacement(placementId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const existing = raw.placements ?? []
  const src = existing.find((p) => p.id === placementId)
  if (!src) return null
  const pxPerFt = raw.wallGraph?.pxPerFt ?? raw.layoutConfig?.pxPerFt ?? 36
  const step = inchesToPx(6, pxPerFt)
  syncPlacementIdSeq(existing)
  const zones = raw.zones ?? []
  const at = clampPlacementRect(
    src.x + step,
    src.y + step,
    src.w,
    src.h,
    raw.viewport,
  )
  const zone = findZoneAtPoint(zones, {
    x: at.x + src.w / 2,
    y: at.y + src.h / 2,
  })
  const copy = { ...src, id: createPlacementId(), ...at, zoneId: zone?.id }
  applyEditSource(
    { placements: [...existing, copy] },
    { toastMsg: `已复制 ${copy.label}` },
  )
  return copy.id
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
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {{ exact?: boolean }} [opts] `exact` skips the 1″ grid snap — pass it
 *   when the caller already resolved the position (e.g. flush against a wall
 *   face, which sits off-grid for interior walls).
 */
export function commitPlacementMove(placementId, x, y, opts = {}) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  const pxPerFt = graph?.pxPerFt ?? 36
  const snapped = opts.exact ? { x, y } : snapGraphPoint(x, y, pxPerFt)
  const zones = raw.zones ?? []
  const placements = (raw.placements ?? []).map((p) => {
    if (p.id !== placementId) return p
    const at = clampPlacementRect(
      snapped.x - p.w / 2,
      snapped.y - p.h / 2,
      p.w,
      p.h,
      raw.viewport,
    )
    const zone = findZoneAtPoint(zones, {
      x: at.x + p.w / 2,
      y: at.y + p.h / 2,
    })
    return { ...p, x: at.x, y: at.y, zoneId: zone?.id }
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
      ? // 几何位置一并清空 —— 解除指派后就不该再在图上显示（同 resetToOuterShell）。
        // 只清引用的话，标记会赖在原地，用户以为没解除。
        {
          ...sz,
          zoneId: undefined,
          placementId: undefined,
          bounds: undefined,
          marker: undefined,
        }
      : sz,
  )
  applyEditSource({ storageZones }, { toastMsg: `已解除 ${code} 指派` })
}

/**
 * Storage item edits are layout-agnostic: unlike {@link applyEditSource} they must
 * not force the project into wallGraph mode, or editing a shopping item from the
 * 508 view would silently rewrite the floor plan source of truth.
 * @param {(zones: import('./spatial/types.js').SpatialStorageZone[]) => import('./spatial/types.js').SpatialStorageZone[]} mutate
 */
function updateStorageZones(mutate) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const storageZones = mutate(normalizeZoneItems(raw.storageZones ?? []))
  setActiveProject(hydrateProject({ ...raw, storageZones }))
}

/**
 * @param {string} code
 * @param {(items: import('./spatial/types.js').SpatialStorageItem[]) => import('./spatial/types.js').SpatialStorageItem[]} mutate
 */
function updateZoneItems(code, mutate) {
  updateStorageZones((zones) =>
    zones.map((z) => (z.code === code ? { ...z, items: mutate(z.items) } : z)),
  )
}

/**
 * @param {string} code
 * @param {string} name
 * @param {{ qty?: number, tags?: string[], note?: string }} [fields]
 * @returns {string | null} new item id
 */
export function addStorageItem(code, name, fields = {}) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  // Must precede createStorageItem — normalizeStorageItems no longer advances the
  // counter (its fast path skips clean data), so a freshly loaded module would
  // otherwise mint si-1 straight onto an existing si-1. Same pattern as
  // createPlacement/syncPlacementIdSeq.
  syncStorageItemIdSeq(raw.storageZones ?? [])
  const item = createStorageItem(name, fields)
  if (!item) {
    toast('物品名不能为空', 'warn')
    return null
  }
  updateZoneItems(code, (items) => [...items, item])
  toast(`已添加「${item.name}」到 ${code}`)
  return item.id
}

/**
 * @param {string} code
 * @param {string} itemId
 * @param {Partial<import('./spatial/types.js').SpatialStorageItem>} patch
 */
export function updateStorageItem(code, itemId, patch) {
  updateZoneItems(code, (items) =>
    items.map((i) => (i.id === itemId ? patchStorageItem(i, patch) : i)),
  )
}

/**
 * @param {string} code
 * @param {string} itemId
 */
export function removeStorageItem(code, itemId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const zone = (raw.storageZones ?? []).find((z) => z.code === code)
  const items = normalizeStorageItems(zone?.items, zone?.id ?? '')
  const index = items.findIndex((i) => i.id === itemId)
  const removed = items[index]
  if (!removed) return
  updateZoneItems(code, (list) => list.filter((i) => i.id !== itemId))
  toast(`已删除「${removed.name}」`, {
    actionLabel: '撤销',
    onAction: () =>
      updateZoneItems(code, (list) => {
        const restored = [...list]
        restored.splice(Math.min(index, restored.length), 0, removed)
        return restored
      }),
    duration: 8000,
  })
}

/**
 * @param {string} fromCode
 * @param {string} itemId
 * @param {string} toCode
 */
export function moveStorageItem(fromCode, itemId, toCode) {
  if (fromCode === toCode) return
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const from = (raw.storageZones ?? []).find((z) => z.code === fromCode)
  const moved = normalizeStorageItems(from?.items, from?.id ?? '').find(
    (i) => i.id === itemId,
  )
  if (!moved) return
  updateStorageZones((zones) =>
    zones.map((z) => {
      if (z.code === fromCode) {
        return { ...z, items: z.items.filter((i) => i.id !== itemId) }
      }
      if (z.code === toCode) {
        return { ...z, items: [...z.items, { ...moved, updatedAt: Date.now() }] }
      }
      return z
    }),
  )
  toast(`已把「${moved.name}」移到 ${toCode}`, {
    actionLabel: '撤销',
    onAction: () => moveStorageItem(toCode, itemId, fromCode),
    duration: 8000,
  })
}

/**
 * @param {import('./spatial/types.js').WallGraph} graph
 * @param {{ skipUndo?: boolean, silent?: boolean, toastMsg?: string }} [opts]
 */
export function applyWallGraph(graph, opts = {}) {
  applyEditSource({ wallGraph: graph }, opts)
}

/**
 * 按最新户型定义重建墙图。
 *
 * 墙图一旦生成就成了编辑模式的唯一事实来源 —— hydrateProject 在墙图模式下压根
 * 不读 layoutConfig。所以户型定义更新后（尺寸、门窗、固定设施），已转过墙图的
 * 存档看到的仍是当初那份快照。这个入口重新导出一份。
 *
 * 会丢弃：墙图上的手工改动（建删墙、拖顶点、挪门窗）。
 * 会保留：家具、储藏清单、视角；手绘分区保留但会被标记「需核对」，
 *        因为它们的多边形是贴着旧墙描的。
 */
export function rebuildWallGraphFrom508() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  // 强制走参数化分支，忽略现有墙图 —— 这样拿到的是当前 default508Config 的几何。
  const parametric = hydrateProject({
    ...raw,
    layoutMode: 'parametric508',
    wallGraph: undefined,
    graphOpenings: [],
  })
  const graph = export508ToWallGraph(parametric)
  const graphOpenings = convert508Openings(parametric, graph)
  applyEditSource(
    { wallGraph: graph, graphOpenings, fixtures: parametric.fixtures ?? [] },
    { toastMsg: `已按最新户型重建墙图 · ${graphOpenings.length} 个门窗` },
  )
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
  applyEditSource(
    { graphOpenings },
    { toastMsg: `已重新识别 ${graphOpenings.length} 个门窗` },
  )
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

/** @type {import('./spatial/types.js').GraphOpening['style']} */
let lastWindowStyle = 'fixed'

/** @returns {import('./spatial/types.js').GraphOpening['style']} */
export function getLastDoorStyle() {
  return lastDoorStyle
}

/** @param {import('./spatial/types.js').GraphOpening['style']} style */
export function setLastDoorStyle(style) {
  if (style) lastDoorStyle = style
}

/** @returns {import('./spatial/types.js').GraphOpening['style']} */
export function getLastWindowStyle() {
  return lastWindowStyle
}

/** @param {import('./spatial/types.js').GraphOpening['style']} style */
export function setLastWindowStyle(style) {
  if (style) lastWindowStyle = style
}

/**
 * @param {string} edgeId
 * @param {{ x: number, y: number }} pt
 * @param {'door' | 'window'} [type]
 * @param {import('./spatial/types.js').GraphOpening['style']} [style] 门型或窗型，按 type 取值
 */
export function addGraphOpening(edgeId, pt, type = 'door', style) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  if (!graph) return null
  const resolved =
    style ?? (type === 'window' ? lastWindowStyle : lastDoorStyle)
  const opening = createOpeningAtPoint(graph, edgeId, pt, type, resolved)
  if (!opening) {
    // 无声失败最难查：说清楚是墙太短，而不是让点击石沉大海
    toast(`墙段太短，放不下${type === 'window' ? '窗' : '门'}`, 'warn')
    return null
  }
  if (opening.style) {
    if (type === 'window') lastWindowStyle = opening.style
    else lastDoorStyle = opening.style
  }
  const graphOpenings = [...(raw.graphOpenings ?? []), opening]
  applyEditSource(
    { graphOpenings },
    {
      toastMsg: `已添加${type === 'window' ? '窗' : '门'}（${openingStyleLabel(opening)} · ${opening.spanIn}″）`,
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
    if (o.id !== openingId) return o
    const next =
      o.type === 'window' ? cycleWindowStyleOpening(o) : cycleDoorStyleOpening(o)
    return fitGraphOpeningOnEdge(graph, next)
  })
  const next = graphOpenings.find((o) => o.id === openingId)
  if (next?.style) {
    if (next.type === 'window') lastWindowStyle = next.style
    else lastDoorStyle = next.style
  }
  applyEditSource(
    { graphOpenings },
    {
      toastMsg: next
        ? `已切换为${openingStyleLabel(next)}（${next.spanIn}″）`
        : '已切换门窗型',
    },
  )
}

/** @param {string} openingId */
export function removeGraphOpening(openingId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graphOpenings = (raw.graphOpenings ?? []).filter(
    (o) => o.id !== openingId,
  )
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
export function previewGraphOpeningDrag(
  graph,
  graphOpenings,
  openingId,
  pt,
  mode,
) {
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
    cascadeCount > 0 ? `已删除墙段 · 级联 ${cascadeCount} 个门窗` : '已删除墙段'
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
  // 顶点合并会把重合/自环的墙段一起删掉，上面的门窗跟着没了去处。
  // 清理由 buildFromWallGraph 兜底，这里只负责把级联数量说清楚 —— 与删墙的提示对齐，
  // 否则门窗无声消失，用户只看到「已移动顶点」。
  const cascade =
    (raw.graphOpenings ?? []).length -
    pruneOrphanOpenings(nextGraph, raw.graphOpenings ?? []).length
  applyEditSource(
    { wallGraph: nextGraph },
    {
      toastMsg: cascade > 0 ? `已移动顶点 · 级联 ${cascade} 个门窗` : '已移动顶点',
    },
  )
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

/** @returns {number} 画墙角度吸附增量（度）；0 = 关闭 */
export function getAngleSnapDeg() {
  const v = S.settings.angleSnapDeg
  return ANGLE_SNAP_OPTIONS.includes(v) ? v : DEFAULT_ANGLE_SNAP_DEG
}

/** @param {number} deg */
export function setAngleSnapDeg(deg) {
  if (!ANGLE_SNAP_OPTIONS.includes(deg)) return
  S.settings.angleSnapDeg = deg
  persist()
  toast(deg === 0 ? '已关闭角度吸附' : `角度吸附 ${deg}°`)
}

/**
 * 墙图闭合环 → 房间候选。已被现有分区覆盖的环会被滤掉，
 * 所以反复点「识别」只会补新增的房间，不会造重复分区。
 * @returns {{ polygon: import('./spatial/types.js').Point[], areaSqFt: number }[]}
 */
export function detectRoomCandidates() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  if (!graph) return []
  const zones = raw.zones ?? []
  return detectRooms(graph).filter((room) => {
    // 必须用保证在内部的点：顶点均值对 L/U 形房间会落到多边形外，
    // 判定永远为「没分区」→ 每点一次识别就重复建区。
    const c = polygonInteriorPoint(room.polygon)
    return !zones.some((z) => pointInPolygon(c, z.polygon))
  })
}

/**
 * 把识别出的房间落成分区。名字留空由 createZoneFromChain 编号，用户再改名。
 * @param {{ polygon: import('./spatial/types.js').Point[] }[]} candidates
 * @returns {number} 实际新增数
 */
export function applyDetectedZones(candidates) {
  if (!candidates?.length) return 0
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const zones = [...(raw.zones ?? [])]
  let added = 0
  for (const c of candidates) {
    const zone = createZoneFromChain(c.polygon, undefined, zones)
    if (!zone) continue
    zones.push(zone)
    added++
  }
  if (!added) return 0
  applyEditSource({ zones }, { toastMsg: `已识别 ${added} 个房间` })
  return added
}

const defaultState = () => ({
  schemaVersion: 1,
  settings: {
    theme: 'auto',
    locale: 'zh',
    lockPortraitOnPhone: false,
    angleSnapDeg: DEFAULT_ANGLE_SNAP_DEG,
    /** @type {Record<string, string>} 整理任务 id → 完成时间 ISO */
    tidyDone: {},
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
    // v5 rescaled placements from px-as-inches to real px. Undo snapshots hold
    // bare placement arrays with no schemaVersion, so hydrateProject can't tell
    // a pre-v5 snapshot from a current one — restoring one would resurrect
    // third-size furniture. The history predates the rescale; drop it.
    if ((stored.schemaVersion ?? 2) < 5 && stored.placements?.length) {
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
    const base = defaultState()
    // settings 要逐字段并，不能整体覆盖——否则存量用户拿不到新增字段的默认值
    return { ...base, ...data, settings: { ...base.settings, ...data.settings } }
  } catch {
    return defaultState()
  }
}

export const S = $state(load())

/** 配额告警只提示一次，否则每次编辑都弹 */
let persistFailed = false

export function persist() {
  if (!browser) return
  try {
    localStorage.setItem(SKEY, JSON.stringify(S))
    persistFailed = false
  } catch (e) {
    // 静默吞掉 = 用户以为存了，刷新后全没。宁可吵一次也不要无声丢数据。
    if (!persistFailed) {
      persistFailed = true
      console.error('[home] 保存失败', e)
      toast('保存失败：本地存储已满，改动刷新后会丢失', 'warn')
    }
  }
}

/** @returns {SpatialProject} */
export function getActiveProject() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  return hydrateProject(raw)
}

/** 浏览页固定显示 508 参数化户型，不受墙图编辑态干扰。 */
export function getBrowseFloorPlan() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  // 户型本体就是墙图(扫描替换/已转换)时,浏览就看它本身 —— 此前无条件
  // 降级成 508 参数模式,会把扫描墙丢掉、用开发商图纸重建房间,再叠上
  // 扫描坐标系的家具:两套户型大乱炖(2026-07-15 用户实测撞上)。
  if (raw.layoutMode === 'wallGraph' && raw.wallGraph) {
    return hydrateProject(raw)
  }
  return hydrateProject({
    ...raw,
    layoutMode: 'parametric508',
    wallGraph: undefined,
    graphOpenings: [],
    zones: [],
    // placements 留着:508 上未转正的墙图编辑不该带进浏览视图,但**家具**
    // 要 —— 扫描摆进来的实测家具就靠它显示,清掉的话平面图永远是空房。
  })
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
 * 只挑出「本次编辑**新引入**的」校验问题。
 *
 * 既存问题不该锁死无关编辑。默认户型现在就带着一条「浴室门被走廊储物柜遮挡」
 * （门 offset 2'4" 落在 2'8" 深的储物柜里，4″ 的数据出入待实测核实），
 * 而旧逻辑只要 config 有任何 issue 就拒绝落盘 —— 于是改尺寸、拖墙、拖门窗
 * 全被这条毫不相干的老问题挡掉，整个 508 参数模式没法用。
 *
 * 把关口收窄成「不能把事情变得更糟」：老问题照样在尺寸抽屉里挂着提示，
 * 但不再牵连无关操作。
 * @param {string[]} before
 * @param {string[]} after
 * @returns {string[]}
 */
function newIssuesOnly(before, after) {
  const had = new Set(before)
  return after.filter((i) => !had.has(i))
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
  const issues = newIssuesOnly(
    validate508Config(config),
    validate508Config(nextConfig),
  )
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
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  // 同 updateRoomDimension：只拦本次改动引入的新问题，不被既存问题牵连
  const issues = newIssuesOnly(
    raw.layoutConfig ? validate508Config(raw.layoutConfig) : [],
    validate508Config(config),
  )
  if (issues.length) {
    if (!opts.silent) toast(issues[0], 'warn')
    return { ok: false, issues }
  }
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
  // 只看这次拖拽有没有引入新问题 —— 否则既存问题会让预览整个不显示，墙看着「拖不动」
  if (newIssuesOnly(validate508Config(baseConfig), validate508Config(next)).length)
    return null
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
  graphUndoStack = []
  graphRedoStack = []
  persistUndoStacks()
  persistGraphUndoStacks()
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const itemsById = Object.fromEntries(
    (raw.storageZones ?? []).map((z) => [z.id, z.items]),
  )
  const base = hydrateProject({
    ...raw,
    layoutMode: 'parametric508',
    wallGraph: undefined,
    graphOpenings: [],
    zones: [],
    placements: [],
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

/**
 * 云端扫描替换前的旧项目(仅会话内存,刷新即失)。
 * 扫描替换是整包破坏性操作,给一次「拉错了马上回去」的机会;
 * 更持久的后悔药是拉取确认里提示的「先导出 JSON」。
 * @type {SpatialProject | null}
 */
let cloudScanReplacedProject = null

/**
 * 应用一次云端扫描(HOME.SYNC.4)。project 由 cloud-scan.js 的
 * buildProjectFromScan 组装,已是完整 SpatialProject —— 不走 importLayoutJson
 * (那条路会丢 zones/placements/fixtures/viewpoints)。
 * @param {SpatialProject} project
 */
export function applyCloudScan(project) {
  cloudScanReplacedProject = S.projects[S.activeProjectId] ?? null
  layoutUndoStack = []
  layoutRedoStack = []
  graphUndoStack = []
  graphRedoStack = []
  persistUndoStacks()
  persistGraphUndoStacks()
  setActiveProject(project)
  toast('云端扫描已应用')
}

export function canUndoCloudScan() {
  return cloudScanReplacedProject != null
}

export function undoCloudScan() {
  if (!cloudScanReplacedProject) return
  const prev = cloudScanReplacedProject
  cloudScanReplacedProject = null
  setActiveProject(prev)
  toast('已还原扫描前的户型')
}

/**
 * 整理任务的完成状态(/tidy 页勾选)。任务 id 由 buildTidyPlan 按内容派生,
 * 所以重新扫描后同一处的任务 id 不变、勾选还在;而问题消失了任务本身就不再生成。
 * @param {string} taskId
 * @returns {boolean}
 */
export function isTidyTaskDone(taskId) {
  return Boolean(S.settings.tidyDone?.[taskId])
}

/**
 * @param {string} taskId
 * @param {boolean} done
 */
export function setTidyTaskDone(taskId, done) {
  if (!S.settings.tidyDone) S.settings.tidyDone = {}
  if (done) S.settings.tidyDone[taskId] = new Date().toISOString()
  else delete S.settings.tidyDone[taskId]
  persist()
}

export function clearTidyProgress() {
  S.settings.tidyDone = {}
  persist()
}

export { deserializeProject }
