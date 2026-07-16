import Foundation
import RoomPlan

/// 扫描流程:开扫 → 逐房 → 合并压平投影 → 现实核对 → 预览(→ 上传见 +Upload)。
/// 状态属性都在 AppModel.swift,这里只有动作。
extension AppModel {
    func startScanning(scope: String = "full") {
        scanScope = scope
        // 每次扫描用**全新的 ARSession**:上次扫描(尤其是取消)会把共享
        // session 停死,在死 session 上重开 RoomCaptureSession 起不来 ——
        // 实测「取消后再扫,取景一直黑屏」就是它。
        scanController.reset()
        scanController = ScanSessionController()
        // 新控制器要重新喂永久户型(内存丢了就读本地缓存,不等网络)
        scanController.setCanonicalHome(canonicalHome ?? CanonicalHomeCache.load())
        // 自动机位拍照:拍到就并进 poses;「视角新不新」与全部已有机位比
        scanController.onAutoPose = { [weak self] pose in
            self?.poses.append(pose)
        }
        scanController.existingPoses = { [weak self] in
            self?.poses ?? []
        }
        poses = []
        convertedProject = nil
        photoFiles = []
        objectPhotoFiles = [:]
        structureJSON = nil
        modelFileURL = nil
        scanId = UUID()
        route = .scanning
    }

    /// 「全部完成」:合并房间 → 压平 → 投影 → 预览
    func finishScanning() async {
        lastHomeFrame = scanController.homeFrame
        do {
            let structure = try await scanController.mergeAll()
            structureJSON = try? JSONEncoder().encode(structure)
            // 真实空间模式:导出带家具网格的 USDZ,预览页可 3D 查看/AR/分享
            let usdz = FileManager.default.temporaryDirectory
                .appendingPathComponent("scan-\(scanId.uuidString.lowercased()).usdz")
            try? structure.export(to: usdz, exportOptions: .model)
            modelFileURL = FileManager.default.fileExists(atPath: usdz.path) ? usdz : nil
            var scene = StructureFlattener.flatten(
                structure: structure,
                shots: scanController.shotCapture.allShots
            )
            scene.poses = poses
            applyScene(scene)
        } catch {
            lastError = "合并扫描失败:\(error.localizedDescription)"
            route = .home
        }
        scanController.reset()
    }

    /// FlatScene → HomeOSProject(mock 与真扫共用的汇合点)
    func applyScene(_ scene: FlatScene) {
        // 证据完备度把关:哪些家具的多视角照片没凑够,进预览页「提醒」区
        // (跟着 scanWarnings 一起上传 —— 网页端也能看到这次扫描的证据短板)
        var scene = scene
        scene.warnings += EvidenceGuide.sceneWarnings(scene)
        // 现场没对齐永久户型 → 提醒但不拦(网页端拉取时的全局配准是最终把关)
        if let reg = lastHomeFrame, !reg.ok, let reason = reg.reason {
            scene.warnings.append("现场未对齐永久户型(\(reason))—— 不影响上传,网页端配准会再把关")
        }
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        let projection = PlanProjector.projectScene(
            scene,
            scanId: scanId.uuidString.lowercased(),
            nameZh: "扫描 \(df.string(from: Date()))",
            scanScope: scanScope == "partial" ? "partial" : nil,
            // 权威副本喂给投影:去重仲裁 + 检测陷阱纠正(别名认亲/误检压制)
            canonicalHome: canonicalHome ?? CanonicalHomeCache.load()
        )
        convertedProject = projection.project
        objectPhotoFiles = projection.objectPhotos
        photoFiles = scene.poses.map(\.photoFileURL)
        runRealityCheck()
        route = .reviewing
        persistPending()
    }

    /// 扫描 → 与永久户型比对:认出的换真名,分类进 realityCheck。
    /// 户型优先用内存副本(bootstrap 拉的),没有才读盘 —— 别每次解码大 JSON
    func runRealityCheck() {
        realityCheck = nil
        guard var project = convertedProject,
              let home = canonicalHome ?? CanonicalHomeCache.load(),
              let rc = RealityCheck.run(scan: project, home: home) else { return }
        RealityCheck.adoptLabels(into: &project, result: rc)
        convertedProject = project
        realityCheck = rc
    }

    /// 预览页里改类别(RoomPlan 认错时长按修正),改完重新落盘
    func correctPlacement(id: String, kind: String, label: String) {
        guard var project = convertedProject,
              let i = project.placements.firstIndex(where: { $0.id == id }) else { return }
        project.placements[i].kind = kind
        project.placements[i].label = label
        convertedProject = project
        persistPending()
    }

    func cancelScanning() {
        scanController.reset()
        poses = []
        // 预览页「放弃」= 明确不要这次扫描,盘上副本一起丢
        PendingScanStore.clear()
        route = .home
    }

    #if DEBUG
    /// 模拟器联调:跳过 RoomPlan,用 MockScan 的 FlatScene 走转换→预览→上传全链路
    func loadMockScan() {
        scanId = UUID()
        let scene = MockScan.scene()
        poses = scene.poses
        structureJSON = nil
        modelFileURL = nil
        applyScene(scene)
    }
    #endif
}
