/** @typedef {import('./dimensions.js').FtIn} FtIn */
import { toInches } from './dimensions.js'

/**
 * @param {FtIn} w
 * @param {FtIn} h
 * @returns {number} square feet (rounded to 1 decimal)
 */
export function roomAreaSqft(w, h) {
  const sqIn = toInches(w) * toInches(h)
  return Math.round((sqIn / 144) * 10) / 10
}

/**
 * @param {import('./types.js').Layout508Config} config
 * @returns {{ totalSqft: number, rooms: { key: string, label: string, sqft: number }[] }}
 */
export function summarize508Areas(config) {
  /** @type {{ key: string, label: string, sqft: number }[]} */
  const rooms = []
  let totalSqft = 0
  for (const [key, label] of /** @type {const} */ ([
    ['balcony', '阳台'],
    ['bedroom', '卧室'],
    ['bedCloset', '卧室壁橱'],
    ['coatCloset', '走廊储物柜'],
    ['bathroom', '浴室'],
    ['laundry', '洗衣间'],
    ['living', '客厅'],
    ['kitchen', '厨房'],
    ['entry', '玄关'],
  ])) {
    const room = config.rooms[/** @type {keyof typeof config.rooms} */ (key)]
    if (!room || !('w' in room) || !('h' in room)) continue
    const sqft = roomAreaSqft(room.w, room.h)
    rooms.push({ key, label, sqft })
    totalSqft += sqft
  }
  return { totalSqft: Math.round(totalSqft * 10) / 10, rooms }
}
