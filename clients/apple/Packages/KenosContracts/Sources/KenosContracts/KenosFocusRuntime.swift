import Foundation

/// Phase 5 Focus runtime — pure, local, fail-closed. No production Executor / APNs.
public enum FocusRuntimeResult<T: Sendable>: Sendable {
    case ok(T)
    case error(String)

    public var isOk: Bool {
        if case .ok = self { return true }
        return false
    }

    public var value: T? {
        if case let .ok(value) = self { return value }
        return nil
    }

    public var errorMessage: String? {
        if case let .error(message) = self { return message }
        return nil
    }
}

public enum KenosFocusRuntime {
    public static func nowIso(_ at: String? = nil) -> String {
        if let at { return at }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: Date())
    }

    public static func timestamp(_ at: String? = nil) throws -> KenosTimestamp {
        try KenosTimestamp(nowIso(at))
    }

    public static func canTransitionFocusStatus(from: KenosFocusStatus, to: KenosFocusStatus) -> Bool {
        KenosFocusStatusTransitions.canTransition(from: from, to: to)
    }

    public struct ModePolicy: Sendable {
        public var activeSpace: KenosDomain
        public var visibleDomains: [KenosDomain]
        public var hiddenDomains: [KenosDomain]
        public var allowedInterruptionCategories: [String]
        public var assistantScope: KenosAssistantScope
        public var notificationPolicyRef: String
    }

    public static func focusModePolicy(_ mode: KenosFocusMode) -> ModePolicy {
        switch mode {
        case .training:
            return ModePolicy(
                activeSpace: .training,
                visibleDomains: [.training, .health, .system],
                hiddenDomains: [.work, .money, .home, .library, .plan, .music],
                allowedInterruptionCategories: [
                    "workout_timer", "training_guidance", "health_safety", "whitelisted_contact", "system_critical",
                ],
                assistantScope: KenosAssistantScope(
                    mode: .training,
                    allowedDomains: [.training, .health, .music],
                    toolsAllowlist: [
                        "training.next_exercise", "training.rest_timer", "training.log_pain",
                        "training.notes", "music.session",
                    ]
                ),
                notificationPolicyRef: "focus.training.v1"
            )
        case .deepWork:
            return ModePolicy(
                activeSpace: .work,
                visibleDomains: [.work, .plan, .library, .system],
                hiddenDomains: [.training, .money, .home, .health, .music],
                allowedInterruptionCategories: [
                    "current_work_context", "active_meeting", "user_selected_communication", "system_critical",
                ],
                assistantScope: KenosAssistantScope(
                    mode: .deepWork,
                    allowedDomains: [.work, .plan, .library],
                    toolsAllowlist: [
                        "work.current_project", "work.recent_decision", "plan.current_task", "library.related",
                    ]
                ),
                notificationPolicyRef: "focus.deep_work.v1"
            )
        case .meeting:
            return ModePolicy(
                activeSpace: .work,
                visibleDomains: [.work, .plan, .system],
                hiddenDomains: [.training, .money, .home, .library, .music],
                allowedInterruptionCategories: ["active_meeting", "system_critical"],
                assistantScope: KenosAssistantScope(
                    mode: .meeting,
                    allowedDomains: [.work, .plan],
                    toolsAllowlist: ["work.meeting_notes", "work.action_proposal_draft"]
                ),
                notificationPolicyRef: "focus.meeting.v1"
            )
        case .reading:
            return ModePolicy(
                activeSpace: .library,
                visibleDomains: [.library, .system],
                hiddenDomains: [.work, .money, .home, .training, .plan],
                allowedInterruptionCategories: ["reading_context", "system_critical"],
                assistantScope: KenosAssistantScope(
                    mode: .reading,
                    allowedDomains: [.library],
                    toolsAllowlist: ["library.current", "library.notes"]
                ),
                notificationPolicyRef: "focus.reading.v1"
            )
        case .homeOrganizing:
            return ModePolicy(
                activeSpace: .home,
                visibleDomains: [.home, .system],
                hiddenDomains: [.work, .money, .training, .library, .plan],
                allowedInterruptionCategories: ["home_task", "household_safety", "system_critical"],
                assistantScope: KenosAssistantScope(
                    mode: .homeOrganizing,
                    allowedDomains: [.home],
                    toolsAllowlist: ["home.session", "home.item_locate"]
                ),
                notificationPolicyRef: "focus.home_organizing.v1"
            )
        case .financeReview:
            return ModePolicy(
                activeSpace: .money,
                visibleDomains: [.money, .system],
                hiddenDomains: [.work, .training, .home, .library, .plan],
                allowedInterruptionCategories: ["finance_review", "system_critical"],
                assistantScope: KenosAssistantScope(
                    mode: .financeReview,
                    allowedDomains: [.money],
                    toolsAllowlist: ["money.review", "money.stale_source"]
                ),
                notificationPolicyRef: "focus.finance_review.v1"
            )
        case .windDown:
            return ModePolicy(
                activeSpace: .health,
                visibleDomains: [.health, .system],
                hiddenDomains: [.work, .money, .plan, .library, .training],
                allowedInterruptionCategories: [
                    "sleep_safety", "health_safety", "alarm", "household_safety", "system_critical",
                ],
                assistantScope: KenosAssistantScope(
                    mode: .windDown,
                    allowedDomains: [.health, .home],
                    toolsAllowlist: ["health.sleep", "health.safety"]
                ),
                notificationPolicyRef: "focus.wind_down.v1"
            )
        case .custom:
            return ModePolicy(
                activeSpace: .system,
                visibleDomains: [.system],
                hiddenDomains: [.work, .money, .home, .training, .library, .plan],
                allowedInterruptionCategories: ["system_critical", "user_override"],
                assistantScope: KenosAssistantScope(
                    mode: .custom,
                    allowedDomains: [.system],
                    toolsAllowlist: []
                ),
                notificationPolicyRef: "focus.custom.v1"
            )
        }
    }

    /// Parse raw mode string fail-closed (unknown → error).
    public static func parseFocusModeFailClosed(_ raw: String) -> FocusRuntimeResult<KenosFocusMode> {
        guard let mode = KenosFocusMode(rawValue: raw) else {
            return .error("Unknown focus mode fail-closed: \(raw)")
        }
        return .ok(mode)
    }

    public static func createFocusContext(
        ownerId: UUID,
        mode: KenosFocusMode,
        title: String,
        safeSummary: String,
        activeSessionRef: EntityRef? = nil,
        source: KenosFocusSource = .user,
        classification: KenosDataClassification = .personal,
        returnDestination: KenosFocusReturnDestination? = nil,
        expectedEndAt: KenosTimestamp? = nil,
        at: String? = nil
    ) -> FocusRuntimeResult<KenosFocusContext> {
        let policy = focusModePolicy(mode)
        guard let stamp = try? timestamp(at) else {
            return .error("Invalid Focus timestamp")
        }
        let context = KenosFocusContext(
            id: UUID(),
            ownerId: ownerId,
            mode: mode,
            activeSpace: policy.activeSpace,
            activeSessionRef: activeSessionRef,
            startedAt: nil,
            expectedEndAt: expectedEndAt,
            pausedAt: nil,
            endedAt: nil,
            status: .inactive,
            visibleDomains: policy.visibleDomains,
            hiddenDomains: policy.hiddenDomains,
            allowedInterruptionCategories: policy.allowedInterruptionCategories,
            assistantScope: policy.assistantScope,
            notificationPolicyRef: policy.notificationPolicyRef,
            deferredQueueRef: UUID(),
            returnDestination: returnDestination ?? KenosFocusReturnDestination(
                kind: .space,
                space: policy.activeSpace,
                label: "Return to \(policy.activeSpace.rawValue)"
            ),
            source: source,
            classification: classification,
            title: title,
            safeSummary: safeSummary,
            correlationId: UUID(),
            createdAt: stamp,
            updatedAt: stamp
        )
        do {
            try context.validate()
            return .ok(context)
        } catch {
            return .error(String(describing: error))
        }
    }

    public static func transitionFocus(
        _ focus: KenosFocusContext,
        to: KenosFocusStatus,
        at: String? = nil
    ) -> FocusRuntimeResult<KenosFocusContext> {
        if !canTransitionFocusStatus(from: focus.status, to: to) {
            if focus.status == to { return .ok(focus) }
            if focus.status == .completed, to == .completed { return .ok(focus) }
            if focus.status == .cancelled, to == .cancelled { return .ok(focus) }
            return .error("Illegal Focus transition: \(focus.status.rawValue) -> \(to.rawValue)")
        }
        guard let stamp = try? timestamp(at) else {
            return .error("Invalid Focus timestamp")
        }
        var next = focus
        next.status = to
        next.updatedAt = stamp
        if to == .starting {
            next.endedAt = nil
        }
        if to == .active {
            next.startedAt = focus.startedAt ?? stamp
            next.pausedAt = nil
        }
        if to == .paused {
            next.pausedAt = stamp
        }
        if to == .completed || to == .cancelled {
            next.endedAt = stamp
            next.pausedAt = nil
        }
        do {
            try next.validate()
            return .ok(next)
        } catch {
            return .error(String(describing: error))
        }
    }

    public static func isForegroundFocus(_ focus: KenosFocusContext?) -> Bool {
        guard let focus else { return false }
        return [.starting, .active, .paused, .temporarilyLeft, .ending].contains(focus.status)
    }

    public static func hidesGlobalNavigation(_ focus: KenosFocusContext?) -> Bool {
        focus?.status == .active
    }

    public static func startFocusSession(
        existingForeground: KenosFocusContext?,
        ownerId: UUID,
        mode: KenosFocusMode,
        title: String,
        safeSummary: String,
        activeSessionRef: EntityRef? = nil,
        source: KenosFocusSource = .user,
        classification: KenosDataClassification = .personal,
        returnDestination: KenosFocusReturnDestination? = nil,
        at: String? = nil
    ) -> FocusRuntimeResult<KenosFocusContext> {
        if isForegroundFocus(existingForeground) {
            return .error("Foreground Focus already active; resolve it before starting another")
        }
        let created = createFocusContext(
            ownerId: ownerId,
            mode: mode,
            title: title,
            safeSummary: safeSummary,
            activeSessionRef: activeSessionRef,
            source: source,
            classification: classification,
            returnDestination: returnDestination,
            at: at
        )
        guard case let .ok(inactive) = created else { return created }
        let starting = transitionFocus(inactive, to: .starting, at: at)
        guard case let .ok(started) = starting else { return starting }
        return transitionFocus(started, to: .active, at: at)
    }

    public static func evaluateInterruption(
        focus: KenosFocusContext?,
        candidate: KenosInterruptionCandidate
    ) -> FocusRuntimeResult<(handling: KenosInterruptionHandling, reason: String)> {
        if !isForegroundFocus(focus) || focus?.status == .temporarilyLeft {
            return .ok((.showNow, "No active Focus barrier"))
        }
        guard let focus else {
            return .ok((.showNow, "No active Focus barrier"))
        }
        if candidate.urgency == .critical || candidate.category == "system_critical" {
            return .ok((.alwaysAllow, "System-critical interruption"))
        }
        if candidate.category == "health_safety" || candidate.category == "sleep_safety" {
            return .ok((.alwaysAllow, "Safety interruption"))
        }
        if focus.allowedInterruptionCategories.contains(candidate.category) {
            return .ok((.showNow, "Category allowlisted for Focus mode"))
        }
        if focus.mode == .windDown, [.work, .money, .plan].contains(candidate.sourceDomain) {
            return .ok((.suppressUntilEnd, "Wind-down hides Work/Money/project status"))
        }
        if focus.hiddenDomains.contains(candidate.sourceDomain) {
            if candidate.urgency == .high, candidate.risk == .r3 {
                return .ok((.requireUserOverride, "High-urgency hidden-domain item"))
            }
            return .ok((.defer, "Deferred: \(candidate.sourceDomain.rawValue) hidden in \(focus.mode.rawValue)"))
        }
        if !focus.visibleDomains.contains(candidate.sourceDomain), candidate.sourceDomain != .system {
            return .ok((.defer, "Source domain outside visible set"))
        }
        return .ok((.quietIndicator, "In-scope, non-critical"))
    }

    public static func deferInterruption(
        focus: KenosFocusContext,
        candidate: KenosInterruptionCandidate,
        existing: [KenosDeferredItem],
        at: String? = nil
    ) -> FocusRuntimeResult<KenosDeferredItem> {
        let decision = evaluateInterruption(focus: focus, candidate: candidate)
        guard case let .ok(value) = decision else {
            return .error(decision.errorMessage ?? "evaluate failed")
        }
        guard value.handling == .defer || value.handling == .suppressUntilEnd else {
            return .error("Cannot defer with handling \(value.handling.rawValue)")
        }
        let dedupeKey =
            "\(candidate.sourceDomain.rawValue):\(candidate.category):\(candidate.relatedEntityRef?.id.uuidString ?? candidate.safeSummary)"
        if let duplicate = existing.first(where: {
            $0.focusContextId == focus.id
                && $0.status == .pending
                && "\($0.sourceDomain.rawValue):\($0.category):\($0.sourceEntityRef?.id.uuidString ?? $0.safeSummary)"
                    == dedupeKey
        }) {
            return .ok(duplicate)
        }
        guard let stamp = try? timestamp(at) else {
            return .error("Invalid Focus timestamp")
        }
        return .ok(
            KenosDeferredItem(
                ownerId: focus.ownerId,
                focusContextId: focus.id,
                sourceDomain: candidate.sourceDomain,
                sourceEntityRef: candidate.relatedEntityRef,
                category: candidate.category,
                safeSummary: candidate.safeSummary,
                classification: candidate.classification,
                originalCreatedAt: candidate.createdAt,
                deferredAt: stamp,
                expiry: candidate.expiry,
                urgency: candidate.urgency,
                status: .pending,
                reason: value.reason,
                correlationId: focus.correlationId
            )
        )
    }

    public static func releaseDeferredBatch(
        _ items: [KenosDeferredItem],
        focusContextId: UUID,
        at: String? = nil
    ) -> [KenosDeferredItem] {
        guard let stamp = try? timestamp(at) else { return items }
        return items.map { item in
            guard item.focusContextId == focusContextId, item.status == .pending else { return item }
            var next = item
            next.status = .released
            next.releaseAt = stamp
            return next
        }
    }

    public static func createDefaultBudget(ownerId: UUID, focusContextId: UUID? = nil) -> KenosInterventionBudget {
        KenosInterventionBudget(ownerId: ownerId, focusContextId: focusContextId)
    }

    public static func canShowSuggestion(
        budget: KenosInterventionBudget,
        suggestion: KenosProactiveSuggestion
    ) -> FocusRuntimeResult<(allowed: Bool, reason: String)> {
        if suggestion.risk == .r4 {
            return .ok((false, "R4 fail closed"))
        }
        if suggestion.confidence < 0.45 {
            return .ok((false, "Low confidence — list only, no interrupt"))
        }
        let dismissCount = budget.dismissedTypes[suggestion.suggestionType] ?? 0
        if dismissCount >= budget.repeatedDismissalSuppression {
            return .ok((false, "Repeated dismissal suppression"))
        }
        if (suggestion.risk == .r0 || suggestion.risk == .r1),
           budget.shownNonUrgentCount >= budget.maxSuggestionsPerSession
        {
            return .ok((false, "Session non-urgent budget exhausted"))
        }
        return .ok((true, "Within intervention budget"))
    }

    public static func markSuggestionShown(
        budget: KenosInterventionBudget,
        suggestion: KenosProactiveSuggestion,
        at: String? = nil
    ) -> KenosInterventionBudget {
        var next = budget
        if suggestion.risk == .r0 || suggestion.risk == .r1 {
            next.shownNonUrgentCount += 1
        }
        next.lastShownAt = try? timestamp(at)
        return next
    }

    public static func markSuggestionDismissed(
        budget: KenosInterventionBudget,
        suggestionType: String
    ) -> KenosInterventionBudget {
        var next = budget
        next.dismissedTypes[suggestionType] = (next.dismissedTypes[suggestionType] ?? 0) + 1
        return next
    }

    public static func createExplainableSuggestion(
        ownerId: UUID,
        source: KenosProactiveSuggestionSource,
        targetDomain: KenosDomain,
        focusContextId: UUID? = nil,
        suggestionType: String,
        title: String,
        safeSummary: String,
        rationale: String,
        whyNow: String,
        signalsUsed: [String],
        impactSummary: String,
        confidence: Double,
        risk: KenosRisk,
        writes: Bool,
        requiresApproval: Bool,
        approvalRequirement: KenosApprovalRequirement? = nil,
        actionType: String? = nil,
        classification: KenosDataClassification = .personal,
        at: String? = nil
    ) -> FocusRuntimeResult<KenosProactiveSuggestion> {
        guard let stamp = try? timestamp(at) else {
            return .error("Invalid Focus timestamp")
        }
        var requirement = approvalRequirement
        if requirement == nil {
            if risk == .r4 { requirement = .failClosed }
            else if risk == .r3 { requirement = .strongConfirm }
            else if writes || requiresApproval { requirement = .confirm }
            else { requirement = KenosApprovalRequirement.none }
        }
        guard let resolvedRequirement = requirement else { return .error("Missing approval requirement") }
        if risk == .r4, resolvedRequirement != .failClosed {
            return .error("R4 suggestions must fail closed")
        }
        return .ok(
            KenosProactiveSuggestion(
                ownerId: ownerId,
                source: source,
                targetDomain: targetDomain,
                focusContextId: focusContextId,
                suggestionType: suggestionType,
                title: title,
                safeSummary: safeSummary,
                rationale: rationale,
                confidence: confidence,
                risk: risk,
                proposedAction: KenosProposedAction(
                    actionType: actionType,
                    writes: writes,
                    requiresApproval: requiresApproval || resolvedRequirement != .none,
                    reversibleHint: writes ? "Local draft only until confirmed" : "No write"
                ),
                approvalRequirement: resolvedRequirement,
                createdAt: stamp,
                classification: classification,
                whyNow: whyNow,
                signalsUsed: signalsUsed,
                impactSummary: impactSummary
            )
        )
    }

    public static func buildSessionSummary(
        focus: KenosFocusContext,
        deferred: [KenosDeferredItem],
        completedActions: [String] = [],
        progress: String,
        nextRecommendedStep: String,
        notes: String? = nil,
        activityRefs: [UUID] = [],
        errors: [String] = [],
        at: String? = nil
    ) -> FocusRuntimeResult<KenosSessionSummary> {
        guard let stamp = try? timestamp(at) else {
            return .error("Invalid Focus timestamp")
        }
        let startedRaw = focus.startedAt?.rawValue ?? focus.createdAt.rawValue
        let endedRaw = focus.endedAt?.rawValue ?? stamp.rawValue
        let started = ISO8601DateFormatter().date(from: startedRaw)
            ?? ISO8601DateFormatter().date(from: String(startedRaw.prefix(19)) + "Z")
        let ended = ISO8601DateFormatter().date(from: endedRaw)
            ?? ISO8601DateFormatter().date(from: String(endedRaw.prefix(19)) + "Z")
        let duration: Int
        if let started, let ended {
            duration = max(0, Int(ended.timeIntervalSince(started).rounded()))
        } else {
            duration = 0
        }
        var deferredItemCounts: [String: Int] = [:]
        var releasedUrgentCount = 0
        for item in deferred where item.focusContextId == focus.id {
            deferredItemCounts[item.sourceDomain.rawValue, default: 0] += 1
            if item.status == .released, item.urgency == .high || item.urgency == .critical {
                releasedUrgentCount += 1
            }
        }
        return .ok(
            KenosSessionSummary(
                focusContextId: focus.id,
                ownerId: focus.ownerId,
                mode: focus.mode,
                activeSpace: focus.activeSpace,
                activeSessionRef: focus.activeSessionRef,
                durationSeconds: duration,
                completedActions: completedActions,
                progress: progress,
                notes: notes,
                deferredItemCounts: deferredItemCounts,
                releasedUrgentCount: releasedUrgentCount,
                errors: errors,
                nextRecommendedStep: nextRecommendedStep,
                activityRefs: activityRefs,
                createdAt: stamp
            )
        )
    }

    public static func interruptionCandidate(
        ownerId: UUID,
        focusContextId: UUID? = nil,
        sourceDomain: KenosDomain,
        category: String,
        urgency: KenosInterruptionUrgency,
        risk: KenosRisk,
        safeSummary: String,
        explanation: String,
        at: String? = nil
    ) -> KenosInterruptionCandidate? {
        guard let stamp = try? timestamp(at) else { return nil }
        return KenosInterruptionCandidate(
            ownerId: ownerId,
            focusContextId: focusContextId,
            sourceDomain: sourceDomain,
            category: category,
            urgency: urgency,
            risk: risk,
            createdAt: stamp,
            explanation: explanation,
            safeSummary: safeSummary
        )
    }

    public static func focusActivitySummary(eventType: String, focus: KenosFocusContext) -> String {
        switch eventType {
        case "focus.started": return "Started \(focus.title)"
        case "focus.paused": return "Paused \(focus.title)"
        case "focus.resumed": return "Resumed \(focus.title)"
        case "focus.temporarily_left": return "Temporarily left \(focus.title)"
        case "focus.ended": return "Ended \(focus.title)"
        case "focus.cancelled": return "Cancelled \(focus.title)"
        case "suggestion.shown": return "Showed a suggestion"
        case "suggestion.accepted": return "Accepted a suggestion"
        case "suggestion.dismissed": return "Dismissed a suggestion"
        case "item.deferred": return "Deferred an interruption"
        case "deferred.released": return "Released deferred items"
        default: return "Focus event \(eventType)"
        }
    }

    public enum ScopedAssistantDecision: Sendable, Equatable {
        case inScope(domains: [KenosDomain])
        case explicitCrossDomain(domains: [KenosDomain], notice: String)
        case denied(reason: String)
    }

    /// Fail closed when assistantScope is missing. Explicit user cross-domain is allowed without changing Focus.
    public static func resolveAssistantScope(
        focus: KenosFocusContext?,
        requestedDomains: [KenosDomain],
        userExplicitCrossDomain: Bool
    ) -> ScopedAssistantDecision {
        guard let focus, isForegroundFocus(focus) else {
            return .inScope(domains: requestedDomains.isEmpty ? [.assistant] : requestedDomains)
        }
        let allowed = Set(focus.assistantScope.allowedDomains)
        let outOfScope = requestedDomains.filter { !allowed.contains($0) }
        if outOfScope.isEmpty {
            return .inScope(domains: requestedDomains.isEmpty ? focus.assistantScope.allowedDomains : requestedDomains)
        }
        if userExplicitCrossDomain && focus.assistantScope.allowExplicitCrossDomain {
            return .explicitCrossDomain(
                domains: requestedDomains,
                notice: "Temporarily answering outside current Focus; Focus unchanged"
            )
        }
        if focus.assistantScope.proactiveCrossDomain {
            return .inScope(domains: requestedDomains)
        }
        let names = outOfScope.map(\.rawValue).joined(separator: ", ")
        return .denied(reason: "Out of Focus scope: \(names). Ask explicitly to cross domains.")
    }

    /// Apple system Focus → Kenos suggestion only. Never auto-enter by default.
    public static func appleFocusSuggestion(
        systemFocus: String
    ) -> (suggestedMode: KenosFocusMode, requiresUserConfirm: Bool, autoEnter: Bool) {
        let mode: KenosFocusMode
        switch systemFocus {
        case "fitness": mode = .training
        case "work": mode = .deepWork
        case "sleep": mode = .windDown
        default: mode = .custom
        }
        return (mode, true, false)
    }
}
