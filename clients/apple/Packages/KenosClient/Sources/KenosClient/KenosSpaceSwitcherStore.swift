import Foundation
import Combine

/// Local Space Continuity store — mirrors AIOS `spaceSwitcher.core.js`
/// (recent / pinned / ResumeDescriptor). Disk-backed; never memory-only.
@MainActor
public final class KenosSpaceSwitcherStore: ObservableObject {
    public static let defaultOwnerId = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
    public static let storageFileName = "kenos.spaceSwitcher.v1.json"
    public static let maxRecent = 6
    nonisolated public static let resumeDescriptorVersion = 1

    /// aios.shell_state 云同步的 per-key LWW 记账 — 语义镜像
    /// apps/aios/src/lib/kenos/shellStateSync.core.js(改契约两处同步)。
    /// pinnedAt/recentAt:本地最后一次真实变更的毫秒时间戳(0 = 从未改过,
    /// 不参与推送竞争,新设备默认不会覆盖云端)。tombstones:本地删除的
    /// 续播 listKey → 删除时间戳(wire 前缀 spaces.resume. 由同步引擎加)。
    public struct ShellSyncMeta: Codable, Equatable, Sendable {
        public var pinnedAt: Int64
        public var recentAt: Int64
        public var tombstones: [String: Int64]

        public static let empty = ShellSyncMeta(pinnedAt: 0, recentAt: 0, tombstones: [:])

        public init(pinnedAt: Int64 = 0, recentAt: Int64 = 0, tombstones: [String: Int64] = [:]) {
            self.pinnedAt = pinnedAt
            self.recentAt = recentAt
            self.tombstones = tombstones
        }
    }

    /// 远端赢家行的落地载荷(KenosShellStateSync 翻译好 id 命名空间后调用)。
    public struct RemoteShellApplication: Sendable {
        public var pinned: [String]?
        public var pinnedAt: Int64?
        public var recent: [String]?
        public var recentAt: Int64?
        public var resumeUpserts: [String: ResumeDescriptor]
        public var resumeDeletes: [String]

        public init(
            pinned: [String]? = nil,
            pinnedAt: Int64? = nil,
            recent: [String]? = nil,
            recentAt: Int64? = nil,
            resumeUpserts: [String: ResumeDescriptor] = [:],
            resumeDeletes: [String] = []
        ) {
            self.pinned = pinned
            self.pinnedAt = pinnedAt
            self.recent = recent
            self.recentAt = recentAt
            self.resumeUpserts = resumeUpserts
            self.resumeDeletes = resumeDeletes
        }
    }

    public struct ResumeDescriptor: Codable, Equatable, Sendable {
        public var version: Int
        public var userId: String
        public var spaceId: String
        public var route: String
        public var entityId: String?
        public var substate: [String: String]?
        public var displayTitle: String
        public var displaySubtitle: String?
        public var updatedAt: String
        public var expiresAt: String?

        public init(
            version: Int = 1,
            userId: String,
            spaceId: String,
            route: String,
            entityId: String? = nil,
            substate: [String: String]? = nil,
            displayTitle: String,
            displaySubtitle: String? = nil,
            updatedAt: String = ISO8601DateFormatter().string(from: Date()),
            expiresAt: String? = nil
        ) {
            self.version = version
            self.userId = userId
            self.spaceId = spaceId
            self.route = route
            self.entityId = entityId
            self.substate = substate
            self.displayTitle = displayTitle
            self.displaySubtitle = displaySubtitle
            self.updatedAt = updatedAt
            self.expiresAt = expiresAt
        }

        public var isExpired: Bool {
            guard let expiresAt,
                  let exp = KenosSpaceSwitcherStore.parseIsoDate(expiresAt)
            else { return false }
            return exp < Date()
        }
    }

    private struct PersistableState: Codable, Equatable, Sendable {
        var version: Int
        var ownerId: UUID
        var recent: [String]
        var pinned: [String]
        var resume: [String: ResumeDescriptor]
        var currentListKey: String?
        // v3:云同步记账(v2 旧文件缺省 → empty)
        var syncMeta: ShellSyncMeta?
    }

    @Published public private(set) var ownerId: UUID
    @Published public private(set) var recentSpaceIds: [String] = []
    @Published public private(set) var pinnedSpaceIds: [String] = []
    @Published public private(set) var resumeByListKey: [String: ResumeDescriptor] = [:]
    @Published public private(set) var currentListKey: String?
    @Published public private(set) var syncMeta: ShellSyncMeta = .empty

    /// 本地变更持久化后触发(KenosShellStateSync 订阅做防抖推送)。
    /// 远端落地(applyRemoteShellState)不触发,避免拉→推乒乓。
    public var onLocalChange: (() -> Void)?

    private let fileURL: URL

    nonisolated private static func nowMs() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }

    /// Web `toIso` 带毫秒(fractional seconds),系统 ISO8601 默认解析不了 — 两档都试。
    nonisolated public static func parseIsoDate(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: raw) { return date }
        return ISO8601DateFormatter().date(from: raw)
    }

    public init(
        ownerId: UUID = KenosSpaceSwitcherStore.defaultOwnerId,
        directory: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("kenos-phase5-space-switcher")
    ) {
        self.ownerId = ownerId
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        self.fileURL = directory.appendingPathComponent(Self.storageFileName)
        load()
    }

    /// Move a Space id to the front of recents (max 6).
    public func touchRecentSpace(id: String) {
        let key = id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { return }
        recentSpaceIds = [key] + recentSpaceIds.filter { $0 != key }
        if recentSpaceIds.count > Self.maxRecent {
            recentSpaceIds = Array(recentSpaceIds.prefix(Self.maxRecent))
        }
        currentListKey = key
        if var existing = resumeByListKey[key] {
            existing.updatedAt = ISO8601DateFormatter().string(from: Date())
            resumeByListKey[key] = existing
        }
        syncMeta.recentAt = Self.nowMs()
        persist()
    }

    /// Persist a ResumeDescriptor for Continuity (user-scoped).
    public func rememberResume(_ descriptor: ResumeDescriptor, listKey: String? = nil) {
        let key = (listKey ?? "hosted:\(descriptor.spaceId)")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty, !descriptor.route.isEmpty else { return }
        var next = descriptor
        next.userId = ownerId.uuidString.lowercased()
        next.version = Self.resumeDescriptorVersion
        resumeByListKey[key] = next
        syncMeta.tombstones[key] = nil
        touchRecentSpace(id: key)
    }

    /// Resolve open URL; expired → domain home fallback (descriptor kept).
    public func resolveOpenURL(listKey: String, homeURL: URL) -> URL {
        guard let resume = resumeByListKey[listKey] else { return homeURL }
        if resume.isExpired { return homeURL }
        if let url = URL(string: resume.route), url.scheme != nil { return url }
        if resume.route.hasPrefix("/") {
            return homeURL.appendingPathComponent(String(resume.route.dropFirst()))
        }
        return homeURL
    }

    /// Toggle pin state for a Space id (deduped order preserved on add).
    public func togglePinnedSpace(id: String) {
        let key = id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { return }
        if pinnedSpaceIds.contains(key) {
            pinnedSpaceIds.removeAll { $0 == key }
        } else {
            pinnedSpaceIds.append(key)
        }
        syncMeta.pinnedAt = Self.nowMs()
        persist()
    }

    /// Drop a resume entry locally (user dismiss / remote target gone) — records
    /// a tombstone so other devices drop it too on next sync.
    public func forgetResume(listKey: String) {
        let key = listKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { return }
        var changed = false
        if resumeByListKey.removeValue(forKey: key) != nil {
            syncMeta.tombstones[key] = Self.nowMs()
            changed = true
        }
        if recentSpaceIds.contains(key) {
            recentSpaceIds.removeAll { $0 == key }
            syncMeta.recentAt = Self.nowMs()
            changed = true
        }
        if pinnedSpaceIds.contains(key) {
            pinnedSpaceIds.removeAll { $0 == key }
            syncMeta.pinnedAt = Self.nowMs()
            changed = true
        }
        if currentListKey == key { currentListKey = nil }
        if changed { persist() }
    }

    /// 远端赢家落地:采信远端时间戳写回记账,不触发 onLocalChange(防乒乓)。
    public func applyRemoteShellState(_ application: RemoteShellApplication) {
        if let pinned = application.pinned {
            pinnedSpaceIds = normalizedPinned(pinned)
            if let at = application.pinnedAt { syncMeta.pinnedAt = at }
        }
        if let recent = application.recent {
            var seen = Set<String>()
            recentSpaceIds = recent
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty && seen.insert($0).inserted }
            recentSpaceIds = Array(recentSpaceIds.prefix(Self.maxRecent))
            if let at = application.recentAt { syncMeta.recentAt = at }
        }
        for (listKey, descriptor) in application.resumeUpserts {
            var next = descriptor
            next.version = Self.resumeDescriptorVersion
            // 绑定本地 owner:load() 会按 ownerId 过滤,远端 descriptor 带的是
            // Supabase userId,不重绑会在下次冷启动被整批丢掉。
            next.userId = ownerId.uuidString.lowercased()
            resumeByListKey[listKey] = next
            syncMeta.tombstones[listKey] = nil
        }
        for listKey in application.resumeDeletes {
            resumeByListKey.removeValue(forKey: listKey)
            syncMeta.tombstones[listKey] = nil
            if currentListKey == listKey { currentListKey = nil }
        }
        persist(notifyLocalChange: false)
    }

    /// Bind to session owner; clears persisted state when owner changes or logs out.
    public func bindOwner(_ nextOwnerId: UUID?) {
        guard let nextOwnerId else {
            logoutClear()
            return
        }
        if ownerId != nextOwnerId {
            clearInMemory(resetOwnerTo: nextOwnerId)
            try? FileManager.default.removeItem(at: fileURL)
        }
    }

    /// Unified logout / session clear — wipe user-scoped recents, pinned, resume.
    public func logoutClear() {
        clearInMemory(resetOwnerTo: Self.defaultOwnerId)
        try? FileManager.default.removeItem(at: fileURL)
    }

    // MARK: - Private

    private func clearInMemory(resetOwnerTo newOwner: UUID) {
        ownerId = newOwner
        recentSpaceIds = []
        pinnedSpaceIds = []
        resumeByListKey = [:]
        currentListKey = nil
        syncMeta = .empty
    }

    private func persist(notifyLocalChange: Bool = true) {
        let state = PersistableState(
            version: 3,
            ownerId: ownerId,
            recent: Array(recentSpaceIds.prefix(Self.maxRecent)),
            pinned: normalizedPinned(pinnedSpaceIds),
            resume: resumeByListKey,
            currentListKey: currentListKey,
            syncMeta: syncMeta
        )
        do {
            let data = try JSONEncoder().encode(state)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Quota / disk — ignore for local foundation
        }
        if notifyLocalChange { onLocalChange?() }
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        // Prefer Continuity v2 shape; fall back to legacy recent/pinned-only.
        if let state = try? JSONDecoder().decode(PersistableState.self, from: data) {
            if state.ownerId != ownerId {
                logoutClear()
                return
            }
            recentSpaceIds = Array(state.recent.prefix(Self.maxRecent))
            pinnedSpaceIds = normalizedPinned(state.pinned)
            resumeByListKey = state.resume.filter { $0.value.userId == state.ownerId.uuidString.lowercased()
                || $0.value.userId == state.ownerId.uuidString
                || $0.value.userId == "anonymous" }
            currentListKey = state.currentListKey
            syncMeta = state.syncMeta ?? .empty
            return
        }
        struct LegacyState: Codable {
            var ownerId: UUID
            var recent: [String]
            var pinned: [String]
        }
        guard let legacy = try? JSONDecoder().decode(LegacyState.self, from: data) else { return }
        if legacy.ownerId != ownerId {
            logoutClear()
            return
        }
        recentSpaceIds = Array(legacy.recent.prefix(Self.maxRecent))
        pinnedSpaceIds = normalizedPinned(legacy.pinned)
    }

    private func normalizedPinned(_ ids: [String]) -> [String] {
        var seen = Set<String>()
        return ids.filter { id in
            let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !seen.contains(trimmed) else { return false }
            seen.insert(trimmed)
            return true
        }
    }
}
