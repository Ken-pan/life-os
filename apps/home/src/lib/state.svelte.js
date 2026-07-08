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
  setRoomDimension,
  validate508Config,
} from './spatial/layout-508.js'
import {
  applyOpeningDrag,
  applyWallDrag,
  OPENING_EDIT_BINDINGS,
  resolveWallBinding,
} from './spatial/wall-edit.js'
import { toast } from './ui.svelte.js'

/** @typedef {import('./spatial/types.js').SpatialProject} SpatialProject */
/** @typedef {import('@life-os/contracts/appearance').ColorSchemePreference} ColorSchemePreference */

const SKEY = 'homeos_spatial_v1'
const MAX_LAYOUT_UNDO = 24

/** @type {string[]} */
let layoutUndoStack = []
/** @type {string[]} */
let layoutRedoStack = []

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
    data.projects[SAMPLE_508.meta.id] = hydrateProject({
      ...SAMPLE_508,
      ...stored,
      layoutConfig: stored.layoutConfig ?? SAMPLE_508.layoutConfig,
      storageZones: stored.storageZones ?? SAMPLE_508.storageZones,
      furnitureInventory:
        stored.furnitureInventory ?? SAMPLE_508.furnitureInventory,
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
  toast('已恢复开发商默认尺寸')
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

export { deserializeProject }
