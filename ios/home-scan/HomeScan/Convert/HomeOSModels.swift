import Foundation

/// home.scans.payload jsonb 契约(formatVersion 1)。
/// 三处同源:这里 · apps/home/src/lib/spatial/scan-payload.js · apps/home/supabase/README.md。
/// 单位:plan px(pxPerFt=36,y 轴向下,北向上);graphOpenings 的 offset/span 为沿边英寸。
struct ScanPayload: Codable {
    var formatVersion: Int = 1
    var scanId: String
    var homeos: HomeOSProject
    var raw: RawRefs?

    struct RawRefs: Codable {
        var structurePath: String?
        /// RoomPlan 导出的 USDZ 3D 模型(真实空间模式),桶内路径
        var modelPath: String?
    }
}

struct HomeOSProject: Codable {
    var wallGraph: WallGraph
    var graphOpenings: [GraphOpening]
    var zones: [Zone]
    var placements: [Placement]
    var fixtures: [Fixture]
    var viewpoints: [Viewpoint]
    var meta: Meta

    struct WallGraph: Codable {
        var pxPerFt: Double
        var margin: Point
        var vertices: [Vertex]
        var edges: [Edge]
    }

    struct Vertex: Codable {
        var id: String
        var x: Double
        var y: Double
    }

    struct Edge: Codable {
        var id: String
        var a: String
        var b: String
        var exterior: Bool?
    }

    struct Point: Codable {
        var x: Double
        var y: Double
    }

    struct GraphOpening: Codable {
        var id: String
        var edgeId: String
        var offsetIn: Double
        var spanIn: Double
        var type: String    // door | window
        var style: String?  // swing / sliding / fixed …
        var swing: String?  // in | out
    }

    struct Zone: Codable {
        var id: String
        var nameZh: String
        var polygon: [Point]
    }

    /// 家具外观/实测补充信息(2026-07 加法式扩展,旧网页端忽略该字段即可,
    /// formatVersion 仍为 1)。photoPath 上传前为空,上传时回填桶内路径,
    /// 网页端拉取后换成本地 photoRef。
    struct ObjectAttrs: Codable {
        /// RoomPlan 样式属性 key(带枚举前缀,如 "SofaType.lShaped")
        var styleKeys: [String]? = nil
        /// 样式的人话("L形"/"圆形餐桌"/"转椅"…)
        var styleZh: String? = nil
        /// LiDAR 实测高度(英寸)
        var heightIn: Double? = nil
        /// LiDAR 实测平面脚印(英寸,与落盘时的 w/h 一致)。
        /// w/h 之后可能被用户拖改,这两个字段是**永远不动的真值**,
        /// 网页端「恢复实测尺寸」靠它。
        var measuredWIn: Double? = nil
        var measuredHIn: Double? = nil
        /// RoomPlan 识别置信度 high | medium | low
        var confidence: String? = nil
        /// 自动抓拍图提出的主色 #RRGGBB
        var colorHex: String? = nil
        /// 这件家具的实拍裁剪照片(最佳一张),桶内路径 —— 兼容单图消费方
        var photoPath: String? = nil
        /// 多视角证据包(含最佳那张;分数降序)。上传时回填。
        var photos: [ObjectPhoto]? = nil

        struct ObjectPhoto: Codable {
            var path: String
            /// 物体中心 → 相机的俯视方位角(度,0..360)
            var azimuthDeg: Double?
        }

        var isEmpty: Bool {
            styleKeys == nil && styleZh == nil && heightIn == nil
                && measuredWIn == nil && measuredHIn == nil
                && confidence == nil && colorHex == nil && photoPath == nil
                && photos == nil
        }
    }

    struct Placement: Codable {
        var id: String
        var kind: String
        var label: String
        var x: Double
        var y: Double
        var w: Double
        var h: Double
        var rotation: Int   // 0 | 90 | 180 | 270
        var zoneId: String?
        var attrs: ObjectAttrs?
    }

    struct Fixture: Codable {
        var id: String
        var kind: String
        var label: String
        var bounds: Rect
        var rotation: Int?
        var attrs: ObjectAttrs?

        struct Rect: Codable {
            var x: Double
            var y: Double
            var w: Double
            var h: Double
        }
    }

    struct Viewpoint: Codable {
        var id: String
        var x: Double
        var y: Double
        var heading: Double  // 0=平面图正上,顺时针度数
        var fovDeg: Double
        var headingSource: String = "arkit"
        var takenAt: String?
        var camera: String?
        var photoPath: String?  // 桶内路径;网页端拉取时换成本地 photoRef
    }

    struct Meta: Codable {
        var id: String
        var nameZh: String
        var sqft: Double?
        var scanWarnings: [String]
        var sourceNote: String?
    }
}
