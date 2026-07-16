/**
 * 真实地板贴图 —— 程序化生成的 SVG pattern,不用位图素材。
 *
 * 参照专业平面图软件(RoomSketcher / Floorplanner)的「2D 彩色贴图」惯例:
 *   1. 材质按房间类型给默认值:干区木地板、湿区瓷砖、卧室地毯、阳台户外板;
 *   2. 纹理按真实尺度画:板宽 5 英寸、瓷砖 12 英寸,由 pxPerFt 换算,
 *      放大后看到的仍是「5 英寸的板」而不是一坨噪点;
 *   3. 低对比:纹理只是底色 ±3% 的明度差,房间名/家具压上去仍然可读——
 *      贴图是背景,不是主角。
 *
 * 程序化(而非嵌位图)的理由:随 viewBox 无级缩放不糊、单主题可调色、
 * 零网络请求,而且平面图 SVG 是每次拖拽都整串重渲的,pattern 只进一次 defs,
 * 引用它的 rect 再多也不增加成本。
 *
 * 画布即使暗色模式也固定浅色纸面(见 app.css 的 color-scheme: light 约定),
 * 所以只需要一套浅色配色;CSS 变量留作日后调色的口子。
 */

import { pointInPolygon } from './geometry.js'

/** @typedef {'wood' | 'carpet' | 'tile' | 'deck' | 'steel'} FloorMaterial */

/**
 * 材质选项(UI 选择器用)。value 对应 pattern 名,顺序按常用度。
 * @type {{ value: FloorMaterial, label: string }[]}
 */
export const FLOOR_MATERIALS = [
  { value: 'wood', label: '木地板' },
  { value: 'tile', label: '瓷砖' },
  { value: 'carpet', label: '地毯' },
  { value: 'deck', label: '户外板' },
  { value: 'steel', label: '钢架' },
]

/**
 * 房间名 → 材质的推断规则,自上而下第一条命中即用。
 * 显式 room.floor / zone.floor 优先于推断。
 * @type {Array<{ re: RegExp, mat: FloorMaterial }>}
 */
const MATERIAL_RULES = [
  { re: /浴|卫生|盥洗|bath|toilet|wc|shower/i, mat: 'tile' },
  { re: /洗衣|laundry/i, mat: 'tile' },
  { re: /玄关|门厅|entry|foyer|mud/i, mat: 'tile' },
  { re: /阳台|露台|balcony|patio|deck|terrace/i, mat: 'deck' },
  { re: /卧|bed/i, mat: 'carpet' },
  { re: /壁橱|衣帽|储物|closet|linen|wardrobe|storage/i, mat: 'carpet' },
]

/**
 * @param {...(string | undefined)} names id / 中文名 / 英文名,任一命中即可
 * @returns {FloorMaterial}
 */
export function floorMaterial(...names) {
  const hay = names.filter(Boolean).join(' ')
  for (const rule of MATERIAL_RULES) {
    if (rule.re.test(hay)) return rule.mat
  }
  return 'wood'
}

/**
 * 板材(木地板/户外板)整屋同一个方向铺 —— 真实住宅的地板是连续通铺的,
 * 门洞两侧不换向;方向由调用方按整张图定一次(沿户型长轴)。
 * @param {FloorMaterial} mat
 * @param {boolean} horizontal
 */
function patternRef(mat, horizontal) {
  if (mat === 'wood' || mat === 'deck' || mat === 'steel') {
    return `url(#floor-${mat}-${horizontal ? 'h' : 'v'})`
  }
  return `url(#floor-${mat})`
}

/**
 * @param {import('./types.js').SpatialRoom} room
 * @param {boolean} horizontal 整图板材方向,见 {@link patternRef}
 * @returns {string} fill 属性值
 */
export function floorFillForRoom(room, horizontal) {
  const mat = room.floor ?? floorMaterial(room.id, room.nameZh, room.nameEn)
  return patternRef(mat, horizontal)
}

/**
 * @param {{ nameZh?: string, floor?: FloorMaterial }} zone
 * @param {boolean} horizontal 整图板材方向,见 {@link patternRef}
 * @returns {string} fill 属性值
 */
export function floorFillForZone(zone, horizontal) {
  const mat = zone.floor ?? floorMaterial(zone.nameZh)
  return patternRef(mat, horizontal)
}

/** 见了这些洁具,这块地就是湿区 —— 名字都没有的扫描面也能推出该铺砖。 */
const WET_FIXTURE_KINDS = new Set(['shower', 'toilet', 'bathtub', 'vanity'])
const WET_LABEL_RE = /洗衣|烘干|washer|dryer/i
/** 湿区面积上限(sq ft):比这大的面是「含厨房的大开间」,不整面翻成砖。 */
const WET_FACE_MAX_SQFT = 130

/**
 * 从固定设施里挑出「湿区证据」的中心点,配合 {@link floorFillForFace} 用。
 * @param {Array<{ kind?: string, label?: string, bounds: { x: number, y: number, w: number, h: number } }>} [fixtures]
 * @returns {{ x: number, y: number }[]}
 */
export function wetFixturePoints(fixtures) {
  return (fixtures ?? [])
    .filter(
      (f) => WET_FIXTURE_KINDS.has(f.kind) || WET_LABEL_RE.test(f.label ?? ''),
    )
    .map((f) => ({ x: f.bounds.x + f.bounds.w / 2, y: f.bounds.y + f.bounds.h / 2 }))
}

/**
 * 墙图追出的围合面 → 地板填充。没有名字可推断,就看里面站着什么:
 * 小面积 + 马桶/淋浴/洗衣机 = 湿区铺砖,其余默认木地板。
 * @param {{ polygon: { x: number, y: number }[], areaSqFt: number }} face
 * @param {{ x: number, y: number }[]} wetPoints 来自 {@link wetFixturePoints}
 * @param {boolean} horizontal 整图板材方向,见 {@link patternRef}
 * @returns {string} fill 属性值
 */
export function floorFillForFace(face, wetPoints, horizontal) {
  const wet =
    face.areaSqFt < WET_FACE_MAX_SQFT &&
    wetPoints.some((p) => pointInPolygon(p, face.polygon))
  return wet ? 'url(#floor-tile)' : patternRef('wood', horizontal)
}

const fmt = (n) => Math.round(n * 100) / 100

/**
 * 木纹:横向通铺的板,四行一组,行与行错缝(真实铺法),三档明度轻微交替。
 * @param {string} id
 * @param {number} inch px per inch
 * @param {boolean} vertical
 */
function woodPattern(id, inch, vertical) {
  const pw = 5 * inch // 板宽 5"
  const pl = 46 * inch // 错缝周期,约半块 8ft 板
  // 三档明度差压得很小(ΔL 约 2%):板条感来自缝线,不靠明暗条纹 ——
  // 缩小看是均匀的暖木色,放大才读出板。
  const shades = [
    'var(--plan-wood-a,#e7d7ba)',
    'var(--plan-wood-b,#e3d2b2)',
    'var(--plan-wood-c,#eadabf)',
    'var(--plan-wood-b,#e3d2b2)',
  ]
  const joints = [0.24, 0.74, 0.5, 0.02]
  const line = 'var(--plan-wood-line,#c2ac89)'
  const rows = []
  for (let i = 0; i < 4; i++) {
    const y = fmt(i * pw)
    const jx = fmt(joints[i] * pl)
    rows.push(
      `<rect x="0" y="${y}" width="${fmt(pl)}" height="${fmt(pw)}" fill="${shades[i]}"/>`,
      `<line x1="0" y1="${fmt(y + pw)}" x2="${fmt(pl)}" y2="${fmt(y + pw)}" stroke="${line}" stroke-width="0.8" stroke-opacity="0.55"/>`,
      `<line x1="${jx}" y1="${y}" x2="${jx}" y2="${fmt(y + pw)}" stroke="${line}" stroke-width="0.8" stroke-opacity="0.55"/>`,
    )
  }
  const transform = vertical ? ' patternTransform="rotate(90)"' : ''
  return `<pattern id="${id}" width="${fmt(pl)}" height="${fmt(pw * 4)}" patternUnits="userSpaceOnUse"${transform}>${rows.join('')}</pattern>`
}

/**
 * 户外板:比木地板宽(5.5")、灰调、板缝深且明显(板间真有缝隙)。
 * @param {string} id
 * @param {number} inch
 * @param {boolean} vertical
 */
function deckPattern(id, inch, vertical) {
  const dw = 5.5 * inch
  const len = 24 * inch
  const line = 'var(--plan-deck-line,#a59882)'
  const transform = vertical ? ' patternTransform="rotate(90)"' : ''
  return (
    `<pattern id="${id}" width="${fmt(len)}" height="${fmt(dw * 2)}" patternUnits="userSpaceOnUse"${transform}>` +
    `<rect width="${fmt(len)}" height="${fmt(dw)}" fill="var(--plan-deck-a,#d8cdbb)"/>` +
    `<rect y="${fmt(dw)}" width="${fmt(len)}" height="${fmt(dw)}" fill="var(--plan-deck-b,#d1c5b1)"/>` +
    `<line x1="0" y1="${fmt(dw)}" x2="${fmt(len)}" y2="${fmt(dw)}" stroke="${line}" stroke-width="1.1" stroke-opacity="0.6"/>` +
    `<line x1="0" y1="${fmt(dw * 2)}" x2="${fmt(len)}" y2="${fmt(dw * 2)}" stroke="${line}" stroke-width="1.1" stroke-opacity="0.6"/>` +
    `</pattern>`
  )
}

/**
 * 钢架地面(阳台钢结构):深色金属板,12" 板缝 + 板内极细的防滑纹。
 * 深色地面是刻意的例外 —— 阳台在户型边缘、面积小,一块深色反而把
 * 室内外分开;标签有纸色描边,压在深底上仍可读。
 * @param {string} id
 * @param {number} inch
 * @param {boolean} vertical
 */
function steelPattern(id, inch, vertical) {
  const sw = 12 * inch // 金属板宽
  const len = 24 * inch
  const seam = 'var(--plan-steel-seam,#4b5257)'
  const rib = 'var(--plan-steel-rib,#7d858b)'
  const transform = vertical ? ' patternTransform="rotate(90)"' : ''
  const ribs = []
  // 板内 3 条防滑压纹,细而淡,远看只是金属的哑光质感
  for (let i = 1; i <= 3; i++) {
    const y = fmt((sw * i) / 4)
    ribs.push(
      `<line x1="0" y1="${y}" x2="${fmt(len)}" y2="${y}" stroke="${rib}" stroke-width="0.6" stroke-opacity="0.4"/>`,
    )
  }
  return (
    `<pattern id="${id}" width="${fmt(len)}" height="${fmt(sw)}" patternUnits="userSpaceOnUse"${transform}>` +
    `<rect width="${fmt(len)}" height="${fmt(sw)}" fill="var(--plan-steel-a,#666d72)"/>` +
    ribs.join('') +
    `<line x1="0" y1="${fmt(sw)}" x2="${fmt(len)}" y2="${fmt(sw)}" stroke="${seam}" stroke-width="1.2" stroke-opacity="0.8"/>` +
    `<line x1="${fmt(len)}" y1="0" x2="${fmt(len)}" y2="${fmt(sw)}" stroke="${seam}" stroke-width="1" stroke-opacity="0.5"/>` +
    `</pattern>`
  )
}

/**
 * 浴室/湿区瓷砖:12" 方砖,2×2 一组做极浅的棋盘明度差 + 砖缝。
 * @param {number} inch
 */
function tilePattern(inch) {
  const t = 12 * inch
  const s = fmt(t * 2)
  const grout = 'var(--plan-tile-grout,#c7d2d4)'
  return (
    `<pattern id="floor-tile" width="${s}" height="${s}" patternUnits="userSpaceOnUse">` +
    `<rect width="${s}" height="${s}" fill="var(--plan-tile-a,#e9edee)"/>` +
    `<rect width="${fmt(t)}" height="${fmt(t)}" fill="var(--plan-tile-b,#e3e9ea)"/>` +
    `<rect x="${fmt(t)}" y="${fmt(t)}" width="${fmt(t)}" height="${fmt(t)}" fill="var(--plan-tile-b,#e3e9ea)"/>` +
    `<path d="M 0 0 H ${s} M 0 ${fmt(t)} H ${s} M 0 0 V ${s} M ${fmt(t)} 0 V ${s}" stroke="${grout}" stroke-width="0.9" fill="none"/>` +
    `</pattern>`
  )
}

/**
 * 短毛地毯:细密错位圆点模拟绒面。格 2.5"、点更小更淡 —— 远看是均匀的
 * 织物灰调,放大才看出细绒,不会变成波点桌布。
 * @param {number} inch
 */
function carpetPattern(inch) {
  const c = 2.5 * inch
  const s = fmt(c)
  const q = (f) => fmt(c * f)
  return (
    `<pattern id="floor-carpet" width="${s}" height="${s}" patternUnits="userSpaceOnUse">` +
    `<rect width="${s}" height="${s}" fill="var(--plan-carpet-bg,#eae5d9)"/>` +
    `<circle cx="${q(0.25)}" cy="${q(0.25)}" r="${q(0.06)}" fill="var(--plan-carpet-dot,#dcd5c5)"/>` +
    `<circle cx="${q(0.75)}" cy="${q(0.75)}" r="${q(0.06)}" fill="var(--plan-carpet-dot,#dcd5c5)"/>` +
    `<circle cx="${q(0.75)}" cy="${q(0.25)}" r="${q(0.045)}" fill="var(--plan-carpet-dot2,#e2dccd)"/>` +
    `<circle cx="${q(0.25)}" cy="${q(0.75)}" r="${q(0.045)}" fill="var(--plan-carpet-dot2,#e2dccd)"/>` +
    `</pattern>`
  )
}

// ---- 家具默认材质色(贴图模式) --------------------------------------
// 扫描来的家具带真实主色(attrs.colorHex),走 furniture-tint 的驯化管线;
// 手摆的没有颜色,线稿里回落图纸灰没问题,贴图模式里灰块压在木地板上就
// 出戏了。这里按家具类型给一个"材质常识色",喂进**同一条**驯化管线 ——
// 饱和度/明度夹取、主题混色、标签可读性全部照旧。
const T_WOOD = '#9c7b52' // 木质:桌/柜/架
const T_FABRIC = '#b3a184' // 织物:床/沙发/地毯
const T_METAL = '#78838c' // 金属架/器材
const T_PORCELAIN = '#eef2f2' // 洁具瓷白
const T_APPLIANCE = '#dbe1e5' // 家电亮金属

/** @type {Record<string, string>} 键 = furniture-symbols 的 symbol 名 */
const TEXTURED_FURN_HEX = {
  cabinet: T_WOOD,
  chair: T_WOOD,
  coatRack: T_WOOD,
  counter: T_WOOD,
  cubeShelf: T_WOOD,
  divider: T_WOOD,
  island: T_WOOD,
  shelf: T_WOOD,
  table: T_WOOD,
  wallCabinet: T_WOOD,
  wardrobe: T_WOOD,
  armchair: T_FABRIC,
  bed: T_FABRIC,
  loveseat: T_FABRIC,
  mat: T_FABRIC,
  rug: T_FABRIC,
  sofa: T_FABRIC,
  basket: T_METAL,
  bathScale: T_METAL,
  floorLamp: T_METAL,
  monitor: T_METAL,
  officeChair: T_METAL,
  petPen: T_METAL,
  scooter: T_METAL,
  studioLight: T_METAL,
  trash: T_METAL,
  utilityCart: T_METAL,
  wireRack: T_METAL,
  kitchenSink: T_PORCELAIN,
  mirror: T_PORCELAIN,
  shower: T_PORCELAIN,
  toilet: T_PORCELAIN,
  tub: T_PORCELAIN,
  tubShower: T_PORCELAIN,
  vanity: T_PORCELAIN,
  appliance: T_APPLIANCE,
  ceilingFan: T_APPLIANCE,
  dishwasher: T_APPLIANCE,
  fridge: T_APPLIANCE,
  microwave: T_APPLIANCE,
  purifier: T_APPLIANCE,
  rangeHood: T_APPLIANCE,
  stove: T_APPLIANCE,
}

/**
 * 贴图模式下这类家具的兜底材质色;没有常识色(手绘狗狗等)返回 undefined,
 * 调用方回落图纸灰。
 * @param {string | undefined} symbol furniture-symbols 的 symbol 名
 * @returns {string | undefined}
 */
export function texturedFurnitureHex(symbol) {
  return symbol ? TEXTURED_FURN_HEX[symbol] : undefined
}

/**
 * 全部地板 pattern 的 defs 片段。尺寸由 pxPerFt 决定 —— 贴图始终按真实
 * 比例铺,和图上的墙、家具共享同一把尺子。
 * @param {number} pxPerFt
 */
export function floorPatternDefs(pxPerFt) {
  const inch = pxPerFt / 12
  return [
    woodPattern('floor-wood-h', inch, false),
    woodPattern('floor-wood-v', inch, true),
    deckPattern('floor-deck-h', inch, false),
    deckPattern('floor-deck-v', inch, true),
    steelPattern('floor-steel-h', inch, false),
    steelPattern('floor-steel-v', inch, true),
    tilePattern(inch),
    carpetPattern(inch),
  ].join('\n')
}
