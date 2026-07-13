import { db } from './db.js'
import { entityKey, recordMusicInteraction } from './musicInteractions.js'

/** @typedef {'track' | 'artist' | 'album' | 'playlist' | 'collection'} SpeedDialEntityType */

/**
 * @typedef {object} SpeedDialSlot
 * @property {string} id
 * @property {SpeedDialEntityType} entityType
 * @property {string} entityId
 * @property {'manual' | 'auto'} source
 * @property {number} position
 * @property {boolean} pinned
 * @property {boolean} hidden
 * @property {string} [reason]
 * @property {number} updatedAt
 */

const HIDDEN_TTL_MS = 30 * 86_400_000

/** @returns {Promise<SpeedDialSlot[]>} */
export async function getSpeedDialSlots() {
  const rows = await db.speedDialSlots.toArray()
  const now = Date.now()
  const visible = rows.filter(
    (row) => !row.hidden || now - row.updatedAt < HIDDEN_TTL_MS,
  )
  return visible.sort(
    (a, b) => a.position - b.position || Number(b.pinned) - Number(a.pinned),
  )
}

/** @returns {Promise<Map<string, number>>} Hidden entity → score multiplier (not now, not never) */
export async function getHiddenDownweights() {
  const now = Date.now()
  const rows = await db.speedDialSlots.filter((row) => row.hidden).toArray()
  /** @type {Map<string, number>} */
  const weights = new Map()

  for (const row of rows) {
    const age = now - row.updatedAt
    if (age >= HIDDEN_TTL_MS) continue
    let mult
    if (age < 3 * 86_400_000) mult = 0.08
    else if (age < 7 * 86_400_000) mult = 0.25
    else if (age < 14 * 86_400_000) mult = 0.5
    else mult = 0.75
    weights.set(row.id, mult)
  }

  return weights
}

/** Keys too recently hidden to show on the board (pinned slots override). */
export async function getBoardExcludedKeys() {
  const weights = await getHiddenDownweights()
  /** @type {Set<string>} */
  const excluded = new Set()
  for (const [key, mult] of weights) {
    if (mult < 0.2) excluded.add(key)
  }
  return excluded
}

/**
 * @param {SpeedDialEntityType} entityType
 * @param {string} entityId
 * @param {number} position
 */
export async function pinSpeedDialItem(entityType, entityId, position) {
  const id = entityKey(entityType, entityId)
  const existing = await db.speedDialSlots.get(id)
  await db.speedDialSlots.put({
    id,
    entityType,
    entityId,
    source: 'manual',
    position: Math.max(0, Math.min(7, position)),
    pinned: true,
    hidden: false,
    reason: 'pinned',
    updatedAt: Date.now(),
  })
  if (!existing?.pinned) {
    await recordMusicInteraction({
      entityType,
      entityId,
      action: 'pin_speed_dial',
      source: 'speed_dial',
      passive: false,
    })
  }
}

/** @param {string} id */
export async function unpinSpeedDialItem(id) {
  const row = await db.speedDialSlots.get(id)
  if (!row) return
  await db.speedDialSlots.delete(id)
  await recordMusicInteraction({
    entityType: row.entityType,
    entityId: row.entityId,
    action: 'unpin_speed_dial',
    source: 'speed_dial',
    passive: false,
  })
}

/** @param {string} id */
export async function hideSpeedDialItem(id) {
  const row = await db.speedDialSlots.get(id)
  if (!row) {
    const [entityType, ...rest] = id.split(':')
    const entityId = rest.join(':')
    await db.speedDialSlots.put({
      id,
      entityType,
      entityId,
      source: 'auto',
      position: -1,
      pinned: false,
      hidden: true,
      updatedAt: Date.now(),
    })
  } else {
    await db.speedDialSlots.update(id, { hidden: true, updatedAt: Date.now() })
  }
  const resolved = row || (await db.speedDialSlots.get(id))
  if (resolved) {
    await recordMusicInteraction({
      entityType: resolved.entityType,
      entityId: resolved.entityId,
      action: 'hide_speed_dial',
      source: 'speed_dial',
      passive: false,
    })
  }
}

/**
 * @param {number} position
 * @param {SpeedDialEntityType} entityType
 * @param {string} entityId
 * @param {string} [reason]
 */
export async function persistAutoSpeedDialSlot(
  position,
  entityType,
  entityId,
  reason,
) {
  const id = entityKey(entityType, entityId)
  const pinned = await db.speedDialSlots.get(id)
  if (pinned?.pinned) return
  await db.speedDialSlots.put({
    id,
    entityType,
    entityId,
    source: 'auto',
    position,
    pinned: false,
    hidden: false,
    reason,
    updatedAt: Date.now(),
  })
}

/**
 * Persist user-defined order for the primary 8 slots.
 * Reordering locks layout stability by pinning each slot.
 * @param {import('./speedDial.js').SpeedDialCell[]} cells
 */
export async function saveSpeedDialBoardOrder(cells) {
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    if (cell.variant === 'surprise') continue
    await db.speedDialSlots.put({
      id: cell.id,
      entityType: cell.entityType,
      entityId: cell.entityId,
      source: 'manual',
      position: i,
      pinned: true,
      hidden: false,
      reason: cell.reason || 'pinned',
      updatedAt: Date.now(),
    })
  }
  await recordMusicInteraction({
    entityType: 'collection',
    entityId: 'speed_dial_board',
    action: 'pin_speed_dial',
    source: 'speed_dial',
    passive: false,
  })
}
