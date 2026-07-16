import Foundation
import UIKit

/// 上传:并发续传细节在 SupabaseService.uploadScan(ScanUploader.swift),
/// 这里只管路由与进度状态。
extension AppModel {
    /// 起一次上传并留住句柄 —— UploadView 的「取消」靠它。
    /// 视图层只调这个,别直接 await upload():那样拿不到 Task,就取消不了。
    func startUpload(label: String) {
        uploadTask = Task { await upload(label: label) }
    }

    /// 用户主动取消上传。已传的部分留在桶里,下次续传直接跳过,不浪费。
    func cancelUpload() {
        uploadTask?.cancel()
    }

    func upload(label: String) async {
        guard var project = convertedProject else { return }
        // 扫描诊断摘要随行上传:网页端(和以后的自己)不用连手机也能看到
        // 这次扫描热不热、卡没卡、门控拦了多少 —— 调参数不再靠回忆
        project.meta.scanDiagnostics = ScanLog.shared.diagnosticsSummary()
        ScanLog.shared.log("upload", "upload_started", [
            "photos": .num(Double(photoFiles.compactMap { $0 }.count)),
            "objectAssets": .num(Double(objectPhotoFiles.values.reduce(0) { $0 + $1.count })),
            "hasModel": .bool(modelFileURL != nil),
        ])
        route = .uploading
        // 重试前先清掉上次的失败,否则传成功了预览页那行红字还挂着
        lastError = nil
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
            pendingScan = nil
            route = .home
            await refreshScans()
            // 成功要有个「成了」的时刻。以前是:传完 → 画面自己跳回首页 → 没了。
            // 人刚花了十几分钟扫、又等了几分钟传,拿到的反馈是零 —— 只能自己去
            // 列表里找,确认它是不是真上去了。
            // 触觉是给"没在看屏幕的人"的:上传几分钟里人多半已经把手机搁一边了。
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            justUploaded = label
        } catch {
            uploadStatus = ""
            uploadProgress = 0
            // 用户自己按的取消不是故障 —— 报一行红字「上传失败:cancelled」
            // 只会让人以为出事了。URLSession 抛 URLError.cancelled、结构化并发
            // 抛 CancellationError,两种都认。
            let cancelled = Task.isCancelled
                || error is CancellationError
                || (error as? URLError)?.code == .cancelled
            if !cancelled {
                ScanLog.shared.error("upload", "upload_failed", error)
                lastError = "上传失败:\(error.localizedDescription)"
            } else {
                ScanLog.shared.log("ux", "upload_cancelled")
            }
            route = .reviewing
        }
    }
}
