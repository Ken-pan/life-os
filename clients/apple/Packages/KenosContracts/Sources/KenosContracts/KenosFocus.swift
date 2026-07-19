import Foundation

// MARK: - Phase 5 Focus contracts (camelCase JSON keys match packages/contracts TS)

public enum KenosFocusMode: String, Codable, CaseIterable, Sendable {
    case training
    case deepWork = "deep_work"
    case meeting
    case reading
    case homeOrganizing = "home_organizing"
    case financeReview = "finance_review"
    case windDown = "wind_down"
    case custom
}

public enum KenosFocusStatus: String, Codable, CaseIterable, Sendable {
    case inactive
    case starting
    case active
    case temporarilyLeft = "temporarily_left"
    case paused
    case ending
    case completed
    case cancelled
}

public enum KenosFocusSource: String, Codable, CaseIterable, Sendable {
    case user
    case assistantSuggestion = "assistant_suggestion"
    case appleFocusSuggestion = "apple_focus_suggestion"
    case system
    case deepLink = "deep_link"
}

public enum KenosInterruptionHandling: String, Codable, CaseIterable, Sendable {
    case showNow = "show_now"
    case quietIndicator = "quiet_indicator"
    case `defer` = "defer"
    case suppressUntilEnd = "suppress_until_end"
    case requireUserOverride = "require_user_override"
    case alwaysAllow = "always_allow"
}

public enum KenosInterruptionUrgency: String, Codable, CaseIterable, Sendable {
    case low, normal, high, critical
}

public enum KenosDeferredItemStatus: String, Codable, CaseIterable, Sendable {
    case pending, released, dismissed, expired, superseded
}

public enum KenosProactiveSuggestionStatus: String, Codable, CaseIterable, Sendable {
    case generated, shown, accepted, dismissed, expired, superseded
    case convertedToAction = "converted_to_action"
    case failed
}

public enum KenosProactiveSuggestionSource: String, Codable, CaseIterable, Sendable {
    case rule, session, assistant, system
    case appleFocus = "apple_focus"
}

public enum KenosApprovalRequirement: String, Codable, CaseIterable, Sendable {
    case none, confirm
    case strongConfirm = "strong_confirm"
    case failClosed = "fail_closed"
}

/// Legal Focus status transitions. Unknown/illegal transitions fail closed.
public enum KenosFocusStatusTransitions {
    public static let graph: [KenosFocusStatus: Set<KenosFocusStatus>] = [
        .inactive: [.starting],
        .starting: [.active, .cancelled],
        .active: [.paused, .temporarilyLeft, .ending, .cancelled],
        .temporarilyLeft: [.active, .ending, .cancelled],
        .paused: [.active, .ending, .cancelled],
        .ending: [.completed, .cancelled],
        .completed: [],
        .cancelled: [],
    ]

    public static func canTransition(from: KenosFocusStatus, to: KenosFocusStatus) -> Bool {
        graph[from]?.contains(to) == true
    }

    public static func validateTransition(from: KenosFocusStatus, to: KenosFocusStatus) throws {
        guard canTransition(from: from, to: to) else {
            throw KenosContractError.invalidFocusTransition
        }
    }
}

public struct KenosAssistantScope: Codable, Equatable, Sendable {
    public var mode: KenosFocusMode
    public var allowedDomains: [KenosDomain]
    public var allowExplicitCrossDomain: Bool
    public var proactiveCrossDomain: Bool
    public var toolsAllowlist: [String]
    public var notes: String?

    public init(
        mode: KenosFocusMode,
        allowedDomains: [KenosDomain],
        allowExplicitCrossDomain: Bool = true,
        proactiveCrossDomain: Bool = false,
        toolsAllowlist: [String] = [],
        notes: String? = nil
    ) {
        self.mode = mode
        self.allowedDomains = allowedDomains
        self.allowExplicitCrossDomain = allowExplicitCrossDomain
        self.proactiveCrossDomain = proactiveCrossDomain
        self.toolsAllowlist = toolsAllowlist
        self.notes = notes
    }
}

public struct KenosFocusReturnDestination: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case today, spaces, space, session, route
    }

    public var kind: Kind
    public var space: KenosDomain?
    public var route: String?
    public var sessionRef: EntityRef?
    public var label: String

    public init(
        kind: Kind,
        space: KenosDomain? = nil,
        route: String? = nil,
        sessionRef: EntityRef? = nil,
        label: String
    ) {
        self.kind = kind
        self.space = space
        self.route = route
        self.sessionRef = sessionRef
        self.label = label
    }
}

public struct KenosFocusContext: Codable, Equatable, Sendable {
    public var id: UUID
    public var version: KenosSchemaVersion
    public var ownerId: UUID
    public var mode: KenosFocusMode
    public var activeSpace: KenosDomain
    public var activeSessionRef: EntityRef?
    public var startedAt: KenosTimestamp?
    public var expectedEndAt: KenosTimestamp?
    public var pausedAt: KenosTimestamp?
    public var endedAt: KenosTimestamp?
    public var status: KenosFocusStatus
    public var visibleDomains: [KenosDomain]
    public var hiddenDomains: [KenosDomain]
    public var allowedInterruptionCategories: [String]
    public var assistantScope: KenosAssistantScope
    public var notificationPolicyRef: String
    public var deferredQueueRef: UUID
    public var returnDestination: KenosFocusReturnDestination
    public var source: KenosFocusSource
    public var classification: KenosDataClassification
    public var title: String
    public var safeSummary: String
    public var correlationId: UUID
    public var createdAt: KenosTimestamp
    public var updatedAt: KenosTimestamp

    public init(
        id: UUID,
        version: KenosSchemaVersion = .v1,
        ownerId: UUID,
        mode: KenosFocusMode,
        activeSpace: KenosDomain,
        activeSessionRef: EntityRef? = nil,
        startedAt: KenosTimestamp? = nil,
        expectedEndAt: KenosTimestamp? = nil,
        pausedAt: KenosTimestamp? = nil,
        endedAt: KenosTimestamp? = nil,
        status: KenosFocusStatus,
        visibleDomains: [KenosDomain],
        hiddenDomains: [KenosDomain] = [],
        allowedInterruptionCategories: [String],
        assistantScope: KenosAssistantScope,
        notificationPolicyRef: String,
        deferredQueueRef: UUID,
        returnDestination: KenosFocusReturnDestination,
        source: KenosFocusSource,
        classification: KenosDataClassification,
        title: String,
        safeSummary: String,
        correlationId: UUID,
        createdAt: KenosTimestamp,
        updatedAt: KenosTimestamp
    ) {
        self.id = id
        self.version = version
        self.ownerId = ownerId
        self.mode = mode
        self.activeSpace = activeSpace
        self.activeSessionRef = activeSessionRef
        self.startedAt = startedAt
        self.expectedEndAt = expectedEndAt
        self.pausedAt = pausedAt
        self.endedAt = endedAt
        self.status = status
        self.visibleDomains = visibleDomains
        self.hiddenDomains = hiddenDomains
        self.allowedInterruptionCategories = allowedInterruptionCategories
        self.assistantScope = assistantScope
        self.notificationPolicyRef = notificationPolicyRef
        self.deferredQueueRef = deferredQueueRef
        self.returnDestination = returnDestination
        self.source = source
        self.classification = classification
        self.title = title
        self.safeSummary = safeSummary
        self.correlationId = correlationId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public func validate() throws {
        guard !title.isEmpty, title.count <= 120,
              !safeSummary.isEmpty, safeSummary.count <= 500,
              updatedAt.rawValue >= createdAt.rawValue,
              !visibleDomains.isEmpty,
              visibleDomains.contains(activeSpace),
              Set(visibleDomains).isDisjoint(with: Set(hiddenDomains)),
              assistantScope.mode == mode
        else { throw KenosContractError.invalidFocusState }
        try Self.rejectSensitive(title)
        try Self.rejectSensitive(safeSummary)
        if let activeSessionRef {
            try activeSessionRef.validate()
            guard activeSessionRef.ownerId == ownerId else { throw KenosContractError.targetOwnerMismatch }
        }
        let foreground: Set<KenosFocusStatus> = [.active, .paused, .temporarilyLeft, .ending]
        if foreground.contains(status), startedAt == nil { throw KenosContractError.invalidFocusState }
        if [.completed, .cancelled].contains(status), endedAt == nil { throw KenosContractError.invalidFocusState }
        if status == .inactive, startedAt != nil || endedAt != nil { throw KenosContractError.invalidFocusState }
    }

    static func rejectSensitive(_ value: String) throws {
        let lowered = value.lowercased()
        for marker in ["token", "secret", "password", "authorization", "cookie", "bearer"] {
            if lowered.range(of: #"\b"# + marker + #"\b"#, options: .regularExpression) != nil {
                throw KenosContractError.unredactedSensitivePayload
            }
        }
    }
}

public struct KenosInterruptionCandidate: Codable, Equatable, Sendable {
    public var id: UUID
    public var ownerId: UUID
    public var focusContextId: UUID?
    public var sourceDomain: KenosDomain
    public var category: String
    public var urgency: KenosInterruptionUrgency
    public var risk: KenosRisk
    public var classification: KenosDataClassification
    public var createdAt: KenosTimestamp
    public var expiry: KenosTimestamp?
    public var relatedEntityRef: EntityRef?
    public var recommendedHandling: KenosInterruptionHandling
    public var explanation: String
    public var safeSummary: String

    public init(
        id: UUID = UUID(),
        ownerId: UUID,
        focusContextId: UUID? = nil,
        sourceDomain: KenosDomain,
        category: String,
        urgency: KenosInterruptionUrgency,
        risk: KenosRisk,
        classification: KenosDataClassification = .personal,
        createdAt: KenosTimestamp,
        expiry: KenosTimestamp? = nil,
        relatedEntityRef: EntityRef? = nil,
        recommendedHandling: KenosInterruptionHandling = .defer,
        explanation: String,
        safeSummary: String
    ) {
        self.id = id
        self.ownerId = ownerId
        self.focusContextId = focusContextId
        self.sourceDomain = sourceDomain
        self.category = category
        self.urgency = urgency
        self.risk = risk
        self.classification = classification
        self.createdAt = createdAt
        self.expiry = expiry
        self.relatedEntityRef = relatedEntityRef
        self.recommendedHandling = recommendedHandling
        self.explanation = explanation
        self.safeSummary = safeSummary
    }
}

public struct KenosDeferredItem: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var ownerId: UUID
    public var focusContextId: UUID
    public var sourceDomain: KenosDomain
    public var sourceEntityRef: EntityRef?
    public var category: String
    public var safeSummary: String
    public var classification: KenosDataClassification
    public var originalCreatedAt: KenosTimestamp
    public var deferredAt: KenosTimestamp
    public var releaseAt: KenosTimestamp?
    public var expiry: KenosTimestamp?
    public var urgency: KenosInterruptionUrgency
    public var status: KenosDeferredItemStatus
    public var reason: String
    public var correlationId: UUID

    public func validate() throws {
        guard !safeSummary.isEmpty, !reason.isEmpty else { throw KenosContractError.invalidFocusState }
        try KenosFocusContext.rejectSensitive(safeSummary)
        try KenosFocusContext.rejectSensitive(reason)
        if let sourceEntityRef {
            try sourceEntityRef.validate()
            guard sourceEntityRef.ownerId == ownerId else { throw KenosContractError.targetOwnerMismatch }
        }
    }

    public init(
        id: UUID = UUID(),
        ownerId: UUID,
        focusContextId: UUID,
        sourceDomain: KenosDomain,
        sourceEntityRef: EntityRef? = nil,
        category: String,
        safeSummary: String,
        classification: KenosDataClassification,
        originalCreatedAt: KenosTimestamp,
        deferredAt: KenosTimestamp,
        releaseAt: KenosTimestamp? = nil,
        expiry: KenosTimestamp? = nil,
        urgency: KenosInterruptionUrgency,
        status: KenosDeferredItemStatus,
        reason: String,
        correlationId: UUID
    ) {
        self.id = id
        self.ownerId = ownerId
        self.focusContextId = focusContextId
        self.sourceDomain = sourceDomain
        self.sourceEntityRef = sourceEntityRef
        self.category = category
        self.safeSummary = safeSummary
        self.classification = classification
        self.originalCreatedAt = originalCreatedAt
        self.deferredAt = deferredAt
        self.releaseAt = releaseAt
        self.expiry = expiry
        self.urgency = urgency
        self.status = status
        self.reason = reason
        self.correlationId = correlationId
    }
}

public struct KenosProposedAction: Codable, Equatable, Sendable {
    public var actionType: String?
    public var writes: Bool
    public var requiresApproval: Bool
    public var reversibleHint: String?

    public init(actionType: String? = nil, writes: Bool, requiresApproval: Bool, reversibleHint: String? = nil) {
        self.actionType = actionType
        self.writes = writes
        self.requiresApproval = requiresApproval
        self.reversibleHint = reversibleHint
    }
}

public struct KenosProactiveSuggestion: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var version: KenosSchemaVersion
    public var ownerId: UUID
    public var source: KenosProactiveSuggestionSource
    public var targetDomain: KenosDomain
    public var focusContextId: UUID?
    public var suggestionType: String
    public var title: String
    public var safeSummary: String
    public var rationale: String
    public var evidenceRefs: [EntityRef]
    public var confidence: Double
    public var risk: KenosRisk
    public var proposedAction: KenosProposedAction
    public var approvalRequirement: KenosApprovalRequirement
    public var createdAt: KenosTimestamp
    public var expiresAt: KenosTimestamp?
    public var status: KenosProactiveSuggestionStatus
    public var dismissalReason: String?
    public var feedback: String?
    public var classification: KenosDataClassification
    public var correlationId: UUID
    public var whyNow: String
    public var signalsUsed: [String]
    public var impactSummary: String

    public init(
        id: UUID = UUID(),
        version: KenosSchemaVersion = .v1,
        ownerId: UUID,
        source: KenosProactiveSuggestionSource,
        targetDomain: KenosDomain,
        focusContextId: UUID? = nil,
        suggestionType: String,
        title: String,
        safeSummary: String,
        rationale: String,
        evidenceRefs: [EntityRef] = [],
        confidence: Double,
        risk: KenosRisk,
        proposedAction: KenosProposedAction,
        approvalRequirement: KenosApprovalRequirement,
        createdAt: KenosTimestamp,
        expiresAt: KenosTimestamp? = nil,
        status: KenosProactiveSuggestionStatus = .generated,
        dismissalReason: String? = nil,
        feedback: String? = nil,
        classification: KenosDataClassification = .personal,
        correlationId: UUID = UUID(),
        whyNow: String,
        signalsUsed: [String],
        impactSummary: String
    ) {
        self.id = id
        self.version = version
        self.ownerId = ownerId
        self.source = source
        self.targetDomain = targetDomain
        self.focusContextId = focusContextId
        self.suggestionType = suggestionType
        self.title = title
        self.safeSummary = safeSummary
        self.rationale = rationale
        self.evidenceRefs = evidenceRefs
        self.confidence = confidence
        self.risk = risk
        self.proposedAction = proposedAction
        self.approvalRequirement = approvalRequirement
        self.createdAt = createdAt
        self.expiresAt = expiresAt
        self.status = status
        self.dismissalReason = dismissalReason
        self.feedback = feedback
        self.classification = classification
        self.correlationId = correlationId
        self.whyNow = whyNow
        self.signalsUsed = signalsUsed
        self.impactSummary = impactSummary
    }

    public func validate() throws {
        guard !title.isEmpty, !safeSummary.isEmpty, !rationale.isEmpty,
              !whyNow.isEmpty, !impactSummary.isEmpty, !signalsUsed.isEmpty,
              confidence >= 0, confidence <= 1
        else { throw KenosContractError.invalidFocusState }
        try KenosFocusContext.rejectSensitive(title)
        try KenosFocusContext.rejectSensitive(safeSummary)
        try KenosFocusContext.rejectSensitive(rationale)
        if risk == .r4, approvalRequirement != .failClosed {
            throw KenosContractError.invalidFocusState
        }
        if (risk == .r3 || risk == .r4), approvalRequirement == .none {
            throw KenosContractError.invalidFocusState
        }
        if proposedAction.writes, approvalRequirement == .none, risk != .r0 {
            throw KenosContractError.invalidFocusState
        }
    }
}

public struct KenosInterventionBudget: Codable, Equatable, Sendable {
    public var id: UUID
    public var ownerId: UUID
    public var focusContextId: UUID?
    public var maxSuggestionsPerSession: Int
    public var cooldownSeconds: Int
    public var repeatedDismissalSuppression: Int
    public var quietHours: QuietHours?
    public var urgencyThreshold: KenosInterruptionUrgency
    public var groupedRelease: Bool
    public var shownNonUrgentCount: Int
    public var lastShownAt: KenosTimestamp?
    public var dismissedTypes: [String: Int]

    public struct QuietHours: Codable, Equatable, Sendable {
        public var startHour: Int
        public var endHour: Int
    }

    public init(
        id: UUID = UUID(),
        ownerId: UUID,
        focusContextId: UUID? = nil,
        maxSuggestionsPerSession: Int = 2,
        cooldownSeconds: Int = 900,
        repeatedDismissalSuppression: Int = 2,
        quietHours: QuietHours? = nil,
        urgencyThreshold: KenosInterruptionUrgency = .high,
        groupedRelease: Bool = true,
        shownNonUrgentCount: Int = 0,
        lastShownAt: KenosTimestamp? = nil,
        dismissedTypes: [String: Int] = [:]
    ) {
        self.id = id
        self.ownerId = ownerId
        self.focusContextId = focusContextId
        self.maxSuggestionsPerSession = maxSuggestionsPerSession
        self.cooldownSeconds = cooldownSeconds
        self.repeatedDismissalSuppression = repeatedDismissalSuppression
        self.quietHours = quietHours
        self.urgencyThreshold = urgencyThreshold
        self.groupedRelease = groupedRelease
        self.shownNonUrgentCount = shownNonUrgentCount
        self.lastShownAt = lastShownAt
        self.dismissedTypes = dismissedTypes
    }
}

public struct KenosSessionSummary: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var focusContextId: UUID
    public var ownerId: UUID
    public var mode: KenosFocusMode
    public var activeSpace: KenosDomain
    public var activeSessionRef: EntityRef?
    public var durationSeconds: Int
    public var completedActions: [String]
    public var progress: String
    public var notes: String?
    public var deferredItemCounts: [String: Int]
    public var releasedUrgentCount: Int
    public var errors: [String]
    public var nextRecommendedStep: String
    public var activityRefs: [UUID]
    public var createdAt: KenosTimestamp

    public init(
        id: UUID = UUID(),
        focusContextId: UUID,
        ownerId: UUID,
        mode: KenosFocusMode,
        activeSpace: KenosDomain,
        activeSessionRef: EntityRef? = nil,
        durationSeconds: Int,
        completedActions: [String] = [],
        progress: String,
        notes: String? = nil,
        deferredItemCounts: [String: Int] = [:],
        releasedUrgentCount: Int = 0,
        errors: [String] = [],
        nextRecommendedStep: String,
        activityRefs: [UUID] = [],
        createdAt: KenosTimestamp
    ) {
        self.id = id
        self.focusContextId = focusContextId
        self.ownerId = ownerId
        self.mode = mode
        self.activeSpace = activeSpace
        self.activeSessionRef = activeSessionRef
        self.durationSeconds = durationSeconds
        self.completedActions = completedActions
        self.progress = progress
        self.notes = notes
        self.deferredItemCounts = deferredItemCounts
        self.releasedUrgentCount = releasedUrgentCount
        self.errors = errors
        self.nextRecommendedStep = nextRecommendedStep
        self.activityRefs = activityRefs
        self.createdAt = createdAt
    }
}
