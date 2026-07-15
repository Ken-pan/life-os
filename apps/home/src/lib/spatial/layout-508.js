/** @typedef {import('./types.js').SpatialProject} SpatialProject */
/** @typedef {import('./types.js').Layout508Config} Layout508Config */
/** @typedef {import('./dimensions.js').FtIn} FtIn */
import { SPATIAL_SCHEMA_VERSION } from './types.js'
import { dimPx, formatFtIn, toInches, fromInches } from './dimensions.js'
import { doorPath } from './doors.js'
import {
  defaultOpenings,
  openingHitAlongH,
  openingHitAlongV,
} from './wall-edit.js'
import { normalizeZoneItems } from './storage-items.js'
import { wallStrokePx } from './wall-standards.js'
import { windowPath } from './windows.js'

/** Bump when default topology changes — stale saved configs are discarded. */
export const LAYOUT_508_VERSION = 6

/** @param {FtIn} d @param {number} px */
function px(d, px) {
  return dimPx(d, px)
}

/**
 * Avalon #508.
 *
 * Two sources, and they are not interchangeable:
 *  - Room sizes come from the printed labels on the developer render
 *    (A9-769sf-DCI) — the only hard numbers it carries. Rooms it does not
 *    label keep the earlier red-line field values; kitchen depth is derived
 *    from the column-sum constraint.
 *  - Door offsets and hinge sides come from the red-line field audit. The
 *    render is a 3D perspective, so opening positions are NOT recoverable
 *    from it — only counts, walls and orientation are.
 *
 * Topology: balcony door off the living room, bedroom door on the south wall,
 * bedroom closet sliding into the bedroom, west-wall storage closet,
 * open-concept living/kitchen, solid structural core under the laundry with
 * the entry door tight against its east face.
 * @returns {Layout508Config}
 */
export function default508Config() {
  return {
    layoutVersion: LAYOUT_508_VERSION,
    pxPerFt: 36,
    margin: { x: 40, y: 40 },
    leftCol: { ft: 12, in: 6 },
    rightCol: { ft: 11, in: 10 },
    rooms: {
      balcony: { w: { ft: 12, in: 6 }, h: { ft: 4, in: 6 } },
      bedroom: { w: { ft: 12, in: 6 }, h: { ft: 10, in: 11 } },
      bedCloset: {
        w: { ft: 7, in: 0 },
        h: { ft: 2, in: 2 },
        door: { w: { ft: 3, in: 11 }, offset: { ft: 2, in: 10 } },
      },
      linenCloset: { w: { ft: 2, in: 8 }, h: { ft: 3, in: 6 } },
      bathroom: { w: { ft: 8, in: 5 }, h: { ft: 7, in: 8 } },
      laundry: { w: { ft: 3, in: 7 }, h: { ft: 6, in: 0 } },
      living: { w: { ft: 11, in: 10 }, h: { ft: 16, in: 9 } },
      // Depth is derived, not measured: the render labels only the bedroom and
      // the living room, and both columns must span the same overall depth.
      // Left = 4'6" + 10'11" + 2'2" + 3'6" + 7'8" = 28'9", so kitchen takes
      // whatever the living room leaves: 28'9" − 16'9" = 12'0".
      kitchen: { w: { ft: 11, in: 10 }, h: { ft: 12, in: 0 } },
      entry: { w: { ft: 5, in: 0 }, h: { ft: 3, in: 4 } },
    },
    openings: defaultOpenings(),
  }
}

/**
 * 深拷贝 config。
 *
 * **不能用 structuredClone** —— 调用方传进来的往往是 S 里的 Svelte $state 代理，
 * 而 structuredClone 遇到 Proxy 直接抛 DataCloneError。config 全是数字/字符串，
 * JSON 往返足够，也正是 wall-edit.js 的 cloneConfig 一直在用的办法。
 * @template T
 * @param {T} config
 * @returns {T}
 */
function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config))
}

/**
 * @param {Layout508Config} base
 * @param {Partial<Layout508Config>} patch
 * @returns {Layout508Config}
 */
export function merge508Config(base, patch) {
  // Saved configs from an older topology (pre red-line re-trace) carry
  // offsets whose semantics changed — discard them wholesale.
  if ((patch?.layoutVersion ?? 1) < (base.layoutVersion ?? 1)) {
    return cloneConfig(base)
  }
  const rooms = /** @type {Layout508Config['rooms']} */ ({})
  for (const key of Object.keys(base.rooms)) {
    const k = /** @type {keyof Layout508Config['rooms']} */ (key)
    rooms[k] = {
      ...base.rooms[k],
      ...(patch.rooms?.[k] ?? {}),
    }
  }
  if (patch.rooms?.bedCloset) {
    rooms.bedCloset = {
      ...base.rooms.bedCloset,
      ...patch.rooms.bedCloset,
      door: {
        ...base.rooms.bedCloset.door,
        ...patch.rooms.bedCloset.door,
      },
    }
  }
  const openings = {
    ...defaultOpenings(),
    ...(base.openings ?? {}),
    ...(patch.openings ?? {}),
  }
  return {
    ...base,
    ...patch,
    layoutVersion: base.layoutVersion,
    margin: { ...base.margin, ...patch.margin },
    leftCol: patch.leftCol ?? base.leftCol,
    rightCol: patch.rightCol ?? base.rightCol,
    rooms,
    openings,
    disabledOpenings: patch.disabledOpenings ?? base.disabledOpenings ?? [],
  }
}

/** Solid structural core below the laundry — floor to south wall. */
const PILLAR_H = { ft: 3, in: 4 }
/** Kitchen counter run depth along the east wall. */
const COUNTER_DEPTH = { ft: 2, in: 4 }

/**
 * Build full spatial project from parametric layout config.
 * @param {Layout508Config} config
 * @param {Partial<SpatialProject>} [carry] — preserve storage items / inventory from saved state
 */
export function build508Project(config, carry = {}) {
  const P = config.pxPerFt
  const X0 = config.margin.x
  const Y0 = config.margin.y
  const LEFT_W = px(config.leftCol, P)
  const RIGHT_W = px(config.rightCol, P)
  const X_DIV = X0 + LEFT_W
  const X_END = X_DIV + RIGHT_W

  const r = config.rooms
  const balconyH = px(r.balcony.h, P)
  const bedroomH = px(r.bedroom.h, P)
  const bedClosetW = px(r.bedCloset.w, P)
  const bedClosetH = px(r.bedCloset.h, P)
  const linenW = px(r.linenCloset.w, P)
  const linenH = px(r.linenCloset.h, P)
  const bathW = px(r.bathroom.w, P)
  const bathH = px(r.bathroom.h, P)
  const laundryW = px(r.laundry.w, P)
  const laundryH = px(r.laundry.h, P)
  const livingH = px(r.living.h, P)
  const kitchenH = px(r.kitchen.h, P)
  const entryW = px(r.entry.w, P)
  const entryH = px(r.entry.h, P)
  const pillarH = px(PILLAR_H, P)
  const kitCounterDepth = px(COUNTER_DEPTH, P)
  const kitCounterX = X_END - kitCounterDepth
  const op = { ...defaultOpenings(), ...(config.openings ?? {}) }

  // The developer render shows the living room's north glazing as two units
  // split by a mullion, not one continuous pane.
  const livWinX1 = X_DIV + px(op.livingWindow.insetLeft ?? { ft: 2, in: 0 }, P)
  const livWinX2 = X_END - px(op.livingWindow.insetRight ?? { ft: 2, in: 0 }, P)
  const livWinMid = (livWinX1 + livWinX2) / 2
  const MULLION_HALF = px({ ft: 0, in: 1 }, P) / 2
  const bedWinX1 = X0 + px(op.bedroomWindow.insetLeft ?? { ft: 2, in: 0 }, P)
  const bedWinX2 = X0 + LEFT_W - px(op.bedroomWindow.insetRight ?? { ft: 2, in: 0 }, P)
  const extThick = wallStrokePx('exterior', P)
  const intThick = wallStrokePx('interior', P)

  /**
   * Windows sit ON the wall centreline and the host wall is split around them
   * (the same way the doors are). Drawing a window over an unbroken wall just
   * hides it under the wall's own stroke — which is why this plan never showed
   * its windows at all.
   * @param {string} id
   * @param {number} x1
   * @param {number} x2
   * @param {number} y
   * @param {number} thickness
   */
  const windowOpening = (id, x1, x2, y, thickness) => ({
    id,
    type: /** @type {const} */ ('window'),
    // Style is NOT recoverable from the developer render — a 3D view can't
    // distinguish a slider from a hung sash. Each unit reads as two stacked
    // panes there, so 'hung' is the closest inference.
    windowStyle: /** @type {const} */ ('hung'),
    from: { x: x1, y },
    to: { x: x2, y },
    pathD: windowPath('hung', { x: x1, y }, { x: x2, y }, { thickness }),
  })


  const yBalconyBot = Y0 + balconyH
  const yBedroomBot = yBalconyBot + bedroomH
  const yClosetBandBot = yBedroomBot + bedClosetH
  const yLinenBot = yClosetBandBot + linenH
  const yLivKit = Y0 + livingH
  const Y_BOT = Math.max(yLivKit + kitchenH, yLinenBot + bathH)
  const outerH = Y_BOT - Y0

  const yBathTop = Y_BOT - bathH
  const laundryX = X0 + bathW
  const laundryE = laundryX + laundryW
  const yPillarTop = Y_BOT - pillarH
  const yLaundryTop = yPillarTop - laundryH
  const linenE = X0 + linenW

  // Balcony ↔ living swing door at the top of the divider wall
  const balcDoorY1 = Y0 + px(op.balconyDoor.offset, P)
  const balcDoorY2 = balcDoorY1 + px(op.balconyDoor.span, P)
  // Bedroom door on the bedroom's south wall, near the east corner
  const bedDoorX1 = X0 + px(op.bedroomDoor.offset, P)
  const bedDoorX2 = bedDoorX1 + px(op.bedroomDoor.span, P)
  // Bed closet sliding front onto the hall (south face)
  const cdX1 = X0 + px(r.bedCloset.door.offset, P)
  const cdX2 = cdX1 + px(r.bedCloset.door.w, P)
  // Linen closet door on its east wall
  const linenDoorY1 = yClosetBandBot + px(op.linenDoor.offset, P)
  const linenDoorY2 = linenDoorY1 + px(op.linenDoor.span, P)
  // Bathroom door on its north wall, swings out into the hall
  const bathDoorX1 = X0 + px(op.bathDoor.offset, P)
  const bathDoorX2 = bathDoorX1 + px(op.bathDoor.span, P)
  // Laundry double doors on its east wall
  const laundryDoorY1 = yLaundryTop + px(op.laundryDoor.offset, P)
  const laundryDoorY2 = laundryDoorY1 + px(op.laundryDoor.span, P)
  // Entry door on the south wall, just east of the structural core
  const entryX2 =
    X_END - px(op.entryDoor.offsetFromRight ?? { ft: 0, in: 0 }, P)
  const entryX1 = entryX2 - px(op.entryDoor.span, P)

  /** @type {SpatialProject['rooms']} */
  const rooms = [
    {
      id: 'balcony',
      nameZh: '阳台',
      nameEn: 'Balcony / Patio',
      bounds: { x: X0, y: Y0, w: LEFT_W, h: balconyH },
      fill: '#e4eaef',
      dimensions: { w: r.balcony.w, h: r.balcony.h },
    },
    {
      id: 'bedroom',
      nameZh: '卧室',
      nameEn: 'Bedroom',
      bounds: { x: X0, y: yBalconyBot, w: LEFT_W, h: bedroomH },
      fill: '#eee9f0',
      dimensions: { w: r.bedroom.w, h: r.bedroom.h },
    },
    {
      id: 'bed-closet',
      nameZh: '卧室壁橱',
      nameEn: 'Bedroom Closet',
      bounds: { x: X0, y: yBedroomBot, w: bedClosetW, h: bedClosetH },
      fill: '#e8edf1',
      dimensions: { w: r.bedCloset.w, h: r.bedCloset.h },
    },
    {
      id: 'linen-closet',
      nameZh: '走廊储物柜',
      nameEn: 'Linen / Storage Closet',
      bounds: { x: X0, y: yClosetBandBot, w: linenW, h: linenH },
      fill: '#e8edf1',
      dimensions: { w: r.linenCloset.w, h: r.linenCloset.h },
    },
    {
      id: 'bathroom',
      nameZh: '浴室',
      nameEn: 'Bath',
      bounds: { x: X0, y: yBathTop, w: bathW, h: bathH },
      fill: '#e6eef0',
      dimensions: { w: r.bathroom.w, h: r.bathroom.h },
    },
    {
      id: 'laundry',
      nameZh: '洗衣间',
      nameEn: 'Laundry',
      bounds: { x: laundryX, y: yLaundryTop, w: laundryW, h: laundryH },
      fill: '#eef1f4',
      dimensions: { w: r.laundry.w, h: r.laundry.h },
    },
    {
      id: 'living',
      nameZh: '客厅',
      nameEn: 'Living Room',
      bounds: { x: X_DIV, y: Y0, w: RIGHT_W, h: livingH },
      fill: '#e8edf1',
      dimensions: { w: r.living.w, h: r.living.h },
    },
    {
      id: 'kitchen',
      nameZh: '厨房 · 餐区',
      nameEn: 'Kitchen / Dining',
      bounds: { x: X_DIV, y: yLivKit, w: RIGHT_W, h: kitchenH },
      fill: '#efece5',
      dimensions: { w: r.kitchen.w, h: r.kitchen.h },
    },
    {
      id: 'entry',
      nameZh: '玄关',
      nameEn: 'Entry',
      bounds: {
        x: laundryE,
        y: Y_BOT - entryH,
        w: entryW,
        h: entryH,
      },
      fill: '#eaeee9',
      dimensions: { w: r.entry.w, h: r.entry.h },
    },
    {
      // 卧室门的落脚处：壁橱以东、卧室与走廊之间的一条。此前没有任何房间盖到，
      // 渲染出来是一块空白，看着就像墙断了。
      id: 'hall-bed-landing',
      nameZh: '',
      nameEn: '',
      kind: 'circulation',
      bounds: {
        x: X0 + bedClosetW,
        y: yBedroomBot,
        w: X_DIV - (X0 + bedClosetW),
        h: bedClosetH,
      },
      fill: 'transparent',
    },
    {
      id: 'hall',
      nameZh: '走廊',
      nameEn: 'Circulation',
      kind: 'circulation',
      bounds: {
        x: linenE,
        y: yClosetBandBot,
        w: laundryX - linenE,
        h: yBathTop - yClosetBandBot,
      },
      fill: 'transparent',
      dimensions: {
        w: fromInches(Math.round(((laundryX - linenE) / P) * 12)),
        h: fromInches(Math.round(((yBathTop - yClosetBandBot) / P) * 12)),
      },
    },
    {
      id: 'structural-pillar',
      nameZh: '结构柱 · 实心不可进',
      nameEn: 'Solid Core',
      kind: 'structural',
      bounds: { x: laundryX, y: yPillarTop, w: laundryW, h: pillarH },
      fill: '#c9bfb4',
    },
  ]

  /** @type {SpatialProject['walls']} */
  const walls = [
    {
      id: 'w-outer-left',
      from: { x: X0, y: Y0 },
      to: { x: X0, y: Y_BOT },
      kind: 'wall',
      role: 'exterior',
    },
    {
      id: 'w-outer-top',
      from: { x: X0, y: Y0 },
      to: { x: livWinX1, y: Y0 },
      kind: 'wall',
      role: 'exterior',
    },
    // Mullion stub between the two living-room window units.
    {
      id: 'w-outer-top-mullion',
      from: { x: livWinMid - MULLION_HALF, y: Y0 },
      to: { x: livWinMid + MULLION_HALF, y: Y0 },
      kind: 'wall',
      role: 'exterior',
    },
    {
      id: 'w-outer-top-e',
      from: { x: livWinX2, y: Y0 },
      to: { x: X_END, y: Y0 },
      kind: 'wall',
      role: 'exterior',
    },
    {
      id: 'w-outer-right',
      from: { x: X_END, y: Y0 },
      to: { x: X_END, y: Y_BOT },
      kind: 'wall',
      role: 'exterior',
    },
    // South wall with entry door just east of the structural core
    {
      id: 'w-outer-bot-w',
      from: { x: X0, y: Y_BOT },
      to: { x: entryX1, y: Y_BOT },
      kind: 'wall',
      role: 'exterior',
    },
    {
      id: 'g-entry',
      from: { x: entryX1, y: Y_BOT },
      to: { x: entryX2, y: Y_BOT },
      kind: 'gap',
    },
    {
      id: 't-entry',
      from: { x: entryX1, y: Y_BOT },
      to: { x: entryX2, y: Y_BOT },
      kind: 'threshold',
    },
    {
      id: 'w-outer-bot-e',
      from: { x: entryX2, y: Y_BOT },
      to: { x: X_END, y: Y_BOT },
      kind: 'wall',
      role: 'exterior',
    },
    // Divider wall alongside balcony + bedroom only — open to the hall below
    {
      id: 'w-div-top',
      from: { x: X_DIV, y: Y0 },
      to: { x: X_DIV, y: balcDoorY1 },
      kind: 'wall',
      role: 'interior',
    },
    {
      id: 'g-balcony',
      from: { x: X_DIV, y: balcDoorY1 },
      to: { x: X_DIV, y: balcDoorY2 },
      kind: 'gap',
    },
    {
      id: 't-balcony',
      from: { x: X_DIV, y: balcDoorY1 },
      to: { x: X_DIV, y: balcDoorY2 },
      kind: 'threshold',
    },
    {
      id: 'w-div',
      from: { x: X_DIV, y: balcDoorY2 },
      to: { x: X_DIV, y: yBedroomBot },
      kind: 'wall',
      role: 'interior',
    },
    // Balcony / bedroom separation — solid, window only
    {
      id: 'w-balcony',
      from: { x: X0, y: yBalconyBot },
      to: { x: bedWinX1, y: yBalconyBot },
      kind: 'wall',
      role: 'interior',
    },
    {
      id: 'w-balcony-e',
      from: { x: bedWinX2, y: yBalconyBot },
      to: { x: X_DIV, y: yBalconyBot },
      kind: 'wall',
      role: 'interior',
    },
    // Bedroom south wall with swing door near the east corner
    {
      id: 'w-bed-south-l',
      from: { x: X0, y: yBedroomBot },
      to: { x: cdX1, y: yBedroomBot },
      kind: 'wall',
      role: 'interior',
    },
    // 壁橱推拉门开在卧室这侧（衣柜从卧室进，不是从走廊）
    {
      id: 'g-bed-closet',
      from: { x: cdX1, y: yBedroomBot },
      to: { x: cdX2, y: yBedroomBot },
      kind: 'gap',
    },
    {
      id: 'w-bed-south-m',
      from: { x: cdX2, y: yBedroomBot },
      to: { x: bedDoorX1, y: yBedroomBot },
      kind: 'wall',
      role: 'interior',
    },
    {
      id: 'g-bed',
      from: { x: bedDoorX1, y: yBedroomBot },
      to: { x: bedDoorX2, y: yBedroomBot },
      kind: 'gap',
    },
    {
      id: 't-bed',
      from: { x: bedDoorX1, y: yBedroomBot },
      to: { x: bedDoorX2, y: yBedroomBot },
      kind: 'threshold',
    },
    {
      id: 'w-bed-south-r',
      from: { x: bedDoorX2, y: yBedroomBot },
      to: { x: X_DIV, y: yBedroomBot },
      kind: 'wall',
      role: 'interior',
    },
    // Bed closet — east cheek wall; sliding front faces the BEDROOM
    {
      id: 'w-closet-v',
      from: { x: X0 + bedClosetW, y: yBedroomBot },
      to: { x: X0 + bedClosetW, y: yClosetBandBot },
      kind: 'wall',
      role: 'interior',
    },
    {
      // 壁橱背面 —— 门在卧室那侧，这面是整堵墙
      id: 'w-closet-back',
      from: { x: X0, y: yClosetBandBot },
      to: { x: X0 + bedClosetW, y: yClosetBandBot },
      kind: 'wall',
      role: 'interior',
    },
    // Linen / storage closet along the west wall
    {
      id: 'w-linen-east-top',
      from: { x: linenE, y: yClosetBandBot },
      to: { x: linenE, y: linenDoorY1 },
      kind: 'wall',
      role: 'interior',
    },
    {
      id: 'g-linen',
      from: { x: linenE, y: linenDoorY1 },
      to: { x: linenE, y: linenDoorY2 },
      kind: 'gap',
    },
    {
      id: 't-linen',
      from: { x: linenE, y: linenDoorY1 },
      to: { x: linenE, y: linenDoorY2 },
      kind: 'threshold',
    },
    {
      id: 'w-linen-east-bot',
      from: { x: linenE, y: linenDoorY2 },
      to: { x: linenE, y: yLinenBot },
      kind: 'wall',
      role: 'interior',
    },
    {
      id: 'w-linen-bot',
      from: { x: X0, y: yLinenBot },
      to: { x: linenE, y: yLinenBot },
      kind: 'wall',
      role: 'interior',
    },
    // Bathroom north wall — door swings out into the hall
    {
      id: 'w-bath-top-l',
      from: { x: X0, y: yBathTop },
      to: { x: bathDoorX1, y: yBathTop },
      kind: 'wall',
      role: 'interior',
    },
    {
      id: 'g-bath',
      from: { x: bathDoorX1, y: yBathTop },
      to: { x: bathDoorX2, y: yBathTop },
      kind: 'gap',
    },
    {
      id: 't-bath',
      from: { x: bathDoorX1, y: yBathTop },
      to: { x: bathDoorX2, y: yBathTop },
      kind: 'threshold',
    },
    {
      id: 'w-bath-top-r',
      from: { x: bathDoorX2, y: yBathTop },
      to: { x: laundryX, y: yBathTop },
      kind: 'wall',
      role: 'interior',
    },
    // Bath east wall = laundry/pillar west wall (single shared line)
    {
      id: 'w-bath-laundry',
      from: { x: laundryX, y: yLaundryTop },
      to: { x: laundryX, y: Y_BOT },
      kind: 'wall',
      role: 'interior',
    },
    {
      id: 'w-laundry-top',
      from: { x: laundryX, y: yLaundryTop },
      to: { x: laundryE, y: yLaundryTop },
      kind: 'wall',
      role: 'interior',
    },
    // Laundry east wall with full-height double doors
    {
      id: 'w-laundry-east-top',
      from: { x: laundryE, y: yLaundryTop },
      to: { x: laundryE, y: laundryDoorY1 },
      kind: 'wall',
      role: 'interior',
    },
    {
      id: 'g-laundry',
      from: { x: laundryE, y: laundryDoorY1 },
      to: { x: laundryE, y: laundryDoorY2 },
      kind: 'gap',
    },
    {
      id: 't-laundry',
      from: { x: laundryE, y: laundryDoorY1 },
      to: { x: laundryE, y: laundryDoorY2 },
      kind: 'threshold',
    },
    {
      id: 'w-laundry-east-bot',
      from: { x: laundryE, y: laundryDoorY2 },
      to: { x: laundryE, y: yPillarTop },
      kind: 'wall',
      role: 'interior',
    },
    // Solid structural core under the laundry, down to the south wall
    {
      id: 'w-pillar-top',
      from: { x: laundryX, y: yPillarTop },
      to: { x: laundryE, y: yPillarTop },
      kind: 'wall',
      role: 'interior',
    },
    {
      id: 'w-pillar-east',
      from: { x: laundryE, y: yPillarTop },
      to: { x: laundryE, y: Y_BOT },
      kind: 'wall',
      role: 'interior',
    },
    // Kitchen counter run along the east wall (open-concept, no room divider)
    {
      id: 'w-kit-cap',
      from: { x: kitCounterX, y: yLivKit },
      to: { x: X_END, y: yLivKit },
      kind: 'wall',
      role: 'interior',
    },
    {
      id: 'w-kit-counter',
      from: { x: kitCounterX, y: yLivKit },
      to: { x: kitCounterX, y: Y_BOT },
      kind: 'wall',
      role: 'interior',
    },
  ]

  /** @type {SpatialProject['openings']} */
  const openings = [
    windowOpening('win-living', livWinX1, livWinMid - MULLION_HALF, Y0, extThick),
    windowOpening('win-living-2', livWinMid + MULLION_HALF, livWinX2, Y0, extThick),
    windowOpening('win-bedroom', bedWinX1, bedWinX2, yBalconyBot, intThick),
    {
      id: 'ac-living',
      type: 'ac',
      rect: { x: X_DIV + RIGHT_W / 2 - 28, y: Y0 + 2, w: 56, h: 18 },
      label: 'WALL AC',
    },
    {
      id: 'door-balcony',
      type: 'door',
      doorStyle: 'swing',
      opensInto: 'balcony',
      hitRect: openingHitAlongV(X_DIV, balcDoorY1, balcDoorY2),
      // 底铰链、向西开进阳台
      pathD: doorPath(
        'swing',
        { x: X_DIV, y: balcDoorY2 },
        { x: X_DIV, y: balcDoorY1 },
        { thickness: intThick, side: 'left' },
      ),
    },
    {
      id: 'door-bedroom',
      type: 'door',
      doorStyle: 'swing',
      opensInto: 'hall',
      hitRect: openingHitAlongH(bedDoorX1, bedDoorX2, yBedroomBot),
      // 西铰链、向南开进走廊
      pathD: doorPath(
        'swing',
        { x: bedDoorX1, y: yBedroomBot },
        { x: bedDoorX2, y: yBedroomBot },
        { thickness: intThick, side: 'right' },
      ),
    },
    {
      id: 'door-bed-closet',
      type: 'door',
      doorStyle: 'bypass',
      opensInto: 'bedroom',
      hitRect: openingHitAlongH(cdX1, cdX2, yBedroomBot),
      // 推拉门开在卧室这侧
      pathD: doorPath(
        'bypass',
        { x: cdX1, y: yBedroomBot },
        { x: cdX2, y: yBedroomBot },
        { thickness: intThick },
      ),
    },
    {
      id: 'door-linen',
      type: 'door',
      doorStyle: 'swing',
      opensInto: 'hall',
      hitRect: openingHitAlongV(linenE, linenDoorY1, linenDoorY2),
      // 北铰链、向东开进走廊
      pathD: doorPath(
        'swing',
        { x: linenE, y: linenDoorY1 },
        { x: linenE, y: linenDoorY2 },
        { thickness: intThick, side: 'left' },
      ),
    },
    {
      id: 'door-bath',
      type: 'door',
      doorStyle: 'swing',
      opensInto: 'hall',
      hitRect: openingHitAlongH(bathDoorX1, bathDoorX2, yBathTop),
      // 西铰链、向北开进走廊
      pathD: doorPath(
        'swing',
        { x: bathDoorX1, y: yBathTop },
        { x: bathDoorX2, y: yBathTop },
        { thickness: intThick, side: 'left' },
      ),
    },
    {
      id: 'door-laundry',
      type: 'door',
      doorStyle: 'double',
      opensInto: 'hall',
      hitRect: openingHitAlongV(laundryE, laundryDoorY1, laundryDoorY2),
      // 双开、向东开进玄关走廊
      pathD: doorPath(
        'double',
        { x: laundryE, y: laundryDoorY1 },
        { x: laundryE, y: laundryDoorY2 },
        { thickness: intThick, side: 'left' },
      ),
    },
    {
      id: 'door-entry',
      type: 'door',
      doorStyle: 'swing',
      hitRect: openingHitAlongH(entryX1, entryX2, Y_BOT),
      // 西铰链、向北开进屋内
      pathD: doorPath(
        'swing',
        { x: entryX1, y: Y_BOT },
        { x: entryX2, y: Y_BOT },
        { thickness: extThick, side: 'left' },
      ),
    },
  ].filter((op) => !(config.disabledOpenings ?? []).includes(op.id))

  /**
   * Built-in fixtures, laid out per the developer render (A9-769sf-DCI):
   * a galley along the kitchen's east wall running DW → sink → cooktop → fridge
   * north-to-south, the bathroom's tub against the west wall with the toilet and
   * vanity east of it, the laundry pair stacked north-south, and fixed shelving
   * in both closets.
   *
   * The render is a 3D perspective, so it fixes the *wall and the order*, not
   * exact offsets — these are laid out against this model's own geometry
   * (counter run, room faces) and spaced evenly. Treat the positions as
   * approximate; the wall each one sits on is what the render actually pins.
   *
   * @type {SpatialProject['fixtures']}
   */
  const fixtures = []
  {
    const IN = (n) => (n / 12) * P
    /** Appliances in the galley face west, so their width runs north-south. */
    const galley = (id, kind, label, wIn, dIn, cy) => {
      const w = IN(wIn) // along the wall (north-south)
      const d = IN(dIn) // into the room (east-west)
      fixtures.push({
        id,
        kind,
        label,
        rotation: /** @type {const} */ (90),
        // bounds is the rotated AABB: width runs north-south here.
        bounds: { x: X_END - d, y: cy - w / 2, w: d, h: w },
      })
    }
    // Evenly spaced down the counter run, in the render's order.
    const galleyTop = yLivKit + IN(6)
    const galleyBot = Y_BOT - IN(6)
    const slots = 4
    const pitch = (galleyBot - galleyTop) / slots
    const at = (i) => galleyTop + pitch * (i + 0.5)
    galley('fx-dw', 'dishwasher', 'DW', 24, 24, at(0))
    galley('fx-ksink', 'kitchenSink', '水槽', 30, 22, at(1))
    galley('fx-range', 'stove', '灶台', 30, 25, at(2))
    galley('fx-fridge', 'fridge', '冰箱', 33, 30, at(3))

    // Bathroom, per the developer render: a walk-in shower (curved glass door,
    // tiled pan, drain — NOT a tub) in the west alcove running north-south, and
    // the vanity + toilet both against the east wall with the vanity to the
    // north. A 30x60 alcove is the standard footprint (30" is the code minimum
    // width); the bath door is on the *north* wall and swings out to the hall,
    // so it does not constrain a shower in the south-west corner.
    // Fixtures sit against wall *faces*, not centrelines — a wall is stroked at
    // its real thickness, so the usable face is half a thickness in.
    const bathE = X0 + bathW
    const bathEFace = bathE - intThick / 2
    const bathWFace = X0 + extThick / 2
    const bathSFace = Y_BOT - extThick / 2
    const bathNFace = yBathTop + intThick / 2

    fixtures.push({
      id: 'fx-shower',
      kind: 'shower',
      label: '淋浴',
      bounds: { x: bathWFace, y: bathSFace - IN(60), w: IN(30), h: IN(60) },
    })

    // Vanity and toilet both back onto the EAST wall, vanity to the north.
    // rotation 90 turns each symbol's back (drawn "up" unrotated) to the east —
    // at rotation 0 they would back onto the north wall instead, which is the
    // wall they are nowhere near.
    const vanityY = bathNFace + IN(4)
    fixtures.push({
      id: 'fx-vanity',
      kind: 'vanity',
      label: '洗手台',
      rotation: /** @type {const} */ (90),
      // bounds is the rotated AABB: 30" of width now runs north-south.
      bounds: { x: bathEFace - IN(21), y: vanityY, w: IN(21), h: IN(30) },
    })
    fixtures.push({
      id: 'fx-toilet',
      kind: 'toilet',
      label: '马桶',
      rotation: /** @type {const} */ (90),
      // 15" from the toilet's centreline to the nearest obstruction each side is
      // the code clearance; the vanity above is what it has to clear here.
      bounds: {
        x: bathEFace - IN(28),
        y: vanityY + IN(35),
        w: IN(28),
        h: IN(20),
      },
    })

    // Laundry pair, stacked north-south inside the closet.
    const laundryCx = laundryX + laundryW / 2
    fixtures.push({
      id: 'fx-dryer',
      kind: 'appliance',
      label: '烘干机',
      bounds: { x: laundryCx - IN(13.5), y: yLaundryTop + IN(2), w: IN(27), h: IN(27) },
    })
    fixtures.push({
      id: 'fx-washer',
      kind: 'appliance',
      label: '洗衣机',
      bounds: { x: laundryCx - IN(13.5), y: yLaundryTop + IN(31), w: IN(27), h: IN(27) },
    })

    // Fixed shelving: a hanging rod across the bedroom closet, wire shelves in
    // the linen closet. These are built in, not furniture.
    fixtures.push({
      id: 'fx-bed-closet-rod',
      kind: 'rod',
      label: '挂杆',
      bounds: { x: X0 + IN(3), y: yBedroomBot + IN(3), w: bedClosetW - IN(6), h: bedClosetH - IN(6) },
    })
    fixtures.push({
      id: 'fx-linen-shelves',
      kind: 'shelf',
      label: '储物架',
      rotation: /** @type {const} */ (90),
      bounds: { x: X0 + IN(3), y: yClosetBandBot + IN(3), w: linenW - IN(6), h: linenH - IN(6) },
    })
  }

  /** @type {SpatialProject['furniture']} */
  const furniture = []

  const defaultZones = defaultStorageZones(config, {
    X0,
    Y0,
    X_END,
    X_DIV,
    yBalconyBot,
    yBedroomBot,
    yClosetBandBot,
    yBathTop,
    yLaundryTop,
    yLivKit,
    Y_BOT,
    laundryX,
    livingH,
    LEFT_W,
    bedClosetW,
    kitCounterX,
    kitCounterDepth,
    // Zones that *are* a built-in are derived from that built-in's own
    // footprint, so the two can never drift apart.
    fixture: (id) => fixtures.find((f) => f.id === id)?.bounds ?? null,
    P,
  })

  const storageZones = normalizeZoneItems(
    (carry.storageZones ?? defaultZones).map((z) => {
      const built = defaultZones.find((d) => d.id === z.id)
      return built
        ? {
            ...built,
            items: z.items,
            nameZh: built.nameZh,
            locationZh: built.locationZh,
            formZh: built.formZh,
            inferred: built.inferred ?? z.inferred,
          }
        : z
    }),
  )

  return {
    schemaVersion: SPATIAL_SCHEMA_VERSION,
    meta: {
      id: 'avalon-508',
      nameZh: '我的户型 · 储藏审计',
      unitId: '001-508',
      building: 'Avalon Alderwood Place',
      sqft: carry.meta?.sqft ?? 769,
      layoutType: '1 bed · 1 bath · 769 sqft',
      status: carry.meta?.status ?? '搬家 / 打包中',
      floorplanUrl:
        'https://resource.avalonbay.com//floorplans/wa037/wa802-a9-769sf-dci.png',
      scaleLabel: `${config.pxPerFt} px/ft · 北向上 · 可编辑尺寸`,
      assumptions: [
        '<b>平面来源</b>：v6 尺寸改用开发商图纸 A9-769sf-DCI 的标注 — 卧室 12′6″×10′11″、客厅 11′10″×16′9″。其余房间该图<b>没有标注</b>，沿用此前红线实测值；厨房进深由列高反推。',
        '<b>门窗精度</b>：该图为 3D 透视效果图，墙有高度会使开口投影偏移，<b>门窗的精确偏移/跨度无法从中还原</b>。图上可确证的只有数量与朝向：客厅北墙两扇窗（中间竖梃）、卧室北墙单扇窗、阳台门自客厅向阳台开。门的偏移与铰链方向仍是此前逐一校准的值。',
        '<b>墙厚</b>：美国公寓惯例 — 外墙 6″、内隔墙 4.5″（2×4 + 双面石膏板）。',
        '<b>阳台</b>：仅由客厅西北角平开门进入（底铰链向阳台开）；卧室北墙为单扇窗、无门。',
        '<b>卧室门</b>：在南墙偏东（距东角约 1′），西铰链向走廊下开。',
        '<b>壁橱</b>：卧室壁橱推拉门<b>朝卧室开</b>（衣柜从卧室进，背面朝走廊是整墙）；内为挂杆 + 上层板。走廊储物柜贴西墙 2′8″ 深 × 3′6″ 高，门向走廊外开，内为多层钢丝层架。',
        '<b>浴室</b>：西南角，门在北墙、向走廊外开；东墙与洗衣间西墙共线。洁具按开发商图：西侧为<b>步入式淋浴（弧形玻璃门，非浴缸）</b>30″×60″ 壁龛；洗手台在东墙北端，马桶在其正下方、中心线距东墙 18″。',
        '<b>洗衣间</b>：双开门朝东向玄关走廊；正下方结构柱实心不可进，直落南墙。',
        '<b>入户门</b>：南墙紧贴结构柱东侧，西铰链向内开。',
        '<b>厨房</b>：与客厅开放贯通、无隔墙；东墙橱柜条深 2′4″ 直达南墙。',
      ],
      sourceNote:
        carry.meta?.sourceNote ?? 'HOME.OS · 参数化户型 · 储藏清单来自现场审计',
      ...(carry.meta ?? {}),
    },
    viewport: { width: X_END - X0 + 80, height: outerH + 80 },
    gridStep: config.pxPerFt,
    outerBounds: { x: X0, y: Y0, w: X_END - X0, h: outerH },
    rooms,
    walls,
    openings,
    fixtures,
    furniture,
    storageZones,
    furnitureInventory: [],
    layoutConfig: config,
  }
}

/**
 * @param {Layout508Config} config
 * @param {Record<string, number>} L layout constants in px
 */
function defaultStorageZones(config, L) {
  const r = config.rooms
  const P = config.pxPerFt
  const px = /** @param {FtIn} d */ (d) => dimPx(d, P)

  return [
    {
      id: 's1',
      code: 'S1',
      nameZh: '走廊储物柜',
      locationZh: `走廊西侧 · ${formatFtIn(r.linenCloset.w)}×${formatFtIn(r.linenCloset.h)}`,
      formZh: '走廊储物柜 · 多层钢丝层架',
      bounds: {
        x: L.X0,
        y: L.yClosetBandBot,
        w: px(r.linenCloset.w),
        h: px(r.linenCloset.h),
      },
      marker: {
        x: L.X0 + px(r.linenCloset.w) / 2,
        y: L.yClosetBandBot + px(r.linenCloset.h) / 2,
      },
      items: [
        '外套 / 夹克',
        '鞋履 · Birkenstock 拖鞋',
        '电动滑板车',
        '折叠健身垫',
        '清洁杂物',
      ],
    },
    {
      id: 's2',
      code: 'S2',
      nameZh: '厨房橱柜 + 干货',
      locationZh: '厨房 · 东墙橱柜',
      formZh: '上柜 + 下柜 + 台面',
      // The counter run itself — upper + lower cabinets flank the appliances,
      // so the zone is the whole galley strip rather than a floating box.
      bounds: {
        x: L.kitCounterX,
        y: L.yLivKit,
        w: L.kitCounterDepth,
        h: L.Y_BOT - L.yLivKit,
      },
      marker: {
        x: L.kitCounterX + L.kitCounterDepth / 2,
        y: L.yLivKit + (L.Y_BOT - L.yLivKit) / 2,
      },
      items: [
        '餐具 / 玻璃杯 / 干货',
        '锅具 / 平底锅',
        '咖啡设备 · 小家电',
        '调味 / 囤货',
      ],
    },
    {
      id: 's3',
      code: 'S3',
      nameZh: 'Kallax 方格柜',
      locationZh: '客厅 · 靠隔墙',
      formZh: '开放格 + 抽屉盒',
      bounds: {
        x: L.X_DIV + 8,
        y: L.Y0 + px({ ft: 6, in: 0 }, P),
        w: 48,
        h: px({ ft: 4, in: 0 }, P),
      },
      marker: { x: L.X_DIV + 32, y: L.Y0 + px({ ft: 8, in: 0 }, P) },
      items: ['透明抽屉收纳盒', '摄影 / 数码配件', '杂项装备'],
    },
    {
      id: 's4',
      code: 'S4',
      nameZh: '钢丝补给货架',
      locationZh: '客厅 · 东墙内侧 · 推测摆位',
      formZh: '多层金属层架',
      inferred: true,
      bounds: {
        x: L.X_END - px({ ft: 3, in: 6 }, P),
        y: L.Y0 + px({ ft: 9, in: 0 }, P),
        w: px({ ft: 3, in: 0 }, P),
        h: px({ ft: 4, in: 0 }, P),
      },
      marker: {
        x: L.X_END - px({ ft: 2, in: 0 }, P),
        y: L.Y0 + px({ ft: 11, in: 0 }, P),
      },
      items: ['蛋白粉 / 燕麦', '囤货收纳箱', '备餐容器 · 零食'],
    },
    {
      id: 's5',
      code: 'S5',
      nameZh: '浴室层架 + 洗手台',
      locationZh: `浴室 · ${formatFtIn(r.bathroom.w)}×${formatFtIn(r.bathroom.h)}`,
      formZh: '壁挂层板 + 台下',
      // Sits on the vanity — the storage here is the cabinet under the basin
      // plus the shelf above it, so it tracks fx-vanity rather than floating.
      bounds: L.fixture('fx-vanity') ?? {
        x: L.X0 + px({ ft: 4, in: 0 }, P),
        y: L.yBathTop + px({ ft: 2, in: 0 }, P),
        w: px({ ft: 2, in: 0 }, P),
        h: px({ ft: 3, in: 0 }, P),
      },
      marker: (() => {
        const b = L.fixture('fx-vanity')
        return b
          ? { x: b.x + b.w / 2, y: b.y + b.h / 2 }
          : { x: L.X0 + px({ ft: 5, in: 0 }, P), y: L.yBathTop + px({ ft: 3, in: 6 }, P) }
      })(),
      items: ['护肤 / 洗漱', '毛巾 · 纸品', '清洁工具', '体脂秤'],
    },
    {
      id: 's6',
      code: 'S6',
      nameZh: '卧室壁橱',
      locationZh: `卧室下 · ${formatFtIn(r.bedCloset.w)}×${formatFtIn(r.bedCloset.h)}`,
      formZh: '推拉门 · 朝卧室开启 · 挂杆 + 上层板',
      bounds: {
        x: L.X0,
        y: L.yBedroomBot,
        w: px(r.bedCloset.w),
        h: px(r.bedCloset.h),
      },
      marker: {
        x: L.X0 + px({ ft: 3, in: 6 }, P),
        y: L.yBedroomBot + px({ ft: 1, in: 0 }, P),
      },
      items: ['当季衣物', '床品 / 备用寝具', '托特包 · 手提袋', '换季堆叠'],
    },
    {
      id: 's7',
      code: 'S7',
      nameZh: '床头钢架',
      locationZh: '卧室 · 床侧',
      formZh: '两层金属边架',
      bounds: {
        x: L.X0 + px({ ft: 8, in: 0 }, P),
        y: L.yBalconyBot + px({ ft: 5, in: 0 }, P),
        w: px({ ft: 1, in: 6 }, P),
        h: px({ ft: 2, in: 0 }, P),
      },
      marker: {
        x: L.X0 + px({ ft: 8, in: 9 }, P),
        y: L.yBalconyBot + px({ ft: 6, in: 0 }, P),
      },
      items: ['加湿器', '磨豆机 / 咖啡', '充电 · 小电子', '夜间用品'],
    },
    {
      id: 's8',
      code: 'S8',
      nameZh: '洗衣 / 走廊杂物',
      locationZh: `洗衣间 · ${formatFtIn(r.laundry.w)}×${formatFtIn(r.laundry.h)}`,
      formZh: '洗衣机 + 烘干机 · 上方囤货',
      bounds: {
        x: L.laundryX,
        y: L.yLaundryTop,
        w: px(r.laundry.w),
        h: px(r.laundry.h),
      },
      marker: {
        x: L.laundryX + px(r.laundry.w) / 2,
        y: L.yLaundryTop + px({ ft: 2, in: 0 }, P),
      },
      items: ['洗衣液 / 柔顺剂', '清洁用品囤货', '垃圾桶 / 回收', '搬家纸箱'],
    },
  ]
}

/** Editable room keys shown in UI */
export const EDITABLE_ROOM_KEYS = [
  ['balcony', '阳台'],
  ['bedroom', '卧室'],
  ['bedCloset', '卧室壁橱'],
  ['linenCloset', '走廊储物柜'],
  ['bathroom', '浴室'],
  ['laundry', '洗衣间'],
  ['living', '客厅'],
  ['kitchen', '厨房'],
  ['entry', '玄关'],
]

/**
 * 这些房间的「宽」不是独立参数，而是跟着所在的列走 —— 见下面 setRoomDimension
 * 结尾的联动：写完立刻被 leftCol / rightCol 覆盖回去。要改只能拖分隔墙（w-div）。
 *
 * 导出是为了让尺寸编辑器把这几个宽度框置灰：不然用户输进去的数字会留在框里、
 * 却永远不生效，看着像编辑器坏了。改了下面的联动记得同步这张表。
 * @type {Record<string, 'leftCol' | 'rightCol'>}
 */
export const COLUMN_LOCKED_WIDTH = {
  balcony: 'leftCol',
  bedroom: 'leftCol',
  living: 'rightCol',
  kitchen: 'rightCol',
}

/**
 * @param {Layout508Config} config
 * @param {string} roomKey
 * @param {'w' | 'h'} axis
 * @param {{ ft: number, in: number }} value
 */
export function setRoomDimension(config, roomKey, axis, value) {
  const next = cloneConfig(config)
  const room = /** @type {Record<string, { w: FtIn, h: FtIn }>} */ (next.rooms)[
    roomKey
  ]
  if (!room) return config
  room[axis] = value
  if (roomKey === 'balcony' || roomKey === 'bedroom') {
    next.rooms.balcony.w = next.leftCol
    next.rooms.bedroom.w = next.leftCol
  }
  if (roomKey === 'living' || roomKey === 'kitchen') {
    next.rooms.living.w = next.rightCol
    next.rooms.kitchen.w = next.rightCol
  }
  return next
}

/**
 * @param {Layout508Config} config
 * @returns {string[]}
 */
export function validate508Config(config) {
  const issues = []
  const op = { ...defaultOpenings(), ...(config.openings ?? {}) }
  const leftIn = toInches(config.leftCol)
  const totalIn = leftIn + toInches(config.rightCol)

  if (toInches(config.rooms.bedCloset.w) > leftIn) {
    issues.push(
      `卧室壁橱宽 ${formatFtIn(config.rooms.bedCloset.w)} 超过左列 ${formatFtIn(config.leftCol)}`,
    )
  }
  const cd = config.rooms.bedCloset.door
  if (
    toInches(cd.offset) + toInches(cd.w) >
    toInches(config.rooms.bedCloset.w)
  ) {
    issues.push('壁橱推拉门超出壁橱面宽')
  }
  if (toInches(config.rooms.linenCloset.w) >= toInches(cd.offset)) {
    issues.push('储物柜宽度不能遮挡壁橱推拉门开口')
  }
  const bedDoorEnd =
    toInches(op.bedroomDoor.offset) + toInches(op.bedroomDoor.span)
  if (bedDoorEnd > leftIn) {
    issues.push('卧室门超出南墙范围')
  }
  const bathDoorEnd = toInches(op.bathDoor.offset) + toInches(op.bathDoor.span)
  if (bathDoorEnd > toInches(config.rooms.bathroom.w)) {
    issues.push('浴室门超出浴室北墙范围')
  }
  if (toInches(op.bathDoor.offset) < toInches(config.rooms.linenCloset.w)) {
    issues.push('浴室门被走廊储物柜遮挡')
  }
  const laundryEastIn =
    toInches(config.rooms.bathroom.w) + toInches(config.rooms.laundry.w)
  if (laundryEastIn > totalIn - 28 - 36) {
    issues.push('浴室+洗衣间过宽 — 玄关走廊被挤压（需留入户门与橱柜条）')
  }
  const laundryDoorEnd =
    toInches(op.laundryDoor.offset) + toInches(op.laundryDoor.span)
  if (laundryDoorEnd > toInches(config.rooms.laundry.h)) {
    issues.push('洗衣间双开门超出洗衣间高度')
  }
  const linenDoorEnd =
    toInches(op.linenDoor.offset) + toInches(op.linenDoor.span)
  if (linenDoorEnd > toInches(config.rooms.linenCloset.h)) {
    issues.push('储物柜门超出柜体高度')
  }
  return issues
}
