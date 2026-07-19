import Foundation
import KenosContracts

public struct TodayGlance: Codable, Equatable, Sendable {
    public var nextPlanTitle: String?
    public var nextPlanDue: String?
    public var nextPlanDeepLink: String?
    public var activeDeliverableTitle: String?
    public var activeDeliverableDeepLink: String?
    public var pendingInboxCount: Int?
    public var pendingApprovalCount: Int?
    public var freshness: String
    public var offlineStatus: String
    public var lastSync: String?
    public var state: String

    public init(
        nextPlanTitle: String? = nil,
        nextPlanDue: String? = nil,
        nextPlanDeepLink: String? = nil,
        activeDeliverableTitle: String? = nil,
        activeDeliverableDeepLink: String? = nil,
        pendingInboxCount: Int? = nil,
        pendingApprovalCount: Int? = nil,
        freshness: String,
        offlineStatus: String,
        lastSync: String? = nil,
        state: String
    ) {
        self.nextPlanTitle = nextPlanTitle
        self.nextPlanDue = nextPlanDue
        self.nextPlanDeepLink = nextPlanDeepLink
        self.activeDeliverableTitle = activeDeliverableTitle
        self.activeDeliverableDeepLink = activeDeliverableDeepLink
        self.pendingInboxCount = pendingInboxCount
        self.pendingApprovalCount = pendingApprovalCount
        self.freshness = freshness
        self.offlineStatus = offlineStatus
        self.lastSync = lastSync
        self.state = state
    }
}

public struct ApprovalGlance: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var risk: KenosRisk
    public var safeSummary: String
    public var expiry: String
    public var ownerDomain: KenosDomain
    public var handoffDeepLink: String
    public var decisionAvailable: Bool

    public init(
        id: UUID,
        risk: KenosRisk,
        safeSummary: String,
        expiry: String,
        ownerDomain: KenosDomain,
        handoffDeepLink: String,
        decisionAvailable: Bool = false
    ) {
        self.id = id
        self.risk = risk
        self.safeSummary = safeSummary
        self.expiry = expiry
        self.ownerDomain = ownerDomain
        self.handoffDeepLink = handoffDeepLink
        self.decisionAvailable = decisionAvailable
    }
}

public struct ActivityGlance: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var safeResult: String
    public var domain: KenosDomain
    public var timestamp: String
    public var correlationId: UUID
    public var success: Bool

    public init(id: UUID, safeResult: String, domain: KenosDomain, timestamp: String, correlationId: UUID, success: Bool) {
        self.id = id
        self.safeResult = safeResult
        self.domain = domain
        self.timestamp = timestamp
        self.correlationId = correlationId
        self.success = success
    }
}

public struct CaptureDraftGlance: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var safePreview: String
    public var classification: KenosDataClassification
    public var queueState: String
    public var createdAt: String

    public init(id: UUID, safePreview: String, classification: KenosDataClassification, queueState: String, createdAt: String) {
        self.id = id
        self.safePreview = safePreview
        self.classification = classification
        self.queueState = queueState
        self.createdAt = createdAt
    }
}

public enum KenosGlanceMapper {
    /// Display mapping only — never a transport/canonical truth.
    public static func todayGlance(
        today: TodayProjection?,
        inbox: [InboxItem],
        approvals: [ApprovalRecord],
        work: WorkOverview?,
        freshness: String,
        lastSync: String?,
        repositoryState: String,
        hasSource: Bool
    ) -> TodayGlance {
        let cards = today?.cards ?? []
        let plan = cards.first(where: { $0.kind == "plan_task" })
        let workCard = cards.first(where: { $0.kind == "active_project" || $0.kind.contains("work") })
        let inboxCard = cards.first(where: { $0.kind == "pending_inbox" })
        let approvalCard = cards.first(where: { $0.kind == "pending_approval" })

        let inboxCount: Int? = {
            if !hasSource && inbox.isEmpty { return nil }
            if !inbox.isEmpty { return inbox.count }
            if inboxCard != nil { return 1 }
            return hasSource ? 0 : nil
        }()

        let approvalCount: Int? = {
            if !hasSource && approvals.isEmpty { return nil }
            let pending = approvals.filter { $0.status == .pending }.count
            if pending > 0 { return pending }
            if approvalCard != nil { return 1 }
            return hasSource ? 0 : nil
        }()

        let deliverable = work?.deliverables.first
        let state: String = {
            switch repositoryState {
            case "loading": return "loading"
            case "stale": return "stale"
            case "unavailable": return "unavailable"
            case "sessionExpired", "session_expired": return "session_expired"
            case "empty": return "no_data"
            case "partial": return "partial"
            case "ready": return cards.isEmpty && work == nil ? "no_data" : "ready"
            default: return hasSource ? "ready" : "offline"
            }
        }()

        return TodayGlance(
            nextPlanTitle: plan?.title,
            nextPlanDue: nil,
            nextPlanDeepLink: plan?.deepLink,
            activeDeliverableTitle: deliverable?.title ?? workCard?.title,
            activeDeliverableDeepLink: deliverable.map { "kenos://deliverable/\($0.id.uuidString)" } ?? workCard?.deepLink,
            pendingInboxCount: inboxCount,
            pendingApprovalCount: approvalCount,
            freshness: freshness,
            offlineStatus: state == "stale" || state == "offline" || state == "unavailable" ? state : "online",
            lastSync: lastSync,
            state: state
        )
    }

    public static func approvalGlances(from approvals: [ApprovalRecord]) -> [ApprovalGlance] {
        approvals.map {
            ApprovalGlance(
                id: $0.id,
                risk: $0.risk,
                safeSummary: $0.safeSummary,
                expiry: $0.expiresAt.rawValue,
                ownerDomain: $0.requestingDomain,
                handoffDeepLink: "kenos://approvals/\($0.id.uuidString)",
                decisionAvailable: false
            )
        }
    }

    public static func activityGlances(from activity: [ActivityItem]) -> [ActivityGlance] {
        activity.map {
            ActivityGlance(
                id: $0.id,
                safeResult: $0.safeSummary,
                domain: $0.ownerDomain,
                timestamp: $0.occurredAt,
                correlationId: $0.correlationId,
                success: $0.result == "succeeded"
            )
        }
    }

    public static func captureGlance(from draft: CaptureDraft) -> CaptureDraftGlance {
        let preview = String(draft.text.prefix(80))
        return CaptureDraftGlance(
            id: draft.id,
            safePreview: preview,
            classification: draft.classification,
            queueState: draft.queueStatus,
            createdAt: draft.capturedAt
        )
    }
}
