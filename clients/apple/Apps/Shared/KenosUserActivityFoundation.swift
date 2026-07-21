#if os(iOS)
import CoreSpotlight
import Foundation
import UniformTypeIdentifiers

/// Apple Continuity Handoff via `NSUserActivity` (Phase D).
///
/// Distinct from the Watch companion package `KenosHandoff` — this is system
/// Handoff / Spotlight / Siri Suggestions for the current Continuity surface.
enum KenosUserActivityFoundation {
    /// No special entitlement required for basic Handoff eligibility.
    static let isEnabled = true

    /// Must match `NSUserActivityTypes` in Info.plist.
    static let activityType = "space.kenos.app.continuity"

    /// Retained so resign/invalidate targets the live activity (not a fresh stub).
    @MainActor
    private static var currentActivity: NSUserActivity?

    nonisolated(unsafe) private(set) static var lastActivityType: String?
    nonisolated(unsafe) private(set) static var lastDeepLink: String?
    nonisolated(unsafe) private(set) static var lastTitle: String?

    static var statusSummary: String {
        isEnabled ? "user_activity_ready" : "user_activity_disabled"
    }

    /// Publish (or refresh) the current Continuity surface as the Handoff activity.
    @MainActor
    @discardableResult
    static func becomeCurrent(_ surface: KenosSystemDiscovery.Surface) -> NSUserActivity? {
        guard isEnabled else { return nil }
        guard let def = KenosDomainRegistry.definition(for: surface.domainId) else { return nil }

        // Reuse one activity instance — avoids Handoff thrash on SPA path updates.
        let activity = currentActivity ?? NSUserActivity(activityType: activityType)
        currentActivity = activity
        activity.title = surface.title
        activity.isEligibleForHandoff = true
        activity.isEligibleForSearch = true
        activity.isEligibleForPrediction = true
        activity.userInfo = [
            "kenosDeepLink": surface.deepLink,
            "domainId": surface.domainId,
            "path": surface.path,
        ]
        activity.requiredUserInfoKeys = ["kenosDeepLink"]
        // webpageURL only allows http(s) — Continuity restore uses userInfo deep link.
        if let http = KenosDomainRegistry.continuityURL(
            for: surface.domainId,
            path: surface.privacy ? nil : surface.path
        ),
           let scheme = http.scheme?.lowercased(),
           scheme == "http" || scheme == "https"
        {
            activity.webpageURL = http
        } else {
            activity.webpageURL = nil
        }
        activity.keywords = [def.label, surface.domainId]
        if !surface.summary.isEmpty {
            let attrs = CSSearchableItemAttributeSet(contentType: .content)
            attrs.title = surface.title
            attrs.contentDescription = surface.summary
            activity.contentAttributeSet = attrs
        }
        activity.needsSave = true
        activity.becomeCurrent()

        lastActivityType = activityType
        lastDeepLink = surface.deepLink
        lastTitle = surface.title
        KenosLog.debug("user activity becomeCurrent", category: .shell, metadata: [
            "domain": surface.domainId,
            "privacy": surface.privacy ? "1" : "0",
            "title": String(surface.title.prefix(40)),
        ])
        return activity
    }

    @MainActor
    static func resignCurrent() {
        guard isEnabled else { return }
        if let current = currentActivity {
            current.invalidate()
            currentActivity = nil
        }
        lastDeepLink = nil
        lastTitle = nil
        KenosLog.debug("user activity resigned", category: .shell)
    }

    /// Extract deep link from a continued `NSUserActivity` (Handoff or Spotlight).
    static func deepLink(from activity: NSUserActivity) -> String? {
        if let link = activity.userInfo?["kenosDeepLink"] as? String, !link.isEmpty {
            return link
        }
        if activity.activityType == CSSearchableItemActionType,
           let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String
        {
            return KenosSpotlightFoundation.deepLink(forUniqueIdentifier: id)
        }
        // Last resort: map webpageURL host/path back through Continuity registry.
        if let url = activity.webpageURL {
            let domainId = KenosDomainRegistry.domainId(fromContinuity: url)
            if domainId != "domain", KenosDomainRegistry.definition(for: domainId) != nil {
                let path = url.path.isEmpty ? "/" : url.path
                return KenosSystemDiscovery.deepLink(
                    domainId: domainId,
                    path: path,
                    homePath: KenosDomainRegistry.definition(for: domainId)?.homePath ?? "/"
                )
            }
        }
        return nil
    }

    @MainActor
    static func resetForTests() {
        currentActivity?.invalidate()
        currentActivity = nil
        lastActivityType = nil
        lastDeepLink = nil
        lastTitle = nil
    }
}
#endif
