import Foundation
import Supabase

/// 上传一次扫描:照片逐张 → structure.json → 最后 upsert scans 行。
/// 行最后写,保证列表里只出现完整扫描;照片路径 uuid 幂等,断点重传不脏。
extension SupabaseService {
    struct ScanRowInsert: Encodable {
        let id: UUID
        let updatedAt: Int64
        let deleted: Bool
        let device: String
        let label: String
        let payload: ScanPayload

        enum CodingKeys: String, CodingKey {
            case id
            case updatedAt = "updated_at"
            case deleted
            case device
            case label
            case payload
        }
    }

    func uploadScan(
        scanId: UUID,
        project: HomeOSProject,
        photoFiles: [URL?],
        structureJSON: Data?,
        modelFileURL: URL?,
        label: String,
        device: String,
        onProgress: @escaping @MainActor (String) -> Void
    ) async throws {
        guard let uid = currentUserId else {
            throw NSError(domain: "HomeScan", code: 1, userInfo: [NSLocalizedDescriptionKey: "未登录"])
        }
        var project = project
        let storage = client.storage.from(Config.scanPhotoBucket)
        let prefix = "\(uid.uuidString.lowercased())/\(scanId.uuidString.lowercased())"

        // 1) 照片逐张(与 viewpoints 按下标对齐)
        let withPhotos = photoFiles.enumerated().filter { $0.element != nil }
        var done = 0
        for (i, fileURL) in withPhotos {
            guard let fileURL, i < project.viewpoints.count else { continue }
            let data = try Data(contentsOf: fileURL)
            let path = "\(prefix)/\(UUID().uuidString.lowercased()).jpg"
            await onProgress("上传照片 \(done + 1)/\(withPhotos.count)…")
            try await storage.upload(
                path,
                data: data,
                options: FileOptions(contentType: "image/jpeg", upsert: true)
            )
            project.viewpoints[i].photoPath = path
            done += 1
        }

        // 2) 原始结构 JSON(备将来重处理) + USDZ 3D 模型(真实空间模式)
        var raw = ScanPayload.RawRefs()
        if let structureJSON {
            await onProgress("上传原始结构…")
            let path = "\(prefix)/structure.json"
            try await storage.upload(
                path,
                data: structureJSON,
                options: FileOptions(contentType: "application/json", upsert: true)
            )
            raw.structurePath = path
        }
        if let modelFileURL, let modelData = try? Data(contentsOf: modelFileURL) {
            await onProgress("上传 3D 模型(\(modelData.count / 1_048_576) MB)…")
            let path = "\(prefix)/model.usdz"
            try await storage.upload(
                path,
                data: modelData,
                options: FileOptions(contentType: "model/vnd.usdz+zip", upsert: true)
            )
            raw.modelPath = path
        }
        let rawRefs: ScanPayload.RawRefs? =
            (raw.structurePath == nil && raw.modelPath == nil) ? nil : raw

        // 3) scans 行(最后写)
        await onProgress("写入扫描记录…")
        let row = ScanRowInsert(
            id: scanId,
            updatedAt: Int64(Date().timeIntervalSince1970 * 1000),
            deleted: false,
            device: device,
            label: label,
            payload: ScanPayload(
                scanId: scanId.uuidString.lowercased(),
                homeos: project,
                raw: rawRefs
            )
        )
        try await client.schema("home").from("scans").upsert(row, onConflict: "user_id,id").execute()
    }
}
