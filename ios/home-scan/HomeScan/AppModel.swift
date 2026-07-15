import Foundation
import Observation
import RoomPlan
import UIKit

/// App 全局状态机。扫描/上传阶段的细分状态由各自控制器持有,
/// 这里只管「人在哪个屏」和跨屏数据(位姿、转换结果)。
@Observable
final class AppModel {
    enum Route {
        case loading      // 冷启动恢复会话
        case signedOut
        case home
        case scanning
        case reviewing
        case uploading
    }

    var route: Route = .loading
    var userEmail: String?
    var scans: [SupabaseService.ScanRow] = []
    var lastError: String?

    let supabase = SupabaseService.shared

    // ---- 扫描流程 ----
    var scanController = ScanSessionController()
    /// 扫描全程攒下的拍照机位(与墙体同一 ARKit 世界坐标)
    var poses: [FlatScene.CameraPose] = []
    /// 转换结果(ReviewView 画它,UploadView 传它)
    var convertedProject: HomeOSProject?
    /// 与 convertedProject.viewpoints 按下标对齐的本机照片
    var photoFiles: [URL?] = []
    /// placement/fixture id → 扫描中自动抓拍的多视角家具照片(本机临时文件)
    var objectPhotoFiles: [String: [PlanProjector.Projection.ShotAsset]] = [:]
    /// 原始 CapturedRoom JSON(备重处理);mock 模式为 nil
    var structureJSON: Data?
    /// RoomPlan 导出的 USDZ 3D 模型(真实空间模式);mock/导出失败为 nil
    var modelFileURL: URL?
    var scanId = UUID()
    var uploadStatus = ""
    /// 照片上传进度 0..1(UploadView 的进度条;0 = 未知/准备中)
    var uploadProgress: Double = 0

    /// 默认扫描名:「全屋 · 7月15日 14:30」—— 桶里一排「未命名扫描」谁也分不清
    static func defaultScanLabel(now: Date = Date()) -> String {
        let df = DateFormatter()
        df.locale = Locale(identifier: "zh_CN")
        df.dateFormat = "M月d日 HH:mm"
        return "全屋 · \(df.string(from: now))"
    }

    /// 本次扫描的范围:full 全屋 / partial 房间更新(网页端只动扫到的那片)
    var scanScope: String = "full"

    @MainActor
    func startScanning(scope: String = "full") {
        scanScope = scope
        // 每次扫描用**全新的 ARSession**:上次扫描(尤其是取消)会把共享
        // session 停死,在死 session 上重开 RoomCaptureSession 起不来 ——
        // 实测「取消后再扫,取景一直黑屏」就是它。
        scanController.reset()
        scanController = ScanSessionController()
        // 新控制器要重新喂永久户型(内存丢了就读本地缓存,不等网络)
        scanController.setCanonicalHome(CanonicalHomeCache.load())
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

    /// 现场 Home Frame 配准结果(扫描结束时从控制器接走,预览页显示)
    var lastHomeFrame: HomeFrame.Registration?

    /// 「全部完成」:合并房间 → 压平 → 投影 → 预览
    @MainActor
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
    @MainActor
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
            scanScope: scanScope == "partial" ? "partial" : nil
        )
        convertedProject = projection.project
        objectPhotoFiles = projection.objectPhotos
        photoFiles = scene.poses.map(\.photoFileURL)
        runRealityCheck()
        route = .reviewing
        persistPending()
    }

    /// 现实核对结果(预览页「现实核对」区;nil = 没有户型副本或配准没过门)
    var realityCheck: RealityCheck.Result?

    /// 扫描 → 与永久户型比对:认出的换真名,分类进 realityCheck
    @MainActor
    private func runRealityCheck() {
        realityCheck = nil
        guard var project = convertedProject,
              let home = CanonicalHomeCache.load(),
              let rc = RealityCheck.run(scan: project, home: home) else { return }
        RealityCheck.adoptLabels(into: &project, result: rc)
        convertedProject = project
        realityCheck = rc
    }

    /// 预览页里改类别(RoomPlan 认错时长按修正),改完重新落盘
    @MainActor
    func correctPlacement(id: String, kind: String, label: String) {
        guard var project = convertedProject,
              let i = project.placements.firstIndex(where: { $0.id == id }) else { return }
        project.placements[i].kind = kind
        project.placements[i].label = label
        convertedProject = project
        persistPending()
    }

    /// 落盘:从转换完成起,断网/被杀都不丢这次扫描(上传成功才清)。
    /// 后台拷,几十张照片 ~0.2s,别卡预览页出场
    @MainActor
    private func persistPending() {
        guard let project = convertedProject else { return }
        let snapshot = (
            scanId: scanId, project: project, photos: photoFiles,
            objects: objectPhotoFiles, structure: structureJSON, model: modelFileURL
        )
        Task.detached(priority: .utility) {
            try? PendingScanStore.save(
                scanId: snapshot.scanId,
                project: snapshot.project,
                photoFiles: snapshot.photos,
                objectPhotoFiles: snapshot.objects,
                structureJSON: snapshot.structure,
                modelFileURL: snapshot.model
            )
        }
    }

    /// 上次没传完的扫描(冷启动从盘上捞的)—— 首页给「继续上传」入口
    var pendingScan: PendingScanStore.Manifest?

    /// 恢复落盘的扫描 → 直接进预览页(照片用落盘副本)
    @MainActor
    func restorePendingScan() {
        guard let m = pendingScan else { return }
        let r = PendingScanStore.restore(m)
        scanId = m.scanId
        convertedProject = m.project
        photoFiles = r.photoFiles
        objectPhotoFiles = r.objectPhotoFiles
        structureJSON = r.structureJSON
        modelFileURL = r.modelFileURL
        pendingScan = nil
        runRealityCheck() // 落盘副本恢复后重算现实核对(采纳真名幂等)
        route = .reviewing
    }

    @MainActor
    func discardPendingScan() {
        PendingScanStore.clear()
        pendingScan = nil
    }

    #if DEBUG
    /// 模拟器联调:跳过 RoomPlan,用 MockScan 的 FlatScene 走转换→预览→上传全链路
    @MainActor
    func loadMockScan() {
        scanId = UUID()
        let scene = MockScan.scene()
        poses = scene.poses
        structureJSON = nil
        modelFileURL = nil
        applyScene(scene)
    }
    #endif

    @MainActor
    func cancelScanning() {
        scanController.reset()
        poses = []
        // 预览页「放弃」= 明确不要这次扫描,盘上副本一起丢
        PendingScanStore.clear()
        route = .home
    }

    @MainActor
    func upload(label: String) async {
        guard let project = convertedProject else { return }
        route = .uploading
        uploadStatus = "准备上传…"
        uploadProgress = 0
        do {
            try await supabase.uploadScan(
                scanId: scanId,
                project: project,
                photoFiles: photoFiles,
                objectPhotoFiles: objectPhotoFiles,
                structureJSON: structureJSON,
                modelFileURL: modelFileURL,
                label: label,
                device: "\(UIDevice.current.name) / iOS \(UIDevice.current.systemVersion)",
                onProgress: { [weak self] msg in self?.uploadStatus = msg },
                onFraction: { [weak self] f in self?.uploadProgress = f }
            )
            uploadStatus = ""
            convertedProject = nil
            PendingScanStore.clear() // 传完了,盘上的保险副本使命结束
            route = .home
            await refreshScans()
        } catch {
            uploadStatus = ""
            lastError = "上传失败:\(error.localizedDescription)"
            route = .reviewing
        }
    }

    @MainActor
    func bootstrap() async {
        let restored = await supabase.restoreSession()
        userEmail = supabase.currentUserEmail
        // 上次有没传完的扫描?登录态无关 —— 先捞出来,首页给恢复入口
        pendingScan = PendingScanStore.load()
        route = restored ? .home : .signedOut
        if restored { await refreshScans() }
        // 永久户型(优化副本):设备端重定位与漏扫检测的基准;断网退本地缓存
        scanController.setCanonicalHome(await supabase.fetchCanonicalHome())
    }

    @MainActor
    func signIn(email: String, password: String) async {
        lastError = nil
        do {
            try await supabase.signIn(email: email, password: password)
            userEmail = supabase.currentUserEmail
            route = .home
            await refreshScans()
        } catch {
            lastError = "登录失败:\(error.localizedDescription)"
        }
    }

    @MainActor
    func signOut() async {
        try? await supabase.signOut()
        userEmail = nil
        scans = []
        route = .signedOut
    }

    @MainActor
    func refreshScans() async {
        do {
            scans = try await supabase.listScans()
        } catch {
            lastError = "拉取扫描列表失败:\(error.localizedDescription)"
        }
    }
}
