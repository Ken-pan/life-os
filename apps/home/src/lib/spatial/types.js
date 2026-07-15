/**
 * HomeOS spatial model types.
 * Graph-based 2D plan — walls/rooms/furniture/storage as first-class entities.
 * Future 3D: extrude walls via {@link toExtrusionHints} without changing this schema.
 */

/** @typedef {'wall' | 'gap' | 'threshold'} WallKind */

/**
 * @typedef {object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {import('./dimensions.js').FtIn} FtIn
 */

/**
 * @typedef {object} RoomDimensions
 * @property {FtIn} w
 * @property {FtIn} h
 */

/**
 * @typedef {object} BedClosetConfig
 * @property {FtIn} w
 * @property {FtIn} h
 * @property {{ w: FtIn, offset: FtIn }} door
 */

/**
 * @typedef {object} OpeningSlotConfig
 * @property {FtIn} offset 沿宿主墙起点偏移
 * @property {FtIn} span 开口宽度/高度
 * @property {FtIn} [offsetFromRight] 入户门等从右缘计
 * @property {boolean} [center] 居中（阳台推拉门）
 * @property {FtIn} [insetLeft]
 * @property {FtIn} [insetRight]
 */

/**
 * @typedef {object} Layout508OpeningsConfig
 * @property {OpeningSlotConfig} bedroomDoor 卧室南墙门（offset 沿南墙从西起；西铰链向走廊下开）
 * @property {OpeningSlotConfig} bathDoor 浴室北墙门（offset 沿北墙从西起；向走廊外开）
 * @property {OpeningSlotConfig} linenDoor 走廊储物柜东墙门（offset 从柜顶起）
 * @property {OpeningSlotConfig} laundryDoor
 * @property {OpeningSlotConfig} entryDoor 入户门（offsetFromRight；西铰链向内开）
 * @property {OpeningSlotConfig} balconyDoor 客厅↔阳台门（offset 沿分隔墙从北起；底铰链向阳台开）
 * @property {OpeningSlotConfig} livingWindow
 * @property {OpeningSlotConfig} bedroomWindow
 */

/**
 * @typedef {object} Layout508Config
 * @property {number} [layoutVersion] 拓扑版本 — 旧版存档整体丢弃
 * @property {number} pxPerFt
 * @property {{ x: number, y: number }} margin
 * @property {FtIn} leftCol
 * @property {FtIn} rightCol
 * @property {Layout508OpeningsConfig} [openings]
 * @property {string[]} [disabledOpenings] 软隐藏门窗 ID（508 拓扑下不拆墙）
 * @property {object} rooms
 * @property {RoomDimensions} rooms.balcony
 * @property {RoomDimensions} rooms.bedroom
 * @property {BedClosetConfig} rooms.bedCloset
 * @property {RoomDimensions} rooms.linenCloset
 * @property {RoomDimensions} rooms.bathroom
 * @property {RoomDimensions} rooms.laundry
 * @property {RoomDimensions} rooms.living
 * @property {RoomDimensions} rooms.kitchen
 * @property {RoomDimensions} rooms.entry
 */

/**
 * @typedef {object} SpatialRoom
 * @property {string} id
 * @property {string} nameZh
 * @property {string} nameEn
 * @property {Rect} bounds
 * @property {string} [fill]
 * @property {'room' | 'circulation' | 'structural'} [kind]
 * @property {RoomDimensions} [dimensions]
 */

/**
 * @typedef {'exterior' | 'interior'} WallRole
 */

/**
 * @typedef {object} SpatialWall
 * @property {string} id
 * @property {Point} from
 * @property {Point} to
 * @property {WallKind} kind
 * @property {WallRole} [role]
 */

/**
 * @typedef {object} SpatialOpening
 * @property {string} id
 * @property {'door' | 'window' | 'ac'} type
 * @property {'swing' | 'bifold' | 'sliding' | 'double' | 'bypass' | 'pocket'} [doorStyle]
 * @property {'fixed' | 'sliding' | 'casement' | 'hung'} [windowStyle]
 * @property {string} [opensInto]
 * @property {string} [pathD]
 * @property {import('./types.js').Rect} [rect]
 * @property {import('./types.js').Rect} [hitRect] gap-sized edit target (not path bbox)
 * @property {import('./types.js').Point} [from]
 * @property {import('./types.js').Point} [to]
 * @property {string} [label]
 */

/**
 * @typedef {object} SpatialFurniture
 * @property {string} id
 * @property {string} roomId
 * @property {Rect} bounds
 * @property {string} label
 * @property {'solid' | 'dashed'} [strokeStyle]
 */

/**
 * One physical thing stored in a zone. Schema v3 held bare strings; v4 promotes
 * them to entities so they can be edited, moved and searched.
 * @typedef {object} SpatialStorageItem
 * @property {string} id
 * @property {string} name
 * @property {number} [qty] 省略 = 1;仅 >1 时显示
 * @property {string[]} [tags]
 * @property {string} [note]
 * @property {number} [updatedAt] epoch ms;迁移数据为 0
 */

/**
 * @typedef {object} SpatialStorageZone
 * @property {string} id
 * @property {string} code
 * @property {string} nameZh
 * @property {string} locationZh
 * @property {string} formZh
 * @property {Rect} bounds
 * @property {Point} marker
 * @property {SpatialStorageItem[]} items
 * @property {boolean} [inferred]
 * @property {string} [zoneId]
 * @property {string} [placementId]
 */

/**
 * @typedef {object} SpatialFurnitureRow
 * @property {string} zoneZh
 * @property {string} objectZh
 * @property {string} noteZh
 */

/**
 * @typedef {object} SpatialMeta
 * @property {string} id
 * @property {string} nameZh
 * @property {string} [unitId]
 * @property {string} [building]
 * @property {number} [sqft]
 * @property {string} [layoutType]
 * @property {string} [status]
 * @property {string} [floorplanUrl]
 * @property {string} [scaleLabel]
 * @property {string[]} [assumptions]
 * @property {string} [sourceNote]
 * @property {number} [planNorthDeg] 平面图正上方对应的真实方位角；罗盘/EXIF 朝向靠它换算。未校准则为空
 */

/**
 * @typedef {object} GraphOpening
 * @property {string} id
 * @property {string} edgeId
 * @property {number} offsetIn 沿边起点偏移（英寸）
 * @property {number} spanIn 开口宽度（英寸）
 * @property {'door' | 'window'} type
 * @property {'swing' | 'sliding' | 'bifold' | 'double' | 'bypass' | 'pocket' | 'fixed' | 'casement' | 'hung'} [style] 门型或窗型，按 type 取值
 * @property {'in' | 'out'} [swing]
 * @property {boolean} [hidden]
 */

/**
 * A built-in fixture: appliances, plumbing, fixed shelving. Part of the unit,
 * not the user's furniture — so unlike SpatialPlacement it is derived from the
 * layout, always drawn, and cannot be dragged.
 * @typedef {object} SpatialFixture
 * @property {string} id
 * @property {string} kind furniture-symbols key
 * @property {string} label
 * @property {Rect} bounds
 * @property {0 | 90 | 180 | 270} [rotation]
 * @property {PlacementAttrs} [attrs]
 */

/**
 * @typedef {object} SpatialZone
 * @property {string} id
 * @property {string} nameZh
 * @property {string} [color]
 * @property {Point[]} polygon
 * @property {boolean} [stale]
 */

/**
 * 家具外观/实测补充信息 —— iOS HomeScan 扫描带来(2026-07 契约加法式扩展),
 * 网页端 VLM「识别外观」也可以补写。全部可选:手摆的家具一个都没有。
 * @typedef {object} PlacementAttrs
 * @property {string[]} [styleKeys] RoomPlan 样式属性(带枚举前缀,如 "SofaType.lShaped")
 * @property {string} [styleZh] 样式的人话("L形"/"圆形餐桌"/"转椅"…)
 * @property {number} [heightIn] LiDAR 实测高度(英寸)
 * @property {number} [measuredWIn] LiDAR 实测脚印宽(英寸)—— w/h 会被用户拖改,这是不动的真值
 * @property {number} [measuredHIn] LiDAR 实测脚印深(英寸)
 * @property {'high'|'medium'|'low'} [confidence] RoomPlan 识别置信度
 * @property {string} [colorHex] 主色 #RRGGBB(设备端抓拍图聚类,或 VLM 识别)
 * @property {string} [photoRef] 这件家具的实拍裁剪照片(最佳一张;IndexedDB,见 photo-store.js)
 * @property {Array<{ photoRef?: string, azimuthDeg?: number }>} [photos]
 *   多视角证据包(按方位分桶,分数降序,第一张 = photoRef 那张)——
 *   一张照片看不出 L 形沙发的另一侧;多视角融合与 VLM 复核都吃它
 * @property {string} [material] 材质(VLM 识别:布艺/皮革/实木…)
 * @property {string} [colorZh] 颜色的人话(VLM 识别:深棕/米白…)
 * @property {string} [describedAt] 上次 VLM 识别时间 ISO
 */

/**
 * 一个轴上的墙锚:家具哪一侧、贴的哪面墙、离多远、在墙上什么位置。
 * @typedef {object} WallAnchorAxis
 * @property {string} edgeId 锚定的墙边 id(wallGraph.edges;结构锁定后是稳定身份)
 * @property {'left'|'right'|'up'|'down'} side 家具哪一侧贴墙
 * @property {number} gapIn 离墙缝隙(垂直于墙,英寸,0.1 精度)
 * @property {number} alongIn 沿墙距离:墙段 lo 端 → 家具近端(英寸,可为负)
 */

/**
 * 家具与最近墙面的空间关系 —— 「桌子真的被挪了 40cm」判断的地基:
 * 中心点位移分不清「扫描漂了」和「家具挪了」,而墙不会动(结构锁定),
 * 墙距是免疫全局漂移的局部真值。只对贴墙(≤30″)的轴记录,居中家具没有
 * 这个字段。由 hydrateProject 在墙图模式下自动维护(纯几何推导,幂等),
 * 不手工编辑;跨扫描比对见 spatial/wall-anchor.js 的 diffWallAnchors。
 * @typedef {object} WallAnchor
 * @property {WallAnchorAxis} [x] 横向锚(左/右墙)
 * @property {WallAnchorAxis} [y] 纵向锚(上/下墙)
 * @property {0 | 90 | 180 | 270} rotation 锚定时的朝向 —— 相对墙的朝向由 side × rotation 完全决定
 */

/**
 * @typedef {object} SpatialPlacement
 * @property {string} id
 * @property {string} kind
 * @property {string} label
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {0 | 90 | 180 | 270} rotation
 * @property {string} [zoneId]
 * @property {PlacementAttrs} [attrs]
 * @property {WallAnchor} [wallAnchor] 与最近墙面的实测关系;见 {@link WallAnchor}
 */

/**
 * 一张实拍照片在平面图上的机位：点 + 朝向 + 视锥。
 * 照片本体不在这里 —— photoRef 指向 IndexedDB（见 lib/photo-store.js），
 * 因为 localStorage 装不下 blob，且内景照片不该离开本机。
 * @typedef {object} SpatialViewpoint
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} heading 0=平面图正上，顺时针度数
 * @property {number} fovDeg 视锥张角
 * @property {string} [zoneId] 落在哪个分区（放置时自动归属）
 * @property {string} [photoRef] IndexedDB 主键；无照片则为空视角
 * @property {string} [label]
 * @property {string} [takenAt] ISO 时间
 * @property {string} [note]
 * @property {string} [camera] EXIF 机型
 * @property {'manual'|'exif'|'compass'|'anchor'|'solved'|'arkit'} [headingSource] 朝向/位置哪来的，按可信度：
 *   **arkit** — iOS HomeScan 扫描时的 ARKit 相机位姿，厘米/度级，与扫描墙体同一坐标系 — 最可信。
 *   **solved** — 三边定位：≥2 件**固定设施**的已知尺寸 + 画面占宽 → 距离 → 交点解出机位与朝向。
 *     实测 ~32cm/7.2°（目录尺寸）、~11cm/1.75°（尺寸量准后）。见 spatial/localize.js。
 *   **anchor** — 只认出画面正中那件固定设施 → 朝向 = 机位→它；位置仍是分区中心。
 *   ⚠️ 定位基准只取 `fixtures[]`（装死的），**不取 `placements[]`** —— 用户挪一次沙发，
 *      所有以它为基准的机位就静默失准。
 *   exif/compass — 室内罗盘粗估，偏 20–40° 常见，仅作初值。
 * @property {string} [anchorId] 定朝向所用的 fixture id
 * @property {number} [fixResidual] 三边定位残差（平面 px）；⚠️ 系统性尺寸偏差下残差会偏小，不能当唯一可信度
 * @property {number} [fixUsed] 参与解算的家具数
 * @property {string} [state] 这块地方的状态（见 vlm.js ROOM_STATES）
 * @property {string[]} [items] VLM 看到的主要物品
 * @property {string} [describedAt] 上次 VLM 识别时间 ISO
 */

/**
 * @typedef {object} SpatialProject
 * @property {number} schemaVersion
 * @property {SpatialMeta} meta
 * @property {{ width: number, height: number }} viewport
 * @property {number} [gridStep]
 * @property {SpatialRoom[]} rooms
 * @property {SpatialWall[]} walls
 * @property {Rect} [outerBounds]
 * @property {SpatialOpening[]} openings
 * @property {SpatialFurniture[]} furniture
 * @property {SpatialStorageZone[]} storageZones
 * @property {SpatialFurnitureRow[]} furnitureInventory
 * @property {Layout508Config} [layoutConfig]
 * @property {'parametric508' | 'wallGraph'} [layoutMode]
 * @property {WallGraph} [wallGraph]
 * @property {GraphOpening[]} [graphOpenings]
 * @property {SpatialZone[]} [zones]
 * @property {SpatialPlacement[]} [placements]
 * @property {SpatialFixture[]} [fixtures]
 * @property {SpatialViewpoint[]} [viewpoints]
 */

/**
 * @typedef {object} WallGraphVertex
 * @property {string} id
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {object} WallGraphEdge
 * @property {string} id
 * @property {string} a
 * @property {string} b
 * @property {boolean} [exterior]
 */

/**
 * @typedef {object} WallGraph
 * @property {number} pxPerFt
 * @property {{ x: number, y: number }} margin
 * @property {WallGraphVertex[]} vertices
 * @property {WallGraphEdge[]} edges
 */

export const SPATIAL_SCHEMA_VERSION = 5
