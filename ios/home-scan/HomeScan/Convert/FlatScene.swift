import Foundation

/// 3D 扫描压平后的 2D 中间层(米,ARKit 世界 XZ 平面的俯视图:x 右,z 下)。
/// 俯视图与楼层平面同手性,直接 (x, z) → (planX, planY) 不需要镜像。
/// StructureFlattener 从 RoomPlan 产出它;PlanProjector 把它变成 HomeOS plan px。
/// 与 RoomPlan 类型解耦,转换数学在模拟器单测里可全覆盖。
struct FlatScene {
    struct WallSeg {
        var a: SIMD2<Double>
        var b: SIMD2<Double>
        /// RoomPlan 未标注内外;先全按非承重内墙处理,导出时 exterior 留空
        var confidenceLow: Bool = false
    }

    enum OpeningKind: String {
        case door
        case window
        /// RoomPlan 的 opening(无门扇的洞口) —— 导出为 door + 无样式
        case opening
    }

    struct Opening {
        var kind: OpeningKind
        var center: SIMD2<Double>
        var widthM: Double
        /// 宿主墙在 walls 数组里的下标;RoomPlan parentIdentifier 缺失时为 nil,投影时找最近共线墙
        var wallIndex: Int?
    }

    struct Item {
        /// RoomPlan 类目名(KindMaps 的 key,如 "bed" / "sofa" / "refrigerator")
        var category: String
        var center: SIMD2<Double>
        /// 物体局部 +x 轴在俯视图上的角度(度,自 +x 轴起逆时针为正 —— atan2 惯例)
        var axisDeg: Double
        var widthM: Double   // 物体局部 x 向尺寸
        var depthM: Double   // 物体局部 z 向尺寸
    }

    struct RoomPoly {
        /// RoomPlan section label 原文(如 "bedroom"),无则 nil
        var label: String?
        var points: [SIMD2<Double>]
    }

    struct CameraPose {
        var pos: SIMD2<Double>
        /// 相机前向(-z)在俯视图上的角度(度,atan2 惯例,自 +x 逆时针)
        var forwardDeg: Double
        var fovDeg: Double
        var takenAt: Date
        var camera: String?
        /// 本机临时 JPEG 路径;上传时换算桶内路径
        var photoFileURL: URL?
    }

    var walls: [WallSeg] = []
    var openings: [Opening] = []
    var items: [Item] = []
    var rooms: [RoomPoly] = []
    var poses: [CameraPose] = []
    var warnings: [String] = []
}
