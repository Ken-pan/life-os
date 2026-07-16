import Foundation

/// 扫描落盘与恢复:转换完成即持久化,断网/被杀不丢;上传成功或明确放弃才清。
/// 状态属性(pendingScan)在 AppModel.swift。
extension AppModel {
    /// 落盘:从转换完成起,断网/被杀都不丢这次扫描(上传成功才清)。
    /// 后台拷;同一 scanId 重复落盘(改类别后)只重写 manifest,照片不重拷
    func persistPending() {
        guard let project = convertedProject else { return }
        let snapshot = (
            scanId: scanId, project: project, photos: photoFiles,
            objects: objectPhotoFiles, structure: structureJSON, model: modelFileURL
        )
        pendingSaveTask = Task.detached(priority: .utility) {
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

    /// 「稍后再传」:留着盘上的副本回首页,首页的「继续」入口能原样捞回来。
    ///
    /// 这条路以前**根本不存在** —— 预览页只有「放弃」(毁掉)和「上传」两个出口,
    /// 想晚点再传的人只能杀进程,或者手滑点了放弃。
    func keepScanForLater() async {
        // 等落盘写完再走。不等的话 load() 可能读不到 manifest,首页就不显示
        // 「有一次没传完的扫描」—— 数据其实在盘上,但人看到的是它没了。
        await pendingSaveTask?.value
        scanController.reset()
        poses = []
        convertedProject = nil
        // 盘上副本**不清** —— 这正是与 cancelScanning() 的唯一区别
        pendingScan = PendingScanStore.load()
        route = .home
    }

    /// 恢复落盘的扫描 → 直接进预览页(照片用落盘副本)
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

    func discardPendingScan() {
        PendingScanStore.clear()
        pendingScan = nil
    }
}
