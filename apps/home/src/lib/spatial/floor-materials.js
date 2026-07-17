/**
 * 真实地板贴图 —— 程序化生成的 SVG pattern,不用位图素材。
 *
 * 参照专业平面图软件(RoomSketcher / Floorplanner)的「2D 彩色贴图」惯例:
 *   1. 材质按房间类型给默认值:干区木地板、湿区瓷砖、卧室地毯、阳台钢架;
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
import { parseHex, rgbToHsl } from './furniture-tint.js'

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
  { re: /阳台|露台|balcony|patio|terrace/i, mat: 'steel' },
  { re: /deck|木平台/i, mat: 'deck' },
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
 * @param {FloorMaterial} [explicitMat] 该面所属分区/房间显式设的材质。
 *   有就直接用 —— **显式意图赢过湿区推断**。用户家的卫生间是与外连续的木地板,
 *   洁具推断会硬铺砖盖不掉,就靠这个口子让分区的 floor 字段说了算。
 * @returns {string} fill 属性值
 */
export function floorFillForFace(face, wetPoints, horizontal, explicitMat) {
  if (explicitMat) return patternRef(explicitMat, horizontal)
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

// ---- 家具俯视材质色(贴图模式) --------------------------------------
// 按真实户型逐件核过的顶视主色。三条定色原则:
//   1. 以俯视看到的主色为准,不是侧面色;
//   2. 以家具本体色为准 —— 开放/透明收纳取柜体/容器色,不取内容物;
//   3. 材质色分「软兜底」与「硬身份」两类,对扫描的态度不同(见
//      {@link resolveFurnitureColor}):
//      · **软兜底**(木色系的架/桌 + 通用软包办公椅,{@link SOFT_SCAN_SYMBOLS}):
//        WOOD_MED/FABRIC_OFFICE 只是「不确定时的安全猜测」。早先「一律用材质色、
//        完全忽略扫描」把用户家白色的开放层架一刀切成木色 —— 现在这些 symbol 让位
//        给可信的淡中性扫描(白/浅灰):浴室层架、电视边小架变白,主/副办公椅各用
//        自己的扫描色自然分色。
//      · **硬身份**(白柜、银架、瓷洁具、黑电子……):材质是确定的,扫描抓错就抓错,
//        一律用策展色、不采信扫描 —— 这正是「银架不发黄、白柜不发灰、鸟笼不发红」
//        的保证。扫描必错的具体 kind(鸟笼/折叠桌/电视/工作桌)再在 {@link KIND_HEX}
//        里硬锁一层。
//      软装(沙发/床/地毯)的采信策略见 render-svg 调用处。
// 这些色都进 furniture-tint 的 **trusted** 驯化管线(比扫描色更宽的明度区间),
// 好让黑工作桌真的深、白柜真的白;标签可读性靠贴图模式的描边光晕兜底。
//
// 六个「材质系统」,和整张图的视觉语言对齐:
//   白色系 · 浅木系 · 黑/深电子系 · 银/金属系 · 家电钢系 · 石瓷系 · 灰软装系
const WHITE_CABINET = '#f4f4f2' // 白柜体:柜/衣柜/吊柜/浴室柜/净化器/吊扇/体重秤
const WHITE_CUBE = '#f3f3f1' // 格子柜 / 白色滚轮小推车
const WHITE_WIRE = '#f7f7f5' // 白线框:洗衣篮
const WHITE_CAGE = '#f5f5f3' // 白金属围栏 / 鸟笼
const WOOD_MED = '#c79d70' // 中浅暖木:餐桌/书架/挂衣架
const BEDDING = '#f3f1ec' // 床品暖白(床面俯视)
const DESK_BLACK = '#1f2124' // 黑工作桌面
const ELEC_BLACK = '#2e3135' // 黑电子:显示器/摄影灯/滑板车
const SCREEN_GRAY = '#8e8f92' // 中性灰:隔音隔断屏风
const METAL_CHROME = '#b9bec5' // 镀铬金属:置物架/落地灯/挂杆
const METAL_TRASH = '#b6bcc2' // 拉丝不锈钢:垃圾桶
const MIRROR = '#d9dee3' // 镜面银灰:全身镜
const STEEL_APPLIANCE = '#b8bdc3' // 不锈钢家电:冰箱/洗碗机/油烟机/微波炉/灶台
const STEEL_LAUNDRY = '#c7ccd1' // 洗衣机 / 烘干机浅灰
const STONE_COUNTER = '#c9c7c2' // 石台面:台面下柜/中岛
const PORCELAIN = '#f7f7f5' // 洁具瓷白:马桶/浴缸/水槽
const GLASS_SHOWER = '#eef2f4' // 淋浴玻璃浅
const FABRIC_SOFA = '#bcb4a8' // 中性织物:沙发系
const FABRIC_DINING = '#9ea8b2' // 浅灰蓝:餐椅/单椅
const FABRIC_OFFICE = '#c9cdd2' // 浅灰软包:办公椅
const CARPET_RUG = '#d8d0c6' // 地毯 / 瑜伽垫

/** @type {Record<string, string>} 键 = furniture-symbols 的 symbol 名 —— 材质默认色 */
const SYMBOL_HEX = {
  // 白色系
  cabinet: WHITE_CABINET,
  wardrobe: WHITE_CABINET,
  wallCabinet: WHITE_CABINET,
  vanity: WHITE_CABINET,
  purifier: WHITE_CABINET,
  ceilingFan: WHITE_CABINET,
  bathScale: WHITE_CABINET,
  cubeShelf: WHITE_CUBE,
  utilityCart: WHITE_CUBE,
  basket: WHITE_WIRE,
  petPen: WHITE_CAGE,
  // 浅木系
  table: WOOD_MED,
  shelf: WOOD_MED,
  coatRack: WOOD_MED,
  bed: BEDDING,
  // 黑 / 深电子系
  monitor: ELEC_BLACK,
  studioLight: ELEC_BLACK,
  scooter: ELEC_BLACK,
  divider: SCREEN_GRAY,
  // 银 / 金属系
  wireRack: METAL_CHROME,
  floorLamp: METAL_CHROME,
  rod: METAL_CHROME,
  trash: METAL_TRASH,
  mirror: MIRROR,
  // 家电钢系
  fridge: STEEL_APPLIANCE,
  dishwasher: STEEL_APPLIANCE,
  rangeHood: STEEL_APPLIANCE,
  microwave: STEEL_APPLIANCE,
  stove: STEEL_APPLIANCE,
  appliance: STEEL_LAUNDRY,
  // 石 / 瓷系
  counter: STONE_COUNTER,
  island: STONE_COUNTER,
  kitchenSink: PORCELAIN,
  toilet: PORCELAIN,
  tub: PORCELAIN,
  tubShower: PORCELAIN,
  shower: GLASS_SHOWER,
  // 灰软装系
  sofa: FABRIC_SOFA,
  loveseat: FABRIC_SOFA,
  armchair: FABRIC_SOFA,
  chair: FABRIC_DINING,
  officeChair: FABRIC_OFFICE,
  rug: CARPET_RUG,
  mat: CARPET_RUG,
}

/**
 * kind 级硬锁:这些 kind 的扫描主色**已知会误导**,永远用这里的材质色 ——
 * 连淡中性扫描也不让它翻(见 {@link resolveFurnitureColor} 第 1 级)。两类:
 *   · 共用 symbol 需分色:书桌/升降桌/餐桌/折叠桌都是 `table` symbol,但工作面
 *     该黑、折叠桌奶白、餐桌木色;
 *   · 扫描必错:鸟笼被罩布染红、狗笼同理、电视被当白柜、工作桌被灯光/反光洗亮。
 * 查表时 kind 优先于 symbol。
 * @type {Record<string, string>}
 */
const KIND_HEX = {
  desk: DESK_BLACK, // 书桌 / 工作桌:黑面
  standing_desk: DESK_BLACK, // 升降桌:黑面
  folding_table: '#ece7db', // 折叠桌:奶白面
  tv: ELEC_BLACK, // 电视:黑屏(否则走 cabinet symbol 默认白,像白柜)
  // 无专属 symbol、会回落成素方块的 kind —— 显式给材质色,别让它落到扫描杂物色。
  bird_cage: WHITE_CAGE, // 鸟笼:白(扫描惯把罩布/内容物聚成红)
  pet_crate: WHITE_CAGE, // 狗狗木笼:白围栏系
}

/**
 * 扫描主色可信度门槛。iOS HomeScan 的 dominantColorHex 抓错主要两类:
 *   1. 高饱和 —— 罩布 / 内容物 / 花色被聚成主色(红鸟笼、紫折叠桌);
 *   2. 发黑   —— 阴影 / 深腔把整件压成一坨暗斑(鸟笼 #330000、espresso 折叠桌)。
 * 反过来「淡中性」(低饱和 + 够亮)几乎只可能是家具本体的真实浅色 —— 白层架
 * #FFFFFF、近白电视边小架 #D7CBBC、浅木升降边桌 #928372 都落在这里。
 * 所以判据:低饱和 **且** 不发黑 → 可信。
 *
 * 阈值以真实 scan-ce72b155 校准(S=HSL 饱和度, L=明度, 均 0..1):
 *   #FFFFFF S=0.00 L=1.00 · #D7CBBC S=0.25 L=0.79 · #928372 S=0.13 L=0.51  → 全过
 *   #3A2E24 S=0.23 L=0.18(espresso 折叠桌)· #330000 S=1.00 L=0.10(鸟笼)  → 全拦
 * SAT_MAX=0.30:接住 #D7CBBC 这类 S≈0.25 的暖近白,又远低于真木(WOOD_MED
 * #c79d70 S≈0.44)和任何有色罩布,免得把真木架也当成「淡中性」放行;
 * DARK_MIN=0.35:拦住 espresso / 阴影黑斑,同时放过任何真实浅色件。
 */
const TRUST_SAT_MAX = 0.3
const TRUST_DARK_MIN = 0.35

/**
 * 这条扫描主色是否是「可信的淡中性」—— 亮到、且中性到几乎只可能是家具本体真实
 * 浅色,而非罩布 / 内容物 / 阴影。是否**采用**它还要看 symbol 属不属于软兜底
 * (见 {@link resolveFurnitureColor});这里只判「色本身可不可信」。
 * @param {string | undefined} scanHex `attrs.colorHex`
 * @returns {boolean}
 */
export function isTrustworthyScan(scanHex) {
  const rgb = parseHex(scanHex ?? '')
  if (!rgb) return false
  const { s, l } = rgbToHsl(rgb)
  return s <= TRUST_SAT_MAX && l >= TRUST_DARK_MIN
}

/**
 * 「软兜底」symbol —— 这些的材质默认色只是**不确定时的安全猜测**,遇到可信的
 * 淡中性扫描就该让位:
 *   · table / shelf / coatRack:默认 WOOD_MED。木色是对「开放结构件」的通用猜测,
 *     但现代开放架 / 浅色桌常是白 / 浅灰;扫描说浅就信扫描。
 *     (shelf 默认仍留木不改白:它也是 `bookshelf` 书架的 symbol,真木书架该木;
 *      真白层架自带可信白扫描,已被这条接住,不必动默认。)
 *   · officeChair:默认 FABRIC_OFFICE 通用软包灰。同款多件(主 / 副办公椅)靠各自
 *     扫描色自然分色,正是任务要的。
 * 其余 symbol 是**硬身份**(白柜确定白、银架确定金属、瓷洁具确定瓷白、黑电子确定
 * 深)—— 扫描抓错也不采信,一律用策展色。这条边界就是「银架不发黄 / 白柜不发灰」
 * 的护栏(扫描常把它们抓成暖灰,若一并采信就会整屋走色)。
 * @type {Set<string>}
 */
const SOFT_SCAN_SYMBOLS = new Set(['table', 'shelf', 'coatRack', 'officeChair'])

/**
 * 贴图模式下这件家具最终采用的**原始**色(未驯化,交给 furniture-tint 的
 * trusted 宽档去混主题底色)。按可信度分三级,从「最不信扫描」到「最信」:
 *
 *   1. kind 硬锁({@link KIND_HEX}):扫描已知必错的 kind —— 鸟笼(罩布染红)、
 *      折叠桌(espresso 面)、工作桌(要保持炭黑)、电视(要黑屏)。永远用材质色,
 *      连淡中性也不让它翻(否则一束灯光就能把黑桌洗白)。
 *   2. 软兜底 symbol({@link SOFT_SCAN_SYMBOLS})+ 扫描可信({@link isTrustworthyScan})
 *      → 采用扫描本体色。这一级把白层架 / 近白小架 / 浅色桌从「一刀切木色」里救回来,
 *      也让主 / 副办公椅各用自己的扫描色分色。**硬身份 symbol 不进这一级** —— 白柜、
 *      银架、瓷洁具即便扫描是淡中性,也保持策展色不动(红线:不受影响)。
 *   3. 否则回落 symbol 材质默认色({@link SYMBOL_HEX});无默认色的手绘件返回
 *      undefined,调用方回落扫描色 / 图纸灰(与改动前一致)。
 *
 * 注:kind=table 的「工作大桌」若扫描是淡中性,会走第 2 级用扫描色(浅)而非炭黑。
 * 要它保持深炭黑,得让它的 kind 是 desk / standing_desk(→ 第 1 级硬锁 DESK_BLACK),
 * 那是扫描 / 建模侧的事,不在本函数。
 *
 * @param {string | undefined} kind placements 的规范 kind 名
 * @param {string | undefined} symbol furniture-symbols 的 symbol 名
 * @param {string | undefined} scanHex 家具 `attrs.colorHex` 的扫描主色
 * @returns {string | undefined} 原始 #hex,或 undefined = 无类型色且扫描不可信
 */
export function resolveFurnitureColor(kind, symbol, scanHex) {
  if (kind && KIND_HEX[kind]) return KIND_HEX[kind]
  if (symbol && SOFT_SCAN_SYMBOLS.has(symbol) && isTrustworthyScan(scanHex)) {
    return scanHex
  }
  return symbol ? SYMBOL_HEX[symbol] : undefined
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
