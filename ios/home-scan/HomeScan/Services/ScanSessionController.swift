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
    /// 地理上下文(GPS + 罗盘北向初值),跟扫描同生共死;摘要进 payload.meta.geo
    let geo = GeoContext()
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

    /// ScanView 的画布尺寸(点)—— 目标标记要投成屏幕坐标,得知道画布多大。
    /// SwiftUI 的 GeometryReader 喂进来。
    var viewportSize: CGSize = .zero

    /// 「他让我拍的到底是哪一件」—— HUD 的目标标记。
    ///
    /// 一句「朝右前方走 2 米,对准床」在真实房间里是不够的:屋里两张床、
    /// 三个柜子时,用户并不知道说的是哪一件,只能挨个试。指给他看。
    struct GuideMarker: Equatable {
        var label: String
        /// 目标在画面里的位置(ScanView 点坐标);nil = 在画面外/身后
        var screen: CGPoint?
        /// 相对当前朝向的方位(度,0 = 正前/屏幕正上,正 = 右手边)——
        /// 画面外时照它在屏幕边缘画箭头
        var relativeDeg: Double
        var distanceM: Double
        /// 取景已达标 = 下一拍就是它。准星变绿,用户可以停手了
        var framed: Bool
    }
    private(set) var guideMarker: GuideMarker?

    // ---- Home Frame 重定位(设备端) ----
    /// 永久户型(优化副本);nil = 云端还没有(第一次建家),扫描照常
    /// **Quick Scan 安静模式(默认开)**:扫描只管轻松扫完,逐件补拍引导(还差角度/
    /// 请移动/请靠近)与机位站位提示**默认不打断你** —— 证据缺口留到扫描后处理,
    /// ObjectShotCapture 仍静默收好帧。只保留严重打断(跟踪丢失 + 离开房间前的机位提醒)。
    /// 关掉它 = 「高精度补扫」逐件引导(未来 UI 开关;现在默认安静)。
    var quietScan = true
    private var canonicalHome: CanonicalHome?
    private var canonicalSegments: [HomeFrame.Segment] = []
    /// 权威副本家具预算成户型米坐标(认账家的记忆:活体对回后免催拍)。
    /// setCanonicalHome 时算一次;活体中心经 homeFrame.toHome 转到同一坐标系比对。
    private var canonicalPriors: [EvidenceGuide.Prior] = []
    /// 最近一次配准结果(HUD 徽标 + 预览页;nil = 墙还不够/没有户型基准)
    private(set) var homeFrame: HomeFrame.Registration?
    /// 配准成功后对照户型分区算出的「还没扫到的房间」
    private(set) var uncoveredRooms: [String] = []
    private var lastRegisterAt: TimeInterval = 0

    func setCanonicalHome(_ home: CanonicalHome?) {
        canonicalHome = home
        canonicalSegments = home.map { HomeFrame.segments(fromWallGraph: $0.wallGraph) } ?? []
        canonicalPriors = home.map(Self.priors(from:)) ?? []
    }

    /// 权威副本家具 → 户型米坐标的 priors(中心 + kind)。plan-px → 米:除以
    /// pxPerM(pxPerFt / 0.3048)。只要位置 —— 认账靠原位识别,与照片无关
    /// (优化副本本就不携带每件照片,真机 v23:37 件 placements 零张 attrs.photos)。
    private static func priors(from home: CanonicalHome) -> [EvidenceGuide.Prior] {
        let pxPerM = home.wallGraph.pxPerFt / 0.3048
        guard pxPerM > 0 else { return [] }
        var out: [EvidenceGuide.Prior] = []
        for pl in home.placements {
            out.append(EvidenceGuide.Prior(
                center: SIMD2((pl.x + pl.w / 2) / pxPerM, (pl.y + pl.h / 2) / pxPerM), kind: pl.kind))
        }
        for fx in home.fixtures ?? [] {
            let b = fx.bounds
            out.append(EvidenceGuide.Prior(
                center: SIMD2((b.x + b.w / 2) / pxPerM, (b.y + b.h / 2) / pxPerM), kind: fx.kind))
        }
        return out
    }

    /// RoomPlan 实时快照里的物体(didUpdate 喂进来,抓拍定时器消费)
    private var liveObjects: [CapturedRoom.Object] = []
    /// 当前房间的实时墙段(俯视 2D,米)—— 证据引导用它剔掉「靠墙拍不到」的方位
    private var liveWalls: [EvidenceGuide.Wall] = []
    /// 当前房间的实时功能区(RoomPlan sections)—— 离开零状态照分区的催拍用
    private var liveSections: [SectionExitNudge.Section] = []
    /// 实时地面 y(米,ARKit 世界系)—— 「藏在桌下」判定的基准
    private var liveFloorY: Double = 0
    /// 当前房间地板面积(sqft)—— 机位配额按它伸缩(大房多拍,小卫生间少拍)。
    /// nil = RoomPlan 还没认出地板(扫描头几秒的常态),配额退旧值 4
    private var liveRoomAreaSqFt: Double?
    /// 每件家具第一次被 RoomPlan 认出的时刻 —— 刚认出的先别催,给自然扫描留时间
    private var firstSeen: [UUID: TimeInterval] = [:]
    /// 证据引导锁定的目标(缺口没补上就不换目标,防 HUD 来回跳)
    private var evidenceTarget: (objectId: UUID, bin: Int)?
    /// 锁定的起点 —— 超时就换人(见 evidenceTargetTimeoutS)
    private var evidenceTargetSince: TimeInterval?
    /// 这次扫描里已经放弃引导的目标:拍不到的就别一直喊同一句
    private var parkedTargets: Set<UUID> = []
    /// 跟踪质量恶化的起点(去抖:持续 >1.5s 才上 HUD)
    private var limitedSince: TimeInterval?
    private var shotTimer: Timer?
    /// HUD 用:已抓到照片的家具件数
    private(set) var objectShotCount = 0
    /// 降级采集中(低电量/过热)的 HUD 说明;nil = 正常
    private(set) var degradedReason: String?
    // 日志去抖:只有状态**变化**才落一条(ScanLog 事件是给人翻的,不是采样流)
    private var degradedLogged = false
    private var hintLogged: String?
    private var regOkLogged: Bool?
    private var tickCount = 0
    /// 上一轮配准是否已对齐(只在「对上了」那一刻触感+播报一次)
    private var wasAligned = false

    /// 家具认出后先自然扫这么久,还缺证据才开始引导
    static let evidenceGraceS: TimeInterval = 15

    /// 一个目标引导这么久还没补上 → 放弃它,换下一件。
    ///
    /// 几何门槛可以算准(见 EvidenceGuide.standRadius),现场的意外算不准:
    /// 家具被人挡着、那一侧有强反光、深度图在玻璃上打滑…… 任何一件
    /// 「怎么都拍不到」的家具都会把 HUD 永久钉死在同一句上,而用户看到的
    /// 就是「我照着做了,它还是卡着」。这是最后一道兜底 —— 宁可少一个侧面,
    /// 不可把人锁在原地。
    static let evidenceTargetTimeoutS: TimeInterval = 30

    var roomCount: Int { capturedRooms.count }

    /// ScanView 每一代调用一次;RoomCaptureView 挂共享 ARSession
    @MainActor
    func makeCaptureView() -> RoomCaptureView {
        let view = RoomCaptureView(frame: .zero, arSession: arSession)
        view.captureSession.delegate = self
        view.captureSession.run(configuration: RoomCaptureSession.Configuration())
        captureView = view
        geo.start()
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
            // 降级进入/退出各记一次(何时热到降速 = 调采集参数的第一手数据);
            // 降级时长累进摘要 —— 一次扫描热降 3 分钟和 30 秒是两种体验
            if degraded != self.degradedLogged {
                self.degradedLogged = degraded
                ScanLog.shared.log("perf", "degraded", [
                    "on": .bool(degraded),
                    "thermal": .string(ScanLog.thermalName(thermal)),
                    "lowPower": .bool(lowPower),
                ])
            }
            if degraded { ScanLog.shared.counter { $0.add("degraded_s", 0.5) } }
            // 罗盘北向采样:相机水平朝向(场景系,x 右、z 作 y 向下)配对
            // 最近的罗盘真北读数。相机近乎垂直朝下(扫地面)时水平朝向没意义,跳过
            let ct = frame.camera.transform
            let fx = -Double(ct.columns.2.x)
            let fz = -Double(ct.columns.2.z)
            if fx * fx + fz * fz > 0.04 {
                let sceneYawDeg = GeoContext.normalizeDeg(atan2(fx, -fz) * 180 / .pi)
                self.geo.recordSample(cameraSceneYawDeg: sceneYawDeg)
            }
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
                sections: self.liveSections,
                roomAreaSqFt: self.liveRoomAreaSqFt,
                existingPoses: self.existingPoses?() ?? []
            ) { [weak self] pose in
                self?.onAutoPose?(pose)
            }

            // HUD 优先级:跟踪异常(数据正在变坏) > 补拍走位 > 机位站位。
            // 离开零状态照分区的催拍与「补拍走位」同级 —— 人已经在往外走,
            // 这句先说(错过就真没了),走位引导下一 tick 自然接上
            if let tracking = self.trackingHint(frame) {
                self.hudHint = (tracking, .tracking)
            } else if let nudge = self.autoViewpoint.exitNudge {
                self.hudHint = (nudge, .evidence)
            } else {
                // 补拍引导仍在后台算:设 evidenceTarget(给抓拍定优先级)+ 记证据缺口 +
                // 认账遥测。安静模式(默认)**不弹给你**;高精度补扫模式才逐件引导/机位站位。
                let guide = self.evidenceHint(frame)
                if !self.quietScan, let guide {
                    self.hudHint = (guide, .evidence)
                } else if !self.quietScan, let hint = self.autoViewpoint.hint {
                    self.hudHint = (hint, .viewpoint)
                } else {
                    self.hudHint = nil
                }
            }
            // 引导提示的每次**变化**都留档:用户被什么提示轰炸、跟踪坏了多久,
            // 是调门槛常数(EvidenceGuide/ViewpointGate)最缺的现场数据
            let hintKey = self.hudHint.map { "\($0.kind)|\($0.text)" }
            if hintKey != self.hintLogged {
                self.hintLogged = hintKey
                if let h = self.hudHint {
                    ScanLog.shared.log("ux", "hint", [
                        "kind": .string("\(h.kind)"), "text": .string(h.text),
                    ])
                    ScanLog.shared.counter { $0.count("hint_\(h.kind)") }
                }
            }
            if self.hudHint?.kind == .tracking {
                ScanLog.shared.counter { $0.add("tracking_limited_s", degraded ? 1 : 0.5) }
            }
            // 目标标记跟着引导走:evidenceHint 已经把 evidenceTarget 定下来了
            self.updateGuideMarker(frame)
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
        // 配准状态翻转才记(2s 一次全记会刷屏):失败原因分布 = HomeFrame
        // 验收门(常数)是否太苛/太松的依据
        if reg.ok != regOkLogged {
            regOkLogged = reg.ok
            ScanLog.shared.log("scan", "home_frame", [
                "ok": .bool(reg.ok),
                "reason": .string(reg.reason ?? ""),
                "medianCm": .num(reg.medianCm),
                "matchedWalls": .num(Double(reg.matchedWalls)),
            ])
        }
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
            let center = SIMD2(Double(t.x), Double(t.z))
            // 认账家的记忆:配准成功时把活体中心转到户型米坐标,对回**原位**权威件 ——
            // 权威已有足够方位 → 不再催拍(见 EvidenceGuide.deficits)。配准还没成 /
            // 没有权威副本 / 挪走了对不回原位 → priors 空,当新件照旧催(安全兜底)。
            var recognized = false
            if let reg = homeFrame, reg.ok, !canonicalPriors.isEmpty {
                let hc = HomeFrame.toHome(center, reg)
                recognized = EvidenceGuide.matchPrior(homeCenter: hc, priors: canonicalPriors)
                // 诊断:这件离最近权威件多远。closeness = max(0, 300 − nearest_cm),
                // peak 取最大 → 最近任何一件曾贴到多近。判读:nearest_cm = 300 − peak。
                if let nm = EvidenceGuide.nearestPriorDist(homeCenter: hc, priors: canonicalPriors) {
                    ScanLog.shared.counter { $0.peak("prior_closeness", max(0, 300 - nm * 100)) }
                }
            }
            furnitures.append(
                EvidenceGuide.Furniture(
                    id: object.identifier,
                    category: String(describing: object.category),
                    center: center,
                    widthM: Double(object.dimensions.x),
                    depthM: Double(object.dimensions.z),
                    binsCovered: Set((shotCapture.shots[object.identifier] ?? [:]).keys),
                    heightM: Double(object.dimensions.y),
                    elevM: max(0, Double(t.y) - Double(object.dimensions.y) / 2 - liveFloorY),
                    recognizedFromPrior: recognized
                )
            )
        }
        guard !furnitures.isEmpty else {
            clearEvidenceTarget()
            return nil
        }

        // 认账家的记忆 QA 遥测:峰值时多少件被先验认出(priorBinsCovered 非空)/ 共几件 /
        // 配准是否在线 / 加载了几件权威 prior。判读:prior_count=0 → 没加载权威副本;
        // prior_regOk=0 → 扫描中配准没成(matchPrior 永远兜底催拍);matched≈0 而
        // objects 高 → 坐标没对上(配准/换算问题);matched≈objects → 认账在工作。
        // 一次扫描即可定位,不必再盲装。
        let matched = furnitures.filter { $0.recognizedFromPrior }.count
        ScanLog.shared.counter {
            $0.peak("prior_objects_peak", Double(furnitures.count))
            $0.peak("prior_matched_peak", Double(matched))
            $0.peak("prior_regOk", (self.homeFrame?.ok == true) ? 1 : 0)
            $0.peak("prior_count", Double(self.canonicalPriors.count))
        }

        let cam = frame.camera.transform
        let pos = SIMD2(Double(cam.columns.3.x), Double(cam.columns.3.z))
        let fwd = SIMD2(-Double(cam.columns.2.x), -Double(cam.columns.2.z))
        let guide = EvidenceGuide.guidance(
            deficits: EvidenceGuide.deficits(furnitures: furnitures, walls: liveWalls)
                .filter { !parkedTargets.contains($0.furniture.id) },
            cameraPos: pos,
            cameraForwardDeg: atan2(fwd.y, fwd.x) * 180 / .pi,
            holdTarget: evidenceTarget
        )
        guard let guide else {
            clearEvidenceTarget()
            return nil
        }
        if evidenceTarget?.objectId != guide.objectId || evidenceTarget?.bin != guide.bin {
            evidenceTarget = (guide.objectId, guide.bin)
            evidenceTargetSince = now
        } else if now - (evidenceTargetSince ?? now) > Self.evidenceTargetTimeoutS {
            // 喊了 30 秒还没拍上 —— 这一件这个方位现场就是拍不到。
            // 停止引导它,让位给下一件(下一 tick 自然选出)。
            parkedTargets.insert(guide.objectId)
            clearEvidenceTarget()
            return nil
        }
        // 抓拍认这个账:本帧优先拍引导指着的那件(见 ObjectShotCapture.priorityTarget)
        shotCapture.priorityTarget = evidenceTarget
        return guide.text
    }

    private func clearEvidenceTarget() {
        evidenceTarget = nil
        evidenceTargetSince = nil
        shotCapture.priorityTarget = nil
    }

    /// 目标标记:把引导锁定的那件投到屏幕上(HUD 画准星/边缘箭头)。
    private func updateGuideMarker(_ frame: ARFrame) {
        guard let target = evidenceTarget,
              let object = liveObjects.first(where: { $0.identifier == target.objectId }),
              viewportSize.width > 1, viewportSize.height > 1
        else {
            guideMarker = nil
            return
        }
        let c = object.transform.columns.3
        let cam = frame.camera.transform
        let inCam = cam.inverse * SIMD4(c.x, c.y, c.z, 1)
        // 竖屏显示 → .portrait + 视图尺寸,拿到的直接就是 ScanView 的点坐标
        let p = frame.camera.projectPoint(
            SIMD3(c.x, c.y, c.z),
            orientation: .portrait,
            viewportSize: viewportSize
        )
        let onScreen = inCam.z < -0.1
            && p.x >= 0 && p.x <= viewportSize.width
            && p.y >= 0 && p.y <= viewportSize.height

        // 屏外箭头的角度用**世界系方位**算,不用投影点:目标在身后时
        // projectPoint 会翻转乱飞,照它画的箭头会指反。
        let camPos = SIMD2(Double(cam.columns.3.x), Double(cam.columns.3.z))
        let objPos = SIMD2(Double(c.x), Double(c.z))
        let fwd = SIMD2(-Double(cam.columns.2.x), -Double(cam.columns.2.z))
        let forwardDeg = atan2(fwd.y, fwd.x) * 180 / .pi
        let bearing = atan2(objPos.y - camPos.y, objPos.x - camPos.x) * 180 / .pi
        var rel = (bearing - forwardDeg).truncatingRemainder(dividingBy: 360)
        if rel > 180 { rel -= 360 }
        if rel < -180 { rel += 360 }

        guideMarker = GuideMarker(
            label: EvidenceGuide.zhName(String(describing: object.category)),
            screen: onScreen ? p : nil,
            relativeDeg: rel,
            distanceM: simd_length(objPos - camPos),
            framed: shotCapture.isWellFramed(object, in: frame)
        )
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
        liveRoomAreaSqFt = nil      // 面积是上一间的,新一间重测(nil 期配额退 4)
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
        liveSections = []
        liveRoomAreaSqFt = nil
        firstSeen = [:]
        clearEvidenceTarget()
        parkedTargets = []
        guideMarker = nil
        limitedSince = nil
        shotCapture.reset()
        autoViewpoint.reset()
        hudHint = nil
        objectShotCount = 0
        homeFrame = nil
        uncoveredRooms = []
        lastRegisterAt = 0
        degradedReason = nil
        degradedLogged = false
        hintLogged = nil
        regOkLogged = nil
        tickCount = 0
        wasAligned = false
        geo.stop()
        arSession.pause()
    }

    // MARK: - RoomCaptureSessionDelegate

    nonisolated func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        let objects = room.objects
        // 地面高度(叠放判定的基准):地板面最低 y。没识别出地板就保持旧值
        let floorY = room.floors.map { Double($0.transform.columns.3.y) }.min()
        // 地板面积(sqft)—— 机位配额的伸缩依据。地板是平面 Surface,
        // dimensions.x/y 就是两条面内边长(z 是厚度,可忽略);多块地板求和
        let areaSqFt = room.floors.isEmpty ? nil : room.floors
            .map { Double($0.dimensions.x) * Double($0.dimensions.y) * 10.7639 }
            .reduce(0, +)
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
        // 功能区中心(与 StructureFlattener 同一套取数):离房催拍的归属依据
        let sections = room.sections.map {
            SectionExitNudge.Section(
                label: String(describing: $0.label),
                center: SIMD2(Double($0.center.x), Double($0.center.z))
            )
        }
        Task { @MainActor in
            self.liveObjects = objects
            self.liveWalls = walls
            self.liveSections = sections
            if let floorY { self.liveFloorY = floorY }
            if let areaSqFt { self.liveRoomAreaSqFt = areaSqFt }
        }
    }

    nonisolated func captureSession(
        _ session: RoomCaptureSession,
        didEndWith data: CapturedRoomData,
        error: (any Error)?
    ) {
        Task { @MainActor in
            self.liveObjects = []  // 房间收尾,别再对着旧快照抓拍
            self.liveSections = [] // 分区归属同理(下一间的 didUpdate 再喂)
        }
        if let error {
            Task { @MainActor in
                ScanLog.shared.error("scan", "room_capture_failed", error)
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
                // 逐房后处理耗时(RoomBuilder 也是重活,和 mergeAll 分开计)
                let end = ScanLog.shared.time("perf", "room_build")
                let room = try await self.roomBuilder.capturedRoom(from: data)
                // 内存大头取证(真扫 mem_peak_mb=1642 偏高):RoomPlan 逐房构建侧
                // 峰值,与照片编码队列侧(mem_peak_encode_mb)对照定位
                ScanLog.shared.counter { $0.peak("mem_peak_roombuild_mb", ScanLog.memoryFootprintMB()) }
                self.capturedRooms.append(room)
                end([
                    "index": .num(Double(self.capturedRooms.count)),
                    "objects": .num(Double(room.objects.count)),
                    "walls": .num(Double(room.walls.count)),
                    "doors": .num(Double(room.doors.count)),
                    "windows": .num(Double(room.windows.count)),
                    "sqft": .num((self.liveRoomAreaSqFt ?? -1).rounded()),
                ])
                ScanLog.shared.counter {
                    $0.count("rooms")
                    $0.add("objects_detected", Double(room.objects.count))
                }
            } catch {
                ScanLog.shared.error("scan", "room_build_failed", error)
                self.lastError = "房间处理失败:\(error.localizedDescription)"
            }
        }
    }
}
