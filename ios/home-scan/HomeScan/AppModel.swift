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
    /// 原始 CapturedRoom JSON(备重处理);mock 模式为 nil
    var structureJSON: Data?
    /// RoomPlan 导出的 USDZ 3D 模型(真实空间模式);mock/导出失败为 nil
    var modelFileURL: URL?
    var scanId = UUID()
    var uploadStatus = ""

    @MainActor
    func startScanning() {
        poses = []
        convertedProject = nil
        photoFiles = []
        structureJSON = nil
        modelFileURL = nil
        scanId = UUID()
        route = .scanning
    }

    /// 「全部完成」:合并房间 → 压平 → 投影 → 预览
    @MainActor
    func finishScanning() async {
        do {
            let structure = try await scanController.mergeAll()
            structureJSON = try? JSONEncoder().encode(structure)
            // 真实空间模式:导出带家具网格的 USDZ,预览页可 3D 查看/AR/分享
            let usdz = FileManager.default.temporaryDirectory
                .appendingPathComponent("scan-\(scanId.uuidString.lowercased()).usdz")
            try? structure.export(to: usdz, exportOptions: .model)
            modelFileURL = FileManager.default.fileExists(atPath: usdz.path) ? usdz : nil
            var scene = StructureFlattener.flatten(structure: structure)
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
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        let project = PlanProjector.project(
            scene,
            scanId: scanId.uuidString.lowercased(),
            nameZh: "扫描 \(df.string(from: Date()))"
        )
        convertedProject = project
        photoFiles = scene.poses.map(\.photoFileURL)
        route = .reviewing
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
        route = .home
    }

    @MainActor
    func upload(label: String) async {
        guard let project = convertedProject else { return }
        route = .uploading
        uploadStatus = "准备上传…"
        do {
            try await supabase.uploadScan(
                scanId: scanId,
                project: project,
                photoFiles: photoFiles,
                structureJSON: structureJSON,
                modelFileURL: modelFileURL,
                label: label,
                device: "\(UIDevice.current.name) / iOS \(UIDevice.current.systemVersion)",
                onProgress: { [weak self] msg in self?.uploadStatus = msg }
            )
            uploadStatus = ""
            convertedProject = nil
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
        route = restored ? .home : .signedOut
        if restored { await refreshScans() }
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
