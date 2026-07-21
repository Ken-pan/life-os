import Foundation

/// Low-noise runtime health snapshot for Daily Beta Stabilization.
/// Persisted via App Group store / local fallback — **never** shown on ordinary UI.
/// Forbidden: tokens, full emails, user message bodies, sensitive payloads.
public struct KenosRuntimeHealthSnapshot: Sendable, Equatable, Codable {
    public var recordedAt: Date
    public var buildSha: String
    public var originHost: String
    public var originReachable: Bool?
    public var authState: String
    public var continueDescriptorCount: Int?
    public var lastErrorClass: String?
    public var phase4: String

    public init(
        recordedAt: Date = Date(),
        buildSha: String,
        originHost: String,
        originReachable: Bool? = nil,
        authState: String = "unknown",
        continueDescriptorCount: Int? = nil,
        lastErrorClass: String? = nil,
        phase4: String = "EXIT_OPEN"
    ) {
        self.recordedAt = recordedAt
        self.buildSha = buildSha
        self.originHost = originHost
        self.originReachable = originReachable
        self.authState = authState
        self.continueDescriptorCount = continueDescriptorCount
        self.lastErrorClass = lastErrorClass
        self.phase4 = phase4
    }
}

public enum KenosRuntimeHealth {
    public static let storageKey = "runtimeHealth.v1"

    /// Sanitize origin to host:port only (no path/query).
    public static func host(from url: URL) -> String {
        let host = url.host ?? "unknown"
        if let port = url.port {
            return "\(host):\(port)"
        }
        return host
    }

    public static func encode(_ snap: KenosRuntimeHealthSnapshot) -> Data? {
        try? JSONEncoder().encode(snap)
    }

    public static func decode(_ data: Data) -> KenosRuntimeHealthSnapshot? {
        try? JSONDecoder().decode(KenosRuntimeHealthSnapshot.self, from: data)
    }

    public static func save(_ snap: KenosRuntimeHealthSnapshot, store: KenosAppGroupStore) {
        guard let data = encode(snap),
              let raw = String(data: data, encoding: .utf8)
        else { return }
        store.setString(raw, forKey: storageKey)
    }

    public static func load(store: KenosAppGroupStore) -> KenosRuntimeHealthSnapshot? {
        guard let raw = store.string(forKey: storageKey),
              let data = raw.data(using: .utf8)
        else { return nil }
        return decode(data)
    }
}
