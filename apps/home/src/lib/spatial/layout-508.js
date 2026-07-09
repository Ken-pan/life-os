/** @typedef {import('./types.js').SpatialProject} SpatialProject */
/** @typedef {import('./types.js').Layout508Config} Layout508Config */
/** @typedef {import('./dimensions.js').FtIn} FtIn */
import { SPATIAL_SCHEMA_VERSION } from './types.js'
import { dimPx, formatFtIn, toInches, fromInches } from './dimensions.js'
import {
  bifoldHorizontalUp,
  bifoldVerticalRight,
  slidingHorizontal,
  swingHorizontalUp,
  swingVerticalLeft,
  swingVerticalRight,
} from './doors.js'
import { defaultOpenings, openingHitAlongH, openingHitAlongV } from './wall-edit.js'

/** @param {FtIn} d @param {number} px */
function px(d, px) {
  return dimPx(d, px)
}

/**
 * Default Avalon #508 dimensions from developer floor plan.
 * @returns {Layout508Config}
 */
export function default508Config() {
  return {
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
        door: { w: { ft: 5, in: 0 }, offset: { ft: 1, in: 0 } },
      },
      coatCloset: { w: { ft: 3, in: 5 }, h: { ft: 3, in: 2 } },
      bathroom: { w: { ft: 7, in: 11 }, h: { ft: 7, in: 8 } },
      laundry: { w: { ft: 3, in: 2 }, h: { ft: 5, in: 4 } },
      living: { w: { ft: 11, in: 10 }, h: { ft: 16, in: 9 } },
      kitchen: { w: { ft: 11, in: 10 }, h: { ft: 13, in: 10 } },
      entry: { w: { ft: 3, in: 9 }, h: { ft: 4, in: 5 } },
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
    margin: { ...base.margin, ...patch.margin },
    leftCol: patch.leftCol ?? base.leftCol,
    rightCol: patch.rightCol ?? base.rightCol,
    rooms,
    openings,
    disabledOpenings: patch.disabledOpenings ?? base.disabledOpenings ?? [],
  }
}

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
  const coatClosetW = px(r.coatCloset.w, P)
  const coatClosetH = px(r.coatCloset.h, P)
  const closetBandH = Math.max(bedClosetH, coatClosetH)
  const bathW = px(r.bathroom.w, P)
  const bathH = px(r.bathroom.h, P)
  const laundryW = px(r.laundry.w, P)
  const laundryH = px(r.laundry.h, P)
  const livingH = px(r.living.h, P)
  const kitchenH = px(r.kitchen.h, P)
  const entryW = px(r.entry.w, P)
  const entryH = px(r.entry.h, P)
  const op = config.openings ?? defaultOpenings()

  const yBalconyBot = Y0 + balconyH
  const yBedroomBot = yBalconyBot + bedroomH
  const yClosetBandBot = yBedroomBot + closetBandH
  const yLaundryTop = yClosetBandBot + px({ ft: 2, in: 0 }, P)
  const coatX = X0 + bedClosetW + coatClosetW
  const hallX = X0 + bathW + laundryW
  const hallW = X_DIV - hallX
  const hallH = bathH + px(r.coatCloset.h, P) - px({ ft: 2, in: 0 }, P)

  const yLeftBot = Math.max(yClosetBandBot + bathH, yLaundryTop + laundryH)
  const yRightBot = Y0 + livingH + kitchenH
  const Y_BOT = Math.max(yLeftBot, yRightBot)
  const outerH = Y_BOT - Y0
  const midColX = X0 + bathW
  const midColW = laundryW + hallW
  const pillarW = px({ ft: 2, in: 0 }, P)
  const pillarH = px({ ft: 2, in: 0 }, P)
  const pillarX = midColX + Math.max(0, (midColW - pillarW) / 2)
  const pillarY = Y_BOT - pillarH
  const coatDoorY1 = yBedroomBot + px(op.coatDoor.offset, P)
  const coatDoorY2 = coatDoorY1 + px(op.coatDoor.span, P)
  const laundryDoorY1 = yLaundryTop + px(op.laundryDoor.offset, P)
  const laundryDoorY2 = laundryDoorY1 + px(op.laundryDoor.span, P)

  // Bed closet bifold door on shared wall with bedroom (opens up into bedroom only)
  const doorOff = px(r.bedCloset.door.offset, P)
  const doorW = px(r.bedCloset.door.w, P)
  const doorX1 = X0 + doorOff
  const doorX2 = doorX1 + doorW

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
      id: 'coat-closet',
      nameZh: '走廊储物柜',
      nameEn: 'Coat Closet',
      bounds: { x: X0 + bedClosetW, y: yBedroomBot, w: coatClosetW, h: coatClosetH },
      fill: '#e8edf1',
      dimensions: { w: r.coatCloset.w, h: r.coatCloset.h },
    },
    {
      id: 'bathroom',
      nameZh: '浴室',
      nameEn: 'Bath',
      bounds: { x: X0, y: yClosetBandBot, w: bathW, h: bathH },
      fill: '#e6eef0',
      dimensions: { w: r.bathroom.w, h: r.bathroom.h },
    },
    {
      id: 'laundry',
      nameZh: '洗衣间',
      nameEn: 'Laundry',
      bounds: { x: X0 + bathW, y: yLaundryTop, w: laundryW, h: laundryH },
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
      nameZh: '厨房',
      nameEn: 'Kitchen',
      bounds: { x: X_DIV, y: Y0 + livingH, w: RIGHT_W, h: kitchenH },
      fill: '#efece5',
      dimensions: { w: r.kitchen.w, h: r.kitchen.h },
    },
    {
      id: 'entry',
      nameZh: '玄关',
      nameEn: 'Entry',
      bounds: {
        x: X_END - entryW,
        y: Y0 + livingH + kitchenH - entryH,
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
        x: hallX,
        y: yBedroomBot + bedClosetH,
        w: hallW,
        h: hallH,
      },
      fill: 'transparent',
    },
    {
      id: 'structural-pillar',
      nameZh: '结构柱',
      nameEn: 'Structural Column',
      kind: 'structural',
      bounds: { x: pillarX, y: pillarY, w: pillarW, h: pillarH },
      fill: '#c9bfb4',
    },
  ]

  /** @type {SpatialProject['walls']} */
  const walls = [
    { id: 'w-outer-left', from: { x: X0, y: Y0 }, to: { x: X0, y: Y_BOT }, kind: 'wall' },
    { id: 'w-outer-bot-left', from: { x: X0, y: Y_BOT }, to: { x: X_DIV, y: Y_BOT }, kind: 'wall' },
    { id: 'w-outer-right', from: { x: X_END, y: Y0 }, to: { x: X_END, y: Y_BOT }, kind: 'wall' },
    { id: 'w-outer-top', from: { x: X0, y: Y0 }, to: { x: X_END, y: Y0 }, kind: 'wall' },
    { id: 'w-div', from: { x: X_DIV, y: Y0 }, to: { x: X_DIV, y: Y_BOT }, kind: 'wall' },
    { id: 'w-balcony', from: { x: X0, y: yBalconyBot }, to: { x: X0 + LEFT_W, y: yBalconyBot }, kind: 'wall' },
    // Closet row — gap for bifold door (bed-closet → bedroom only)
    {
      id: 'w-closet-row-l',
      from: { x: X0, y: yBedroomBot },
      to: { x: doorX1, y: yBedroomBot },
      kind: 'wall',
    },
    {
      id: 'g-bed-closet',
      from: { x: doorX1, y: yBedroomBot },
      to: { x: doorX2, y: yBedroomBot },
      kind: 'gap',
    },
    {
      id: 'w-closet-row-r',
      from: { x: doorX2, y: yBedroomBot },
      to: { x: X0 + bedClosetW, y: yBedroomBot },
      kind: 'wall',
    },
    {
      id: 'w-closet-row-ext',
      from: { x: X0 + bedClosetW, y: yBedroomBot },
      to: { x: X0 + LEFT_W, y: yBedroomBot },
      kind: 'wall',
    },
    {
      id: 'w-closet-v',
      from: { x: X0 + bedClosetW, y: yBedroomBot },
      to: { x: X0 + bedClosetW, y: yBedroomBot + coatClosetH },
      kind: 'wall',
    },
    {
      id: 'w-coat-east-top',
      from: { x: coatX, y: yBedroomBot },
      to: { x: coatX, y: coatDoorY1 },
      kind: 'wall',
    },
    {
      id: 'g-coat',
      from: { x: coatX, y: coatDoorY1 },
      to: { x: coatX, y: coatDoorY2 },
      kind: 'gap',
    },
    {
      id: 't-coat',
      from: { x: coatX, y: coatDoorY1 },
      to: { x: coatX, y: coatDoorY2 },
      kind: 'threshold',
    },
    {
      id: 'w-coat-east-bot',
      from: { x: coatX, y: coatDoorY2 },
      to: { x: coatX, y: yBedroomBot + coatClosetH },
      kind: 'wall',
    },
    {
      id: 'w-bath-top',
      from: { x: X0, y: yClosetBandBot },
      to: { x: X0 + bathW + laundryW, y: yClosetBandBot },
      kind: 'wall',
    },
    {
      id: 'w-bath-right',
      from: { x: X0 + bathW, y: yClosetBandBot },
      to: { x: X0 + bathW, y: yLaundryTop },
      kind: 'wall',
    },
    {
      id: 'w-laundry-east-top',
      from: { x: hallX, y: yLaundryTop },
      to: { x: hallX, y: laundryDoorY1 },
      kind: 'wall',
    },
    {
      id: 'g-laundry',
      from: { x: hallX, y: laundryDoorY1 },
      to: { x: hallX, y: laundryDoorY2 },
      kind: 'gap',
    },
    {
      id: 't-laundry',
      from: { x: hallX, y: laundryDoorY1 },
      to: { x: hallX, y: laundryDoorY2 },
      kind: 'threshold',
    },
    {
      id: 'w-laundry-east-bot',
      from: { x: hallX, y: laundryDoorY2 },
      to: { x: hallX, y: yLaundryTop + laundryH },
      kind: 'wall',
    },
    {
      id: 'w-bath-right-low',
      from: { x: X0 + bathW, y: yLaundryTop + laundryH },
      to: { x: X0 + bathW, y: Y_BOT },
      kind: 'wall',
    },
    {
      id: 'w-liv-kit',
      from: { x: X_DIV, y: Y0 + livingH },
      to: { x: X_END - px({ ft: 4, in: 0 }, P), y: Y0 + livingH },
      kind: 'wall',
    },
    {
      id: 'g-bed',
      from: { x: X_DIV, y: yBalconyBot + px(op.bedroomDoor.offset, P) },
      to: { x: X_DIV, y: yBalconyBot + px(op.bedroomDoor.offset, P) + px(op.bedroomDoor.span, P) },
      kind: 'gap',
    },
    {
      id: 't-bed',
      from: { x: X_DIV, y: yBalconyBot + px(op.bedroomDoor.offset, P) },
      to: { x: X_DIV, y: yBalconyBot + px(op.bedroomDoor.offset, P) + px(op.bedroomDoor.span, P) },
      kind: 'threshold',
    },
    {
      id: 'g-bath',
      from: { x: X0 + bathW, y: yClosetBandBot + px(op.bathDoor.offset, P) },
      to: { x: X0 + bathW, y: yClosetBandBot + px(op.bathDoor.offset, P) + px(op.bathDoor.span, P) },
      kind: 'gap',
    },
    {
      id: 't-bath',
      from: { x: X0 + bathW, y: yClosetBandBot + px(op.bathDoor.offset, P) },
      to: { x: X0 + bathW, y: yClosetBandBot + px(op.bathDoor.offset, P) + px(op.bathDoor.span, P) },
      kind: 'threshold',
    },
    {
      id: 'g-entry',
      from: {
        x: X_END - px(op.entryDoor.offsetFromRight ?? { ft: 0, in: 0 }, P) - px(op.entryDoor.span, P),
        y: Y_BOT,
      },
      to: { x: X_END - px(op.entryDoor.offsetFromRight ?? { ft: 0, in: 0 }, P), y: Y_BOT },
      kind: 'gap',
    },
    {
      id: 't-entry',
      from: {
        x: X_END - px(op.entryDoor.offsetFromRight ?? { ft: 0, in: 0 }, P) - px(op.entryDoor.span, P),
        y: Y_BOT,
      },
      to: { x: X_END - px(op.entryDoor.offsetFromRight ?? { ft: 0, in: 0 }, P), y: Y_BOT },
      kind: 'threshold',
    },
  ]

  const bedDoorY1 = yBalconyBot + px(op.bedroomDoor.offset, P)
  const bedDoorY2 = bedDoorY1 + px(op.bedroomDoor.span, P)
  const bathDoorY1 = yClosetBandBot + px(op.bathDoor.offset, P)
  const bathDoorY2 = bathDoorY1 + px(op.bathDoor.span, P)
  const entryX2 = X_END - px(op.entryDoor.offsetFromRight ?? { ft: 0, in: 0 }, P)
  const entryX1 = entryX2 - px(op.entryDoor.span, P)
  const balconySpanPx = px(op.balconyDoor.span, P)
  const balconyDoorX1 = op.balconyDoor.center
    ? X0 + LEFT_W / 2 - balconySpanPx / 2
    : X0 + px(op.balconyDoor.offset, P)
  const balconyDoorX2 = balconyDoorX1 + balconySpanPx

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
      doorStyle: 'sliding',
      hitRect: openingHitAlongH(balconyDoorX1, balconyDoorX2, yBalconyBot),
      pathD: slidingHorizontal({
        x1: balconyDoorX1,
        x2: balconyDoorX2,
        y: yBalconyBot,
      }),
    },
    {
      id: 'door-bedroom',
      type: 'door',
      doorStyle: 'swing',
      hitRect: openingHitAlongV(X_DIV, bedDoorY1, bedDoorY2),
      pathD: swingVerticalRight({ x: X_DIV, y1: bedDoorY1, y2: bedDoorY2 }),
    },
    {
      id: 'door-bed-closet',
      type: 'door',
      doorStyle: 'bifold',
      opensInto: 'bedroom',
      hitRect: openingHitAlongH(doorX1, doorX2, yBedroomBot),
      pathD: bifoldHorizontalUp({ x1: doorX1, x2: doorX2, y: yBedroomBot }),
    },
    {
      id: 'door-bath',
      type: 'door',
      doorStyle: 'swing',
      hitRect: openingHitAlongV(X0 + bathW, bathDoorY1, bathDoorY2),
      pathD: swingVerticalLeft({ x: X0 + bathW, y1: bathDoorY1, y2: bathDoorY2 }),
    },
    {
      id: 'door-coat',
      type: 'door',
      doorStyle: 'swing',
      hitRect: openingHitAlongV(coatX, coatDoorY1, coatDoorY2),
      pathD: swingVerticalRight({ x: coatX, y1: coatDoorY1, y2: coatDoorY2, radius: 28 }),
    },
    {
      id: 'door-laundry',
      type: 'door',
      doorStyle: 'bifold',
      opensInto: 'hall',
      hitRect: openingHitAlongV(hallX, laundryDoorY1, laundryDoorY2),
      pathD: bifoldVerticalRight({ x: hallX, y1: laundryDoorY1, y2: laundryDoorY2 }),
    },
    {
      id: 'door-entry',
      type: 'door',
      doorStyle: 'swing',
      hitRect: openingHitAlongH(entryX1, entryX2, Y_BOT),
      pathD: swingHorizontalUp({ x1: entryX1, x2: entryX2, y: Y_BOT }),
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
    yLaundryTop,
    livingH,
    LEFT_W,
    bedClosetW,
    coatClosetW,
    bathW,
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

  const sqft = carry.meta?.sqft ?? 769

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
        '<b>平面来源</b>：参数化布局，默认按开发商 769 sqft 户型图重建。',
        '<b>卧室壁橱</b>：双折门（bifold），仅向卧室方向开启，不向走廊开门。',
        '<b>洗衣间</b>：双折门 5′ 宽，向走廊开启；底部结构柱为实心不可进。',
        '<b>储藏区 S1–S8</b>：位置随尺寸自适应；柜内明细可继续修正。',
      ],
      sourceNote: carry.meta?.sourceNote ?? 'HOME.OS · 参数化户型 · 储藏清单来自现场审计',
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
      locationZh: `走廊旁 · ${formatFtIn(r.coatCloset.w)}×${formatFtIn(r.coatCloset.h)}`,
      formZh: 'Coat / Storage Closet',
      bounds: {
        x: L.X0 + px(r.bedCloset.w),
        y: L.yBedroomBot,
        w: px(r.coatCloset.w),
        h: px(r.coatCloset.h),
      },
      marker: {
        x: L.X0 + px(r.bedCloset.w) + px({ ft: 1, in: 8 }, P),
        y: L.yBedroomBot + px({ ft: 1, in: 7 }, P),
      },
      items: ['外套 / 夹克', '鞋履 · Birkenstock 拖鞋', '电动滑板车', '折叠健身垫', '清洁杂物'],
    },
    {
      id: 's2',
      code: 'S2',
      nameZh: '厨房橱柜 + 干货',
      locationZh: '厨房 · 东墙橱柜',
      formZh: '上柜 + 下柜 + 台面',
      bounds: { x: L.X_END - 58, y: L.Y0 + L.livingH + 20, w: 52, h: px({ ft: 11, in: 0 }, P) },
      marker: { x: L.X_END - 32, y: L.Y0 + L.livingH + px({ ft: 6, in: 0 }, P) },
      items: ['餐具 / 玻璃杯 / 干货', '锅具 / 平底锅', '咖啡设备 · 小家电', '调味 / 囤货'],
    },
    {
      id: 's3',
      code: 'S3',
      nameZh: 'Kallax 方格柜',
      locationZh: '客厅 · 靠隔墙',
      formZh: '开放格 + 抽屉盒',
      bounds: { x: L.X_DIV + 8, y: L.Y0 + px({ ft: 6, in: 0 }, P), w: 48, h: px({ ft: 4, in: 0 }, P) },
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
      marker: { x: L.X_END - px({ ft: 2, in: 0 }, P), y: L.Y0 + px({ ft: 11, in: 0 }, P) },
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
        y: L.yClosetBandBot + px({ ft: 2, in: 0 }, P),
        w: px({ ft: 2, in: 0 }, P),
        h: px({ ft: 3, in: 0 }, P),
      },
      marker: { x: L.X0 + px({ ft: 5, in: 0 }, P), y: L.yClosetBandBot + px({ ft: 3, in: 6 }, P) },
      items: ['护肤 / 洗漱', '毛巾 · 纸品', '清洁工具', '体脂秤'],
    },
    {
      id: 's6',
      code: 'S6',
      nameZh: '卧室壁橱',
      locationZh: `卧室下 · ${formatFtIn(r.bedCloset.w)}×${formatFtIn(r.bedCloset.h)}`,
      formZh: '双折门 · 仅向卧室开启',
      bounds: { x: L.X0, y: L.yBedroomBot, w: px(r.bedCloset.w), h: px(r.bedCloset.h) },
      marker: { x: L.X0 + px({ ft: 3, in: 6 }, P), y: L.yBedroomBot + px({ ft: 1, in: 0 }, P) },
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
      marker: { x: L.X0 + px({ ft: 8, in: 9 }, P), y: L.yBalconyBot + px({ ft: 6, in: 0 }, P) },
      items: ['加湿器', '磨豆机 / 咖啡', '充电 · 小电子', '夜间用品'],
    },
    {
      id: 's8',
      code: 'S8',
      nameZh: '洗衣 / 走廊杂物',
      locationZh: `洗衣间 · ${formatFtIn(r.laundry.w)}×${formatFtIn(r.laundry.h)}`,
      formZh: 'W/D + 清洁囤货',
      bounds: {
        x: L.X0 + px(r.bathroom.w),
        y: L.yLaundryTop,
        w: px(r.laundry.w),
        h: px(r.laundry.h),
      },
      marker: { x: L.X0 + px({ ft: 8, in: 6 }, P), y: L.yLaundryTop + px({ ft: 2, in: 0 }, P) },
      items: ['洗衣液 / 柔顺剂', '清洁用品囤货', '垃圾桶 / 回收', '搬家纸箱'],
    },
  ]
}

/** Editable room keys shown in UI */
export const EDITABLE_ROOM_KEYS = [
  ['balcony', '阳台'],
  ['bedroom', '卧室'],
  ['bedCloset', '卧室壁橱'],
  ['coatCloset', '走廊储物柜'],
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
  const room = /** @type {Record<string, { w: FtIn, h: FtIn }>} */ (next.rooms)[roomKey]
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
  const leftIn = toInches(config.leftCol)
  const closetSum =
    toInches(config.rooms.bedCloset.w) + toInches(config.rooms.coatCloset.w)
  if (closetSum > leftIn) {
    issues.push(
      `壁橱+储物柜总宽 ${formatFtIn(fromInches(closetSum))} 超过左列 ${formatFtIn(config.leftCol)}`,
    )
  }
  if (toInches(config.rooms.bedCloset.door.w) > toInches(config.rooms.bedCloset.w)) {
    issues.push('壁橱双折门宽度不能大于壁橱宽度')
  }
  const bathLaundry =
    toInches(config.rooms.bathroom.w) + toInches(config.rooms.laundry.w)
  if (bathLaundry > leftIn) {
    issues.push(
      `浴室+洗衣间总宽超过左列（${formatFtIn(fromInches(bathLaundry))} > ${formatFtIn(config.leftCol)}）`,
    )
  }
  return issues
}
