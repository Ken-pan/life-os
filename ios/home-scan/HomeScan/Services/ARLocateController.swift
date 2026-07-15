import Foundation
import Observation
import ARKit
import simd

/// AR 寻物的定位器 —— 不开 RoomPlan,用普通 ARKit 的**竖直平面**当墙,
/// 走与扫描相同的 HomeFrame 配准把手机对齐到永久户型坐标,然后把目标
/// (储藏区/家具在户型里的位置)变换回相机世界系,给方向和距离。
///
/// 为什么竖直平面够用:配准只吃「轴对齐墙段」,ARKit 对露出来的墙面
/// 给的平面锚点(中心+宽度+朝向)正好是墙段;家具挡住一半也不要紧 ——
/// 1D 投票本来就吃部分墙。认不出位置时如实说「再走动走动」,不瞎指。
@Observable
final class ARLocateController: NSObject, ARSessionDelegate {
    let session = ARSession()

    /// 竖直平面锚点 → 俯视墙段(随 didUpdate 原地更新)
    private var wallByAnchor: [UUID: (a: SIMD2<Double>, b: SIMD2<Double>)] = [:]
    private var lastRegisterAt: TimeInterval = 0
    private var canonicalSegments: [HomeFrame.Segment] = []

    /// 最近一次配准(nil = 还没对上)
    private(set) var registration: HomeFrame.Registration?
    /// 已收集的墙段数(HUD「还差几面墙」)
    private(set) var wallCount = 0

    /// 目标在户型坐标的位置(米)—— FindItemView 选中目标后设置
    var targetHomeM: SIMD2<Double>?

    /// 指路结果(每帧从 currentFrame 现算)
    struct Guidance {
        var distanceM: Double
        /// 相对相机朝向的人话方向(EvidenceGuide 同一套)
        var direction: String
        /// 相对相机朝向的角度(度,右正)—— 箭头旋转用
        var bearingDeg: Double
    }

    func start(home: CanonicalHome) {
        canonicalSegments = HomeFrame.segments(fromWallGraph: home.wallGraph)
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.vertical]
        session.delegate = self
        session.run(config, options: [.resetTracking, .removeExistingAnchors])
    }

    func stop() {
        session.pause()
        wallByAnchor = [:]
        registration = nil
        wallCount = 0
    }

    /// 当前帧的指路(没定位/没目标/没帧 → nil)
    func guidance() -> Guidance? {
        guard let reg = registration, reg.ok,
              let target = targetHomeM,
              let frame = session.currentFrame else { return nil }
        let world = HomeFrame.fromHome(target, reg)
        let cam = frame.camera.transform
        let pos = SIMD2(Double(cam.columns.3.x), Double(cam.columns.3.z))
        let fwd = SIMD2(-Double(cam.columns.2.x), -Double(cam.columns.2.z))
        let v = world - pos
        let dist = simd_length(v)
        let bearing = atan2(v.y, v.x) * 180 / .pi
        let heading = atan2(fwd.y, fwd.x) * 180 / .pi
        var d = (bearing - heading).truncatingRemainder(dividingBy: 360)
        if d > 180 { d -= 360 }
        if d < -180 { d += 360 }
        return Guidance(
            distanceM: dist,
            direction: EvidenceGuide.relativeDirection(from: pos, forwardDeg: heading, to: world),
            bearingDeg: d
        )
    }

    // MARK: - ARSessionDelegate(平面 → 墙段)

    nonisolated func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        updateWalls(anchors)
    }

    nonisolated func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        updateWalls(anchors)
    }

    nonisolated func session(_ session: ARSession, didRemove anchors: [ARAnchor]) {
        let ids = anchors.compactMap { ($0 as? ARPlaneAnchor)?.identifier }
        Task { @MainActor in
            for id in ids { self.wallByAnchor[id] = nil }
        }
    }

    private nonisolated func updateWalls(_ anchors: [ARAnchor]) {
        var updates: [(UUID, (a: SIMD2<Double>, b: SIMD2<Double>))] = []
        for anchor in anchors {
            guard let plane = anchor as? ARPlaneAnchor,
                  plane.alignment == .vertical else { continue }
            let width = Double(plane.planeExtent.width)
            guard width >= 0.5 else { continue } // 碎片平面(画框/柜门)不是墙
            let t = plane.transform
            let center = SIMD2(Double(t.columns.3.x), Double(t.columns.3.z))
            var axis = SIMD2(Double(t.columns.0.x), Double(t.columns.0.z))
            let len = simd_length(axis)
            axis = len > 1e-9 ? axis / len : SIMD2(1, 0)
            let half = width / 2
            updates.append((plane.identifier, (a: center - axis * half, b: center + axis * half)))
        }
        guard !updates.isEmpty else { return }
        Task { @MainActor in
            for (id, seg) in updates { self.wallByAnchor[id] = seg }
            self.wallCount = self.wallByAnchor.count
            self.register()
        }
    }

    @MainActor
    private func register() {
        let now = Date().timeIntervalSince1970
        guard !canonicalSegments.isEmpty, now - lastRegisterAt > 1 else { return }
        lastRegisterAt = now
        let walls = Array(wallByAnchor.values)
        guard walls.count >= 3 else { return }
        let (segs, phi) = HomeFrame.axisAlign(walls: walls)
        registration = HomeFrame.register(scan: segs, home: canonicalSegments, phi: phi)
    }
}
