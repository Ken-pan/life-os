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
                  let exp = ISO8601DateFormatter().date(from: expiresAt)
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
    }

    @Published public private(set) var ownerId: UUID
    @Published public private(set) var recentSpaceIds: [String] = []
    @Published public private(set) var pinnedSpaceIds: [String] = []
    @Published public private(set) var resumeByListKey: [String: ResumeDescriptor] = [:]
    @Published public private(set) var currentListKey: String?

    private let fileURL: URL

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
        persist()
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
    }

    private func persist() {
        let state = PersistableState(
            version: 2,
            ownerId: ownerId,
            recent: Array(recentSpaceIds.prefix(Self.maxRecent)),
            pinned: normalizedPinned(pinnedSpaceIds),
            resume: resumeByListKey,
            currentListKey: currentListKey
        )
        do {
            let data = try JSONEncoder().encode(state)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Quota / disk — ignore for local foundation
        }
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
