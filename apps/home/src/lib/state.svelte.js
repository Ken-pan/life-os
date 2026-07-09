import { browser } from '$app/environment'
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme,
} from '@life-os/theme'
import { SAMPLE_508 } from './spatial/sample-508.js'
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
  deleteWallEdge,
  export508ToWallGraph,
} from './spatial/wall-graph.js'
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

function pushGraphUndo() {
  const raw = S.projects[S.activeProjectId]
  if (!raw?.wallGraph) return
  graphUndoStack.push(JSON.stringify(raw.wallGraph))
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
    graphRedoStack.push(JSON.stringify(raw.wallGraph))
    if (graphRedoStack.length > MAX_LAYOUT_UNDO) graphRedoStack.shift()
  }
  const graph = JSON.parse(prev)
  applyWallGraph(graph, { skipUndo: true, silent: true })
  persistGraphUndoStacks()
  toast('已撤销墙图修改')
}

export function redoGraphEdit() {
  const nextGraph = graphRedoStack.pop()
  if (!nextGraph) {
    toast('没有可重做的墙图修改', 'warn')
    return
  }
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  if (raw?.wallGraph) {
    graphUndoStack.push(JSON.stringify(raw.wallGraph))
    if (graphUndoStack.length > MAX_LAYOUT_UNDO) graphUndoStack.shift()
  }
  const graph = JSON.parse(nextGraph)
  applyWallGraph(graph, { skipUndo: true, silent: true })
  persistGraphUndoStacks()
  toast('已重做墙图修改')
}

/**
 * @param {import('./spatial/types.js').WallGraph} graph
 * @param {{ skipUndo?: boolean, silent?: boolean, toastMsg?: string }} [opts]
 */
export function applyWallGraph(graph, opts = {}) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  if (!opts.skipUndo) pushGraphUndo()
  const next = hydrateProject({
    ...raw,
    layoutMode: 'wallGraph',
    wallGraph: graph,
  })
  setActiveProject(next)
  if (!opts.silent && opts.toastMsg) toast(opts.toastMsg)
  else if (!opts.silent) notifyLayoutSaved()
}

export function activateWallGraphMode() {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const hydrated = hydrateProject(raw)
  const graph = export508ToWallGraph(hydrated)
  graphUndoStack = []
  graphRedoStack = []
  persistGraphUndoStacks()
  const next = hydrateProject({
    ...hydrated,
    layoutMode: 'wallGraph',
    wallGraph: graph,
  })
  setActiveProject(next)
  toast('已切换墙图，点「墙图编辑」开始建墙')
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
  })
  setActiveProject(next)
  toast('已切回 508 参数化编辑')
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
  applyWallGraph(result.graph, { toastMsg: '已添加墙段' })
  return true
}

/** @param {string} edgeId */
export function removeGraphWall(edgeId) {
  const raw = S.projects[S.activeProjectId] ?? SAMPLE_508
  const graph = raw.wallGraph
  if (!graph) return
  const next = deleteWallEdge(graph, edgeId)
  applyWallGraph(next, { toastMsg: '已删除墙段' })
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
    if (stored.layoutMode === 'wallGraph') {
      stored.layoutMode = 'parametric508'
      delete stored.wallGraph
    }
    data.projects[SAMPLE_508.meta.id] = hydrateProject({
      ...SAMPLE_508,
      ...stored,
      layoutConfig: stored.layoutConfig ?? SAMPLE_508.layoutConfig,
      layoutMode: 'parametric508',
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

/** @type {number} */
let layoutSavedAt = $state(0)

/** @param {string} subtitle */
export function setPlanSubtitle(subtitle) {
  planSubtitle = subtitle
}

/** @returns {string} */
export function getPlanSubtitle() {
  return planSubtitle
}

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
