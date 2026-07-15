import Foundation
import Observation
import ARKit
import RealityKit
import UIKit

/// 柜内扫描(能力11 设备端):打开柜门后,引导用户点六个位置拟合内腔,
/// ARKit 水平面锚点自动识别层板(手动补点兜底),再拍正面 + 斜侧两张证据照。
///
/// 与主扫描(RoomPlan)完全独立的一次 ARKit 会话 —— 世界系不同,
/// 只取相对尺寸;与户型的绑定靠调用方传入的 placementId。
@Observable
final class ContainerScanController: NSObject, ARSessionDelegate {
    enum Step: Int, CaseIterable {
        case left, right, bottom, top, back, front
        case shelves
        case photoFront, photoSide
        case confirm

        /// HUD 指令(错误示范是「请继续扫描」 —— 必须告诉用户点哪里)
        var instruction: String {
            switch self {
            case .left: return "打开柜门,点屏幕上柜内**左侧壁**的中间"
            case .right: return "点柜内**右侧壁**的中间"
            case .bottom: return "点柜子**内底板**"
            case .top: return "点柜子**内顶板**"
            case .back: return "点柜内**最深处的后壁**"
            case .front: return "点**门框前沿**(开口边缘)"
            case .shelves: return "逐块点**层板前沿**;没有层板直接点「完成层板」"
            case .photoFront: return "退后一步,正对柜子按「拍照」"
            case .photoSide: return "斜 45° 再拍一张(看清进深)"
            case .confirm: return "核对尺寸,没问题就上传"
            }
        }
    }

    private(set) var step: Step = .left
    private(set) var taps = ContainerGeometry.Taps()
    private(set) var box: ContainerGeometry.InteriorBox?
    /// 手动点的层板 y(世界系)
    private(set) var manualShelfYs: [Double] = []
    /// 拍好的证据照(正面、斜侧)
    private(set) var photoURLs: [URL] = []
    var lastError: String?

    /// 合并后的层板(相对内底,米)—— HUD 与确认页共用
    var shelfYs: [Double] {
        guard let box else { return [] }
        return ContainerGeometry.mergedShelfYs(
            manualShelfYs + autoShelfCandidates(),
            box: box
        )
    }

    private weak var arView: ARView?
    /// ARKit 认出的水平面(id → 锚点中心);层板常被认成小水平面
    private var horizontalPlanes: [UUID: SIMD3<Double>] = [:]
    /// 打点的可视标记,撤销/重测时移除
    private var markers: [Step: AnchorEntity] = [:]
    private var shelfMarkers: [AnchorEntity] = []

    // MARK: - 会话

    @MainActor
    func attach(_ view: ARView) {
        arView = view
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        view.session.delegate = self
        view.session.run(config)
    }

    @MainActor
    func stop() {
        arView?.session.pause()
    }

    nonisolated func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        updatePlanes(anchors)
    }

    nonisolated func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        updatePlanes(anchors)
    }

    private nonisolated func updatePlanes(_ anchors: [ARAnchor]) {
        let horizontal = anchors.compactMap { anchor -> (UUID, SIMD3<Double>)? in
            guard let plane = anchor as? ARPlaneAnchor,
                  plane.alignment == .horizontal else { return nil }
            let c = plane.transform * SIMD4(plane.center, 1)
            return (plane.identifier, SIMD3(Double(c.x), Double(c.y), Double(c.z)))
        }
        guard !horizontal.isEmpty else { return }
        Task { @MainActor in
            for (id, center) in horizontal {
                self.horizontalPlanes[id] = center
            }
        }
    }

    /// 平面锚点里落在内腔中段的 → 自动层板候选
    private func autoShelfCandidates() -> [Double] {
        guard let box else { return [] }
        return horizontalPlanes.values
            .filter { ContainerGeometry.isShelfCandidate($0, box: box) }
            .map(\.y)
    }

    // MARK: - 引导打点

    @MainActor
    func handleTap(at point: CGPoint) {
        guard let arView else { return }
        switch step {
        case .left, .right, .bottom, .top, .back, .front:
            guard let hit = raycast(arView, at: point) else {
                lastError = "没点到面 —— 对准柜体表面再点"
                return
            }
            lastError = nil
            record(hit, for: step)
            placeMarker(at: hit, for: step)
            advanceAfterTap()
        case .shelves:
            guard let box, let hit = raycast(arView, at: point) else {
                lastError = "没点到面 —— 对准层板前沿再点"
                return
            }
            guard ContainerGeometry.isShelfCandidate(hit, box: box, footprintMargin: 0.25) else {
                lastError = "这个点不在柜子内腔里 —— 点层板的前沿"
                return
            }
            lastError = nil
            manualShelfYs.append(hit.y)
            let marker = makeMarker(at: hit, color: .systemTeal)
            shelfMarkers.append(marker)
            arView.scene.addAnchor(marker)
        case .photoFront, .photoSide, .confirm:
            break
        }
    }

    /// 左/右/后三次打点时相机必然朝向柜内 —— 各采一份水平前向,平均出开口朝向。
    /// 按步骤键存(撤销重打会覆盖,不会重复计票)。
    private var forwardSamples: [Step: SIMD2<Double>] = [:]

    private func record(_ p: SIMD3<Double>, for step: Step) {
        switch step {
        case .left: taps.left = p
        case .right: taps.right = p
        case .bottom: taps.bottom = p
        case .top: taps.top = p
        case .back: taps.back = p
        case .front: taps.front = p
        default: return
        }
        if step == .left || step == .right || step == .back,
           let cam = arView?.session.currentFrame?.camera.transform {
            let fwd = SIMD2(-Double(cam.columns.2.x), -Double(cam.columns.2.z))
            let len = simd_length(fwd)
            if len > 1e-9 { forwardSamples[step] = fwd / len }
        }
        taps.forwards = Array(forwardSamples.values)
    }

    /// 六点收齐 → 拟合;失败留在 front 步骤提示重点
    @MainActor
    private func advanceAfterTap() {
        guard let next = Step(rawValue: step.rawValue + 1) else { return }
        if next == .shelves {
            guard let fitted = ContainerGeometry.fitBox(taps) else {
                lastError = "尺寸异常(某维 <3cm 或 >3.5m)—— 点「重新测量」再来"
                return
            }
            box = fitted
        }
        step = next
    }

    /// 撤销上一步:层板步先撤手动点;打点步退回上一个点重打;
    /// 拍照步撤回上一张。朝向样本跟着左/右/后三个点走(见 record)。
    @MainActor
    func undoTap() {
        lastError = nil
        switch step {
        case .left:
            break
        case .right, .bottom, .top, .back, .front:
            let prev = Step(rawValue: step.rawValue - 1)!
            step = prev
            clear(prev)
        case .shelves:
            if !manualShelfYs.isEmpty {
                manualShelfYs.removeLast()
                if let marker = shelfMarkers.popLast() {
                    arView?.scene.removeAnchor(marker)
                }
            } else {
                box = nil
                step = .front
                clear(.front)
            }
        case .photoFront:
            step = .shelves
        case .photoSide, .confirm:
            if !photoURLs.isEmpty { photoURLs.removeLast() }
            step = step == .photoSide ? .photoFront : .photoSide
        }
    }

    private func clear(_ s: Step) {
        switch s {
        case .left: taps.left = nil
        case .right: taps.right = nil
        case .bottom: taps.bottom = nil
        case .top: taps.top = nil
        case .back: taps.back = nil
        case .front: taps.front = nil
        default: break
        }
        forwardSamples[s] = nil
        taps.forwards = Array(forwardSamples.values)
        if let marker = markers.removeValue(forKey: s) {
            arView?.scene.removeAnchor(marker)
        }
    }

    @MainActor
    func restart() {
        step = .left
        taps = ContainerGeometry.Taps()
        box = nil
        manualShelfYs = []
        photoURLs = []
        lastError = nil
        horizontalPlanes = [:]
        forwardSamples = [:]
        for (_, m) in markers { arView?.scene.removeAnchor(m) }
        for m in shelfMarkers { arView?.scene.removeAnchor(m) }
        markers = [:]
        shelfMarkers = []
    }

    @MainActor
    func finishShelves() {
        guard step == .shelves else { return }
        step = .photoFront
    }

    /// 拍证据照(正面/斜侧),复用机位照片的 JPEG 管线
    @MainActor
    func capturePhoto() {
        guard step == .photoFront || step == .photoSide,
              let frame = arView?.session.currentFrame else {
            lastError = "相机还没准备好"
            return
        }
        guard let url = ViewpointCapture.writeJpeg(frame.capturedImage) else {
            lastError = "照片保存失败,再试一次"
            return
        }
        lastError = nil
        photoURLs.append(url)
        step = step == .photoFront ? .photoSide : .confirm
    }

    #if DEBUG
    /// 模拟器联调:没有相机,用一个 80×35×190cm 双层衣柜直接进确认页
    @MainActor
    func loadMockMeasurement() {
        taps = ContainerGeometry.Taps(
            left: SIMD3(-0.4, 0.02, -1.0),
            right: SIMD3(0.4, 0.05, -1.0),
            bottom: SIMD3(0, 0, -1.1),
            top: SIMD3(0, 1.9, -1.1),
            back: SIMD3(0, 1.0, -1.35),
            front: SIMD3(0.1, 1.0, -1.0),
            forwards: [SIMD2(0, -1)]
        )
        box = ContainerGeometry.fitBox(taps)
        manualShelfYs = [0.62, 1.24]
        step = .confirm
    }
    #endif

    // MARK: - 小件

    private func raycast(_ arView: ARView, at point: CGPoint) -> SIMD3<Double>? {
        let results = arView.raycast(
            from: point,
            allowing: .estimatedPlane,
            alignment: .any
        )
        guard let hit = results.first else { return nil }
        let t = hit.worldTransform.columns.3
        return SIMD3(Double(t.x), Double(t.y), Double(t.z))
    }

    @MainActor
    private func placeMarker(at p: SIMD3<Double>, for step: Step) {
        guard let arView else { return }
        if let old = markers.removeValue(forKey: step) {
            arView.scene.removeAnchor(old)
        }
        let marker = makeMarker(at: p, color: .systemOrange)
        markers[step] = marker
        arView.scene.addAnchor(marker)
    }

    private func makeMarker(at p: SIMD3<Double>, color: UIColor) -> AnchorEntity {
        let anchor = AnchorEntity(world: SIMD3(Float(p.x), Float(p.y), Float(p.z)))
        let sphere = ModelEntity(
            mesh: .generateSphere(radius: 0.012),
            materials: [SimpleMaterial(color: color, isMetallic: false)]
        )
        anchor.addChild(sphere)
        return anchor
    }
}
