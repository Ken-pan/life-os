import Foundation
import KenosClient

/// Read-only complication/widget foundation helpers. No writes.
/// WidgetKit `TimelineProvider` conformance lives in the app/extension target when App Group signing allows.
public enum KenosComplicationFoundation {
    public static func freshnessLabel(for glance: TodayGlance) -> String {
        switch glance.state {
        case "stale", "offline", "unavailable":
            return glance.state
        case "ready":
            return glance.freshness
        default:
            return glance.state
        }
    }

    public static func summaryLine(for glance: TodayGlance) -> String {
        if glance.state == "unavailable" || glance.state == "offline" {
            return "Kenos unavailable"
        }
        if let plan = glance.nextPlanTitle {
            return plan
        }
        if let count = glance.pendingApprovalCount {
            return "Approvals \(count)"
        }
        if let inbox = glance.pendingInboxCount {
            return "Inbox \(inbox)"
        }
        if glance.state == "no_data" {
            return "Nothing due"
        }
        return "Kenos"
    }

    public static func deepLink(for glance: TodayGlance) -> String {
        if let link = glance.nextPlanDeepLink { return link }
        if let link = glance.activeDeliverableDeepLink { return link }
        if glance.pendingApprovalCount != nil { return "kenos://approvals" }
        if glance.pendingInboxCount != nil { return "kenos://inbox" }
        return "kenos://today"
    }
}
