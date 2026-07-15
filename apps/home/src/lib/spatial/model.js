/** @typedef {import('./types.js').SpatialProject} SpatialProject */

import { build508Project, default508Config, merge508Config } from './layout-508.js'
import { clampPlacementRect } from './placements.js'
import { buildFromWallGraph } from './wall-graph.js'

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
  if (!project.layoutConfig) {
    const built = build508Project(default508Config(), project)
    return {
      ...built,
      layoutMode: 'parametric508',
      wallGraph: undefined,
      furniture: [],
      furnitureInventory: [],
      viewpoints: project.viewpoints ?? [],
    }
  }
  const config = merge508Config(default508Config(), project.layoutConfig)
  const built = build508Project(config, project)
  return {
    ...built,
    layoutMode: 'parametric508',
    wallGraph: undefined,
    furniture: [],
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
