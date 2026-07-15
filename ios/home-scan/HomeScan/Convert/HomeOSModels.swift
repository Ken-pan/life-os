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
        var structurePath: String
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
    }

    struct Fixture: Codable {
        var id: String
        var kind: String
        var label: String
        var bounds: Rect
        var rotation: Int?

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
