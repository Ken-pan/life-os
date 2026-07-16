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
    /// 冷启动等超过 3 秒 —— 让 .loading 那个纯转圈能说句人话,并给个「跳过」出口
    var bootstrapSlow = false
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
    /// 「全部完成」之后的处理进度(合并/导模型/投影)。nil = 没在处理。
    /// 这一段要跑好几秒,不报进度的话人只能盯着一个转圈的按钮猜是不是死了。
    var processingStatus: String?

    // ---- 落盘恢复(方法见 AppModel+Pending)----
    /// 上次没传完的扫描(冷启动从盘上捞的)—— 首页给「继续上传」入口
    var pendingScan: PendingScanStore.Manifest?
    /// 落盘任务的句柄。「稍后再传」必须先 await 它:落盘是后台拷几十 MB 照片,
    /// 刚进预览页就点的话 manifest 还没写完,首页 load() 捞不到 —— 人看到的
    /// 就是「我的扫描没了」。
    var pendingSaveTask: Task<Void, Never>?

    // ---- 上传(方法见 AppModel+Upload)----
    /// 上传任务句柄 —— 有它才取消得掉。中途取消是安全的:上传按「桶里已有的同名
    /// 文件直接跳过」续传(ScanUploader),取消只是停在半路,已传的下次不重来。
    var uploadTask: Task<Void, Never>?
    var uploadStatus = ""
    /// 刚传成功的那一次叫什么名字 —— 首页据此给一条「传好了」的确认条。
    /// 看过就清(首页 onAppear 起定时器),它是个「时刻」,不是个状态。
    var justUploaded: String?
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
        bootstrapSlow = false
        // 恢复会话要发网络请求刷 token。超时已收到 15s,但 15s 的纯转圈仍然是
        // 「这 App 卡死了吧」——3 秒还没回就承认「网络有点慢」,让人知道在等什么。
        let slowFlag = Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            bootstrapSlow = true
        }
        let restored = await supabase.restoreSession()
        slowFlag.cancel()
        bootstrapSlow = false
        userEmail = supabase.currentUserEmail
        // 上次有没传完的扫描?登录态无关 —— 先捞出来,首页给恢复入口
        pendingScan = PendingScanStore.load()
        // ⚠️ 只有还停在 .loading 才由我们决定去哪。慢网下用户可能已经点了「用账号
        // 密码登录」并手动登进去了 —— 这时再按 restoreSession 的旧结果赋值,
        // 会把刚登录成功的人一脚踢回登录页。
        if route == .loading {
            route = restored ? .home : .signedOut
        }
        if route == .home { await refreshScans() }
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

    /// 删除一次扫描(立墓碑)。先在本地摘掉再发请求 —— 列表立刻有反应,
    /// 失败了再放回去并报错。等一个网络往返才消失,人会以为没点中而再点一次。
    func deleteScan(id: UUID) async {
        let backup = scans
        scans.removeAll { $0.id == id }
        do {
            try await supabase.softDeleteScan(id: id)
        } catch {
            scans = backup
            lastError = "删除失败:\(error.localizedDescription)"
        }
    }

    /// 给扫描改名。同样先落本地再发请求。
    func renameScan(id: UUID, to label: String) async {
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let backup = scans
        if let i = scans.firstIndex(where: { $0.id == id }) {
            scans[i].label = trimmed
        }
        do {
            try await supabase.renameScan(id: id, label: trimmed)
        } catch {
            scans = backup
            lastError = "改名失败:\(error.localizedDescription)"
        }
    }

    func refreshScans() async {
        do {
            scans = try await supabase.listScans()
            // 成功就把上次的红字收走 —— 否则地铁里抖一下网络,首页底部那行红字
            // 就永远挂着了:下拉刷新成功它还在,只有重装 App 才消失
            lastError = nil
        } catch {
            lastError = "拉取扫描列表失败:\(error.localizedDescription)"
        }
    }
}
