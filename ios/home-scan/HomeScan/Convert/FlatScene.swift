import Foundation

/// 3D 扫描压平后的 2D 中间层(米,ARKit 世界 XZ 平面的俯视图:x 右,z 下)。
/// 俯视图与楼层平面同手性,直接 (x, z) → (planX, planY) 不需要镜像。
/// StructureFlattener 从 RoomPlan 产出它;PlanProjector 把它变成 HomeOS plan px。
/// 与 RoomPlan 类型解耦,转换数学在模拟器单测里可全覆盖。
struct FlatScene {
    struct WallSeg {
        var a: SIMD2<Double>
        var b: SIMD2<Double>
        /// 墙板高度(米,RoomPlan dimensions.y)。全屋中位数 = 吊顶高
        var heightM: Double = 0
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
        /// 洞口高度(米,dimensions.y);0 = 未知
        var heightM: Double = 0
        /// 底边离地(米):窗 = 窗台高;门通常 ≈0
        var elevM: Double = 0
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
        var heightM: Double = 0  // 物体局部 y 向尺寸(实测高)
        /// 底面离地高度(米)。0 = 落地;>0 = 架空(吊柜/挂墙电视/桌下净空里的东西)——
        /// 叠放关系(桌下柜、柜上电视)在网页端靠它判「立体上互相让开」
        var elevM: Double = 0
        /// RoomPlan 识别置信度("high"/"medium"/"low";mock 为 nil)
        var confidence: String? = nil
        /// RoomPlan iOS 17 样式属性,带类型前缀防跨枚举撞名
        /// (如 "SofaType.lShaped"、"TableType.coffee" —— 见 KindMaps.applyStyle)
        var styleKeys: [String] = []
        /// 扫描中自动抓拍的这件家具的照片(最佳视角裁剪;无则 nil)
        var photoFileURL: URL? = nil
        /// 从抓拍图提出的主色(#RRGGBB)
        var colorHex: String? = nil
        /// 多视角证据包(分数降序,第一张 = photoFileURL 那张)
        var photos: [ObjectPhoto] = []
    }

    /// 一张家具抓拍图 + 它是从哪个方位拍的
    struct ObjectPhoto {
        var fileURL: URL
        /// 物体中心 → 相机的俯视方位角(度,0..360;mock 可为 nil)
        var azimuthDeg: Double?
        var score: Double = 0
    }

    struct RoomPoly {
        /// 落在此地板内的全部 RoomPlan section label(如 ["kitchen","livingRoom"])。
        /// 一次扫描常横跨多个功能区,单标签会把整层误命名成第一个撞上的。
        var labels: [String] = []
        var points: [SIMD2<Double>]
    }

    /// RoomPlan 的功能区中心点(kitchen/bedroom/bathroom/unidentified)。
    /// 实测:全屋扫描常只给 1 块地板 + 多个 section —— 分区只能靠它切,
    /// 否则家具全挤进同一个区,zoneId 失去意义。
    struct Section {
        var label: String
        var center: SIMD2<Double>
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
    var sections: [Section] = []
    var poses: [CameraPose] = []
    var warnings: [String] = []
}
