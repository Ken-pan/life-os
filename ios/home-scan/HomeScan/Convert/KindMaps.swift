import Foundation

/// RoomPlan 识别结果 → HomeOS 词表。
/// placement kind 必须在 apps/home/src/lib/spatial/placements.js PLACEMENT_KINDS 里;
/// fixture kind 必须在 furniture-symbols.js BUILDERS 里。
enum KindMaps {
    /// 固定设施(水电位,不可拖):RoomPlan 类目 → (furniture-symbols key, 中文名)。
    /// 这些是网页端照片定位(localize.js)的锚点,所以宁可归为 fixture。
    static let fixtureKinds: [String: (kind: String, label: String)] = [
        "toilet": ("toilet", "马桶"),
        "bathtub": ("tub", "浴缸"),
        "sink": ("kitchenSink", "水槽"),
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

    /// 没有对应符号的类目 —— 跳过并记 scanWarnings
    static let skippedCategories: Set<String> = ["fireplace", "stairs"]

    /// RoomPlan section label → 中文房名
    static let sectionNames: [String: String] = [
        "bedroom": "卧室",
        "livingRoom": "客厅",
        "kitchen": "厨房",
        "bathroom": "卫生间",
        "diningRoom": "餐厅",
        "unidentified": "房间",
    ]

    /// 多 section 地板拼名:["kitchen","livingRoom"] → "厨房·客厅"(去重,最多 3 段)。
    static func zoneName(for labels: [String]) -> String {
        var names: [String] = []
        for label in labels {
            let name = sectionNames[label] ?? "房间"
            if name != "房间", !names.contains(name) { names.append(name) }
        }
        guard !names.isEmpty else { return "房间" }
        return names.prefix(3).joined(separator: "·")
    }
}
