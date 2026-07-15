import Foundation
import UIKit

/// 上传:并发续传细节在 SupabaseService.uploadScan(ScanUploader.swift),
/// 这里只管路由与进度状态。
extension AppModel {
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
}
