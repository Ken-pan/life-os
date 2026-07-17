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
        /// 洞口高度(英寸,LiDAR 实测,2026-07 加法式)
        var heightIn: Double? = nil
        /// 窗台高(英寸,底边离地,2026-07 加法式):窗下家具规划的依据;门不发
        var sillIn: Double? = nil
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
        /// LiDAR 实测底面离地高度(英寸)。省略/0 = 落地;>0 = 架空
        /// (吊柜/挂墙电视…)—— 网页端叠放关系(桌下柜、柜上电视)靠它
        var elevIn: Double? = nil
        /// LiDAR 实测平面脚印(英寸,与落盘时的 w/h 一致)。
        /// w/h 之后可能被用户拖改,这两个字段是**永远不动的真值**,
        /// 网页端「恢复实测尺寸」靠它。
        var measuredWIn: Double? = nil
        var measuredHIn: Double? = nil
        /// RoomPlan 识别置信度 high | medium | low
        var confidence: String? = nil
        /// 自动抓拍图提出的主色 #RRGGBB(多视角共识)
        var colorHex: String? = nil
        /// 主色可信度(0..1,2 位小数,2026-07 加法式):多视角共识后的稳健度。
        /// 下游据此区分「可信的白」(高)与「猜的红/罩布色」(低),低可信时可弱化上色、
        /// 提示用户复核。缺省 = 旧数据没这个信号。
        var colorConfidence: Double? = nil
        /// kind 识别可信度(0..1,2 位小数,2026-07 加法式):RoomPlan 置信度 + 细分把握。
        /// 尺寸/高度清楚区分出的(升降桌按台面高)偏高;几何猜的(书桌 vs 折叠桌)偏低,
        /// 下游可对低可信 kind 标「待复核」。缺省 = 旧数据没这个信号。
        var kindConfidence: Double? = nil
        /// 这件家具的实拍裁剪照片(最佳一张),桶内路径 —— 兼容单图消费方
        var photoPath: String? = nil
        /// 最佳抓拍图的感知哈希(dHash,16 位 hex,2026-07-16 加法式;与网页 photo-hash.js
        /// 逐位同源)。设备侧现算并上传 —— 网页端优先用它、缺失才自派生,跨扫描外观认亲
        /// 靠它认回尺寸抖动的柜子(汉明 ≤10 强加分)。
        var photoHash: String? = nil
        /// 多视角证据包(含最佳那张;分数降序)。上传时回填。
        var photos: [ObjectPhoto]? = nil

        struct ObjectPhoto: Codable {
            var path: String
            /// 物体中心 → 相机的俯视方位角(度,0..360)
            var azimuthDeg: Double?
        }

        /// 真实朝向与 90° 网格的偏角(度,2026-07 加法式):rotation 只有
        /// 0/90/180/270,斜摆家具(转角钢琴/斜置沙发)的真朝向靠它;
        /// 基本贴轴(≤3°)不发。语义:真朝向 = rotation + yawDeg
        var yawDeg: Double? = nil

        var isEmpty: Bool {
            styleKeys == nil && styleZh == nil && heightIn == nil && elevIn == nil
                && measuredWIn == nil && measuredHIn == nil
                && confidence == nil && colorHex == nil && colorConfidence == nil
                && kindConfidence == nil && photoPath == nil && photoHash == nil
                && photos == nil && yawDeg == nil
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
        /// 公寓自带、钉死(优化副本才带;iPhone 扫描不发,可选字段编码时省略)。
        /// 设备端「现实核对」用它:钉死件没扫到不算「消失」
        var fixed: Bool?
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
        /// "full"(缺省)/"partial":房间更新 —— 网页端只动扫到的那片
        var scanScope: String?
        /// 扫描诊断摘要(2026-07 加法式,ScanLog 聚合):阶段耗时/卡顿峰值/
        /// 内存峰值/降级秒数/门控拒绝分布/上传流量… 纯数值键值对。
        /// 网页端只透传展示,不参与任何合并逻辑。契约三处同源:此处 +
        /// apps/home/supabase/README.md + web scan-payload.js(meta 展开透传)
        var scanDiagnostics: [String: Double]?
        /// 吊顶高(英寸,墙板高中位数,LiDAR 实测,2026-07 加法式):
        /// 吊柜/高架储物规划与 3D 视图的纵向标尺
        var ceilingHeightIn: Double?
        /// 扫描现场地理上下文(2026-07 加法式):GPS + 平面图北向初值。
        /// 网页端「阳光模拟」的太阳角与窗户朝向靠它免手填;
        /// planNorthDeg 是罗盘初值(室内有磁偏),仅在网页端北向未校准时回填
        var geo: Geo?

        struct Geo: Codable {
            var lat: Double
            var lon: Double
            /// 海拔(米,GPS 垂直通道有效时才发)
            var elevM: Double?
            /// GPS 水平精度(米)
            var horizAccM: Double?
            /// 平面图正上方对应的真实方位角(0=北,顺时针)
            var planNorthDeg: Double?
            /// 罗盘样本精度中位数(度) —— 网页端据此措辞"仅供参考"
            var headingAccDeg: Double?
        }
    }
}
