import Foundation
#if canImport(ActivityKit)
@preconcurrency import ActivityKit
#endif

extension Notification.Name {
    /// Posted when Live Activity cache upserts/ends — Live Accessory / Shelf Active refresh.
    static let kenosLiveActivityDidChange = Notification.Name("kenosLiveActivityDidChange")
}

/// Live Activities / Dynamic Island foundation (ActivityKit).
///
/// Continuity upserts always refresh the **in-shell Live Accessory / Shelf** cache.
/// When ActivityKit is available and the user has Live Activities enabled, also
/// requests / updates / ends system Live Activities (Lock Screen + Dynamic Island).
enum KenosLiveActivityFoundation {
    /// Code path is shipped. Runtime still respects Settings → Live Activities.
    static let isImplementationReady = true

    #if DEBUG
    /// Unit tests can force the ActivityKit path off without changing production.
    nonisolated(unsafe) static var testingForceDisabled = false
    #endif

    /// True when system Live Activities can be requested from this process.
    static var isEnabled: Bool {
        #if DEBUG
        if testingForceDisabled { return false }
        #endif
        guard isImplementationReady else { return false }
        #if os(iOS) && canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            return ActivityAuthorizationInfo().areActivitiesEnabled
        }
        #endif
        return false
    }

    /// Remaining blockers (empty when system Live Activities are available).
    static var readinessBlockers: [String] {
        #if DEBUG
        if testingForceDisabled { return ["testing_force_disabled"] }
        #endif
        guard isImplementationReady else { return ["implementation_not_ready"] }
        #if os(iOS) && canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            if ActivityAuthorizationInfo().areActivitiesEnabled {
                return []
            }
            return ["system_live_activities_disabled"]
        }
        return ["ios_version_below_16_2"]
        #else
        return ["activitykit_unavailable"]
        #endif
    }

    enum Kind: String, Codable, CaseIterable {
        case training
        case focus
        case tidy
    }

    struct Snapshot: Codable, Equatable {
        var kind: Kind
        var title: String
        var subtitle: String
        var progress: Double?
        var endsAt: Date?

        init(
            kind: Kind,
            title: String,
            subtitle: String,
            progress: Double? = nil,
            endsAt: Date? = nil
        ) {
            self.kind = kind
            self.title = title
            self.subtitle = subtitle
            self.progress = progress
            self.endsAt = endsAt
        }

        init?(dict: [String: Any]) {
            let kindRaw = String(describing: dict["kind"] ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            guard let kind = Kind(rawValue: kindRaw) else { return nil }
            let title = String(describing: dict["title"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let subtitle = String(describing: dict["subtitle"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let progress: Double?
            if let n = dict["progress"] as? Double {
                progress = min(1, max(0, n))
            } else if let n = dict["progress"] as? NSNumber {
                progress = min(1, max(0, n.doubleValue))
            } else {
                progress = nil
            }
            var endsAt: Date?
            if let iso = dict["endsAt"] as? String, !iso.isEmpty {
                endsAt = ISO8601DateFormatter().date(from: iso)
            } else if let ms = dict["endsAtMs"] as? Double {
                endsAt = Date(timeIntervalSince1970: ms / 1000)
            } else if let ms = dict["endsAtMs"] as? NSNumber {
                endsAt = Date(timeIntervalSince1970: ms.doubleValue / 1000)
            }
            self.init(
                kind: kind,
                title: title.isEmpty ? kind.rawValue.capitalized : title,
                subtitle: subtitle,
                progress: progress,
                endsAt: endsAt
            )
        }
    }

    // Cached for diagnostics / UI; not actor-isolated (main-thread shell use).
    nonisolated(unsafe) private(set) static var lastSnapshot: Snapshot?
    nonisolated(unsafe) private(set) static var lastUpdatedAt: Date?
    nonisolated(unsafe) private(set) static var activeKinds: Set<Kind> = []

    static var statusSummary: String {
        if isEnabled { return "live_activity_enabled" }
        if readinessBlockers == ["system_live_activities_disabled"] {
            return "live_activity_system_disabled"
        }
        if readinessBlockers.isEmpty { return "live_activity_ready_to_enable" }
        return "live_activity_shell_preview"
    }

    /// Start (or update) a Live Activity. Always caches; ActivityKit when enabled.
    @discardableResult
    static func upsert(_ snapshot: Snapshot) -> Bool {
        lastSnapshot = snapshot
        lastUpdatedAt = Date()
        activeKinds.insert(snapshot.kind)
        KenosLog.debug(
            isEnabled ? "live activity upsert" : "live activity upsert cached — shell preview",
            category: .shell,
            metadata: [
                "kind": snapshot.kind.rawValue,
                "title": String(snapshot.title.prefix(40)),
                "enabled": isEnabled ? "1" : "0",
            ]
        )
        NotificationCenter.default.post(name: .kenosLiveActivityDidChange, object: snapshot.kind.rawValue)
        guard isEnabled else { return false }
        return upsertActivityKit(snapshot)
    }

    @discardableResult
    static func upsert(params: [String: Any]) -> (ok: Bool, enabled: Bool, kind: String) {
        guard let snapshot = Snapshot(dict: params) else {
            return (false, isEnabled, "")
        }
        let started = upsert(snapshot)
        return (true, isEnabled && started, snapshot.kind.rawValue)
    }

    @discardableResult
    static func end(_ kind: Kind) -> Bool {
        activeKinds.remove(kind)
        if lastSnapshot?.kind == kind {
            lastSnapshot = nil
        }
        lastUpdatedAt = Date()
        KenosLog.debug(
            isEnabled ? "live activity end" : "live activity end cached — shell preview",
            category: .shell,
            metadata: ["kind": kind.rawValue, "enabled": isEnabled ? "1" : "0"]
        )
        NotificationCenter.default.post(name: .kenosLiveActivityDidChange, object: kind.rawValue)
        guard isEnabled else { return false }
        return endActivityKit(kind)
    }

    @discardableResult
    static func end(params: [String: Any]) -> (ok: Bool, enabled: Bool, kind: String) {
        let kindRaw = String(describing: params["kind"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        guard let kind = Kind(rawValue: kindRaw) else {
            return (false, isEnabled, "")
        }
        let ended = end(kind)
        return (true, isEnabled && ended, kind.rawValue)
    }

    /// Test / diagnostics reset (cache only — does not end system activities).
    static func resetForTests() {
        lastSnapshot = nil
        lastUpdatedAt = nil
        activeKinds = []
        #if DEBUG
        testingForceDisabled = false
        #endif
    }

    // MARK: - ActivityKit

    @discardableResult
    private static func upsertActivityKit(_ snapshot: Snapshot) -> Bool {
        #if os(iOS) && canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            let attributes = KenosDomainActivityAttributes(kind: snapshot.kind.rawValue)
            let state = KenosDomainActivityAttributes.ContentState(
                title: snapshot.title,
                subtitle: snapshot.subtitle,
                progress: snapshot.progress,
                endsAt: snapshot.endsAt
            )
            // Prefer session end; otherwise mark stale after 8h so Lock Screen doesn't keep dead work.
            let staleDate = snapshot.endsAt ?? Date().addingTimeInterval(8 * 60 * 60)
            let content = ActivityContent(state: state, staleDate: staleDate)

            let existing = Activity<KenosDomainActivityAttributes>.activities.filter {
                $0.attributes.kind == snapshot.kind.rawValue
            }
            if let activity = existing.first {
                updateActivity(activity, content: content)
                for extra in existing.dropFirst() {
                    endActivity(extra)
                }
                return true
            }

            do {
                _ = try Activity.request(
                    attributes: attributes,
                    content: content,
                    pushType: nil
                )
                return true
            } catch {
                KenosLog.warning(
                    "live activity request failed",
                    category: .shell,
                    metadata: [
                        "kind": snapshot.kind.rawValue,
                        "error": String(describing: error).prefix(120).description,
                    ]
                )
                return false
            }
        }
        #endif
        return false
    }

    @discardableResult
    private static func endActivityKit(_ kind: Kind) -> Bool {
        #if os(iOS) && canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            let matches = Activity<KenosDomainActivityAttributes>.activities.filter {
                $0.attributes.kind == kind.rawValue
            }
            guard !matches.isEmpty else { return true }
            for activity in matches {
                endActivity(activity)
            }
            return true
        }
        #endif
        return false
    }

    #if os(iOS) && canImport(ActivityKit)
    @available(iOS 16.2, *)
    private static func updateActivity(
        _ activity: Activity<KenosDomainActivityAttributes>,
        content: ActivityContent<KenosDomainActivityAttributes.ContentState>
    ) {
        // Hop through nonisolated Task.detached so Swift 6 doesn't treat Activity as MainActor-bound.
        Task.detached {
            await activity.update(content)
        }
    }

    @available(iOS 16.2, *)
    private static func endActivity(_ activity: Activity<KenosDomainActivityAttributes>) {
        Task.detached {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
    #endif
}
