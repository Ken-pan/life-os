/** @typedef {import('./types.js').SpatialProject} SpatialProject */

import { build508Project, default508Config, merge508Config } from './layout-508.js'
import { clampPlacementRect, placementsToFurniture } from './placements.js'
import { buildFromWallGraph } from './wall-graph.js'

/** 同一件东西的两份记录:实测件落在内置件这么近以内,就认为是同一个(3ft) */
const FIXTURE_REPLACE_PX = 108

const centerOfBox = (o) => {
  const b = o.bounds ?? o
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

/**
 * 508 参数户型的内置设施是每次 hydrate 现搭的,直接用会把扫描来的实测件冲掉。
 * 这里让外来件(id 前缀 `scan-`)顶掉与它重合的内置件,其余内置件照旧。
 * 幂等:外来件只存在于 carry 里,内置件每次重生成,所以重复 hydrate 结果一样。
 * @param {SpatialProject['fixtures']} builtin
 * @param {SpatialProject['fixtures']} carried
 */
function mergeBuiltinFixtures(builtin, carried) {
  const extra = (carried ?? []).filter((f) => String(f.id).startsWith('scan-'))
  if (!extra.length) return builtin
  const kept = (builtin ?? []).filter((f) => {
    const c = centerOfBox(f)
    return !extra.some((e) => {
      const ec = centerOfBox(e)
      return Math.hypot(ec.x - c.x, ec.y - c.y) < FIXTURE_REPLACE_PX
    })
  })
  return [...kept, ...extra]
}

/**
 * v5: placement w/h were authored in inches (the catalogue and the inspector's
 * ″ both say so) but stored and drawn as plan px, so all furniture rendered at
 * 1/3 real size. Rescale about each piece's centre so its position survives.
 *
 * Keyed on schemaVersion and run before the builders — they stamp the current
 * version on the way out, so a project only ever migrates once even though
 * hydrateProject runs on every edit.
 *
 * @param {SpatialProject} project
 * @returns {SpatialProject}
 */
function migratePlacementScale(project) {
  if ((project.schemaVersion ?? 0) >= 5) return project
  if (!project.placements?.length) return project
  const pxPerFt =
    project.wallGraph?.pxPerFt ?? project.layoutConfig?.pxPerFt ?? 36
  const k = pxPerFt / 12
  if (k === 1) return project
  return {
    ...project,
    placements: project.placements.map((p) => {
      const cx = p.x + p.w / 2
      const cy = p.y + p.h / 2
      const w = p.w * k
      const h = p.h * k
      return { ...p, x: cx - w / 2, y: cy - h / 2, w, h }
    }),
  }
}

/**
 * Pull placements that sit *entirely* outside the canvas back into view.
 *
 * Such a piece is invisible and unclickable — its hit rect is outside the
 * viewBox too — so the clamp on the movement paths can never rescue it: you
 * can't select what you can't click. Undo is the only other way back, and undo
 * doesn't survive a reload.
 *
 * Deliberately only rescues the fully-lost. A piece with any part on canvas is
 * still grabbable and therefore the user's business, not ours to move. Runs
 * after the builders because they're what compute the viewport.
 *
 * @param {SpatialProject} project
 * @returns {SpatialProject}
 */
function rescueStrayPlacements(project) {
  const vp = project.viewport
  const placements = project.placements
  if (!vp || !placements?.length) return project
  let changed = false
  const next = placements.map((p) => {
    const lost =
      p.x + p.w <= 0 || p.y + p.h <= 0 || p.x >= vp.width || p.y >= vp.height
    if (!lost) return p
    changed = true
    return { ...p, ...clampPlacementRect(p.x, p.y, p.w, p.h, vp) }
  })
  return changed ? { ...project, placements: next } : project
}

/**
 * Rebuild derived geometry from layoutConfig or wallGraph source of truth.
 * @param {SpatialProject} raw
 * @returns {SpatialProject}
 */
export function hydrateProject(raw) {
  const project = migratePlacementScale(raw)
  if (project.layoutMode === 'wallGraph' && project.wallGraph) {
    return rescueStrayPlacements(buildFromWallGraph(project.wallGraph, project))
  }
  const config = project.layoutConfig
    ? merge508Config(default508Config(), project.layoutConfig)
    : default508Config()
  const built = build508Project(config, project)
  // 508 参数模式此前把 placements 整个丢掉、furniture 写死成空 —— 扫描摆好的家具
  // 一刷新就没了(setActiveProject 当场能看到,load() 再 hydrate 就蒸发)。
  // 户型仍由 config 说了算,家具只是搭在上面的一层,carry 过来即可。
  const placements = project.placements ?? []
  return {
    ...built,
    layoutMode: 'parametric508',
    wallGraph: undefined,
    placements,
    fixtures: mergeBuiltinFixtures(built.fixtures, project.fixtures),
    furniture: placementsToFurniture(placements),
    furnitureInventory: [],
    viewpoints: project.viewpoints ?? [],
  }
}

/**
 * Serialize / deserialize spatial projects.
 * @param {SpatialProject} project
 */
export function serializeProject(project) {
  return JSON.stringify(project, null, 2)
}

/**
 * @param {string} raw
 * @returns {SpatialProject | null}
 */
export function deserializeProject(raw) {
  try {
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || !Array.isArray(data.rooms)) return null
    return /** @type {SpatialProject} */ (data)
  } catch {
    return null
  }
}

/**
 * Future 3D extrusion hints — walls get default height, rooms become floor slabs.
 * Consumed later by Three.js layer; no renderer dependency here.
 * @param {SpatialProject} project
 */
export function toExtrusionHints(project) {
  const wallHeightFt = 8
  const zones = project.zones ?? []
  const floors =
    zones.length > 0
      ? zones.map((z, i) => ({
          id: z.id,
          polygon: z.polygon,
          elevationFt: 0,
          fill: z.color ?? project.rooms[i]?.fill,
        }))
      : project.rooms.map((room) => ({
          id: room.id,
          polygon: rectToPolygon(room.bounds),
          elevationFt: 0,
          fill: room.fill,
        }))
  return {
    schemaVersion: 1,
    unit: 'ft',
    wallHeightFt,
    floors,
    walls: project.walls
      .filter((w) => w.kind === 'wall')
      .map((wall) => ({
        id: wall.id,
        segment: [wall.from, wall.to],
        heightFt: wallHeightFt,
        thicknessIn: 6,
      })),
    furniture: project.furniture.map((f) => ({
      id: f.id,
      roomId: f.roomId,
      footprint: rectToPolygon(f.bounds),
      label: f.label,
      heightFt: 2.5,
    })),
    storageZones: project.storageZones.filter((z) => z.bounds).map((z) => ({
      id: z.id,
      code: z.code,
      footprint: rectToPolygon(z.bounds),
      marker: z.marker,
    })),
  }
}

/** @param {{ x: number, y: number, w: number, h: number }} rect */
function rectToPolygon(rect) {
  const { x, y, w, h } = rect
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

/**
 * @param {SpatialProject} project
 * @returns {{ rooms: number, storageZones: number, furniture: number }}
 */
export function projectStats(project) {
  return {
    rooms: project.rooms.filter((r) => r.kind !== 'circulation').length,
    storageZones: project.storageZones.length,
    furniture: project.furniture.length,
  }
}
