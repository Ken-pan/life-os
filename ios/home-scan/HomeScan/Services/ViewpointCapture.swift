import Foundation
import ARKit
import CoreImage
import UIKit

/// 扫描中的拍照快门:抓当前 ARFrame 的相机位姿 + 画面 JPEG。
/// 位姿与 RoomPlan 墙体同一世界坐标系(共享 ARSession),
/// 这正是 headingSource:'arkit' 比网页端罗盘/EXIF 可信的原因。
enum ViewpointCapture {
    static let maxEdgePx: CGFloat = 2048
    static let jpegQuality: CGFloat = 0.8

    /// 从共享 ARSession 抓一张机位(手动快门,同步编码)。失败返回 nil。
    static func capture(from session: ARSession) -> FlatScene.CameraPose? {
        guard let frame = session.currentFrame else { return nil }
        let photoURL = writeJpeg(frame.capturedImage)
        return pose(from: frame, photoFileURL: photoURL, camera: UIDevice.current.model)
    }

    /// 位姿字段(不碰像素):AutoViewpointCapture 复用 —— 位姿在主线程抓,
    /// 像素编码丢后台。
    static func pose(from frame: ARFrame, photoFileURL: URL?, camera: String) -> FlatScene.CameraPose {
        let cam = frame.camera
        let t = cam.transform

        // 相机前向 = 本地 -z 轴;投到俯视 (x, z)
        let forward = SIMD2(-Double(t.columns.2.x), -Double(t.columns.2.z))
        let forwardDeg = atan2(forward.y, forward.x) * 180 / .pi
        let pos = SIMD2(Double(t.columns.3.x), Double(t.columns.3.z))

        // 水平视场角:2·atan(w / 2fx)
        let fx = Double(cam.intrinsics.columns.0.x)
        let imgW = Double(cam.imageResolution.width)
        let fovDeg = 2 * atan(imgW / (2 * fx)) * 180 / .pi

        return FlatScene.CameraPose(
            pos: pos,
            forwardDeg: forwardDeg,
            fovDeg: fovDeg,
            takenAt: Date(),
            camera: camera,
            photoFileURL: photoFileURL
        )
    }

    /// CVPixelBuffer(横向) → 竖持方向 JPEG(长边 ≤2048),写进临时目录。
    static func writeJpeg(_ pixelBuffer: CVPixelBuffer) -> URL? {
        var image = CIImage(cvPixelBuffer: pixelBuffer).oriented(.right)
        let longEdge = max(image.extent.width, image.extent.height)
        if longEdge > maxEdgePx {
            let scale = maxEdgePx / longEdge
            image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        }
        let context = CIContext()
        guard
            let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
            let data = context.jpegRepresentation(
                of: image,
                colorSpace: colorSpace,
                options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: jpegQuality]
            )
        else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("vp-\(UUID().uuidString).jpg")
        do {
            try data.write(to: url)
            return url
        } catch {
            return nil
        }
    }
}
