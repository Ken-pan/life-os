import Foundation
import RoomPlan

/// 扫描流程:开扫 → 逐房 → 合并压平投影 → 现实核对 → 预览(→ 上传见 +Upload)。
/// 状态属性都在 AppModel.swift,这里只有动作。
extension AppModel {
    func startScanning(scope: String = "full") {
        scanScope = scope
        // 每次扫描一个独立日志会话:环境快照(热/电/盘/内存)是解读后面一切
        // 性能数据的底色 —— 38° 的手机和刚开机的手机,同一段代码两个世界
        ScanLog.shared.beginSession(kind: "scan-\(scope)", env: ScanLog.envSnapshot())
        ScanLog.shared.markActive()
        ScanLog.shared.startMemorySampling()
        ScanLog.shared.log("scan", "scan_started", ["scope": .string(scope)])
        // 每次扫描用**全新的 ARSession**:上次扫描(尤其是取消)会把共享
        // session 停死,在死 session 上重开 RoomCaptureSession 起不来 ——
        // 实测「取消后再扫,取景一直黑屏」就是它。
        scanController.reset()
        scanController = ScanSessionController()
        // 安静/高精度偏好(HomeView 设置区,默认安静):每次扫描按当前偏好喂进去
        scanController.quietScan =
            UserDefaults.standard.object(forKey: ScanSessionController.quietScanKey) as? Bool ?? true
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

    /// 「全部完成」:合并房间 → 压平 → 投影 → 预览。
    ///
    /// ⚠️ 这里的重活**必须**待在主线程之外。AppModel 整类 @MainActor,而
    /// USDZ 导出 / JSON 编码 / 压平都是同步调用 —— 直接写在这个方法里就是拿主线程
    /// 去跑它们。一整套房子的网格导出是秒级的,那十几秒里 App 是**真的冻住**:
    /// 按钮上那个转圈只是 CA 在渲染进程里空转,点什么都没反应,看着就是崩了。
    /// (ARCHITECTURE.md 的「后台工作用 Task.detached 带值快照出去」说的就是这个,
    /// 落盘那条路一直照做,最重的这条以前反而没做。)
    ///
    /// DEBUG 下带**主线程卡顿探针**:这条路只有真机 + 真实房间才走得到
    /// (模拟器没 LiDAR,mergeAll 拿不到数据),模拟器和单测都验不了它 ——
    /// 所以让它自己把证据打出来,别靠嘴说「我挪到后台了」。
    func finishScanning() async {
        lastHomeFrame = scanController.homeFrame
        let rooms = scanController.roomCount
        let probe = MainThreadStallProbe(label: "finishScanning")
        probe.start()
        defer { probe.stop() }
        do {
            probe.mark("合并 \(rooms) 间")
            processingStatus = rooms > 1 ? "正在合并 \(rooms) 个房间…" : "正在处理这个房间…"
            let endMerge = ScanLog.shared.time("perf", "merge_all")
            let structure = try await scanController.mergeAll()
            endMerge(["rooms": .num(Double(rooms))])

            probe.mark("导模型+压平(后台)")
            processingStatus = "正在生成 3D 模型与平面图…"
            // 值快照带出去,不捎带 self
            let shots = scanController.shotCapture.allShots
            let id = scanId
            let endExport = ScanLog.shared.time("perf", "export_flatten")
            let out = await Task.detached(priority: .userInitiated) {
                () -> (json: Data?, model: URL?, scene: FlatScene) in
                let json = try? JSONEncoder().encode(structure)
                // 真实空间模式:导出带家具网格的 USDZ,预览页可 3D 查看/AR/分享
                let usdz = FileManager.default.temporaryDirectory
                    .appendingPathComponent("scan-\(id.uuidString.lowercased()).usdz")
                try? structure.export(to: usdz, exportOptions: .model)
                let model = FileManager.default.fileExists(atPath: usdz.path) ? usdz : nil
                let scene = StructureFlattener.flatten(structure: structure, shots: shots)
                return (json, model, scene)
            }.value
            endExport([
                "jsonKB": .num(Double((out.json?.count ?? 0) / 1024)),
                "usdz": .bool(out.model != nil),
            ])

            probe.mark("投影+落盘(主线程)")
            structureJSON = out.json
            modelFileURL = out.model
            var scene = out.scene
            scene.poses = poses
            let endProject = ScanLog.shared.time("perf", "project_apply")
            applyScene(scene)
            endProject([:])
            probe.mark("进预览页")
        } catch {
            ScanLog.shared.error("scan", "merge_failed", error, ["rooms": .num(Double(rooms))])
            lastError = "合并扫描失败:\(error.localizedDescription)"
            route = .home
        }
        ScanLog.shared.stopMemorySampling()
        // 扫后环境对账:电量掉了几格、热到什么档 —— 一次扫描的真实硬件成本
        ScanLog.shared.logEnvEnd(ScanLog.envSnapshot())
        processingStatus = nil
        scanController.reset()
    }

    /// FlatScene → HomeOSProject(mock 与真扫共用的汇合点)
    func applyScene(_ scene: FlatScene) {
        // 证据完备度把关:哪些家具的多视角照片没凑够,进预览页「提醒」区
        // (跟着 scanWarnings 一起上传 —— 网页端也能看到这次扫描的证据短板)。
        // **认账家的记忆**:成功对齐已知户型的重扫,权威副本已有照片,不必逐件重拍 ——
        // 这条只会把没重拍的件误报成「N 件证据不足」的噪声,压掉。只在建家/没对齐时提示。
        var scene = scene
        if lastHomeFrame?.ok != true {
            scene.warnings += EvidenceGuide.sceneWarnings(scene)
        }
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
            canonicalHome: canonicalHome ?? CanonicalHomeCache.load(),
            // 现场地理上下文:GPS + 罗盘北向初值 → 网页端阳光模拟免手填
            geo: scanController.geo.summary()
        )
        convertedProject = projection.project
        objectPhotoFiles = projection.objectPhotos
        photoFiles = scene.poses.map(\.photoFileURL)
        // 转换产出的规模摘要:一次扫描认出多少东西、带多少证据照,是检测质量
        // 与门槛常数长期调优的基线数据
        ScanLog.shared.log("convert", "scene_applied", [
            "placements": .num(Double(projection.project.placements.count)),
            "fixtures": .num(Double(projection.project.fixtures.count)),
            "viewpoints": .num(Double(projection.project.viewpoints.count)),
            "objectPhotos": .num(Double(projection.objectPhotos.values.reduce(0) { $0 + $1.count })),
            "warnings": .num(Double(scene.warnings.count)),
            "sqft": .num((projection.project.meta.sqft ?? -1).rounded()),
        ])
        runRealityCheck()
        route = .reviewing
        // pendingScan 的语义是「首页那个『继续上传』该指向谁」。这次扫描已经
        // 摊在预览页上了 —— 它不是"待恢复"的,它就在你眼前,所以这里必须是 nil。
        //
        // 不清的话会留下一个**指向已删文件**的幽灵:落盘只留最新一次(persistPending
        // 换 scanId 时会整目录清掉重来),上一次没传完的 A 的照片此刻已经没了,
        // 而内存里的 pendingScan 还是 A。目前从预览页出去的三条路都会各自纠正它,
        // 所以看不见 —— 但那是巧合,不是设计。让不变式一直成立。
        pendingScan = nil
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
        // 漏检警告随 payload 上传(网页端合并靠它降级成「外观增强」不删件):认出
        // 率低 + 漏检 ≥3 件才提醒(单件搬走是常态,一打集体没扫到才是覆盖问题)。
        let seen = rc.recognized.count + rc.missing.count
        if rc.missing.count >= 3, seen > 0, Double(rc.recognized.count) / Double(seen) < 0.7 {
            let names = rc.missing.prefix(5).joined(separator: "、")
            let more = rc.missing.count > 5 ? " 等 \(rc.missing.count) 件" : ""
            let warn = "这次只认出 \(rc.recognized.count)/\(seen) 件,还没扫到:\(names)\(more) —— 贴近补扫,或上传后网页端会保留没扫到的件(不删)"
            if !project.meta.scanWarnings.contains(warn) {
                project.meta.scanWarnings.append(warn)
            }
        }
        convertedProject = project
        realityCheck = rc
        // 认亲成绩单:识别率(认出/新件/没扫到/不敢认)是 ScanIdentity 打分
        // 常数是否失准的直接信号
        ScanLog.shared.log("convert", "reality_check", [
            "recognized": .num(Double(rc.recognized.count)),
            "added": .num(Double(rc.added.count)),
            "missing": .num(Double(rc.missing.count)),
            "possiblySame": .num(Double(rc.possiblySame)),
            "registeredCm": .num(rc.registeredCm ?? -1),
        ])
    }

    /// 预览页里改类别(RoomPlan 认错时长按修正),改完重新落盘
    func correctPlacement(id: String, kind: String, label: String) {
        guard var project = convertedProject,
              let i = project.placements.firstIndex(where: { $0.id == id }) else { return }
        // 用户改类别 = RoomPlan 认错了。改了什么→什么,是检测质量的一等反馈
        ScanLog.shared.log("ux", "kind_corrected", [
            "from": .string(project.placements[i].kind),
            "to": .string(kind),
        ])
        ScanLog.shared.counter { $0.count("review_kind_fixes") }
        project.placements[i].kind = kind
        project.placements[i].label = label
        convertedProject = project
        persistPending()
    }

    /// 放弃**这一次**扫描。
    ///
    /// ⚠️ 「这一次」三个字是要害。以前这里无条件 `PendingScanStore.clear()`,而
    /// `startScanning` 根本不碰盘上副本 —— 于是:首页挂着上次没传完的扫描 A,
    /// 你点「全屋扫描」,一间还没扫就点「取消」(此时 hasProgress=false,连确认
    /// 都不弹),**A 的照片就被删光了**。内存里的 pendingScan 还是 A,首页继续
    /// 显示「有一次没传完的扫描 · 继续」,点进去是个照片全空的壳子。
    /// 所以只清盘上副本确实属于本次 scanId 的情况。
    func cancelScanning() {
        // 人在哪一步放弃 = UX 最痛的位置。带上已扫进度:扫了 3 间才放弃和
        // 一间没扫就退,是两种完全不同的问题
        ScanLog.shared.log("ux", "scan_cancelled", [
            "rooms": .num(Double(scanController.roomCount)),
            "poses": .num(Double(poses.count)),
        ])
        ScanLog.shared.stopMemorySampling()
        scanController.reset()
        poses = []
        let id = scanId
        let saving = pendingSaveTask
        // 落盘是后台跑的:必须等它收尾再判断,否则它会在我们清完之后才落地,
        // 留下一个「你明明放弃了、首页还问你要不要继续」的幽灵副本。
        // 视图层不必等 —— 立刻回首页。
        Task {
            await saving?.value
            guard PendingScanStore.load()?.scanId == id else { return }
            PendingScanStore.clear()
            pendingScan = nil
        }
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
