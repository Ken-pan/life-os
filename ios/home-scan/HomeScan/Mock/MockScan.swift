#if DEBUG
import Foundation
import UIKit

/// 模拟器全链路联调:RoomPlan 不能在模拟器跑,这里手搓一个 FlatScene
/// (两室带门窗/家具/机位,米制,与真实扫描同一数据形状),
/// 转换 → 预览 → 上传全部走真代码,打通 Supabase 而不需要真机。
enum MockScan {
    static func scene() -> FlatScene {
        var s = FlatScene()

        // 卧室 4×3m(左) + 客厅 5×4m(右),整体旋转 12° 检验主方向对齐
        let rot = 12.0 * .pi / 180
        func r(_ x: Double, _ y: Double) -> SIMD2<Double> {
            SIMD2(x * cos(rot) - y * sin(rot), x * sin(rot) + y * cos(rot))
        }

        let corners: [(SIMD2<Double>, SIMD2<Double>)] = [
            // 卧室外圈
            (r(0, 0), r(4, 0)),
            (r(0, 0), r(0, 3)),
            (r(0, 3), r(4, 3)),
            // 共享墙
            (r(4, 0), r(4, 3)),
            // 客厅
            (r(4, 0), r(9, 0)),
            (r(9, 0), r(9, 4)),
            (r(4, 3), r(4, 4)),
            (r(4, 4), r(9, 4)),
        ]
        s.walls = corners.map { .init(a: $0.0, b: $0.1) }

        s.openings = [
            .init(kind: .door, center: r(4, 1.2), widthM: 0.9, wallIndex: 3),
            .init(kind: .window, center: r(2, 0), widthM: 1.2, wallIndex: 0),
        ]

        s.items = [
            .init(category: "bed", center: r(1.2, 1.5), axisDeg: rot * 180 / .pi + 90, widthM: 1.5, depthM: 2.0),
            .init(category: "sofa", center: r(6.5, 3.2), axisDeg: rot * 180 / .pi, widthM: 2.2, depthM: 0.9),
            .init(category: "refrigerator", center: r(8.5, 0.5), axisDeg: rot * 180 / .pi, widthM: 0.7, depthM: 0.7),
            .init(category: "stairs", center: r(5, 2), axisDeg: 0, widthM: 1, depthM: 2), // 应被跳过并告警
        ]

        s.rooms = [
            .init(label: "bedroom", points: [r(0, 0), r(4, 0), r(4, 3), r(0, 3)]),
            .init(label: "livingRoom", points: [r(4, 0), r(9, 0), r(9, 4), r(4, 4)]),
        ]

        // 机位:卧室看床(朝 -y 即户型上方),客厅看沙发
        s.poses = [
            .init(
                pos: r(2, 2.6),
                forwardDeg: atan2(r(0, -1).y, r(0, -1).x) * 180 / .pi,
                fovDeg: 69.4,
                takenAt: Date(),
                camera: "Mock",
                photoFileURL: mockPhoto(hue: 0.6)
            ),
            .init(
                pos: r(6.5, 1),
                forwardDeg: atan2(r(0, 1).y, r(0, 1).x) * 180 / .pi,
                fovDeg: 69.4,
                takenAt: Date(),
                camera: "Mock",
                photoFileURL: mockPhoto(hue: 0.1)
            ),
        ]
        return s
    }

    /// 一张纯色假照片(JPEG 落盘),让照片上传/网页拉取链路有真文件可走
    private static func mockPhoto(hue: CGFloat) -> URL? {
        let size = CGSize(width: 800, height: 600)
        let img = UIGraphicsImageRenderer(size: size).image { ctx in
            UIColor(hue: hue, saturation: 0.5, brightness: 0.9, alpha: 1).setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
        guard let data = img.jpegData(compressionQuality: 0.8) else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("mock-\(UUID().uuidString).jpg")
        try? data.write(to: url)
        return url
    }
}
#endif
