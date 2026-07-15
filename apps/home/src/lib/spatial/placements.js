/** @typedef {import('./types.js').SpatialPlacement} SpatialPlacement */
/** @typedef {import('./types.js').SpatialFurniture} SpatialFurniture */
/** @typedef {import('./types.js').SpatialZone} SpatialZone */
/** @typedef {import('./types.js').SpatialStorageZone} SpatialStorageZone */

import { findZoneAtPoint, polygonBbox, zoneCentroid } from './zones.js'

/**
 * Furniture catalogue. `w`/`h` are the plan footprint in inches at rotation 0,
 * taken from US residential norms (mattress sizes, 24″ base-cabinet depth,
 * 60×30 alcove tub, 27″ laundry pair) rather than eyeballed.
 *
 * `symbol` picks the plan glyph in furniture-symbols.js — several kinds share
 * one. The original eight keys (bed/sofa/table/chair/cabinet/shelf/washer/
 * fridge) are load-bearing: saved placements store the key, so they keep their
 * names even where a more specific one now exists.
 *
 * Four more properties carry what a footprint alone cannot say. All lengths are
 * inches. Read them through {@link placementSpec}, never off the record — the
 * defaults live there, and a caller that reads `spec.mount` raw gets undefined
 * for the 40-odd kinds that are simply on the floor.
 *
 *   - `mount`     what holds it up. Only 'floor' pieces contest floor area: a
 *                 'wall' upper cabinet and the 'floor' base cabinet beneath it
 *                 overlap in plan, and that is correct — not a collision.
 *   - `elev`      underside height above the floor; 0 for anything floor-borne.
 *   - `tall`      the piece's own height, so `elev + tall` is where its top
 *                 lands. Required — every object has one.
 *   - `storable`  may hold inventory (S1–S8). A cabinet may; a ceiling fan may
 *                 not, and allowing that is how a storage zone ends up
 *                 pointing at a fan.
 *   - `clearance` floor depth needed *in front* to use it: a door swing, a
 *                 drawer pull-out, or code-mandated space. 0 when it needs none.
 *
 * Numbers fixed by the IRC are marked `code`; the rest are industry-standard
 * dimensions or derived from the door/drawer the piece opens.
 *
 * @typedef {'卧室' | '客厅' | '办公' | '厨房' | '卫浴' | '玄关' | '储物'} PlacementGroup
 * @typedef {'floor' | 'wall' | 'ceiling' | 'counter'} PlacementMount
 * @typedef {object} PlacementKind
 * @property {string} label
 * @property {number} w
 * @property {number} h
 * @property {PlacementGroup} group
 * @property {string} symbol
 * @property {number} tall
 * @property {PlacementMount} [mount] default 'floor'
 * @property {number} [elev] default 0
 * @property {boolean} [storable] default false
 * @property {number} [clearance] default 0
 * @property {number} [clearUnder] 台面/床板下的净空高度(英寸):桌腿之间、床底
 *   都是能塞东西的空间 —— 它的「实际占据」只有 [clearUnder, tall] 这一层板。
 *   没有该字段 = 从地到顶都是实心(柜子/冰箱)。叠放判定(桌下柜)靠它。
 * @type {Record<string, PlacementKind>}
 */
export const PLACEMENT_KINDS = {
  bed: { label: '双人床 Queen', w: 60, h: 80, group: '卧室', symbol: 'bed', tall: 25, clearUnder: 7 },
  bed_twin: { label: '单人床 Twin', w: 39, h: 75, group: '卧室', symbol: 'bed', tall: 25, clearUnder: 7 },
  bed_full: { label: '双人床 Full', w: 54, h: 75, group: '卧室', symbol: 'bed', tall: 25, clearUnder: 7 },
  bed_king: { label: '大床 King', w: 76, h: 80, group: '卧室', symbol: 'bed', tall: 25, clearUnder: 7 },
  nightstand: {
    label: '床头柜',
    w: 22,
    h: 18,
    group: '卧室',
    symbol: 'cabinet',
    tall: 24,
    storable: true,
    clearance: 18,
  },
  dresser: {
    label: '五斗柜',
    w: 60,
    h: 20,
    group: '卧室',
    symbol: 'cabinet',
    tall: 32,
    storable: true,
    clearance: 24,
  },
  wardrobe: {
    label: '衣柜',
    w: 48,
    h: 24,
    group: '卧室',
    symbol: 'wardrobe',
    tall: 84,
    storable: true,
    clearance: 36,
  },
  // 52″ 是最常见的吊扇扫风直径。画的是扫风圈而非灯座 —— 平面图上要占地的是叶片。
  // elev 84″ = 叶片离地 7ft，code 下限；低于它人会撞到。
  ceiling_fan: {
    label: '吊扇',
    w: 52,
    h: 52,
    group: '卧室',
    symbol: 'ceilingFan',
    mount: 'ceiling',
    elev: 84,
    tall: 12,
  },
  air_purifier: {
    label: '空气净化器',
    w: 12,
    h: 12,
    group: '卧室',
    symbol: 'purifier',
    tall: 24,
  },

  sofa: { label: '沙发', w: 84, h: 36, group: '客厅', symbol: 'sofa', tall: 32 },
  loveseat: {
    label: '双人沙发',
    w: 58,
    h: 36,
    group: '客厅',
    symbol: 'loveseat',
    tall: 32,
  },
  armchair: {
    label: '单人沙发',
    w: 32,
    h: 34,
    group: '客厅',
    symbol: 'armchair',
    tall: 32,
  },
  coffee_table: {
    label: '茶几',
    w: 48,
    h: 24,
    group: '客厅',
    symbol: 'table',
    tall: 18,
  },
  tv: {
    label: '电视柜',
    w: 60,
    h: 16,
    group: '客厅',
    symbol: 'cabinet',
    tall: 20,
    storable: true,
  },
  desk: { label: '书桌', w: 60, h: 30, group: '客厅', symbol: 'table', tall: 30, clearUnder: 26 },
  table: { label: '餐桌', w: 60, h: 36, group: '客厅', symbol: 'table', tall: 30, clearUnder: 26 },
  chair: { label: '椅', w: 18, h: 18, group: '客厅', symbol: 'chair', tall: 34 },
  // 地毯和瑜伽垫 tall: 1 不是凑数 —— 它们确实只有一指厚，而这正是「踩得过去」
  // 与「绕得开」的分界：高度是这个判断唯一的依据。
  rug: { label: '地毯', w: 96, h: 60, group: '客厅', symbol: 'rug', tall: 1 },
  floor_lamp: {
    label: '落地灯',
    w: 14,
    h: 14,
    group: '客厅',
    symbol: 'floorLamp',
    tall: 60,
  },
  yoga_mat: {
    label: '瑜伽垫',
    w: 68,
    h: 24,
    group: '客厅',
    symbol: 'mat',
    tall: 1,
  },
  pet_pen: {
    label: '宠物围栏',
    w: 36,
    h: 36,
    group: '客厅',
    symbol: 'petPen',
    tall: 24,
  },

  // 两条柴犬。它们占地、会挪窝,而一张没有它们的平面图画的是别人家。
  //
  // 脚印取近正方,是被画稿逼的而不是量出来的:真柴犬俯视约 11″×26″(长条),
  // 但画稿画布是 488×480。非等比会把狗压扁,所以框跟着画走。22″见方 ≈ 3.4 sqft,
  // 比真狗略宽裕,换来的是画不变形、在 36px/ft 下看得清 —— 这两只是画,不是量测。
  // `tall` 是肩高实测:它们钻得过桌子,这在算通行和遮挡时是真信息。
  // storable 当然是 false:狗不是储藏区。
  dog_onyx: { label: 'Onyx', w: 22, h: 22, group: '客厅', symbol: 'shibaOnyx', tall: 16 },
  dog_sard: { label: 'Sard', w: 22, h: 22, group: '客厅', symbol: 'shibaSard', tall: 16 },

  // 办公件和「客厅的桌椅」分开：坐着上一天班的椅子有五星脚和 27″ 回转半径，
  // 餐椅没有；升降桌的深度也不是餐桌那套。混在一组里选不出来。
  // tall 取坐姿 30″；升到站姿约 46″，但平面图关心的是它常态占多高。
  standing_desk: {
    label: '升降桌',
    w: 60,
    h: 30,
    group: '办公',
    symbol: 'table',
    tall: 30,
  },
  office_chair: {
    label: '人体工学椅',
    w: 27,
    h: 27,
    group: '办公',
    symbol: 'officeChair',
    tall: 40,
  },
  // 显示器站在桌面上，不站在地上 —— elev 30 就是桌高。
  monitor: {
    label: '显示器',
    w: 24,
    h: 9,
    group: '办公',
    symbol: 'monitor',
    mount: 'counter',
    elev: 30,
    tall: 20,
  },
  divider: {
    label: '隔音隔断',
    w: 48,
    h: 3,
    group: '办公',
    symbol: 'divider',
    tall: 66,
  },
  folding_table: {
    label: '折叠桌',
    w: 48,
    h: 24,
    group: '办公',
    symbol: 'table',
    tall: 30,
  },
  wire_rack: {
    label: '金属置物架',
    w: 36,
    h: 18,
    group: '办公',
    symbol: 'wireRack',
    tall: 72,
    storable: true,
  },
  // IKEA Kallax 2×2 的实测尺寸，高度同样是实测的 30″。
  cube_shelf: {
    label: '格子柜',
    w: 30,
    h: 15,
    group: '办公',
    symbol: 'cubeShelf',
    tall: 30,
    storable: true,
  },

  fridge: {
    label: '冰箱',
    w: 33,
    h: 30,
    group: '厨房',
    symbol: 'fridge',
    tall: 70,
    storable: true,
    clearance: 36,
  },
  stove: {
    label: '灶台',
    w: 30,
    h: 25,
    group: '厨房',
    symbol: 'stove',
    tall: 36,
    clearance: 30,
  },
  // 水槽是嵌进台面的洞，不是落地件：elev 36 = 标准台面高。
  kitchen_sink: {
    label: '水槽',
    w: 30,
    h: 22,
    group: '厨房',
    symbol: 'kitchenSink',
    mount: 'counter',
    elev: 36,
    tall: 8,
  },
  // 标准嵌入式 24″。symbol 早就画好了，只是一直没接进目录。
  // clearance 24 = 门放平时正好伸出一个门深。
  dishwasher: {
    label: '洗碗机',
    w: 24,
    h: 24,
    group: '厨房',
    symbol: 'dishwasher',
    tall: 34,
    clearance: 24,
  },
  // 吊柜深 12″、下柜深 24″ —— 这是厨房橱柜的行业基数，不是估的。
  // elev 54 = 36″ 台面 + 18″ backsplash，也是行业基数。吊柜和它底下的
  // base_cabinet 在平面上完全重叠，靠 mount/elev 才说得清那不是打架。
  wall_cabinet: {
    label: '吊柜',
    w: 30,
    h: 12,
    group: '厨房',
    symbol: 'wallCabinet',
    mount: 'wall',
    elev: 54,
    tall: 30,
    storable: true,
  },
  base_cabinet: {
    label: '台面下柜',
    w: 30,
    h: 24,
    group: '厨房',
    symbol: 'counter',
    tall: 36,
    storable: true,
    clearance: 24,
  },
  // elev 66 = 灶面 36″ + 抽油烟机离灶面 30″ 的上限。
  range_hood: {
    label: '抽油烟机',
    w: 30,
    h: 20,
    group: '厨房',
    symbol: 'rangeHood',
    mount: 'wall',
    elev: 66,
    tall: 12,
  },
  microwave: {
    label: '微波炉',
    w: 24,
    h: 15,
    group: '厨房',
    symbol: 'microwave',
    mount: 'counter',
    elev: 36,
    tall: 12,
  },
  island: {
    label: '中岛',
    w: 48,
    h: 24,
    group: '厨房',
    symbol: 'island',
    tall: 36,
    storable: true,
    clearance: 36,
  },

  // 卫浴这组的 clearance 21/24 是 IRC R307.1 的硬性下限 —— code，不是惯例。
  // 摆不出这个数的卫浴过不了验收。
  toilet: {
    label: '马桶',
    w: 20,
    h: 28,
    group: '卫浴',
    symbol: 'toilet',
    tall: 30,
    clearance: 21,
  },
  sink: {
    label: '洗手台',
    w: 30,
    h: 21,
    group: '卫浴',
    symbol: 'vanity',
    tall: 32,
    storable: true,
    clearance: 21,
  },
  tub: {
    label: '浴缸',
    w: 60,
    h: 30,
    group: '卫浴',
    symbol: 'tub',
    tall: 20,
    clearance: 24,
  },
  shower: {
    label: '淋浴房',
    w: 36,
    h: 36,
    group: '卫浴',
    symbol: 'shower',
    tall: 78,
    clearance: 24,
  },
  // A shower dropped into a tub-sized alcove — what #508 actually has, and the
  // common retrofit. 30" is the code minimum width.
  shower_alcove: {
    label: '淋浴 · 壁龛',
    w: 30,
    h: 60,
    group: '卫浴',
    symbol: 'shower',
    tall: 78,
    clearance: 24,
  },

  // 浴缸上方装花洒 + 浴帘 —— 照片里 508 卫浴就是这个。和 shower_alcove
  // （同样大小的壁龛、但拆了缸做纯淋浴）是两回事，缸沿要不要跨是实打实的差别。
  // tall 78 是浴帘杆而不是缸沿 —— 这件东西占到的最高点在杆上，
  // 按 20″ 的缸高记会让人以为它上方还能挂吊柜。
  tub_shower: {
    label: '浴缸 · 淋浴两用',
    w: 60,
    h: 32,
    group: '卫浴',
    symbol: 'tubShower',
    tall: 78,
    clearance: 24,
  },

  coat_rack: {
    label: '挂衣架',
    w: 30,
    h: 14,
    group: '玄关',
    symbol: 'coatRack',
    mount: 'wall',
    elev: 60,
    tall: 6,
  },
  shoe_cabinet: {
    label: '鞋柜',
    w: 32,
    h: 14,
    group: '玄关',
    symbol: 'cabinet',
    tall: 40,
    storable: true,
    clearance: 24,
  },
  // 照片里这面镜子是靠墙立在地上的，不是挂的 —— mount 保持 floor。
  floor_mirror: {
    label: '全身镜',
    w: 24,
    h: 4,
    group: '玄关',
    symbol: 'mirror',
    tall: 65,
  },
  scooter: {
    label: '滑板车',
    w: 42,
    h: 8,
    group: '玄关',
    symbol: 'scooter',
    tall: 44,
  },

  cabinet: {
    label: '柜',
    w: 36,
    h: 24,
    group: '储物',
    symbol: 'cabinet',
    tall: 36,
    storable: true,
    clearance: 24,
  },
  shelf: {
    label: '架',
    w: 36,
    h: 12,
    group: '储物',
    symbol: 'shelf',
    tall: 72,
    storable: true,
  },
  bookshelf: {
    label: '书架',
    w: 36,
    h: 12,
    group: '储物',
    symbol: 'shelf',
    tall: 72,
    storable: true,
  },
  // 垃圾桶和洗衣篮装的是「要出门的东西」，不是存放 —— 给它们挂储藏区，
  // 找东西时只会翻出噪音。
  trash: { label: '垃圾桶', w: 14, h: 14, group: '储物', symbol: 'trash', tall: 28 },
  laundry_basket: {
    label: '洗衣篮',
    w: 20,
    h: 15,
    group: '储物',
    symbol: 'basket',
    tall: 24,
  },
  washer: {
    label: '洗衣机',
    w: 27,
    h: 27,
    group: '储物',
    symbol: 'appliance',
    tall: 38,
    clearance: 24,
  },
  dryer: {
    label: '烘干机',
    w: 27,
    h: 27,
    group: '储物',
    symbol: 'appliance',
    tall: 38,
    clearance: 24,
  },
}

/**
 * A catalogue entry with its defaults filled in.
 *
 * Every consumer needs the same four fallbacks, and `PLACEMENT_KINDS` omits
 * them wherever they are the boring answer — most furniture just stands on the
 * floor at elevation 0, holds nothing, and needs no approach depth. Reading the
 * record raw therefore hands you `undefined` for those, which compares wrong
 * rather than failing loudly. Go through here.
 *
 * @param {string} kind
 * @returns {(PlacementKind & { mount: PlacementMount, elev: number, storable: boolean, clearance: number }) | null}
 */
export function placementSpec(kind) {
  const spec = PLACEMENT_KINDS[kind]
  if (!spec) return null
  return { mount: 'floor', elev: 0, storable: false, clearance: 0, ...spec }
}

/** 竖直方向没实测也没规格时按矮件处理的默认高度(英寸) */
const DEFAULT_TALL_IN = 30

/**
 * 一件家具「实际占据」的竖直区间(英寸)—— 叠放判定的地基。
 * 实测优先(attrs.elevIn 底面离地、attrs.heightIn 实测高),没实测退
 * 规格的 elev/tall。带 clearUnder 的(桌/床)腿下是净空,占据只有
 * 台面那一层板:[clearUnder, top]。
 * @param {{ kind: string, attrs?: { elevIn?: number, heightIn?: number } }} p
 * @returns {{ lo: number, hi: number }}
 */
export function verticalBlockRangeIn(p) {
  const spec = placementSpec(p.kind)
  const elev = p.attrs?.elevIn ?? spec?.elev ?? 0
  const hi = elev + (p.attrs?.heightIn ?? spec?.tall ?? DEFAULT_TALL_IN)
  // 台面下净空:实测的 elevIn(桌腿贴地 ≈0)在这里会撒谎,规格优先
  const lo = Math.max(elev, spec?.clearUnder ?? 0)
  return { lo, hi: Math.max(hi, lo) }
}

/** 竖直重叠超过它才算真的撞(英寸)—— 桌下柜顶蹭到桌面板不算 */
const VERTICAL_OVERLAP_TOL_IN = 2

/**
 * 两件家具在竖直方向是否互相让开(桌下柜、格子柜上的电视、台面上方的吊柜):
 * 让开 = 平面重叠也不算「压在一起」。
 * @param {{ kind: string, attrs?: any }} a
 * @param {{ kind: string, attrs?: any }} b
 */
export function verticallyClear(a, b) {
  const ra = verticalBlockRangeIn(a)
  const rb = verticalBlockRangeIn(b)
  const overlap = Math.min(ra.hi, rb.hi) - Math.max(ra.lo, rb.lo)
  return overlap <= VERTICAL_OVERLAP_TOL_IN
}

/**
 * Can this piece hold inventory (S1–S8)?
 * @param {string} kind
 */
export function isStorable(kind) {
  return placementSpec(kind)?.storable ?? false
}

/** @type {PlacementGroup[]} */
export const PLACEMENT_GROUP_ORDER = [
  '卧室',
  '客厅',
  '办公',
  '厨房',
  '卫浴',
  '玄关',
  '储物',
]

/** @returns {[string, typeof PLACEMENT_KINDS[string]][][]} kinds bucketed by group, in PLACEMENT_GROUP_ORDER */
export function placementKindsByGroup() {
  return PLACEMENT_GROUP_ORDER.map((g) =>
    Object.entries(PLACEMENT_KINDS).filter(([, spec]) => spec.group === g),
  )
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
 * Catalogue sizes are inches; placements are stored in plan px.
 * @param {number} inches
 * @param {number} pxPerFt
 */
export function inchesToPx(inches, pxPerFt) {
  return (inches / 12) * pxPerFt
}

/** @param {number} px @param {number} pxPerFt */
export function pxToInches(px, pxPerFt) {
  return (px / pxPerFt) * 12
}

/**
 * Keep a placement's footprint inside the plan canvas.
 *
 * A piece outside the viewBox is both invisible and unclickable — recoverable
 * only by undo. That is reachable in normal use: the drag takes a pointer
 * capture, so releasing well outside the canvas still drops the piece there,
 * and arrow-nudge can walk one out an inch at a time.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {{ width: number, height: number }} viewport
 * @returns {{ x: number, y: number }} top-left, clamped
 */
export function clampPlacementRect(x, y, w, h, viewport) {
  const maxX = Math.max(0, viewport.width - w)
  const maxY = Math.max(0, viewport.height - h)
  return {
    x: Math.min(Math.max(x, 0), maxX),
    y: Math.min(Math.max(y, 0), maxY),
  }
}

/**
 * @param {string} kind
 * @param {number} x
 * @param {number} y
 * @param {SpatialZone[]} zones
 * @param {SpatialPlacement[]} existing
 * @param {number} pxPerFt plan scale — the catalogue is in inches, the plan in px
 */
export function createPlacement(kind, x, y, zones, existing, pxPerFt) {
  const spec = PLACEMENT_KINDS[kind]
  if (!spec) return null
  syncPlacementIdSeq(existing)
  const zone = findZoneAtPoint(zones, { x, y })
  const w = inchesToPx(spec.w, pxPerFt)
  const h = inchesToPx(spec.h, pxPerFt)
  return {
    id: createPlacementId(),
    kind,
    label: spec.label,
    x: x - w / 2,
    y: y - h / 2,
    w,
    h,
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
    const pl = sz.placementId ? plById[sz.placementId] : null
    if (pl) {
      return {
        ...sz,
        bounds: { x: pl.x, y: pl.y, w: pl.w, h: pl.h },
        marker: { x: pl.x + pl.w / 2, y: pl.y + pl.h / 2 },
      }
    }
    const z = sz.zoneId ? zoneById[sz.zoneId] : null
    if (z?.polygon?.length) {
      return { ...sz, bounds: polygonBbox(z.polygon), marker: zoneCentroid(z.polygon) }
    }
    // 指派过、但目标已被删除：bounds/marker 是从那个引用派生出来的，必须跟着消失。
    // 否则删掉房间或家具后，储藏标记会永远浮在原处 —— 指着一个已经不存在的东西。
    // 只在「引用存在但悬空」时清：没有任何引用的（508 默认储藏区自带 bounds）
    // 属于合法的静态位置，动了就会让默认标记在转墙图时集体消失。
    if (sz.placementId || sz.zoneId) {
      return {
        ...sz,
        placementId: undefined,
        zoneId: undefined,
        bounds: undefined,
        marker: undefined,
      }
    }
    return sz
  })
}

/** @type {string[]} */
export const STORAGE_CODES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']
