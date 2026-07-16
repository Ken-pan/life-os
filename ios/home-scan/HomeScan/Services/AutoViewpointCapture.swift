import Foundation
import ARKit
import RoomPlan
import UIKit

/// 自动机位拍照 —— 让扫描「无脑」:App 自己判断「现在这个视角值得留一张
/// 房间状态照」,不需要用户按快门。
///
/// 拍不拍由 `ViewpointGate`(纯函数)裁决,这里只负责取数、编码、落盘。
/// 判定与提示同源:HUD 说的就是**这一刻真正拦住它的那道门**。上一版
/// 六道门各自静默 `return`,提示却只有一句「站稳就会自动拍」—— 用户照做,
/// 而拦路的其实是「太暗」或「这个角度拍过了」,站到天亮也不会拍。
final class AutoViewpointCapture {
    private(set) var capturedInRoom = 0
    private var roomStartedAt = Date()
    private var lastCaptureAt: TimeInterval = 0
    private var lastTransform: simd_float4x4?
    private var lastTime: TimeInterval = 0
    private var busy = false
    private let queue = DispatchQueue(label: "homescan.autoviewpoint", qos: .utility)

    /// 这一刻真正拦住自动拍照的那道门(HUD 用);nil = 没被拦(正要拍/刚拍完)
    private(set) var lastBlock: ViewpointGate.Block?

    // ---- 房间感知的状态照下限(SectionExitNudge 纯函数判定,这里只接线) ----
    /// 当前所在 RoomPlan section 及其状态照计数
    private var sectionState: SectionExitNudge.State?
    /// 催拍提示(HUD 用,级别同「补拍走位」);出现后展示 nudgeShowS 秒
    private(set) var exitNudge: String?
    private var exitNudgeUntil: TimeInterval = 0
    /// 催拍提示的展示时长(秒)—— 人已经在走了,一闪而过等于没说
    static let nudgeShowS: TimeInterval = 8

    func roomChanged() {
        capturedInRoom = 0
        roomStartedAt = Date()
        lastBlock = nil
        sectionState = nil
        exitNudge = nil
        exitNudgeUntil = 0
        // lastCaptureAt 故意不清:6 秒冷却是防「走一步拍一张」,
        // 跨房间一样成立(过了门就是另一间,但手还是那只手)。
    }

    func reset() {
        roomChanged()
        lastCaptureAt = 0
        lastTransform = nil
        lastTime = 0
    }

    /// 手动快门也算这间的状态照 —— 催拍别对着刚按过快门的人喊
    func manualPoseCaptured() {
        sectionState?.photos += 1
    }

    private var secondsInRoom: Double { Date().timeIntervalSince(roomStartedAt) }

    /// 站位引导:这间迟迟拍不上时,告诉用户**到底是什么**拦着(nil = 不用提示)。
    ///
    /// 8 秒就说话(上一版 15 秒):既然现在说得出原因,就没必要让人先干等
    /// 一段再看一句没用的话。
    var hint: String? {
        guard capturedInRoom == 0, secondsInRoom > 8, let block = lastBlock else { return nil }
        return ViewpointGate.hintText(for: block)
    }

    /// 一次评估(主线程,来自 ScanSessionController 的 0.5s 定时器)。
    /// 决定拍时:位姿当场抓,像素编码丢后台,完成回主线程回调。
    /// `roomAreaSqFt`:当前房间地板面积 —— 配额按它伸缩(nil = 还没扫出地板,退 4)。
    func consider(
        frame: ARFrame,
        objects: [CapturedRoom.Object],
        sections: [SectionExitNudge.Section],
        roomAreaSqFt: Double?,
        existingPoses: [FlatScene.CameraPose],
        onCapture: @escaping (FlatScene.CameraPose) -> Void
    ) {
        guard !busy else { return }
        // 跟踪异常有它自己的 HUD 提示(更具体),这里不抢话
        guard case .normal = frame.camera.trackingState else { return }

        let now = frame.timestamp

        // 房间感知下限:即将离开零状态照的分区 → 催一拍(不强拍不阻塞)
        trackSection(frame: frame, sections: sections, now: now)

        // 角速度要两帧才算得出。第一帧只记状态 —— 但**不能**顺手把 lastBlock
        // 清掉,否则 HUD 会在有原因/没原因之间闪。
        guard let last = lastTransform, now > lastTime else {
            lastTransform = frame.camera.transform
            lastTime = now
            return
        }
        let omega = angularDelta(last, frame.camera.transform) / (now - lastTime)
        lastTransform = frame.camera.transform
        lastTime = now

        let (nearestD, nearestDH) = Self.nearestPose(to: frame, among: existingPoses)
        let verdict = ViewpointGate.evaluate(
            ViewpointGate.Input(
                lux: frame.lightEstimate.map { Double($0.ambientIntensity) },
                angularVelocity: omega,
                inViewCount: Self.countInView(objects: objects, frame: frame),
                capturedInRoom: capturedInRoom,
                roomAreaSqFt: roomAreaSqFt,
                secondsInRoom: secondsInRoom,
                secondsSinceLastCapture: now - lastCaptureAt,
                nearestPoseDistanceM: nearestD,
                nearestPoseHeadingDeltaDeg: nearestDH
            )
        )
        switch verdict {
        case .wait(let block):
            // 拒绝分布进摘要(2Hz 逐条记会刷屏):哪道门拦得最多 = ViewpointGate
            // 常数该往哪边调;换门那一下记一条事件,现场时间线可读
            ScanLog.shared.counter { $0.count("gate_\(block)") }
            if block != lastBlock {
                ScanLog.shared.log("ux", "vp_gate", ["block": .string("\(block)")])
            }
            lastBlock = block
            return
        case .capture:
            lastBlock = nil
        }

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
                guard let url else {
                    ScanLog.shared.log("error", "vp_jpeg_failed")
                    return
                }
                self.lastCaptureAt = now
                self.capturedInRoom += 1
                self.sectionState?.photos += 1
                ScanLog.shared.log("scan", "vp_auto_captured", [
                    "inRoom": .num(Double(self.capturedInRoom)),
                ])
                ScanLog.shared.counter { $0.count("vp_auto") }
                var pose = poseNoPhoto
                pose.photoFileURL = url
                // 自动快门有触感:不然用户全程不知道 App 拍没拍、拍了几张
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                onCapture(pose)
            }
        }
    }

    /// 分区跟踪 + 离开催拍(判定在 SectionExitNudge 纯函数里,这里只取数/出话)
    private func trackSection(
        frame: ARFrame,
        sections: [SectionExitNudge.Section],
        now: TimeInterval
    ) {
        if exitNudge != nil, now >= exitNudgeUntil { exitNudge = nil }
        let t = frame.camera.transform
        let pos = SIMD2(Double(t.columns.3.x), Double(t.columns.3.z))
        let (next, leaving) = SectionExitNudge.track(sectionState, pos: pos, sections: sections, now: now)
        sectionState = next
        guard let leaving else { return }
        let name = KindMaps.zoneName(for: [leaving.label])
        // 只催不拍:配额/光线各道门照旧,手动快门也随时能补
        exitNudge = "「\(name)」还没有一张状态照 —— 转身对着它拍一张再走"
        exitNudgeUntil = now + Self.nudgeShowS
        ScanLog.shared.log("ux", "section_exit_nudge", ["label": .string(leaving.label)])
        ScanLog.shared.counter { $0.count("section_exit_nudge") }
    }

    /// 画面中央 84% 区域内、且在相机前方的家具件数
    private static func countInView(objects: [CapturedRoom.Object], frame: ARFrame) -> Int {
        let res = frame.camera.imageResolution
        let inv = frame.camera.transform.inverse
        var n = 0
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
                n += 1
            }
        }
        return n
    }

    /// 与已有机位里「最像」的那个的距离与朝向差。
    /// 取最小距离的那个 —— 视角新度是拿它跟最近的邻居比。
    private static func nearestPose(
        to frame: ARFrame,
        among poses: [FlatScene.CameraPose]
    ) -> (Double?, Double?) {
        let t = frame.camera.transform
        let pos = SIMD2(Double(t.columns.3.x), Double(t.columns.3.z))
        let fwd = SIMD2(-Double(t.columns.2.x), -Double(t.columns.2.z))
        let heading = atan2(fwd.y, fwd.x) * 180 / .pi
        var bestD = Double.infinity
        var bestDH: Double?
        for pose in poses {
            let d = pose.pos - pos
            let dist = (d.x * d.x + d.y * d.y).squareRoot()
            guard dist < bestD else { continue }
            var dh = abs(pose.forwardDeg - heading).truncatingRemainder(dividingBy: 360)
            if dh > 180 { dh = 360 - dh }
            bestD = dist
            bestDH = dh
        }
        return bestD.isFinite ? (bestD, bestDH) : (nil, nil)
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
