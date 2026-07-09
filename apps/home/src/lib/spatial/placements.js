/** @typedef {import('./types.js').SpatialPlacement} SpatialPlacement */
/** @typedef {import('./types.js').SpatialFurniture} SpatialFurniture */
/** @typedef {import('./types.js').SpatialZone} SpatialZone */
/** @typedef {import('./types.js').SpatialStorageZone} SpatialStorageZone */

import { findZoneAtPoint, polygonBbox, zoneCentroid } from './zones.js'

/** @type {Record<string, { label: string, w: number, h: number }>} */
export const PLACEMENT_KINDS = {
  bed: { label: '床', w: 60, h: 80 },
  sofa: { label: '沙发', w: 72, h: 32 },
  table: { label: '桌', w: 48, h: 32 },
  chair: { label: '椅', w: 20, h: 20 },
  cabinet: { label: '柜', w: 36, h: 24 },
  shelf: { label: '架', w: 40, h: 16 },
  washer: { label: '洗衣机', w: 28, h: 28 },
  fridge: { label: '冰箱', w: 32, h: 32 },
}

let placementSeq = 1

/** @param {SpatialPlacement[]} existing */
export function syncPlacementIdSeq(existing) {
  for (const p of existing) {
    const m = /^pl-(\d+)$/.exec(p.id)
    if (m) placementSeq = Math.max(placementSeq, Number(m[1]) + 1)
  }
}

/** @returns {string} */
export function createPlacementId() {
  return `pl-${placementSeq++}`
}

/**
 * @param {string} kind
 * @param {number} x
 * @param {number} y
 * @param {SpatialZone[]} zones
 * @param {SpatialPlacement[]} existing
 */
export function createPlacement(kind, x, y, zones, existing) {
  const spec = PLACEMENT_KINDS[kind]
  if (!spec) return null
  syncPlacementIdSeq(existing)
  const zone = findZoneAtPoint(zones, { x, y })
  return {
    id: createPlacementId(),
    kind,
    label: spec.label,
    x: x - spec.w / 2,
    y: y - spec.h / 2,
    w: spec.w,
    h: spec.h,
    rotation: /** @type {0} */ (0),
    zoneId: zone?.id,
  }
}

/**
 * @param {SpatialPlacement} p
 * @returns {SpatialPlacement}
 */
export function rotatePlacement(p) {
  const nextRot = /** @type {0 | 90 | 180 | 270} */ ((p.rotation + 90) % 360)
  if (nextRot === 90 || nextRot === 270) {
    const cx = p.x + p.w / 2
    const cy = p.y + p.h / 2
    const nw = p.h
    const nh = p.w
    return {
      ...p,
      rotation: nextRot,
      x: cx - nw / 2,
      y: cy - nh / 2,
      w: nw,
      h: nh,
    }
  }
  return { ...p, rotation: nextRot }
}

/**
 * @param {SpatialPlacement[]} placements
 * @returns {SpatialFurniture[]}
 */
export function placementsToFurniture(placements) {
  return placements.map((p) => ({
    id: p.id,
    roomId: p.zoneId ?? '',
    bounds: { x: p.x, y: p.y, w: p.w, h: p.h },
    label: p.label,
    strokeStyle: /** @type {'solid'} */ ('solid'),
  }))
}

/**
 * @param {SpatialStorageZone[]} storageZones
 * @param {SpatialZone[]} zones
 * @param {SpatialPlacement[]} placements
 */
export function resolveStorageZoneBounds(storageZones, zones, placements) {
  const zoneById = Object.fromEntries(zones.map((z) => [z.id, z]))
  const plById = Object.fromEntries(placements.map((p) => [p.id, p]))
  return storageZones.map((sz) => {
    if (sz.placementId) {
      const pl = plById[sz.placementId]
      if (pl) {
        return {
          ...sz,
          bounds: { x: pl.x, y: pl.y, w: pl.w, h: pl.h },
          marker: { x: pl.x + pl.w / 2, y: pl.y + pl.h / 2 },
        }
      }
    }
    if (sz.zoneId) {
      const z = zoneById[sz.zoneId]
      if (z?.polygon?.length) {
        const bbox = polygonBbox(z.polygon)
        const c = zoneCentroid(z.polygon)
        return { ...sz, bounds: bbox, marker: c }
      }
    }
    return sz
  })
}

/** @type {string[]} */
export const STORAGE_CODES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']
