import Foundation
import Supabase

/// 柜内扫描的云端往来:从已上传扫描里列出储物家具,把柜内测量
/// 上传到与扫描同前缀的私有桶(免迁移的加法式契约,见 apps/home/supabase/README.md):
/// `{uid}/{scanId}/container-{placementId}.json` + `container-{placementId}-{k}.jpg`。
/// 路径按 placementId 确定性定名 —— 重测同一个柜子原地覆盖,不攒垃圾。
extension SupabaseService {
    /// 可作为收纳容器的 placement kind(与网页端 PLACEMENT_KINDS 的
    /// storable 家具对齐;iOS 扫描只会产出 cabinet/shelf,其余是网页端
    /// 用户改类目后的可能值)
    static let containerKinds: Set<String> = [
        "cabinet", "shelf", "wardrobe", "dresser", "cube_shelf",
        "wall_cabinet", "base_cabinet", "shoe_cabinet", "sideboard",
        "tv_stand", "nightstand", "bookshelf",
    ]

    /// 只解需要的字段:服务器优化副本可能带 storageZones 等新键,
    /// 也可能裁掉带默认值的键 —— 全量 HomeOSProject 解码太脆,slim 最稳。
    private struct PayloadRow: Decodable {
        let payload: Slim

        struct Slim: Decodable {
            let homeos: Homeos
        }

        struct Homeos: Decodable {
            let placements: [HomeOSProject.Placement]
        }
    }

    /// 这次扫描里能开门扫内部的家具(柜/架/衣柜…)
    func storagePlacements(scanId: UUID) async throws -> [HomeOSProject.Placement] {
        let rows: [PayloadRow] = try await client.schema("home")
            .from("scans")
            .select("payload")
            .eq("id", value: scanId)
            .limit(1)
            .execute()
            .value
        let placements = rows.first?.payload.homeos.placements ?? []
        return placements.filter { Self.containerKinds.contains($0.kind) }
    }

    /// 照片先传(定名幂等),JSON 最后写 —— 桶里出现 container JSON 即数据完整
    func uploadContainer(
        scanId: UUID,
        payload: ContainerGeometry.Payload,
        photoFiles: [URL],
        onProgress: @escaping @MainActor (String) -> Void
    ) async throws {
        guard let uid = currentUserId else {
            throw NSError(
                domain: "HomeScan", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "未登录"]
            )
        }
        var payload = payload
        let storage = client.storage.from(Config.scanPhotoBucket)
        let prefix = "\(uid.uuidString.lowercased())/\(scanId.uuidString.lowercased())"

        var paths: [String] = []
        for (k, fileURL) in photoFiles.enumerated() {
            guard let data = try? Data(contentsOf: fileURL) else { continue }
            let path = "\(prefix)/container-\(payload.placementId)-\(k).jpg"
            await onProgress("上传照片 \(k + 1)/\(photoFiles.count)…")
            try await storage.upload(
                path,
                data: data,
                options: FileOptions(contentType: "image/jpeg", upsert: true)
            )
            paths.append(path)
        }
        payload.photos = paths

        await onProgress("写入柜内数据…")
        let json = try JSONEncoder().encode(payload)
        try await storage.upload(
            "\(prefix)/container-\(payload.placementId).json",
            data: json,
            options: FileOptions(contentType: "application/json", upsert: true)
        )
    }
}
