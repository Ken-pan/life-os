import Foundation

/// RoomPlan 识别结果 → HomeOS 词表。
/// placement kind 必须在 apps/home/src/lib/spatial/placements.js PLACEMENT_KINDS 里;
/// fixture kind 必须在 furniture-symbols.js BUILDERS 里。
enum KindMaps {
    /// 固定设施(水电位,不可拖):RoomPlan 类目 → (furniture-symbols key, 中文名)。
    /// 这些是网页端照片定位(localize.js)的锚点,所以宁可归为 fixture。
    /// ⚠️ 多个类目可映射到同一 kind(oven/stove 都→stove) —— 去重必须在**映射后**
    /// 按 kind 比,否则烤箱灶一体机会在同一坐标画两遍(实测踩过)。
    static let fixtureKinds: [String: (kind: String, label: String)] = [
        "toilet": ("toilet", "马桶"),
        "bathtub": ("tub", "浴缸"),
        "sink": ("kitchenSink", "水槽"), // 卫生间的 sink 由 sinkKind(inBathroom:) 改判
        "stove": ("stove", "灶台"),
        "oven": ("stove", "烤箱"),
        "refrigerator": ("fridge", "冰箱"),
        "dishwasher": ("dishwasher", "洗碗机"),
        "washerDryer": ("appliance", "洗衣机"),
    ]

    /// 可移动家具:RoomPlan 类目 → (PLACEMENT_KINDS key, 中文名)。
    static let placementKinds: [String: (kind: String, label: String)] = [
        "bed": ("bed", "床"),
        "sofa": ("sofa", "沙发"),
        "table": ("table", "桌"),
        "chair": ("chair", "椅"),
        "storage": ("cabinet", "柜"),
        "television": ("tv", "电视"),
    ]

    /// RoomPlan 的 sink 不分厨卫,靠所在功能区改判:卫生间的是洗手台。
    static func sinkKind(inBathroom: Bool) -> (kind: String, label: String) {
        inBathroom ? ("vanity", "洗手台") : ("kitchenSink", "水槽")
    }

    /// iOS 17 样式属性 → 更细的 kind/中文名。key 带枚举类型前缀
    /// ("SofaType.lShaped"),因为 rawValue 会跨枚举撞名(dining 既是椅也是桌)。
    /// 细分 kind 必须仍在 PLACEMENT_KINDS 里(armchair/coffee_table/office_chair/shelf 都有)。
    static func applyStyle(
        baseKind: String,
        baseLabel: String,
        styleKeys: [String]
    ) -> (kind: String, label: String, styleZh: String?) {
        let keys = Set(styleKeys)
        var kind = baseKind
        var label = baseLabel
        var styleZh: String?

        switch baseKind {
        case "sofa":
            if keys.contains("SofaType.singleSeat") {
                kind = "armchair"; label = "单人沙发"; styleZh = "单人"
            } else if keys.contains("SofaType.lShaped") || keys.contains("SofaType.lShapedExtension") {
                label = "L形沙发"; styleZh = "L形"
            } else if keys.contains("SofaType.rectangular") {
                label = "沙发"; styleZh = "直排"
            }
        case "table":
            let round = keys.contains("TableShapeType.circularElliptic")
            if keys.contains("TableType.coffee") {
                kind = "coffee_table"; label = "茶几"; styleZh = round ? "圆形茶几" : "茶几"
            } else if keys.contains("TableType.dining") {
                label = round ? "圆餐桌" : "餐桌"; styleZh = round ? "圆形餐桌" : "餐桌"
            } else if round {
                label = "圆桌"; styleZh = "圆形"
            } else if keys.contains("TableShapeType.lShaped") {
                label = "转角桌"; styleZh = "L形"
            }
        case "chair":
            if keys.contains("ChairType.swivel") {
                kind = "office_chair"; label = "转椅"; styleZh = "转椅"
            } else if keys.contains("ChairType.stool") {
                label = "凳子"; styleZh = "凳"
            } else if keys.contains("ChairType.dining") {
                label = "餐椅"; styleZh = "餐椅"
            }
            if keys.contains("ChairArmType.existing"), styleZh != nil {
                styleZh! += "·带扶手"
            }
        case "cabinet":
            if keys.contains("StorageType.shelf") {
                kind = "shelf"; label = "架子"; styleZh = "开放架"
            } else if keys.contains("StorageType.cabinet") {
                styleZh = "封闭柜"
            }
        default:
            break
        }
        return (kind, label, styleZh)
    }

    /// RoomPlan 置信度 → kind 可信度基线(0..1)。nil(mock/未标)排 low 之上、medium 之下。
    static func kindConfidenceBase(_ confidence: String?) -> Double {
        switch confidence {
        case "high": return 0.9
        case "medium": return 0.72
        case nil: return 0.6
        default: return 0.35 // low
        }
    }

    /// applyStyle 之后的**二次细化 + kindConfidence**。
    ///
    /// RoomPlan 只有一个 `table` 类目:升降桌 / 书桌 / 折叠桌 / 餐桌全塌进去,下游
    /// 拿不回「这是工作桌」。这里靠尺寸/高度把能分的分出来 —— 细分 kind 都在下游
    /// PLACEMENT_KINDS 里(standing_desk 升降桌 / desk 书桌 / folding_table 折叠桌 /
    /// table 餐桌),不会造出下游没有的图形。分不清的**保留 table 但压低 kindConfidence**,
    /// 让网页端标「待复核」而不是硬塞一个错 kind。
    ///
    /// kindConfidence 语义:高 = 有清楚证据(升降桌按台面高、RoomPlan 已判餐桌);
    /// 低 = 纯几何猜(书桌 vs 折叠桌本就难分)。尺寸单位英寸,long/short 为轴对齐
    /// 脚印长短边,heightIn 为台面高(RoomPlan 实测,nil = 没测到)。
    static func refineKind(
        kind: String,
        label: String,
        styleZh: String?,
        confidence: String?,
        longIn: Double?,
        shortIn: Double?,
        heightIn: Double?
    ) -> (kind: String, label: String, styleZh: String?, kindConfidence: Double) {
        let base = kindConfidenceBase(confidence)

        // 只细化通用 table;coffee_table/armchair/office_chair/shelf 等已由样式属性定死。
        // 样式背书的 kind **分类把握保底 0.6**:RoomPlan 的 low 是「包围盒抖」不是
        // 「类目错」——封闭柜就是柜、转椅就是椅,框不准不该把类目标成待复核
        // (0716 真扫:11 件 style 明确的柜/椅全因 low 框置信被压到 0.35,
        // 半张图挂「?」全是噪音;真正该复核的是下面几何猜的 desk/分不清 table)。
        guard kind == "table" else {
            return (kind, label, styleZh, styleZh != nil ? max(base, 0.6) : base)
        }

        // RoomPlan 已判餐桌(TableType.dining → styleZh 含「餐」)/ 圆桌:不猜工作桌,
        // 下游 table 本就是餐桌,给较高可信度。
        if let s = styleZh, s.contains("餐") || s.contains("圆") {
            return (kind, label, styleZh, max(base, 0.8))
        }

        // 升降桌:台面高是最强区分信号(常态坐姿也有 ~38″+,远超餐桌/书桌 29-31″)。
        // 强几何信号不被低框置信拖没:保底 0.7(高度是实测的,框抖类不抖)。
        if let h = heightIn, h >= 38 {
            let conf = h >= 40 ? max(0.7, min(0.9, base + 0.05)) : 0.7
            return ("standing_desk", "升降桌", "升降", conf)
        }

        let lowTop = (heightIn ?? 0) < 34 // 台面不高(排除吧台/升降态)
        // 折叠桌:又长又窄又不高(4-6ft × 18-30in,长宽比大)。
        if let l = longIn, let s = shortIn, l >= 46, s <= 30, l / s >= 2.2, lowTop {
            return ("folding_table", "折叠桌", "折叠", 0.6)
        }
        // 书桌:进深浅、不宽大、不高 —— 但与折叠桌/窄餐桌边界模糊,给低可信度让用户复核。
        if let s = shortIn, s <= 30, (longIn ?? 0) <= 72, lowTop {
            return ("desk", "书桌", styleZh, 0.55)
        }
        // 分不清:保留餐桌,可信度压到复核档(可能是书桌/工作桌)。
        return (kind, label, styleZh, min(base, 0.5))
    }

    /// 没有对应符号的类目 —— 跳过并记 scanWarnings
    static let skippedCategories: Set<String> = ["fireplace", "stairs"]

    /// RoomPlan section label → 中文房名
    static let sectionNames: [String: String] = [
        "bedroom": "卧室",
        "livingRoom": "客厅",
        "kitchen": "厨房",
        "bathroom": "卫生间",
        "diningRoom": "餐厅",
    ]

    /// 多 section 地板拼名:["kitchen","livingRoom"] → "厨房·客厅"(去重,最多 3 段)。
    static func zoneName(for labels: [String]) -> String {
        var names: [String] = []
        for label in labels {
            guard let name = sectionNames[label] else { continue }
            if !names.contains(name) { names.append(name) }
        }
        guard !names.isEmpty else { return "房间" }
        return names.prefix(3).joined(separator: "·")
    }

    /// RoomPlan 认不出功能的区(label=unidentified,实测一次扫描能有 2 个),
    /// 按区内家具反推 —— 总比一律叫「房间」强。
    /// 返回**候选序列**(强信号在前),调用方挑第一个没被占用的:
    /// 真扫有个带{桌,椅,灶台}的区,厨房已被真 section 占了,它其实是餐区。
    static func inferredNames(fromKinds kinds: [String]) -> [String] {
        let set = Set(kinds)
        var out: [String] = []
        if set.contains("bed") { out.append("卧室") }
        if set.contains("sofa") || set.contains("tv") { out.append("客厅") }
        if set.contains("toilet") || set.contains("tub") || set.contains("vanity") { out.append("卫生间") }
        if set.contains("table") && set.contains("chair") { out.append("餐区") }
        if set.contains("stove") || set.contains("fridge") || set.contains("kitchenSink") { out.append("厨房") }
        if set.contains("cabinet") { out.append("储物区") }
        return out
    }
}
