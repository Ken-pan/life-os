/** @typedef {import('./types.js').SpatialProject} SpatialProject */
/** @typedef {import('./types.js').Layout508Config} Layout508Config */
/** @typedef {import('./dimensions.js').FtIn} FtIn */
import { SPATIAL_SCHEMA_VERSION } from './types.js'
import { dimPx, formatFtIn, toInches, fromInches } from './dimensions.js'
import {
  bypassSlidingHorizontal,
  doubleSwingVerticalRight,
  swingHorizontalUp,
  swingVerticalLeft,
  swingVerticalRight,
} from './doors.js'
import {
  defaultOpenings,
  openingHitAlongH,
  openingHitAlongV,
} from './wall-edit.js'

/** Bump when default topology changes — stale saved configs are discarded. */
export const LAYOUT_508_VERSION = 2

/** @param {FtIn} d @param {number} px */
function px(d, px) {
  return dimPx(d, px)
}

/**
 * Avalon #508 dimensions, re-traced 2026-07 from the developer floor plan
 * (red-line audit): balcony door off the living room, bedroom door on the
 * south wall, west-wall storage closet, open-concept living/kitchen,
 * solid structural core under the laundry.
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
      balcony: { w: { ft: 12, in: 6 }, h: { ft: 4, in: 0 } },
      bedroom: { w: { ft: 12, in: 6 }, h: { ft: 10, in: 11 } },
      bedCloset: {
        w: { ft: 7, in: 1 },
        h: { ft: 2, in: 0 },
        door: { w: { ft: 3, in: 11 }, offset: { ft: 3, in: 0 } },
      },
      linenCloset: { w: { ft: 2, in: 8 }, h: { ft: 6, in: 0 } },
      bathroom: { w: { ft: 9, in: 0 }, h: { ft: 7, in: 8 } },
      laundry: { w: { ft: 5, in: 4 }, h: { ft: 6, in: 0 } },
      living: { w: { ft: 11, in: 10 }, h: { ft: 13, in: 10 } },
      kitchen: { w: { ft: 11, in: 10 }, h: { ft: 16, in: 9 } },
      entry: { w: { ft: 5, in: 0 }, h: { ft: 3, in: 4 } },
    },
    openings: defaultOpenings(),
  }
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
    return structuredClone(base)
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
      to: { x: X_DIV, y: yBalconyBot },
      kind: 'wall',
      role: 'interior',
    },
    // Bedroom south wall with swing door near the east corner
    {
      id: 'w-bed-south-l',
      from: { x: X0, y: yBedroomBot },
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
    // Bed closet — east cheek wall + sliding front facing the hall
    {
      id: 'w-closet-v',
      from: { x: X0 + bedClosetW, y: yBedroomBot },
      to: { x: X0 + bedClosetW, y: yClosetBandBot },
      kind: 'wall',
      role: 'interior',
    },
    {
      id: 'w-closet-face-l',
      from: { x: X0, y: yClosetBandBot },
      to: { x: cdX1, y: yClosetBandBot },
      kind: 'wall',
      role: 'interior',
    },
    {
      id: 'g-bed-closet',
      from: { x: cdX1, y: yClosetBandBot },
      to: { x: cdX2, y: yClosetBandBot },
      kind: 'gap',
    },
    {
      id: 'w-closet-face-r',
      from: { x: cdX2, y: yClosetBandBot },
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
    {
      id: 'win-living',
      type: 'window',
      from: {
        x: X_DIV + px(op.livingWindow.insetLeft ?? { ft: 2, in: 0 }, P),
        y: Y0 - 2,
      },
      to: {
        x: X_END - px(op.livingWindow.insetRight ?? { ft: 2, in: 0 }, P),
        y: Y0 - 2,
      },
    },
    {
      id: 'win-bedroom',
      type: 'window',
      from: {
        x: X0 + px(op.bedroomWindow.insetLeft ?? { ft: 2, in: 0 }, P),
        y: yBalconyBot - 2,
      },
      to: {
        x: X0 + LEFT_W - px(op.bedroomWindow.insetRight ?? { ft: 2, in: 0 }, P),
        y: yBalconyBot - 2,
      },
    },
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
      pathD: swingVerticalLeft({
        x: X_DIV,
        y1: balcDoorY1,
        y2: balcDoorY2,
        radius: balcDoorY2 - balcDoorY1,
      }),
    },
    {
      id: 'door-bedroom',
      type: 'door',
      doorStyle: 'swing',
      opensInto: 'bedroom',
      hitRect: openingHitAlongH(bedDoorX1, bedDoorX2, yBedroomBot),
      pathD: swingHorizontalUp({
        x1: bedDoorX1,
        x2: bedDoorX2,
        y: yBedroomBot,
        radius: bedDoorX2 - bedDoorX1,
      }),
    },
    {
      id: 'door-bed-closet',
      type: 'door',
      doorStyle: 'bypass',
      opensInto: 'hall',
      hitRect: openingHitAlongH(cdX1, cdX2, yClosetBandBot),
      pathD: bypassSlidingHorizontal({ x1: cdX1, x2: cdX2, y: yClosetBandBot }),
    },
    {
      id: 'door-linen',
      type: 'door',
      doorStyle: 'swing',
      opensInto: 'hall',
      hitRect: openingHitAlongV(linenE, linenDoorY1, linenDoorY2),
      pathD: swingVerticalRight({
        x: linenE,
        y1: linenDoorY1,
        y2: linenDoorY2,
        radius: linenDoorY2 - linenDoorY1,
      }),
    },
    {
      id: 'door-bath',
      type: 'door',
      doorStyle: 'swing',
      opensInto: 'hall',
      hitRect: openingHitAlongH(bathDoorX1, bathDoorX2, yBathTop),
      pathD: swingHorizontalUp({
        x1: bathDoorX1,
        x2: bathDoorX2,
        y: yBathTop,
        radius: bathDoorX2 - bathDoorX1,
      }),
    },
    {
      id: 'door-laundry',
      type: 'door',
      doorStyle: 'double',
      opensInto: 'hall',
      hitRect: openingHitAlongV(laundryE, laundryDoorY1, laundryDoorY2),
      pathD: doubleSwingVerticalRight({
        x: laundryE,
        y1: laundryDoorY1,
        y2: laundryDoorY2,
      }),
    },
    {
      id: 'door-entry',
      type: 'door',
      doorStyle: 'swing',
      hitRect: openingHitAlongH(entryX1, entryX2, Y_BOT),
      pathD: swingHorizontalUp({
        x1: entryX1,
        x2: entryX2,
        y: Y_BOT,
        radius: entryX2 - entryX1,
      }),
    },
  ].filter((op) => !(config.disabledOpenings ?? []).includes(op.id))

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
    laundryX,
    livingH,
    LEFT_W,
    bedClosetW,
    P,
  })

  const storageZones = (carry.storageZones ?? defaultZones).map((z) => {
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
  })

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
        '<b>平面来源</b>：2026-07 按开发商户型图红线重描 — 墙线、门位、开向逐一校准。',
        '<b>墙厚</b>：美国公寓惯例 — 外墙 6″、内隔墙 4.5″（2×4 + 双面石膏板）。',
        '<b>阳台</b>：仅由客厅西北角平开门进入（向阳台开）；卧室北墙为整幅窗、无门。',
        '<b>卧室门</b>：在南墙偏东（距东角约 1′），西侧铰链向卧室内开。',
        '<b>壁橱</b>：卧室壁橱推拉门朝走廊；走廊储物柜贴西墙 2′8″ 深，门向走廊外开。',
        '<b>浴室</b>：西南角，门在北墙、向走廊外开；东墙与洗衣间西墙共线。',
        '<b>洗衣间</b>：双开门朝东向玄关走廊；正下方结构柱实心不可进，直落南墙。',
        '<b>入户门</b>：南墙紧贴结构柱东侧，向内开、折向柱壁。',
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
      formZh: 'Linen / Storage Closet',
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
      bounds: {
        x: L.X_END - px({ ft: 2, in: 4 }, P),
        y: L.Y0 + L.livingH + 20,
        w: px({ ft: 2, in: 0 }, P),
        h: px({ ft: 11, in: 0 }, P),
      },
      marker: {
        x: L.X_END - px({ ft: 1, in: 4 }, P),
        y: L.Y0 + L.livingH + px({ ft: 6, in: 0 }, P),
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
      bounds: {
        x: L.X0 + px({ ft: 4, in: 0 }, P),
        y: L.yBathTop + px({ ft: 2, in: 0 }, P),
        w: px({ ft: 2, in: 0 }, P),
        h: px({ ft: 3, in: 0 }, P),
      },
      marker: {
        x: L.X0 + px({ ft: 5, in: 0 }, P),
        y: L.yBathTop + px({ ft: 3, in: 6 }, P),
      },
      items: ['护肤 / 洗漱', '毛巾 · 纸品', '清洁工具', '体脂秤'],
    },
    {
      id: 's6',
      code: 'S6',
      nameZh: '卧室壁橱',
      locationZh: `卧室下 · ${formatFtIn(r.bedCloset.w)}×${formatFtIn(r.bedCloset.h)}`,
      formZh: '推拉门 · 朝走廊开启',
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
      formZh: 'W/D + 清洁囤货',
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
 * @param {Layout508Config} config
 * @param {string} roomKey
 * @param {'w' | 'h'} axis
 * @param {{ ft: number, in: number }} value
 */
export function setRoomDimension(config, roomKey, axis, value) {
  const next = structuredClone(config)
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
