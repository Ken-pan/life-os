import Foundation
import Observation
import RoomPlan
import UIKit

/// App 全局状态机 —— 只管「人在哪个屏」和跨屏数据;各阶段的细分状态由
/// 各自控制器持有(扫描 ScanSessionController、寻物 ARLocateController…)。
///
/// 分层约定(详见 ARCHITECTURE.md):
/// - **属性全部住在这个文件**(Swift extension 不能存属性,想找状态只看这里);
/// - 方法按职责拆在 `AppModel+ScanFlow` / `AppModel+Pending` / `AppModel+Upload`;
/// - 整类 @MainActor:UI 状态只在主线程动,后台工作用 Task.detached 带值快照出去。
@Observable
@MainActor
final class AppModel {
    enum Route {
        case loading      // 冷启动恢复会话
        case signedOut
        case home
        case scanning
        case reviewing
        case uploading
    }

    // ---- 账号与导航 ----
    var route: Route = .loading
    var userEmail: String?
    var scans: [SupabaseService.ScanRow] = []
    var lastError: String?
    let supabase = SupabaseService.shared

    /// 永久户型(启动拉取,断网退缓存)—— 设备端重定位/现实核对/AR 寻物共用
    var canonicalHome: CanonicalHome?

    // ---- 扫描流程(方法见 AppModel+ScanFlow)----
    var scanController = ScanSessionController()
    /// 本次扫描的范围:full 全屋 / partial 房间更新(网页端只动扫到的那片)
    var scanScope: String = "full"
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
    /// 现场 Home Frame 配准结果(扫描结束时从控制器接走,预览页显示)
    var lastHomeFrame: HomeFrame.Registration?
    /// 现实核对结果(预览页「现实核对」区;nil = 没有户型副本或配准没过门)
    var realityCheck: RealityCheck.Result?

    // ---- 落盘恢复(方法见 AppModel+Pending)----
    /// 上次没传完的扫描(冷启动从盘上捞的)—— 首页给「继续上传」入口
    var pendingScan: PendingScanStore.Manifest?

    // ---- 上传(方法见 AppModel+Upload)----
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

    // ---- 启动与账号 ----

    func bootstrap() async {
        let restored = await supabase.restoreSession()
        userEmail = supabase.currentUserEmail
        // 上次有没传完的扫描?登录态无关 —— 先捞出来,首页给恢复入口
        pendingScan = PendingScanStore.load()
        route = restored ? .home : .signedOut
        if restored { await refreshScans() }
        // 永久户型(优化副本):设备端重定位/漏扫检测/AR 寻物的基准;断网退本地缓存
        canonicalHome = await supabase.fetchCanonicalHome()
        scanController.setCanonicalHome(canonicalHome)
    }

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

    func signOut() async {
        try? await supabase.signOut()
        userEmail = nil
        scans = []
        route = .signedOut
    }

    func refreshScans() async {
        do {
            scans = try await supabase.listScans()
        } catch {
            lastError = "拉取扫描列表失败:\(error.localizedDescription)"
        }
    }
}
