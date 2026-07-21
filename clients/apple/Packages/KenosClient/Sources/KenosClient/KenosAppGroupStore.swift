import Foundation

/// App Group shared-container helper for Phase 4 cross-device foundation.
///
/// Production group id `group.space.kenos.app` is still a **distribution gate**
/// (`KR-P4B-TEMP-005`). This type never invents a production entitlement —
/// it probes availability and falls back to an isolated in-memory bag when
/// the suite is missing (unsigned simulator / Daily Beta without App Group).
public struct KenosAppGroupConfig: Sendable, Equatable {
    public static let placeholderGroupId = "group.space.kenos.app"
    public var groupId: String

    public init(groupId: String = KenosAppGroupConfig.placeholderGroupId) {
        self.groupId = groupId
    }
}

public enum KenosAppGroupAvailability: String, Sendable, Equatable {
    /// `UserDefaults(suiteName:)` returned a live suite (entitlement present).
    case sharedSuite
    /// Suite unavailable — using process-local fallback (not cross-process).
    case processLocalFallback
}

public protocol KenosSharedDefaultsProviding: AnyObject {
    func set(_ value: Any?, forKey key: String)
    func object(forKey key: String) -> Any?
    func removeObject(forKey key: String)
    func synchronize() -> Bool
}

extension UserDefaults: KenosSharedDefaultsProviding {}

/// Tiny bag used when App Group suite is not provisioned.
public final class KenosInMemorySharedDefaults: KenosSharedDefaultsProviding, @unchecked Sendable {
    private var storage: [String: Any] = [:]
    private let lock = NSLock()

    public init() {}

    public func set(_ value: Any?, forKey key: String) {
        lock.lock(); defer { lock.unlock() }
        if let value {
            storage[key] = value
        } else {
            storage.removeValue(forKey: key)
        }
    }

    public func object(forKey key: String) -> Any? {
        lock.lock(); defer { lock.unlock() }
        return storage[key]
    }

    public func removeObject(forKey key: String) {
        set(nil, forKey: key)
    }

    public func synchronize() -> Bool { true }
}

/// Continuity / handoff scratch that prefers App Group when available.
/// Does **not** store Auth tokens (Keychain remains the session boundary).
public final class KenosAppGroupStore: @unchecked Sendable {
    public let config: KenosAppGroupConfig
    public let availability: KenosAppGroupAvailability
    private let defaults: KenosSharedDefaultsProviding
    private let ownerPrefix: String

    public init(
        config: KenosAppGroupConfig = KenosAppGroupConfig(),
        ownerId: UUID?,
        suiteFactory: (String) -> KenosSharedDefaultsProviding? = { groupId in
            // Prefer container URL — suiteName alone can return a non-shared defaults object.
            guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) != nil,
                  let suite = UserDefaults(suiteName: groupId)
            else { return nil }
            return suite
        },
        fallback: () -> KenosSharedDefaultsProviding = { KenosInMemorySharedDefaults() }
    ) {
        self.config = config
        if let suite = suiteFactory(config.groupId) {
            self.defaults = suite
            self.availability = .sharedSuite
        } else {
            self.defaults = fallback()
            self.availability = .processLocalFallback
        }
        self.ownerPrefix = ownerId?.uuidString.lowercased() ?? "anonymous"
    }

    private func scoped(_ key: String) -> String {
        "kenos.appgroup.\(ownerPrefix).\(key)"
    }

    public func setString(_ value: String?, forKey key: String, flush: Bool = false) {
        defaults.set(value, forKey: scoped(key))
        if flush { _ = defaults.synchronize() }
    }

    public func string(forKey key: String) -> String? {
        defaults.object(forKey: scoped(key)) as? String
    }

    public func clear(key: String, flush: Bool = false) {
        defaults.removeObject(forKey: scoped(key))
        if flush { _ = defaults.synchronize() }
    }

    /// Cross-process payload (Widget / Watch) — not owner-scoped.
    /// Host and extensions must use the same key so glance survives owner bind.
    ///
    /// `flush: true` only for rare handoff keys (pending deep link). Routine
    /// Widget snapshot publishes skip synchronize — UserDefaults App Group
    /// writes are durable without the expensive sync call.
    public func setSharedString(_ value: String?, forKey key: String, flush: Bool = false) {
        let shared = "kenos.appgroup.shared.\(key)"
        defaults.set(value, forKey: shared)
        if flush { _ = defaults.synchronize() }
    }

    public func sharedString(forKey key: String) -> String? {
        defaults.object(forKey: "kenos.appgroup.shared.\(key)") as? String
    }

    public func clearShared(key: String, flush: Bool = false) {
        defaults.removeObject(forKey: "kenos.appgroup.shared.\(key)")
        if flush { _ = defaults.synchronize() }
    }

    /// Probe used by Daily Beta / XCTest — never claims production App Group cutover.
    public var statusReport: [String: String] {
        [
            "groupId": config.groupId,
            "availability": availability.rawValue,
            "ownerScoped": ownerPrefix,
            "phase4": "EXIT_OPEN",
        ]
    }
}
