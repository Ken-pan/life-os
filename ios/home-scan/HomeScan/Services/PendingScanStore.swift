import Foundation

/// 扫描结果落盘 —— 转换完成立即写盘,上传成功才删。
///
/// 为什么必须有:扫完的结果(转换后的 project、几十张照片)以前只活在内存和
/// temp 目录里,上传前 App 被杀/断网退出,一次 10 分钟的全屋扫描就全丢了。
/// 落点选 Application Support(系统不清理;temp 会被随时清),照片从 temp
/// **拷贝**进来 —— 当次会话仍用 temp 原件,恢复路径用这里的副本。
///
/// 只保留**一次**未上传扫描:新扫描落盘会顶掉旧的(扫描是全量语义,
/// 旧的没传就被新的取代,和云端行为一致)。
enum PendingScanStore {
    struct ShotRef: Codable {
        var name: String
        var azimuthDeg: Double?
    }

    struct Manifest: Codable {
        var scanId: UUID
        var savedAt: Date
        var project: HomeOSProject
        /// 与 project.viewpoints 下标对齐;nil = 该机位无照片
        var photoNames: [String?]
        var objectPhotos: [String: [ShotRef]]
        var hasStructure: Bool
        var hasModel: Bool
    }

    static var dir: URL {
        FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("pending-scan", isDirectory: true)
    }

    private static var manifestURL: URL { dir.appendingPathComponent("manifest.json") }

    /// 落盘。单张照片拷贝失败只丢那一张,不拖垮整次落盘。
    ///
    /// **增量语义**:同一 scanId 重复落盘(预览页改类别后)只重写 manifest ——
    /// 同一次扫描内照片内容不变,已在盘上的同名文件直接算成功,不重拷几十 MB;
    /// 顺带免疫「temp 源文件已被系统清掉」(恢复后再改类别时源就是盘上副本自己)。
    /// 换了 scanId 才整目录清掉重来(只保留最新一次,全量语义)。
    static func save(
        scanId: UUID,
        project: HomeOSProject,
        photoFiles: [URL?],
        objectPhotoFiles: [String: [PlanProjector.Projection.ShotAsset]],
        structureJSON: Data?,
        modelFileURL: URL?
    ) throws {
        let fm = FileManager.default
        let incremental = load()?.scanId == scanId
        if !incremental {
            try? fm.removeItem(at: dir)
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        }

        /// 拷进落盘目录;已存在(增量)直接算成功,源丢了但盘上有也算成功
        func persist(_ src: URL, as name: String) -> Bool {
            let dst = dir.appendingPathComponent(name)
            if fm.fileExists(atPath: dst.path) { return true }
            do {
                try fm.copyItem(at: src, to: dst)
                return true
            } catch {
                return fm.fileExists(atPath: dst.path)
            }
        }

        var photoNames: [String?] = []
        for (i, url) in photoFiles.enumerated() {
            guard let url else {
                photoNames.append(nil)
                continue
            }
            let name = "vp-\(i).jpg"
            photoNames.append(persist(url, as: name) ? name : nil)
        }

        var objectRefs: [String: [ShotRef]] = [:]
        for (id, assets) in objectPhotoFiles {
            var refs: [ShotRef] = []
            for (k, asset) in assets.enumerated() {
                let name = "obj-\(id)-\(k).jpg"
                guard persist(asset.url, as: name) else { continue }
                refs.append(ShotRef(name: name, azimuthDeg: asset.azimuthDeg))
            }
            if !refs.isEmpty { objectRefs[id] = refs }
        }

        if let structureJSON, !fm.fileExists(atPath: dir.appendingPathComponent("structure.json").path) {
            try? structureJSON.write(to: dir.appendingPathComponent("structure.json"), options: .atomic)
        }
        var hasModel = false
        if let modelFileURL {
            hasModel = persist(modelFileURL, as: "model.usdz")
        }

        let manifest = Manifest(
            scanId: scanId,
            savedAt: Date(),
            project: project,
            photoNames: photoNames,
            objectPhotos: objectRefs,
            hasStructure: structureJSON != nil,
            hasModel: hasModel
        )
        let data = try JSONEncoder().encode(manifest)
        try data.write(to: manifestURL, options: .atomic)
    }

    /// 有没有一次没传完的扫描
    static func load() -> Manifest? {
        guard let data = try? Data(contentsOf: manifestURL) else { return nil }
        return try? JSONDecoder().decode(Manifest.self, from: data)
    }

    /// 恢复成 AppModel 需要的形状(URL 指向落盘副本;丢失的文件按无照片处理)
    static func restore(_ m: Manifest) -> (
        photoFiles: [URL?],
        objectPhotoFiles: [String: [PlanProjector.Projection.ShotAsset]],
        structureJSON: Data?,
        modelFileURL: URL?
    ) {
        let fm = FileManager.default
        let photoFiles: [URL?] = m.photoNames.map { name in
            guard let name else { return nil }
            let url = dir.appendingPathComponent(name)
            return fm.fileExists(atPath: url.path) ? url : nil
        }
        var objectPhotoFiles: [String: [PlanProjector.Projection.ShotAsset]] = [:]
        for (id, refs) in m.objectPhotos {
            let assets = refs.compactMap { ref -> PlanProjector.Projection.ShotAsset? in
                let url = dir.appendingPathComponent(ref.name)
                guard fm.fileExists(atPath: url.path) else { return nil }
                return .init(url: url, azimuthDeg: ref.azimuthDeg)
            }
            if !assets.isEmpty { objectPhotoFiles[id] = assets }
        }
        let structureJSON = m.hasStructure
            ? try? Data(contentsOf: dir.appendingPathComponent("structure.json"))
            : nil
        let modelURL = dir.appendingPathComponent("model.usdz")
        let modelFileURL = m.hasModel && fm.fileExists(atPath: modelURL.path) ? modelURL : nil
        return (photoFiles, objectPhotoFiles, structureJSON, modelFileURL)
    }

    static func clear() {
        try? FileManager.default.removeItem(at: dir)
    }
}
