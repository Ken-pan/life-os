import Foundation
import Observation
import ARKit
import RoomPlan
import UIKit

/// 多房间扫描:一个共享 ARSession 贯穿全程(所有房间与拍照位姿同一世界坐标),
/// 每个房间一个 RoomCaptureSession;房间之间 stop(pauseARSession: false) 保持
/// 世界地图不丢。全部扫完 StructureBuilder 合并。
@Observable
final class ScanSessionController: NSObject, RoomCaptureSessionDelegate {
    let arSession = ARSession()

    private(set) var capturedRooms: [CapturedRoom] = []
    private(set) var roomProcessing = false
    var lastError: String?

    /// 递增让 SwiftUI 重建 RoomCaptureView(= 开新一间房)
    private(set) var roomGeneration = 0

    private var captureView: RoomCaptureView?
    private let roomBuilder = RoomBuilder(options: [.beautifyObjects])

    /// 家具自动抓拍:跨房间共用一个(同一 ARSession 同一世界系)
    let shotCapture = ObjectShotCapture()
    /// 机位自动拍照:视角好就自己拍,不需要用户按快门
    let autoViewpoint = AutoViewpointCapture()
    /// 自动拍到一张机位时回调(AppModel 接走,并进 poses)
    var onAutoPose: ((FlatScene.CameraPose) -> Void)?
    /// 已有机位(含手动拍的)—— 自动拍照的「视角新不新」要跟它们比
    var existingPoses: (() -> [FlatScene.CameraPose])?

    /// HUD 提示种类(图标/优先级依据):跟踪异常 > 补拍走位 > 机位站位
    enum HintKind {
        case tracking, evidence, viewpoint

        var icon: String {
            switch self {
            case .tracking: return "exclamationmark.triangle.fill"
            case .evidence: return "figure.walk"
            case .viewpoint: return "camera.viewfinder"
            }
        }
    }

    /// HUD 统一提示(nil = 不显示)
    private(set) var hudHint: (text: String, kind: HintKind)?

    // ---- Home Frame 重定位(设备端) ----
    /// 永久户型(优化副本);nil = 云端还没有(第一次建家),扫描照常
    private var canonicalHome: CanonicalHome?
    private var canonicalSegments: [HomeFrame.Segment] = []
    /// 最近一次配准结果(HUD 徽标 + 预览页;nil = 墙还不够/没有户型基准)
    private(set) var homeFrame: HomeFrame.Registration?
    /// 配准成功后对照户型分区算出的「还没扫到的房间」
    private(set) var uncoveredRooms: [String] = []
    private var lastRegisterAt: TimeInterval = 0

    func setCanonicalHome(_ home: CanonicalHome?) {
        canonicalHome = home
        canonicalSegments = home.map { HomeFrame.segments(fromWallGraph: $0.wallGraph) } ?? []
    }

    /// RoomPlan 实时快照里的物体(didUpdate 喂进来,抓拍定时器消费)
    private var liveObjects: [CapturedRoom.Object] = []
    /// 当前房间的实时墙段(俯视 2D,米)—— 证据引导用它剔掉「靠墙拍不到」的方位
    private var liveWalls: [EvidenceGuide.Wall] = []
    /// 实时地面 y(米,ARKit 世界系)—— 「藏在桌下」判定的基准
    private var liveFloorY: Double = 0
    /// 每件家具第一次被 RoomPlan 认出的时刻 —— 刚认出的先别催,给自然扫描留时间
    private var firstSeen: [UUID: TimeInterval] = [:]
    /// 证据引导锁定的目标(缺口没补上就不换目标,防 HUD 来回跳)
    private var evidenceTarget: (objectId: UUID, bin: Int)?
    /// 跟踪质量恶化的起点(去抖:持续 >1.5s 才上 HUD)
    private var limitedSince: TimeInterval?
    private var shotTimer: Timer?
    /// HUD 用:已抓到照片的家具件数
    private(set) var objectShotCount = 0
    /// 降级采集中(低电量/过热)的 HUD 说明;nil = 正常
    private(set) var degradedReason: String?
    private var tickCount = 0
    /// 上一轮配准是否已对齐(只在「对上了」那一刻触感+播报一次)
    private var wasAligned = false

    /// 家具认出后先自然扫这么久,还缺证据才开始引导
    static let evidenceGraceS: TimeInterval = 15

    var roomCount: Int { capturedRooms.count }

    /// ScanView 每一代调用一次;RoomCaptureView 挂共享 ARSession
    @MainActor
    func makeCaptureView() -> RoomCaptureView {
        let view = RoomCaptureView(frame: .zero, arSession: arSession)
        view.captureSession.delegate = self
        view.captureSession.run(configuration: RoomCaptureSession.Configuration())
        captureView = view
        startShotTimer()
        return view
    }

    /// 2Hz 评估当前帧 —— 打分轻(24 次矩阵乘/件),只有明显更好的一眼才真裁图。
    @MainActor
    private func startShotTimer() {
        guard shotTimer == nil else { return }
        let timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self, let frame = self.arSession.currentFrame else { return }
            // 低电量/过热降级:采集降到 1Hz、证据照不走 12MP 高清帧(编码是发热大户)。
            // 扫描不中断 —— 慢一点也比在 38° 的手机上硬撑到系统杀进程强
            self.tickCount += 1
            let thermal = ProcessInfo.processInfo.thermalState
            let lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
            let degraded = lowPower || thermal == .serious || thermal == .critical
            self.degradedReason = degraded
                ? (lowPower ? "省电模式:已降速采集" : "手机偏热:已降速采集,歇几秒更快")
                : nil
            if degraded && self.tickCount % 2 == 1 { return }
            if !self.liveObjects.isEmpty {
                // 传 session:证据照走 12MP 带外高清帧(拿不到自动回退视频帧)
                self.shotCapture.consider(
                    objects: self.liveObjects,
                    frame: frame,
                    session: degraded ? nil : self.arSession
                )
                self.objectShotCount = self.shotCapture.count
            }
            // 机位自动拍照:没家具的房间(玄关/走廊)也要评估,别卡在空列表上
            self.autoViewpoint.consider(
                frame: frame,
                objects: self.liveObjects,
                existingPoses: self.existingPoses?() ?? []
            ) { [weak self] pose in
                self?.onAutoPose?(pose)
            }

            // HUD 优先级:跟踪异常(数据正在变坏) > 补拍走位 > 机位站位
            if let tracking = self.trackingHint(frame) {
                self.hudHint = (tracking, .tracking)
            } else if let guide = self.evidenceHint(frame) {
                self.hudHint = (guide, .evidence)
            } else if let hint = self.autoViewpoint.hint {
                self.hudHint = (hint, .viewpoint)
            } else {
                self.hudHint = nil
            }
            // 语音引导:人在走动没法盯屏幕 —— 要人动起来的提示念出来
            // (机位站位太碎不念;VoiceGuide 自带去重与冷却)
            if let hint = self.hudHint, hint.kind != .viewpoint {
                VoiceGuide.shared.speak(hint.text)
            }

            // Home Frame 重定位:每 2s 一次(几十段墙的 1D 投票,毫秒级)。
            // 对齐上了 = 扫的东西直接落进永久户型坐标;对不上只是没徽标,不打扰
            self.updateHomeFrame(now: frame.timestamp)
        }
        timer.tolerance = 0.15 // 打分不挑时刻,给系统合并唤醒的余地
        shotTimer = timer
    }

    /// 已完成房间 + 当前房间的全部墙(世界系俯视线段)
    private func allWorldWalls() -> [(a: SIMD2<Double>, b: SIMD2<Double>)] {
        var out: [(a: SIMD2<Double>, b: SIMD2<Double>)] = []
        for room in capturedRooms {
            for wall in room.walls { out.append(Self.wallLine(wall)) }
        }
        out.append(contentsOf: liveWalls.map { (a: $0.a, b: $0.b) })
        return out
    }

    /// 墙面 → 俯视线段(与 didUpdate/StructureFlattener 同一套数学)
    private static func wallLine(_ wall: CapturedRoom.Surface) -> (a: SIMD2<Double>, b: SIMD2<Double>) {
        let t = wall.transform
        let center = SIMD2(Double(t.columns.3.x), Double(t.columns.3.z))
        var axis = SIMD2(Double(t.columns.0.x), Double(t.columns.0.z))
        let len = simd_length(axis)
        axis = len > 1e-9 ? axis / len : SIMD2(1, 0)
        let half = Double(wall.dimensions.x) / 2
        return (a: center - axis * half, b: center + axis * half)
    }

    /// Home Frame 配准(节流 2s;几十段墙的量化 1D 投票,毫秒级)
    private func updateHomeFrame(now: TimeInterval) {
        guard !canonicalSegments.isEmpty, now - lastRegisterAt > 2 else { return }
        lastRegisterAt = now
        let walls = allWorldWalls()
        guard walls.count >= 3 else { return }
        let (segs, phi) = HomeFrame.axisAlign(walls: walls)
        let reg = HomeFrame.register(scan: segs, home: canonicalSegments, phi: phi)
        homeFrame = reg
        // 「对上了」那一刻给一次成功触感 + 播报 —— 从此扫的东西都落在户型坐标里
        if reg.ok, !wasAligned {
            wasAligned = true
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            VoiceGuide.shared.speak("已对齐户型坐标", minInterval: 0)
        } else if !reg.ok {
            wasAligned = false
        }
        if reg.ok, let home = canonicalHome {
            uncoveredRooms = HomeFrame.uncoveredRooms(
                zones: home.zones,
                pxPerFt: home.wallGraph.pxPerFt,
                liveWalls: walls,
                registration: reg
            )
        }
    }

    /// 跟踪质量监控:恶化持续 >1.5s 才提示(镜头一晃就闪警告太吵)。
    /// 提示必须具体 —— 告诉用户**怎么救**,而不是「跟踪不佳」。
    private func trackingHint(_ frame: ARFrame) -> String? {
        let reasonText: String?
        switch frame.camera.trackingState {
        case .normal:
            limitedSince = nil
            return nil
        case .notAvailable:
            reasonText = "空间跟踪不可用 —— 举稳手机,对准有细节的区域"
        case .limited(let reason):
            switch reason {
            case .excessiveMotion:
                reasonText = "移动太快,画面会糊 —— 放慢脚步"
            case .insufficientFeatures:
                reasonText = "这里特征太少(白墙/暗处)—— 后退一步或开灯"
            case .relocalizing:
                reasonText = "正在重新定位 —— 走回刚扫过的区域,缓慢环视"
            case .initializing:
                reasonText = "正在初始化 —— 原地缓慢平移手机"
            @unknown default:
                reasonText = "跟踪质量下降 —— 放慢移动"
            }
        }
        if limitedSince == nil { limitedSince = frame.timestamp }
        guard frame.timestamp - (limitedSince ?? frame.timestamp) > 1.5 else { return nil }
        return reasonText
    }

    /// 证据完备度引导:认出 15 秒还缺侧面照片的家具,算出具体走位。
    private func evidenceHint(_ frame: ARFrame) -> String? {
        let now = frame.timestamp
        var furnitures: [EvidenceGuide.Furniture] = []
        for object in liveObjects {
            if firstSeen[object.identifier] == nil {
                firstSeen[object.identifier] = now
            }
            guard now - (firstSeen[object.identifier] ?? now) > Self.evidenceGraceS else { continue }
            let t = object.transform.columns.3
            furnitures.append(
                EvidenceGuide.Furniture(
                    id: object.identifier,
                    category: String(describing: object.category),
                    center: SIMD2(Double(t.x), Double(t.z)),
                    widthM: Double(object.dimensions.x),
                    depthM: Double(object.dimensions.z),
                    binsCovered: Set((shotCapture.shots[object.identifier] ?? [:]).keys),
                    heightM: Double(object.dimensions.y),
                    elevM: max(0, Double(t.y) - Double(object.dimensions.y) / 2 - liveFloorY)
                )
            )
        }
        guard !furnitures.isEmpty else {
            evidenceTarget = nil
            return nil
        }

        let cam = frame.camera.transform
        let pos = SIMD2(Double(cam.columns.3.x), Double(cam.columns.3.z))
        let fwd = SIMD2(-Double(cam.columns.2.x), -Double(cam.columns.2.z))
        let guide = EvidenceGuide.guidance(
            deficits: EvidenceGuide.deficits(furnitures: furnitures, walls: liveWalls),
            cameraPos: pos,
            cameraForwardDeg: atan2(fwd.y, fwd.x) * 180 / .pi,
            holdTarget: evidenceTarget
        )
        evidenceTarget = guide.map { ($0.objectId, $0.bin) }
        return guide?.text
    }

    private var pendingCompletion: CheckedContinuation<Void, Never>?

    /// 「完成本房间」:停当前房间(ARSession 不停),等 RoomBuilder 处理完入列。
    @MainActor
    func finishRoomAndWait() async {
        guard captureView != nil else { return }
        await withCheckedContinuation { cont in
            pendingCompletion = cont
            captureView?.captureSession.stop(pauseARSession: false)
        }
    }

    /// 「再扫一间」:上一间已入列后重建采集视图
    @MainActor
    func startNextRoom() {
        roomGeneration += 1
        autoViewpoint.roomChanged() // 每间的自动拍照配额/引导重新计
    }

    /// 全部房间 → CapturedStructure
    func mergeAll() async throws -> CapturedStructure {
        let builder = StructureBuilder(options: [.beautifyObjects])
        return try await builder.capturedStructure(from: capturedRooms)
    }

    @MainActor
    func reset() {
        captureView?.captureSession.stop()
        captureView = nil
        capturedRooms = []
        roomGeneration = 0
        lastError = nil
        shotTimer?.invalidate()
        shotTimer = nil
        liveObjects = []
        liveWalls = []
        firstSeen = [:]
        evidenceTarget = nil
        limitedSince = nil
        shotCapture.reset()
        autoViewpoint.reset()
        hudHint = nil
        objectShotCount = 0
        homeFrame = nil
        uncoveredRooms = []
        lastRegisterAt = 0
        degradedReason = nil
        tickCount = 0
        wasAligned = false
        arSession.pause()
    }

    // MARK: - RoomCaptureSessionDelegate

    nonisolated func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        let objects = room.objects
        // 地面高度(叠放判定的基准):地板面最低 y。没识别出地板就保持旧值
        let floorY = room.floors.map { Double($0.transform.columns.3.y) }.min()
        // 墙中心 ± 局部 x 轴 × 半宽 → 俯视 2D 线段(与 StructureFlattener 同一套数学)
        let walls = room.walls.map { wall -> EvidenceGuide.Wall in
            let t = wall.transform
            let center = SIMD2(Double(t.columns.3.x), Double(t.columns.3.z))
            var axis = SIMD2(Double(t.columns.0.x), Double(t.columns.0.z))
            let len = simd_length(axis)
            axis = len > 1e-9 ? axis / len : SIMD2(1, 0)
            let half = Double(wall.dimensions.x) / 2
            return EvidenceGuide.Wall(a: center - axis * half, b: center + axis * half)
        }
        Task { @MainActor in
            self.liveObjects = objects
            self.liveWalls = walls
            if let floorY { self.liveFloorY = floorY }
        }
    }

    nonisolated func captureSession(
        _ session: RoomCaptureSession,
        didEndWith data: CapturedRoomData,
        error: (any Error)?
    ) {
        Task { @MainActor in
            self.liveObjects = []  // 房间收尾,别再对着旧快照抓拍
        }
        if let error {
            Task { @MainActor in
                self.lastError = "本房间扫描失败:\(error.localizedDescription)"
                self.pendingCompletion?.resume()
                self.pendingCompletion = nil
            }
            return
        }
        Task { @MainActor in
            self.roomProcessing = true
            defer {
                self.roomProcessing = false
                self.pendingCompletion?.resume()
                self.pendingCompletion = nil
            }
            do {
                let room = try await self.roomBuilder.capturedRoom(from: data)
                self.capturedRooms.append(room)
            } catch {
                self.lastError = "房间处理失败:\(error.localizedDescription)"
            }
        }
    }
}
