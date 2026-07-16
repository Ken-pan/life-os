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
 * @property {import('./floor-materials.js').FloorMaterial} [floor]
 *   地板材质(真实贴图模式用);省略则按房间名推断
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
 * 这件东西是怎么进这个家的 —— FinanceOS 的购买记录。
 *
 * 来源:finance_transactions.purchase_enrichment(Life OS Supabase)按
 * placements.js 的分类法匹配出的居家商品,人工分拣"还有没有"之后导入
 * (见 spatial/inventory-import.js)。手摆/扫描来的东西没有这个字段。
 *
 * 全部可选:匹配质量参差,缺字段是常态,不是错误。
 *
 * @typedef {object} PurchaseInfo
 * @property {string} [orderId] 商家订单号 —— 回 FinanceOS 对账的锚点
 * @property {'amazon'|'target'|'bestbuy'|string} [src] 购买渠道
 * @property {string} [date] 下单日 YYYY-MM-DD
 * @property {number} [amount] 实付金额(正数,美元)
 * @property {string} [title] 商家原始标题(英文长句;name 是人话短名)
 * @property {string} [imageUrl] 商品图 —— 公开桶,不落本机
 * @property {string} [productUrl] 商品页
 * @property {'A'|'B'|'C'|string} [tier] 分拣时标的重要度
 * @property {'maybe'|string} [disp] 退货存疑(同单被标退货,分不清退的哪件)才落档;
 *   确定退掉/取消的在导入时就被拦下,不会带着这个字段进库
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
 * @property {PurchaseInfo} [purchase] 买来的东西才有;见 {@link PurchaseInfo}
 * @property {number} [level] 在柜内哪一层(0 = 最下层)。柜内实测
 *   ({@link ContainerScanInfo})同步后才有意义,但字段独立存在 ——
 *   没实测过也可以手填「第 2 层」
 */

/**
 * iOS 柜内扫描(能力11)同步进来的内腔实测。来源是桶里的
 * `container-{placementId}.json`(契约见 apps/home/supabase/README.md),
 * 经 scan-identity 匹配挂到储藏区。尺寸英寸,与 attrs.heightIn 一致。
 * @typedef {object} ContainerScanInfo
 * @property {string} scanId 来自哪次扫描
 * @property {string} [capturedAt] ISO 时间
 * @property {{ w: number, d: number, h: number }} interiorIn 内宽/内深/内高
 * @property {{ w: number, d: number, h: number }} [measuredInteriorIn] 用户微调过才有:AR 原始实测
 * @property {number[]} shelfHeightsIn 层板高度(相对内底,自下而上)
 * @property {Array<{ level: number, y0In: number, y1In: number, heightIn: number }>} compartments 自下而上的「层」
 * @property {number} [volumeL] 内腔容积(升)
 */

/**
 * 柜体规格中的一组尺寸。尺寸继续用 RoomPlan 的英寸单位存储，
 * UI 统一换算为厘米；来源和 approximate 不可省略地显示，避免把照片估算
 * 冒充成实测。
 * @typedef {object} StorageMeasurement
 * @property {string} labelZh
 * @property {number} [wIn]
 * @property {number} [dIn]
 * @property {number} [hIn]
 * @property {'roomplan'|'container-scan'|'floorplan'|'product'|'photo-estimate'} source
 * @property {boolean} [approximate]
 */

/**
 * 照片 + RoomPlan + 柜内扫描合并得到的「这个储物区到底有多大、怎么用」。
 * @typedef {object} StorageZoneSpec
 * @property {string} summaryZh 例：「1 组三抽地柜」
 * @property {StorageMeasurement[]} [measurements]
 * @property {string[]} [structureZh] 门/抽屉/层板等可数结构
 * @property {string} [storagePlanZh] 适合放什么
 * @property {string} [ergonomicsZh] 人体工学与动线约束
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
 * @property {ContainerScanInfo} [container] 柜内实测(同步来的;items[].level 以它的层为准)
 * @property {StorageZoneSpec} [spec] 柜体数量、尺寸与收纳动线规划
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
 * @property {{ lat: number, lon: number, elevM?: number, horizAccM?: number,
 *   planNorthDeg?: number, headingAccDeg?: number }} [geo]
 *   扫描现场地理上下文(iOS 采集,2026-07 加法式):GPS + 罗盘北向初值。
 *   阳光模拟的太阳角与窗户朝向靠它免手填;planNorthDeg 在
 *   buildProjectFromScan 里提为正式北向(仅当未校准),原始值留档
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
 * @property {boolean} [fixed] 公寓自带、钉死(马桶/冰箱/内嵌橱柜…):
 *   扫描配对时几何一律以本地为准,扫不到也不消失,不参与「被顶掉」
 */

/**
 * @typedef {object} SpatialZone
 * @property {string} id
 * @property {string} nameZh
 * @property {string} [color]
 * @property {Point[]} polygon
 * @property {boolean} [stale]
 * @property {import('./floor-materials.js').FloorMaterial} [floor]
 *   地板材质(真实贴图模式用);省略则按分区名推断
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
 * @property {PurchaseInfo} [purchase] 这件家具是买来的哪一单;见 {@link PurchaseInfo}
 * @property {boolean} [staged] 清单导入新建、还在画布左上暂存网格里没安家。
 *   动线/占地分析和归位建议都跳过它;用户拖到位(commitPlacementMove)时摘掉
 * @property {number} [clearanceIn] 使用净空覆写(英寸):实测过「这台洗衣机门要 26in」
 *   就以实测为准,布局求解不再用词表默认值
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
 * @property {boolean} [fixed] 公寓自带、钉死(洗衣机/烘干机/内嵌柜/窗式空调…):
 *   扫描永远动不了它(几何以本地为准、扫不到也不消失、不被顶掉);
 *   UI 上结构锁定时挪/转/删都被拦,解锁结构编辑才能动
 * @property {boolean} [locked] 用户锁定位置:布局求解器不许挪它(仍算碰撞障碍),
 *   用户自己照常可拖动/旋转/删除 —— 与 `fixed`(物理钉死)是两回事。
 *   典型用法:把折叠桌拖到想要的位置 → 锁定 → 重算,其余家具围着它重新优化
 * @property {Array<{ type: 'near' | 'far_from', targetId: string, gapIn?: [number, number], zh?: string }>} [relations]
 *   用户指定的家规关系,布局求解按间距罚分:near = 边到边保持在 gapIn 区间
 *   (缺省 [0,24]),far_from = 至少隔开 gapIn[0](缺省 72)。
 *   「宠物粮靠近围栏」「鸟笼远离床」这类词表猜不出的约束写在这里;
 *   目标件被删时关系静默失效
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
 * @property {string} [state] 这块地方的状态（见 vlm.js ROOM_STATES）—— 只是给人看的标题,
 *   打分/派任务一律用 {@link SpatialViewpoint.observations}
 * @property {Record<string, number>} [observations] 分轴观察(见 vlm.js OBSERVATION_AXES):
 *   垃圾/碗筷/衣物/台面堆积/地面杂物/地面脏污/收纳凌乱,各 0–3。
 *   ⚠️ 轴名之间用「/」分隔,别给某个轴套星号强调 —— 星号紧挨着分隔斜杠会拼出
 *      注释结束符,块注释就地闭合,整个 types.js 变语法错误、全 app 起不来
 *      (2026-07-15 真踩过)。要强调请改用「」引号。
 *   一个 `state` 概括不了一间屋子:脏和乱是两根轴(地面很空但落灰 → 要拖地,不是要收纳),
 *   台面和地面是两个动作。老数据只有 state、没有这个字段 —— 消费方须能退化(见 clutter-score.js)
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
