import Foundation

/// Per-domain glance slot for Home Screen / Lock Screen widgets.
public struct DomainWidgetGlance: Codable, Equatable, Sendable {
    public var domainId: String
    public var title: String
    public var subtitle: String
    public var deepLink: String
    public var accentRGB: UInt32
    public var systemImage: String
    public var progress: Double?
    public var badge: String?
    public var updatedAt: String?

    public init(
        domainId: String,
        title: String,
        subtitle: String,
        deepLink: String,
        accentRGB: UInt32,
        systemImage: String,
        progress: Double? = nil,
        badge: String? = nil,
        updatedAt: String? = nil
    ) {
        self.domainId = domainId
        self.title = title
        self.subtitle = subtitle
        self.deepLink = deepLink
        self.accentRGB = accentRGB
        self.systemImage = systemImage
        self.progress = progress.map { min(1, max(0, $0)) }
        self.badge = badge
        self.updatedAt = updatedAt
    }

    /// Compare user-visible content (ignore host timestamps).
    public func contentEquals(_ other: DomainWidgetGlance) -> Bool {
        domainId == other.domainId
            && title == other.title
            && subtitle == other.subtitle
            && deepLink == other.deepLink
            && accentRGB == other.accentRGB
            && systemImage == other.systemImage
            && progress == other.progress
            && badge == other.badge
    }
}

/// Full WidgetKit payload published by KenosIOS via App Group.
public struct KenosWidgetSnapshot: Codable, Equatable, Sendable {
    public var today: TodayGlance
    public var domains: [String: DomainWidgetGlance]
    public var recentDomainIds: [String]
    public var publishedAt: String

    // ISO8601DateFormatter is not Sendable; init-only use is serialized via static let.
    private nonisolated(unsafe) static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    public init(
        today: TodayGlance,
        domains: [String: DomainWidgetGlance] = [:],
        recentDomainIds: [String] = [],
        publishedAt: String? = nil
    ) {
        self.today = today
        self.domains = domains
        self.recentDomainIds = recentDomainIds
        self.publishedAt = publishedAt ?? Self.isoFormatter.string(from: Date())
    }

    public func domain(_ id: String) -> DomainWidgetGlance? {
        domains[id]
    }

    /// True when Widget-visible content matches (ignore `publishedAt` / domain `updatedAt`).
    public func contentEquals(_ other: KenosWidgetSnapshot) -> Bool {
        guard today == other.today else { return false }
        guard recentDomainIds == other.recentDomainIds else { return false }
        guard domains.count == other.domains.count else { return false }
        for (key, value) in domains {
            guard let otherValue = other.domains[key], value.contentEquals(otherValue) else {
                return false
            }
        }
        return true
    }
}
