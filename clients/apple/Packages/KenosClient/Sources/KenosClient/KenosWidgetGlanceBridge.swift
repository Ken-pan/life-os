import Foundation

/// Shared Widget glance payload for Widget / Watch (App Group when provisioned).
///
/// Host publishes; Widget reads via **shared** (non-owner-scoped) keys so the
/// extension process can load the same bag. Without App Group entitlement the
/// store falls back to process-local memory — Widget then shows foundation placeholder.
public enum KenosWidgetGlanceBridge {
    public static let snapshotStorageKey = "widget.snapshot"
    /// Legacy Today-only key (owner-scoped historically; still decoded as fallback).
    public static let storageKey = "widget.todayGlance"
    /// Interactive Widget → host pending deep link (shared App Group key).
    public static let pendingDeepLinkKey = "widget.pendingDeepLink"

    private static let encoder = JSONEncoder()
    private static let decoder = JSONDecoder()

    private static let cachedPlaceholderOpen: [String: DomainWidgetGlance] = makePlaceholderDomains(openable: true)
    private static let cachedPlaceholderClosed: [String: DomainWidgetGlance] = makePlaceholderDomains(openable: false)

    public static func postPendingDeepLink(_ urlString: String, store: KenosAppGroupStore) {
        // Flush for cross-process handoff — widget → host open.
        store.setSharedString(urlString, forKey: pendingDeepLinkKey, flush: true)
    }

    public static func consumePendingDeepLink(store: KenosAppGroupStore) -> String? {
        let value = store.sharedString(forKey: pendingDeepLinkKey)
        if value != nil {
            store.clearShared(key: pendingDeepLinkKey, flush: true)
        }
        return value
    }

    // MARK: - Snapshot (preferred)

    public static func encodeSnapshot(_ snapshot: KenosWidgetSnapshot) -> String? {
        guard let data = try? encoder.encode(snapshot) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public static func decodeSnapshot(_ raw: String?) -> KenosWidgetSnapshot? {
        guard let raw, let data = raw.data(using: .utf8) else { return nil }
        return try? decoder.decode(KenosWidgetSnapshot.self, from: data)
    }

    public static func publishSnapshot(_ snapshot: KenosWidgetSnapshot, store: KenosAppGroupStore) {
        store.setSharedString(encodeSnapshot(snapshot), forKey: snapshotStorageKey)
        // Keep legacy Today key warm for older readers / Watch complications.
        publish(snapshot.today, store: store)
    }

    /// Publish only when Widget-visible content changed. Returns `true` if written.
    @discardableResult
    public static func publishSnapshotIfChanged(
        _ snapshot: KenosWidgetSnapshot,
        store: KenosAppGroupStore,
        previous: KenosWidgetSnapshot?
    ) -> Bool {
        if let previous, snapshot.contentEquals(previous) {
            return false
        }
        publishSnapshot(snapshot, store: store)
        return true
    }

    public static func loadSnapshot(store: KenosAppGroupStore) -> KenosWidgetSnapshot? {
        if let snap = decodeSnapshot(store.sharedString(forKey: snapshotStorageKey)) {
            return snap
        }
        // Fallback: wrap legacy TodayGlance into a minimal snapshot.
        if let today = load(store: store) {
            return KenosWidgetSnapshot(today: today, domains: [:], recentDomainIds: [])
        }
        return nil
    }

    // MARK: - TodayGlance (legacy + Watch)

    public static func encode(_ glance: TodayGlance) -> String? {
        guard let data = try? encoder.encode(glance) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public static func decode(_ raw: String?) -> TodayGlance? {
        guard let raw, let data = raw.data(using: .utf8) else { return nil }
        return try? decoder.decode(TodayGlance.self, from: data)
    }

    public static func publish(_ glance: TodayGlance, store: KenosAppGroupStore) {
        let encoded = encode(glance)
        store.setSharedString(encoded, forKey: storageKey)
        store.setString(encoded, forKey: storageKey)
    }

    public static func load(store: KenosAppGroupStore) -> TodayGlance? {
        if let shared = decode(store.sharedString(forKey: storageKey)) {
            return shared
        }
        return decode(store.string(forKey: storageKey))
    }

    /// Foundation glance when no shared payload exists yet.
    public static func foundationPlaceholder(availability: KenosAppGroupAvailability) -> TodayGlance {
        TodayGlance(
            nextPlanTitle: availability == .sharedSuite ? "Kenos" : nil,
            freshness: availability == .sharedSuite ? "local" : "unavailable",
            offlineStatus: availability == .sharedSuite ? "online" : "unavailable",
            state: availability == .sharedSuite ? "no_data" : "unavailable"
        )
    }

    public static func foundationSnapshot(availability: KenosAppGroupAvailability) -> KenosWidgetSnapshot {
        KenosWidgetSnapshot(
            today: foundationPlaceholder(availability: availability),
            domains: placeholderDomains(availability: availability),
            recentDomainIds: ["plan", "training", "music", "health"]
        )
    }

    /// Static domain slots for Widget gallery / empty App Group (cached).
    public static func placeholderDomains(availability: KenosAppGroupAvailability) -> [String: DomainWidgetGlance] {
        availability == .sharedSuite ? cachedPlaceholderOpen : cachedPlaceholderClosed
    }

    public static func placeholderDomain(
        _ id: String,
        availability: KenosAppGroupAvailability = .sharedSuite
    ) -> DomainWidgetGlance? {
        placeholderDomains(availability: availability)[id]
    }

    private static func makePlaceholderDomains(openable: Bool) -> [String: DomainWidgetGlance] {
        let slots: [(String, String, String, UInt32, String, String)] = [
            ("plan", "Plan", openable ? "Open Plan" : "Unavailable", 0xD4AE2E, "checklist", "kenos://domain/plan"),
            ("training", "Training", openable ? "Start workout" : "Unavailable", 0xC45C4A, "figure.strengthtraining.traditional", "kenos://training/session"),
            ("music", "Music", openable ? "Open Music" : "Unavailable", 0x8B7EC8, "music.note", "kenos://domain/music"),
            ("health", "Health", openable ? "Readiness" : "Unavailable", 0x5B6CFF, "heart.text.square", "kenos://domain/health"),
            ("home", "Home", openable ? "Tidy" : "Unavailable", 0x7AA0C8, "house", "kenos://domain/home?path=/tidy/go"),
            ("work", "Work", openable ? "Deep Work" : "Unavailable", 0x6A9BE0, "briefcase", "kenos://work"),
            ("money", "Money", openable ? "Open Money" : "Unavailable", 0x3D9B6E, "dollarsign.circle", "kenos://domain/money"),
            ("library", "Library", openable ? "Open Library" : "Unavailable", 0x5B6BBF, "books.vertical", "kenos://domain/library"),
        ]
        var out: [String: DomainWidgetGlance] = [:]
        out.reserveCapacity(slots.count)
        for (id, title, subtitle, accent, image, link) in slots {
            out[id] = DomainWidgetGlance(
                domainId: id,
                title: title,
                subtitle: subtitle,
                deepLink: link,
                accentRGB: accent,
                systemImage: image
            )
        }
        return out
    }
}
