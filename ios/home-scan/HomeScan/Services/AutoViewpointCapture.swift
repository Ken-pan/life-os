import Foundation
import ARKit
import RoomPlan
import UIKit

/// 自动机位拍照 —— 让扫描「无脑」:App 自己判断「现在这个视角值得留一张
/// 房间状态照」,不需要用户按快门。
///
/// 什么算「值得拍」(全部满足才拍):
/// - 画面稳:追踪 normal、相机没在甩(阈值比家具抓拍更严 —— 整屋照片糊了没得裁)
/// - 光线够:暗光下颜色/状态都不可信
/// - 看得全:画面里能数出 ≥2 件家具(≈ 对着房间而不是对着墙角);
///   本房间第一张放宽到 ≥1 件,免得空房/玄关永远拍不上
/// - 视角新:与已有机位(含手动拍的)相比,移动 ≥1m 或转向 ≥40°
/// - 不轰炸:每间最多 4 张、两张之间 ≥6 秒
///
/// 拍不上时它会给出**站位引导**(hint),ScanView 显示在 HUD 上 ——
/// 「引导用户到某个位置,然后自己拍」就是这两件事的组合。
final class AutoViewpointCapture {
    static let minIntervalS: TimeInterval = 6
    static let minTravelM = 1.0
    static let minHeadingDeltaDeg = 40.0
    static let maxPerRoom = 4
    static let minAmbient: CGFloat = 250
    static let maxAngularVelocity = 0.5

    private(set) var capturedInRoom = 0
    private var roomStartedAt = Date()
    private var lastCaptureAt: TimeInterval = 0
    private var lastTransform: simd_float4x4?
    private var lastTime: TimeInterval = 0
    private var busy = false
    private let queue = DispatchQueue(label: "homescan.autoviewpoint", qos: .utility)

    func roomChanged() {
        capturedInRoom = 0
        roomStartedAt = Date()
    }

    func reset() {
        roomChanged()
        lastCaptureAt = 0
        lastTransform = nil
        lastTime = 0
    }

    /// 站位引导:这间迟迟拍不上时告诉用户怎么站(nil = 不用提示)
    var hint: String? {
        let elapsed = Date().timeIntervalSince(roomStartedAt)
        guard capturedInRoom == 0, elapsed > 15 else { return nil }
        return "退到能看到大半个房间的位置,平稳停一秒 —— 会自动拍照"
    }

    /// 一次评估(主线程,来自 ScanSessionController 的 0.5s 定时器)。
    /// 决定拍时:位姿当场抓,像素编码丢后台,完成回主线程回调。
    func consider(
        frame: ARFrame,
        objects: [CapturedRoom.Object],
        existingPoses: [FlatScene.CameraPose],
        onCapture: @escaping (FlatScene.CameraPose) -> Void
    ) {
        guard !busy, capturedInRoom < Self.maxPerRoom else { return }
        guard case .normal = frame.camera.trackingState else { return }

        let now = frame.timestamp
        guard now - lastCaptureAt > Self.minIntervalS else { return }
        if let lux = frame.lightEstimate?.ambientIntensity, lux < Self.minAmbient { return }

        // 相机在甩 → 糊,跳过这帧
        if let last = lastTransform, now > lastTime {
            let w = angularDelta(last, frame.camera.transform) / (now - lastTime)
            lastTransform = frame.camera.transform
            lastTime = now
            if w > Self.maxAngularVelocity { return }
        } else {
            lastTransform = frame.camera.transform
            lastTime = now
            return // 第一帧没有速度参考,下个 tick 再说
        }

        // 看得全:画面里能数出几件家具(中央 84% 区域内、在相机前方)
        let res = frame.camera.imageResolution
        let inv = frame.camera.transform.inverse
        var inView = 0
        for object in objects {
            let c = object.transform.columns.3
            let cam = inv * SIMD4(c.x, c.y, c.z, 1)
            guard cam.z < -0.5 else { continue }
            let p = frame.camera.projectPoint(
                SIMD3(c.x, c.y, c.z),
                orientation: .landscapeRight,
                viewportSize: res
            )
            if p.x >= res.width * 0.08, p.x <= res.width * 0.92,
               p.y >= res.height * 0.08, p.y <= res.height * 0.92 {
                inView += 1
            }
        }
        let need = capturedInRoom == 0 ? 1 : 2
        // 空房兜底:这间 20 秒还一件家具都框不到(玄关/走廊),放它拍环境照
        let emptyRoomFallback =
            capturedInRoom == 0 && Date().timeIntervalSince(roomStartedAt) > 20
        guard inView >= need || emptyRoomFallback else { return }

        // 视角新:与已有机位(含手动)比,挪得够远或转得够多
        let t = frame.camera.transform
        let pos = SIMD2(Double(t.columns.3.x), Double(t.columns.3.z))
        let fwd = SIMD2(-Double(t.columns.2.x), -Double(t.columns.2.z))
        let heading = atan2(fwd.y, fwd.x) * 180 / .pi
        for pose in existingPoses {
            let d = pose.pos - pos
            let dist = (d.x * d.x + d.y * d.y).squareRoot()
            var dh = abs(pose.forwardDeg - heading).truncatingRemainder(dividingBy: 360)
            if dh > 180 { dh = 360 - dh }
            if dist < Self.minTravelM && dh < Self.minHeadingDeltaDeg { return }
        }

        // 值得拍:位姿主线程抓好,像素编码丢后台(一次只保留 1 个 buffer)
        busy = true
        let pixelBuffer = frame.capturedImage
        let poseNoPhoto = ViewpointCapture.pose(
            from: frame,
            photoFileURL: nil,
            camera: "\(UIDevice.current.model) · auto"
        )
        queue.async { [weak self] in
            let url = ViewpointCapture.writeJpeg(pixelBuffer)
            DispatchQueue.main.async {
                guard let self else { return }
                self.busy = false
                guard let url else { return }
                self.lastCaptureAt = now
                self.capturedInRoom += 1
                var pose = poseNoPhoto
                pose.photoFileURL = url
                // 自动快门有触感:不然用户全程不知道 App 拍没拍、拍了几张
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                onCapture(pose)
            }
        }
    }

    private func angularDelta(_ a: simd_float4x4, _ b: simd_float4x4) -> Double {
        let qa = simd_quatf(simd_float3x3(
            SIMD3(a.columns.0.x, a.columns.0.y, a.columns.0.z),
            SIMD3(a.columns.1.x, a.columns.1.y, a.columns.1.z),
            SIMD3(a.columns.2.x, a.columns.2.y, a.columns.2.z)
        ))
        let qb = simd_quatf(simd_float3x3(
            SIMD3(b.columns.0.x, b.columns.0.y, b.columns.0.z),
            SIMD3(b.columns.1.x, b.columns.1.y, b.columns.1.z),
            SIMD3(b.columns.2.x, b.columns.2.y, b.columns.2.z)
        ))
        let d = abs((qa.inverse * qb).angle)
        return Double(d > .pi ? 2 * .pi - d : d)
    }
}
