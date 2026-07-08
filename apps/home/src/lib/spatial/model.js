/** @typedef {import('./types.js').SpatialProject} SpatialProject */

import { build508Project, default508Config, merge508Config } from './layout-508.js'

/**
 * Rebuild derived geometry from layoutConfig (parametric source of truth).
 * @param {SpatialProject} project
 * @returns {SpatialProject}
 */
export function hydrateProject(project) {
  if (!project.layoutConfig) {
    return build508Project(default508Config(), project)
  }
  const config = merge508Config(default508Config(), project.layoutConfig)
  return build508Project(config, project)
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
  return {
    schemaVersion: 1,
    unit: 'ft',
    wallHeightFt,
    floors: project.rooms.map((room) => ({
      id: room.id,
      polygon: rectToPolygon(room.bounds),
      elevationFt: 0,
      fill: room.fill,
    })),
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
    storageZones: project.storageZones.map((z) => ({
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
