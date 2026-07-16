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
        onProgress: @escaping @MainActor (String) -> Void,
        onFraction: (@MainActor (Double) -> Void)? = nil
    ) async throws {
        guard let uid = currentUserId else {
            throw NSError(domain: "HomeScan", code: 1, userInfo: [NSLocalizedDescriptionKey: "未登录"])
        }
        var project = project
        let storage = client.storage.from(Config.scanPhotoBucket)
        let prefix = "\(uid.uuidString.lowercased())/\(scanId.uuidString.lowercased())"
        let endUpload = ScanLog.shared.time("upload", "upload_total")

        // 0) 断点续传:桶里已有的同名文件直接算成功 —— 同一 scanId 内文件内容
        //    不变(确定性定名),重试只补缺的,不重复吃流量。列表拉不到(弱网)
        //    就当全缺,退化成全量上传,语义不变。
        let existing = Set(((try? await storage.list(path: prefix)) ?? []).map(\.name))

        // 1) 照片作业单:机位 + 家具证据包,统一 3 路并发(几十张串行要等半天,
        //    并发把往返延迟叠起来);单张失败退避重试一次。
        struct Job {
            let key: String
            let name: String
            let fileURL: URL
        }
        var jobs: [Job] = []
        for (i, fileURL) in photoFiles.enumerated() {
            guard let fileURL, i < project.viewpoints.count else { continue }
            jobs.append(Job(key: "vp:\(i)", name: "\(project.viewpoints[i].id).jpg", fileURL: fileURL))
        }
        for (id, assets) in objectPhotoFiles.sorted(by: { $0.key < $1.key }) {
            for (k, asset) in assets.enumerated() {
                jobs.append(Job(key: "obj:\(id):\(k)", name: "obj-\(id)-\(k).jpg", fileURL: asset.url))
            }
        }

        let total = jobs.count
        var okKeys = Set<String>()
        var failed = 0
        let pending = jobs.filter { !existing.contains($0.name) }
        for j in jobs where existing.contains(j.name) { okKeys.insert(j.key) }
        var done = total - pending.count
        if total > 0 {
            let d = done
            await onProgress(d > 0 ? "续传:已有 \(d)/\(total) 张,补 \(pending.count) 张…" : "上传照片 0/\(total)…")
            if let onFraction { await onFraction(Double(d) / Double(total)) }
        }

        await withTaskGroup(of: (String, Bool).self) { group in
            var iterator = pending.makeIterator()
            func addNext() {
                guard let j = iterator.next() else { return }
                group.addTask {
                    guard let data = try? Data(contentsOf: j.fileURL) else {
                        // 本地文件读不到 ≠ 网络问题:多半是落盘副本被清了,单独留名
                        ScanLog.shared.log("error", "upload_file_missing", ["name": .string(j.name)])
                        return (j.key, false)
                    }
                    for attempt in 0..<2 {
                        do {
                            try await storage.upload(
                                "\(prefix)/\(j.name)",
                                data: data,
                                options: FileOptions(contentType: "image/jpeg", upsert: true)
                            )
                            ScanLog.shared.counter {
                                $0.count("upload_ok")
                                $0.add("upload_kb", Double(data.count) / 1024)
                            }
                            return (j.key, true)
                        } catch {
                            if attempt == 0 {
                                ScanLog.shared.counter { $0.count("upload_retries") }
                                try? await Task.sleep(nanoseconds: 600_000_000)
                            } else {
                                // 重试也没救的才记 error(第一次失败是弱网常态)
                                ScanLog.shared.error("upload", "photo_failed", error, [
                                    "name": .string(j.name),
                                    "kb": .num(Double(data.count) / 1024),
                                ])
                            }
                        }
                    }
                    return (j.key, false)
                }
            }
            for _ in 0..<min(3, pending.count) { addNext() }
            for await (key, ok) in group {
                done += 1
                if ok { okKeys.insert(key) } else { failed += 1 }
                let d = done
                await onProgress("上传照片 \(d)/\(total)…")
                if let onFraction { await onFraction(total > 0 ? Double(d) / Double(total) : 1) }
                addNext()
            }
        }

        // 回填:机位照片路径(只挂成功的)
        for (i, fileURL) in photoFiles.enumerated() {
            guard fileURL != nil, i < project.viewpoints.count, okKeys.contains("vp:\(i)") else { continue }
            project.viewpoints[i].photoPath = "\(prefix)/\(project.viewpoints[i].id).jpg"
        }
        // 回填:家具证据包(只挂成功的;一张没成就不写 attrs.photos)
        for (id, assets) in objectPhotoFiles {
            var uploaded: [HomeOSProject.ObjectAttrs.ObjectPhoto] = []
            for (k, asset) in assets.enumerated() where okKeys.contains("obj:\(id):\(k)") {
                uploaded.append(.init(path: "\(prefix)/obj-\(id)-\(k).jpg", azimuthDeg: asset.azimuthDeg))
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

        // 照片阶段成绩单:续传跳过几张、并发补几张、几张没救 ——
        // 弱网体验(续传是否真省流量)全靠这组数说话
        ScanLog.shared.log("upload", "photos_done", [
            "total": .num(Double(total)),
            "skipped": .num(Double(total - pending.count)),
            "ok": .num(Double(okKeys.count)),
            "failed": .num(Double(failed)),
        ])

        // 有照片没传上就不写 scans 行(列表只出现完整扫描)——
        // 重试是续传:已成功的下次直接跳过,只补缺的
        if failed > 0 {
            endUpload(["ok": .bool(false), "failed": .num(Double(failed))])
            throw NSError(domain: "HomeScan", code: 2, userInfo: [
                NSLocalizedDescriptionKey:
                    "\(failed) 张照片没传上(已传好的 \(okKeys.count) 张下次不重传)。网络稳定后再点一次上传即可续传。",
            ])
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
            // USDZ 是单笔最大的传输(几十 MB),单独计时:弱网下它决定整体等待
            let endModel = ScanLog.shared.time("upload", "model_usdz")
            try await storage.upload(
                path,
                data: modelData,
                options: FileOptions(contentType: "model/vnd.usdz+zip", upsert: true)
            )
            endModel(["mb": .num(Double(modelData.count) / 1_048_576)])
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
        endUpload(["ok": .bool(true), "photos": .num(Double(okKeys.count))])
    }
}
