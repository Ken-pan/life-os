/**
 * HomeOS spatial model types.
 * Graph-based 2D plan — walls/rooms/furniture/storage as first-class entities.
 * Future 3D: extrude walls via {@link toExtrusionHints} without changing this schema.
 */

/* ============================================================================
 * 重新扫描契约(RE-SCAN CONTRACT)—— 单一权威定义
 *
 * 「再扫一次」到底动了什么?每个字段只属于两类之一。用户反复纠正的东西
 * (kind/颜色/地板/锁/朝向/透光)绝不因重扫被冲掉;而扫描更强的东西
 * (墙几何/新检测件/未锁件位置/面积)该随新扫描更新。判据:**这个值是用户
 * 的意图/判断,还是扫描的观察?** 前者保全,后者更新。
 *
 * 两条重扫路径,保全机制不同(见 lib/cloud-scan.js pullScan):
 *   • furniture 合并路径 —— mapScanIntoLayout + mergeFurnitureWithIdentity。
 *     从 ...current 起手,做**家具身份配对**(scan-identity.js),逐件保全。
 *   • replace 整包路径 —— buildProjectFromScan → applyCloudScan。全新 SpatialProject,
 *     只保全**户型级**用户覆盖层(scan-merge.js carryCanonicalScan);家具/储物由
 *     服务端优化副本自身携带,按设计整包覆盖(UI 有二次确认 + 一步撤销)。
 *
 * ┌─ 权威 / 用户意图(重扫**不覆盖**)──────────── 保全者 ────────────────────┐
 * │ placement.kind(用户改过的)   attrs.userEdited∋'kind' → carryUserAuthored │
 * │ attrs.colorHex(用户改过的)   attrs.userEdited∋'colorHex' → 同上          │
 * │ placement.label(自定义名)     prev.label ?? n.label(名字跟身份走)        │
 * │ placement.locked(布局锁)       carryUserAuthored 显式 carry(扫描不含此字段)│
 * │ placement.relations(家规)      同上                                        │
 * │ attrs.identityLocked 的整件     reconcile 锁定件分支:kind/label/几何全冻结  │
 * │ placement/fixture.fixed 的整件  reconcile 钉死件分支:几何以本地为准        │
 * │ zone.floor(分区地板)           carryCanonicalScan 按分区名认亲            │
 * │ meta.planNorthDeg(朝向校准)    carryCanonicalScan(手校 > 罗盘初值 > 旧值)│
 * │ graphOpening.opaque(不透光)    carryCanonicalScan 按开口中点就近认亲      │
 * │ storageZones / items(储物)     furniture 路径从 ...current 起手天然保全    │
 * └────────────────────────────────────────────────────────────────────────────┘
 * ┌─ 扫描派生 / 易变(重扫**更新**)────────────────────────────────────────────┐
 * │ 墙体几何 wallGraph / walls        扫描/优化副本重建(508 手录户型仍以本地为准)│
 * │ 新检测到的家具/设施               reconcile 判「新增」进项目                 │
 * │ 未锁件的位置 x/y/rotation         身份配对后取新扫描几何(锁定/钉死件除外)   │
 * │ 家具实测尺寸 w/h、attrs.measured* LiDAR 实测,随新扫描更新                   │
 * │ 面积 / 分区多边形                 随扫描/优化副本更新                        │
 * │ kind/colorHex(**未**被用户改过)  取扫描新值(样式精化本就该更新分类/主色)  │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * 关键区分:merge 靠 attrs.userEdited(provenance 章)分清「用户设的白」和
 * 「扫描猜的白」—— 只保全前者。盖章在 updatePlacement({...},{userEdit:true}),
 * 保全在 scan-merge.js。改这张表要同步改那两处的实现与单测(scan-merge-unit.mjs)。
 * ========================================================================== */

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
 * 物品生命周期(规范 §2.4)。比单纯的「物品类别」更重要 —— 决定放哪、催不催清退。
 * @typedef {'daily' | 'current-project' | 'replenish' | 'low-freq' | 'collection' | 'return-pending' | 'sell' | 'donate' | 'trash'} LifecycleState
 */

/**
 * 使用频率(规范 §3.5–3.6)。喂 storage-plan 的 REACH 取物高度带。
 * @typedef {'daily' | 'weekly' | 'monthly' | 'seasonal' | 'rare'} UseFrequency
 */

/**
 * 宠物风险类型(规范 §4.2)。一件物品可同时属于多种(如药物既 meds 又 toxic),
 * 所以 {@link SpatialStorageItem.petRisks} 是数组。判定见 spatial/pet-safety.js。
 * @typedef {'toxic' | 'cord' | 'chew' | 'small-parts' | 'food' | 'plastic-bag' | 'meds'} PetRisk
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
 * @property {LifecycleState} [lifecycleState] 生命周期(规范 §2.4):比物品类别更重要,
 *   决定取物摩擦与清退路由
 * @property {UseFrequency} [useFrequency] 使用频率:喂 REACH 取物高度带
 * @property {'light'|'medium'|'heavy'} [weight] 轻重:过肩放重物是腰伤第一来源
 * @property {PetRisk[]} [petRisks] 自动检测的宠物风险(可多种);见 spatial/pet-safety.js。
 *   用户覆写走 {@link SpatialStorageItem.petRiskOverride},二者分离
 * @property {{ mode: 'explicit-safe'|'custom', risks?: PetRisk[], reason?: string, at: string }} [petRiskOverride]
 *   用户对风险的覆写。explicit-safe = 用户显式判安全;custom = 自定风险集。
 *   单独存,不用 petRisks=null,免得一点就把自动检出的药品风险清零
 * @property {Array<'heat'|'humidity'|'light'|'freeze'>} [envSensitive] 环境敏感:别把食品囤在灶台上方
 * @property {boolean} [dailyCopy] 一类一归属里的「每日使用份」标记(vs 库存份)
 * @property {{ w?: number, d?: number, h?: number }} [sizeIn] 物品几何(英寸);容量数值化
 *   ({@link SpatialStorageZone.capacityState} 的 fillPct)只在区内尺寸够全时才出
 * @property {boolean} [stackable] 可堆叠 —— 容量估算用
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
 * 储物区容量的**定性**态(规范 §6.3, 评审 B4)。几何容量 ≠ 可用容量:
 * 一个箱子即使还能塞 10%,若已无法正常取物,应视为 `functional-full`。
 * 数值 fillPct 只在区内物品尺寸够全时才另外给(见 spatial/capacity.js),
 * 数据不足则 `unknown` —— 不臆造精度。
 * @typedef {'unknown' | 'available' | 'near-full' | 'functional-full'} CapacityState
 */

/**
 * 满载判定的证据(规范 §9.2:不确定就标记来源,不自信猜)。
 * @typedef {object} CapacityEvidence
 * @property {'user' | 'photo' | 'geometry'} source
 * @property {string} at ISO 时间
 * @property {'overflow' | 'blocked-access' | 'cannot-close' | 'requires-unstacking' | 'volume-estimate'} reason
 */

/**
 * 储物区的**可达性**(规范 §4.2, 评审 B5)。宠物危险判定必须消费它 ——
 * 50cm 高但在带门防护柜内 ≠ 放在开放篮里。可由柜内扫描或用户填。
 * @typedef {object} ZoneAccess
 * @property {boolean} open 开放式(无门无盖)
 * @property {boolean} closable 有门/盖可关
 * @property {boolean} petProof 宠物打不开
 * @property {boolean} lockable 可锁扣
 * @property {number} heightCm 取物口离地高度
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
 * @property {CapacityState} [capacityState] 定性容量态(规范 §6.3)。省略视为 unknown
 * @property {CapacityEvidence} [capacityEvidence] 满载判定的来源与理由
 * @property {ZoneAccess} [zoneAccess] 可达性,宠物危险判定用(规范 §4.2)
 * @property {boolean} [inbox] 是否是全屋**唯一**待处理箱(规范 §6.5)。写时经
 *   capacity.js 的 enforceSingleInbox 强制唯一
 * @property {number} [fillPct] 数值填充率 —— **仅**当区内物品尺寸够全时由 capacity.js 计算;
 *   否则不存(不伪造精度)
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
 * @property {{ reachInCm: number, canJumpToCounter: boolean, chews: boolean, opensCabinets: boolean }} [petSafety]
 *   宠物能力(规范 §4.1):**用户可配,非品种默认**。宠物危险判定的可触带靠它。
 *   缺省 → pet-safety.js 用保守默认
 * @property {string} [truthPatchApplied] 已应用的功能真源补丁 id(规范 §10, 评审 B3)。
 *   项目级幂等标记 —— 不用全局 schemaVersion 代替项目级迁移记录。见 lib/home-truth-patch.js
 */

/**
 * @typedef {object} GraphOpening
 * @property {string} id
 * @property {string} edgeId
 * @property {number} offsetIn 沿边起点偏移（英寸）
 * @property {number} spanIn 开口宽度（英寸）
 * @property {'door' | 'window'} type
 * @property {'swing' | 'sliding' | 'bifold' | 'double' | 'bypass' | 'pocket' | 'fixed' | 'casement' | 'hung'} [style] 门型或窗型，按 type 取值
 * @property {boolean} [opaque] 不透光覆写(网页端人工标):阳光模拟不从这里进光。
 *   衣柜推拉门被扫成 sliding、镜面误检成窗时用;跨扫描按中点就近保全
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
 * 家具/表面的**真实用途**键。规范 §1.1 的核心:HomeOS 不能只凭 kind 推断用途。
 * 词表在 spatial/function-truth.js 的 FUNCTIONS 注册表(单一权威),这里只标类型。
 * @typedef {string} FunctionKey
 */

/**
 * 用途证据的来源,即优先链的档位。**无歧义**:不再同时有 `user` 和 `confirmed`。
 * `user` = UI 里用户亲手确认;`user-session-import` = 种子补丁写入、待用户确认;
 * `document`/`scan` = 旧规划/扫描线索;`guess` = 按 kind 的兜底(今天的唯一行为)。
 * 注意:**照片不在这条链里** —— 照片只产生 functionDrift 提示,永不进 effective。
 * @typedef {'user' | 'user-session-import' | 'document' | 'scan' | 'guess'} FunctionSource
 */

/**
 * 一件家具/表面的**分源用途证据**(规范 §1.1, 评审 B1)。意图与观察分离:
 * `byUser`/`bySessionImport`/`byDocument`/`byScan` 参与 effective 解析;
 * `observedByPhoto` 只用于生成「柜里出现非本职用品」提示,**绝不重定义职责**。
 * effective = byUser ?? bySessionImport ?? byDocument ?? byScan ?? guess(见 function-truth.js)。
 * @typedef {object} PlacementFunctionEvidence
 * @property {{ key: FunctionKey, at: string }} [byUser] 仅 UI 确认可写
 * @property {{ key: FunctionKey, at: string }} [bySessionImport] 种子补丁写、待确认(见 lib/home-truth-patch.js)
 * @property {{ key: FunctionKey }} [byDocument] 旧规划文档线索
 * @property {{ key: FunctionKey }} [byScan] 扫描类目线索(网页侧派生)
 * @property {{ key: FunctionKey, at: string, confidence: number }} [observedByPhoto] VLM 观察,永不进 effective
 * @property {Array<{ key: FunctionKey, source: FunctionSource, at: string }>} [history] 纠正历史(带来源+时间),取代裸 string[]
 */

/**
 * 表面**策略**(规范 §1.3, 评审 B2)。四种 mode 的整理行为完全不同 —— 尤其
 * `prohibited-storage`(炉灶/围栏顶/通风口)是「发现任何物品即高优清空」,与
 * `fixed-equipment`(保留批准设备)相反,不能混为一谈。覆写用;默认由
 * function-truth.js 的 surfaceTypeOf() 按用途+kind 派生。
 * @typedef {object} SurfacePolicy
 * @property {'core-operation' | 'fixed-equipment' | 'temporary-activity' | 'prohibited-storage'} mode
 * @property {string[]} [allowedCategories] fixed-equipment:批准长期放的类目(微波炉/InstantPot/蛋白粉)
 * @property {number} [minFreePct] core-operation:使用后要恢复的最低可操作面积占比
 * @property {number} [maxTemporaryHours] temporary-activity:临时占用的截止小时数
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
 * @property {number} [colorConfidence] 设备侧抓色置信度 0..1(iOS ObjectShotCapture:
 *   主色簇纯度 × 可用像素占比 × 多方位共识度,2026-07-16 加法式)。低 = 罩布/内容物/
 *   反光把物体搅花了,这条主色别太当真。floor-materials 的 {@link isTrustworthyScan}
 *   拿它当第二道闸:即便采样色恰好淡中性,置信度 <0.5 也不采信。省略=老扫描,不设闸
 * @property {number} [kindConfidence] 分类置信度 0..1(iOS KindMaps.refineKind,2026-07-16
 *   加法式)。低 = kind 是靠几何猜的(如按尺寸把 table 细分 desk),该让用户复核;
 *   高 = RoomPlan 直接判定或强几何信号(台面高→standing_desk)。省略=老扫描
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
 * @property {PlacementFunctionEvidence} [function] 分源用途证据(规范 §1.1)。
 *   意图 vs 观察分离,effective 解析见 spatial/function-truth.js。手摆/未确认件为空
 * @property {SurfacePolicy} [surfacePolicy] 表面策略覆写(规范 §1.3)。省略则由
 *   function-truth.js 的 surfaceTypeOf() 按用途+kind 派生默认
 * @property {string[]} [userEdited] **provenance 章**:用户手动改过、扫描无权在
 *   重扫时覆盖的权威字段名(见文件顶部「重新扫描契约」)。取值 `'kind'`/`'label'`/
 *   `'colorHex'` —— 字段名不管它住顶层还是 attrs。由 state.svelte.js 的
 *   updatePlacement({...}, { userEdit: true }) 在用户改动时盖章;VLM「识别外观」
 *   写 colorHex **不盖**(那是扫描猜的,该随新扫描更新)。merge 据此只保全前者
 * @property {string[]} [scanAliases] 用户纠正的一等数据:「扫描惯把这件误检成哪些
 *   kind」(与 iOS 端字段名一致)。scan kind ∈ 本表时视同同 kind 参与身份配对 ——
 *   不吃跨族否决、不吃罚分。用户改 kind 时旧 kind 自动入表(见 updatePlacement),
 *   使 table→standing_desk 后重扫仍认得出是同一件。判定见 scan-identity.js
 * @property {boolean} [identityLocked] 用户逐件校对过身份(与 iOS 端字段名一致):
 *   kind/label/几何以本地为准,扫描无权改、扫不到也不消失,只允许吸收照片等外观
 *   attrs。比 userEdited 更强:userEdited 只保全被标的字段,identityLocked 冻结整件
 */

/* ============================================================================
 * 物体识别层(OBJECT RECOGNITION LAYER)—— 服务端表,非 payload
 *
 * 这两个 typedef 描述 Supabase `home.object_observations` / `home.object_embeddings`
 * 两张表的行(migration 20260717120000),**不是**扫描 payload 的一部分,也不进
 * SpatialPlacement。它们是「跨扫描认亲 + 视觉 embedding」的独立载体:
 *   • payload/attrs 只到「这次扫描的这件观察」;
 *   • ObjectObservation 把历次观察按永久身份(canonicalObjectId)串起来累积;
 *   • ObjectEmbedding 给每张裁剪存版本化的视觉向量(DINOv2 实例特征)。
 * 采集端不变:裁剪 JPEG 早已在 home-scan-photos 桶(obj-{observationId}-{k}.jpg)。
 * 契约与 supabase/migrations/20260717120000_home_object_recognition.sql +
 * supabase/README.md 同源,改一处三处同步。
 * ========================================================================== */

/**
 * `home.object_observations` 的一行:某次扫描里的某个物体观察。
 * scans.payload 里 per-object 数据的规范化投影 + 跨扫描永久身份 + 匹配证据。
 * 事实字段(dims/colorHex/dhash/photoPaths)一次扫描定死;可回写的只有
 * canonicalObjectId 与 match(模型/规则升级后重算认亲)。
 * @typedef {object} ObjectObservation
 * @property {string} scanId 这次扫描的 id(→ home.scans.id)
 * @property {string} observationId 那次扫描的 pl-N / fx-N(payload 内 id)
 * @property {string} [canonicalObjectId] 跨扫描永久身份;承接 scan-merge
 *   carryUserAuthored 的 id 延续语义。同一件家具的历次观察共享它;未认亲前为空
 * @property {string} [kind]
 * @property {string} [label]
 * @property {{ wIn?: number, hIn?: number, heightIn?: number, elevIn?: number }} dims LiDAR 实测
 * @property {string} [colorHex]
 * @property {number} [colorConfidence]
 * @property {number} [kindConfidence]
 * @property {string} [dhash] 最佳裁剪感知哈希(16 hex,与 photo-hash.js 同源)
 * @property {string[]} photoPaths 多角度裁剪桶内路径(obj-{observationId}-{k}.jpg)
 * @property {number[]} [azimuths] 与 photoPaths 同序的方位角(度)
 * @property {number} observedAt 客户端毫秒(= scan updatedAt / capturedAt)
 * @property {ObjectMatchDecision} [match] 匹配器对这次观察的判定 + 候选打分 + 证据
 */

/**
 * 匹配器对一次观察的认亲决定(存进 ObjectObservation.match)。
 * 「保存所有候选分数和最终决定」的落点 —— 升级规则/模型后可回放对比,防倒退。
 * @typedef {object} ObjectMatchDecision
 * @property {'same_unchanged'|'same_moved'|'possibly_same'|'added'|'removed'} state
 * @property {string} [chosenCanonicalId] 最终认定的永久身份(added 时为空)
 * @property {Array<{ canonicalId: string, score: number, breakdown: Record<string, number> }>} candidates
 *   全体候选及其融合分与分项(size/pos/color/dhash/vision/…),按分降序
 * @property {string} [resolver] 判定路径('global-assignment'/'geometry-only'/…)
 * @property {string} [modelVersion] 参与本次判定的视觉模型版本
 * @property {string} [calibrationVersion] 参与本次判定的权重校准版本
 */

/**
 * `home.object_embeddings` 的一行:某张裁剪在某个模型版本下的视觉向量。
 * 版本化存储(不裸存 Float 当永久格式);不引 pgvector —— 家具量小,匹配时
 * 拉候选向量暴力余弦即可。dim 显式存不写死;模型升级换 modelVersion 追加新行。
 * @typedef {object} ObjectEmbedding
 * @property {string} photoPath 对应裁剪(桶内路径,全库唯一含 scanId)
 * @property {string} modelVersion 版本化模型标识,如 'dinov2-vitb14@2026-07'
 * @property {string} scanId
 * @property {string} observationId
 * @property {string} [canonicalObjectId] 冗余一份便于按家具聚向量;认亲后回填
 * @property {number} dim 向量维数(随模型变,不写死)
 * @property {number[]} embedding L2 归一化后的向量;余弦=点积
 * @property {string} [calibrationVersion] 这批向量面向的匹配器校准版本
 * @property {string} [source] 产出来源('mac-dinov2'/Vision revision…),排查用
 * @property {string} [cropRecipeVersion] 裁剪配方版本;变了要重算,勿与旧向量混比
 * @property {number} createdAt 客户端/服务端毫秒
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
