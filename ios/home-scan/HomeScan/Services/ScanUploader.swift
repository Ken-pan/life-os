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
        objectPhotoFiles: [String: [PlanProjector.Projection.ShotAsset]] = [:],
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

        // 1) 照片逐张(与 viewpoints 按下标对齐)。
        //    路径按机位 id 确定性定名 —— 断点重传原地覆盖(upsert),
        //    不会像随机 UUID 那样每次重试都在桶里攒一份孤儿文件。
        let withPhotos = photoFiles.enumerated().filter { $0.element != nil }
        var done = 0
        for (i, fileURL) in withPhotos {
            guard let fileURL, i < project.viewpoints.count else { continue }
            let data = try Data(contentsOf: fileURL)
            let path = "\(prefix)/\(project.viewpoints[i].id).jpg"
            await onProgress("上传照片 \(done + 1)/\(withPhotos.count)…")
            try await storage.upload(
                path,
                data: data,
                options: FileOptions(contentType: "image/jpeg", upsert: true)
            )
            project.viewpoints[i].photoPath = path
            done += 1
        }

        // 1b) 家具多视角证据包(按 placement/fixture id + 序号定名 ——
        //     幂等,断点重传不脏)。单张失败跳过:证据少一张不该拖垮整次上传。
        let objectShots = objectPhotoFiles.sorted { $0.key < $1.key }
        let totalShots = objectShots.reduce(0) { $0 + $1.value.count }
        var objDone = 0
        for (id, assets) in objectShots {
            var uploaded: [HomeOSProject.ObjectAttrs.ObjectPhoto] = []
            for (k, asset) in assets.enumerated() {
                guard let data = try? Data(contentsOf: asset.url) else { continue }
                let path = "\(prefix)/obj-\(id)-\(k).jpg"
                objDone += 1
                await onProgress("上传家具照片 \(objDone)/\(totalShots)…")
                do {
                    try await storage.upload(
                        path,
                        data: data,
                        options: FileOptions(contentType: "image/jpeg", upsert: true)
                    )
                } catch { continue }
                uploaded.append(.init(path: path, azimuthDeg: asset.azimuthDeg))
            }
            guard !uploaded.isEmpty else { continue }
            if let i = project.placements.firstIndex(where: { $0.id == id }) {
                var attrs = project.placements[i].attrs ?? HomeOSProject.ObjectAttrs()
                attrs.photoPath = uploaded[0].path
                attrs.photos = uploaded
                project.placements[i].attrs = attrs
            } else if let i = project.fixtures.firstIndex(where: { $0.id == id }) {
                var attrs = project.fixtures[i].attrs ?? HomeOSProject.ObjectAttrs()
                attrs.photoPath = uploaded[0].path
                attrs.photos = uploaded
                project.fixtures[i].attrs = attrs
            }
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
