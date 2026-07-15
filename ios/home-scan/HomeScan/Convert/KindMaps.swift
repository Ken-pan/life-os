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
