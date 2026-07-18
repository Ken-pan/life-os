// 本地演示数据（localhost）—— demoGraphPatch() 返回一层「图层」补丁，
// 合并到 avalon-508 项目上即可点亮 /plan 墙图编辑与 /tidy 整理计划。
// 只补 graph/tidy 层（layoutMode/wallGraph/graphOpenings/zones/placements/viewpoints），
// 绝不碰 SAMPLE_508 的 rooms/walls/furniture/storageZones —— /storage 原样保留。
//
// 坐标系与 wallGraph 对齐：pxPerFt=36 → 3px/英寸（见 spatial/dimensions.js PX_PER_IN=3）。
// 项目 schemaVersion=5，placement 的 w/h 直接以「平面 px」存（= 英寸 × 3），
// 不再走 migratePlacementScale 缩放（见 spatial/model.js）。字段名逐一核对 spatial/types.js。

/** 英寸 → 平面 px（pxPerFt=36 时 PX_PER_IN=3） */
const IN = (inches) => inches * 3

/**
 * 一套 ~21.7ft × 15ft 的两室户型：客厅/厨房/卧室/卫生间四分区，
 * 外墙一圈 + 顶墙一道门；家具铺满四区，卧室刻意摆得挤一点。
 * @returns {Partial<import('./spatial/types.js').SpatialProject>}
 */
export function demoGraphPatch() {
  /** @type {import('./spatial/types.js').WallGraph} */
  const wallGraph = {
    pxPerFt: 36,
    margin: { x: 40, y: 40 },
    vertices: [
      { id: 'v1', x: 80, y: 80 }, // 左上
      { id: 'v2', x: 860, y: 80 }, // 右上
      { id: 'v3', x: 860, y: 620 }, // 右下
      { id: 'v4', x: 80, y: 620 }, // 左下
    ],
    edges: [
      { id: 'e-top', a: 'v1', b: 'v2', exterior: true },
      { id: 'e-right', a: 'v2', b: 'v3', exterior: true },
      { id: 'e-bot', a: 'v3', b: 'v4', exterior: true },
      { id: 'e-left', a: 'v4', b: 'v1', exterior: true },
    ],
  }

  /** @type {import('./spatial/types.js').GraphOpening[]} */
  const graphOpenings = [
    {
      id: 'demo-door-entry',
      edgeId: 'e-top',
      offsetIn: 120,
      spanIn: 36,
      type: 'door',
      style: 'swing',
      swing: 'in',
    },
  ]

  // 四分区平铺内部（竖分割 x=520，横分割 y=380）。多边形贴到外墙，
  // 靠墙的格子由 circulation 自行判为墙、不影响分区归属。
  /** @type {import('./spatial/types.js').SpatialZone[]} */
  const zones = [
    {
      id: 'zone-living',
      nameZh: '客厅',
      color: '#8ecae6',
      polygon: [
        { x: 80, y: 80 },
        { x: 520, y: 80 },
        { x: 520, y: 380 },
        { x: 80, y: 380 },
      ],
      stale: false,
    },
    {
      id: 'zone-kitchen',
      nameZh: '厨房',
      color: '#ffd6a5',
      polygon: [
        { x: 520, y: 80 },
        { x: 860, y: 80 },
        { x: 860, y: 380 },
        { x: 520, y: 380 },
      ],
      stale: false,
    },
    {
      id: 'zone-bedroom',
      nameZh: '卧室',
      color: '#bdb2ff',
      polygon: [
        { x: 80, y: 380 },
        { x: 520, y: 380 },
        { x: 520, y: 620 },
        { x: 80, y: 620 },
      ],
      stale: false,
    },
    {
      id: 'zone-bath',
      nameZh: '卫生间',
      color: '#caffbf',
      polygon: [
        { x: 520, y: 380 },
        { x: 860, y: 380 },
        { x: 860, y: 620 },
        { x: 520, y: 620 },
      ],
      stale: false,
    },
  ]

  /** @type {import('./spatial/types.js').SpatialPlacement[]} */
  const placements = [
    // —— 客厅 ——
    {
      id: 'demo-sofa',
      kind: 'sofa',
      label: '沙发',
      x: 140,
      y: 110,
      w: IN(84),
      h: IN(36),
      rotation: 0,
      zoneId: 'zone-living',
    },
    {
      id: 'demo-coffee-table',
      kind: 'table',
      label: '茶几',
      x: 200,
      y: 250,
      w: IN(40),
      h: IN(22),
      rotation: 0,
      zoneId: 'zone-living',
    },
    // —— 厨房 ——
    {
      id: 'demo-dining-table',
      kind: 'table',
      label: '餐桌',
      x: 600,
      y: 170,
      w: IN(48),
      h: IN(30),
      rotation: 0,
      zoneId: 'zone-kitchen',
    },
    {
      id: 'demo-kitchen-cabinet',
      kind: 'cabinet',
      label: '橱柜',
      x: 560,
      y: 95,
      w: IN(36),
      h: IN(20),
      rotation: 0,
      zoneId: 'zone-kitchen',
    },
    // —— 卧室（刻意摆挤：床 + 床头柜 + 书桌堆在一起）——
    {
      id: 'demo-bed',
      kind: 'bed',
      label: '床',
      x: 110,
      y: 386,
      w: IN(60),
      h: IN(78),
      rotation: 0,
      zoneId: 'zone-bedroom',
    },
    {
      id: 'demo-nightstand',
      kind: 'cabinet',
      label: '床头柜',
      x: 300,
      y: 390,
      w: IN(18),
      h: IN(16),
      rotation: 0,
      zoneId: 'zone-bedroom',
    },
    {
      id: 'demo-desk',
      kind: 'desk',
      label: '书桌',
      x: 340,
      y: 520,
      w: IN(47),
      h: IN(22),
      rotation: 0,
      zoneId: 'zone-bedroom',
    },
    // —— 卫生间 ——
    {
      id: 'demo-vanity',
      kind: 'cabinet',
      label: '洗手台',
      x: 560,
      y: 400,
      w: IN(30),
      h: IN(18),
      rotation: 0,
      zoneId: 'zone-bath',
    },
  ]

  // 机位 + 分轴观察 → /tidy 有活可派。observations 键见 lib/vlm.js OBSERVATION_AXES：
  // trash/dishes/laundry/surfaces/floorClutter/floorDirt/storageMess，各 0–3。
  /** @type {import('./spatial/types.js').SpatialViewpoint[]} */
  const viewpoints = [
    {
      id: 'demo-vp-living',
      x: 300,
      y: 230,
      heading: 180,
      fovDeg: 70,
      zoneId: 'zone-living',
      label: '客厅机位',
      observations: {
        trash: 1,
        dishes: 2,
        laundry: 1,
        surfaces: 2,
        floorClutter: 2,
        floorDirt: 1,
        storageMess: 1,
      },
      describedAt: '2026-07-16T09:00:00.000Z',
    },
    {
      id: 'demo-vp-bedroom',
      x: 300,
      y: 500,
      heading: 0,
      fovDeg: 70,
      zoneId: 'zone-bedroom',
      label: '卧室机位',
      observations: {
        trash: 0,
        dishes: 0,
        laundry: 3,
        surfaces: 2,
        floorClutter: 2,
        floorDirt: 1,
        storageMess: 2,
      },
      describedAt: '2026-07-16T09:05:00.000Z',
    },
  ]

  return {
    layoutMode: 'wallGraph',
    wallGraph,
    graphOpenings,
    zones,
    placements,
    viewpoints,
  }
}
